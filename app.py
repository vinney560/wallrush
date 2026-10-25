import json, secrets, string, time
from datetime import datetime, timedelta

from flask import Flask, render_template, request, redirect
from flask_socketio import SocketIO, emit
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.pool import QueuePool
from sqlalchemy import text
from decouple import config


app = Flask(__name__)
app.config['SECRET_KEY'] = config('SECRET_KEY')
app.config['SQLALCHEMY_DATABASE_URI'] = config('SQLALCHEMY_DATABASE_URI')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
    "pool_size": 30,
    "max_overflow": 60,
    "pool_recycle": 1800,
    "pool_pre_ping": True,
    "pool_timeout": 10,
    "poolclass": QueuePool,
    "connect_args": {"prepare_threshold": None},
}

socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode="threading",
    manage_session=False,
    ping_timeout=5,
    transports=["websocket", "polling"],
    always_connect=True,
    max_http_buffer_size=1e6,
    ping_interval=3,
    )


db = SQLAlchemy(app)


class GameProfile(db.Model):
    __tablename__ = 'game_profiles'
    token = db.Column(db.String(64), primary_key=True)
    name = db.Column(db.String(40), nullable=False)
    avatar = db.Column(db.String(16), nullable=False)
    points = db.Column(db.Integer, default=0, nullable=False, server_default='0')
    created_at = db.Column(db.DateTime, default=datetime.now)
    last_seen = db.Column(db.DateTime, default=datetime.now)


class GameMatch(db.Model):
    __tablename__ = 'game_matches'
    code = db.Column(db.String(8), primary_key=True)
    blue_token = db.Column(db.String(64))
    red_token = db.Column(db.String(64))
    moves_json = db.Column(db.Text, default='[]')
    winner_id = db.Column(db.String(64))
    finished = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.now)


TURN_TIMEOUT = 20
EMOJI_COOLDOWN = 3
DISCONNECT_GRACE = 10
FINISHED_ROOM_TTL = 120
WIN_POINTS = 10
LOSE_POINTS = 5
LEADER_RANGES = ('all', 'week', 'day')

AVATAR_POOL = [
    '🦊', '🐺', '🦅', '🐦‍⬛', '🐆', '🐯', '🐍', '🐉', '🐨', '🐼',
    '🦈', '🦉', '🐂', '🐻', '🐝', '🦦', '🐇', '🦋', '🦌', '🦝',
    '🐭', '🦇', '🐦', '🦡', '🦩', '🐸', '🦆', '🦎', '🦭', '🐙',
]

sid_token = {}
token_sid = {}
token_room = {}
rooms = {}
queue = []
disconnected_at = {}
last_emoji = {}


def parse_dt(val):
    if val is None:
        return None
    if isinstance(val, datetime):
        return val
    try:
        return datetime.fromisoformat(str(val))
    except Exception:
        pass
    for fmt in ('%Y-%m-%d %H:%M:%S.%f', '%Y-%m-%d %H:%M:%S', '%Y-%m-%d'):
        try:
            return datetime.strptime(str(val), fmt)
        except Exception:
            continue
    return None


def random_name():
    letters = ''.join(secrets.choice(string.ascii_lowercase) for _ in range(4))
    digits = ''.join(secrets.choice(string.digits) for _ in range(3))
    return f'user_{letters}{digits}'


def get_profile(token):
    p = db.session.get(GameProfile, token)
    if not p:
        p = GameProfile(token=token, name=random_name(),
                        avatar=secrets.choice(AVATAR_POOL), points=0)
        db.session.add(p)
    p.last_seen = datetime.now()
    db.session.commit()
    return p


def gen_code():
    while True:
        code = ''.join(secrets.choice('ABCDEFGHJKLMNPQRSTUVWXYZ23456789') for _ in range(6))
        if code not in rooms and db.session.get(GameMatch, code) is None:
            return code


def sid_for(token):
    return token_sid.get(token)


def other_token(r, token):
    return next((t for t in r['players'] if t and t != token), None)


def send_to_others(code, event, data, sender_token=None):
    if code not in rooms:
        return
    for t in rooms[code]['players']:
        if not t or t == sender_token:
            continue
        sid = sid_for(t)
        if sid:
            socketio.emit(event, data, to=sid)


def send_room_state(code):
    if code not in rooms:
        return
    r = rooms[code]
    for t in r['players']:
        if not t:
            continue
        sid = sid_for(t)
        if not sid:
            continue
        players = []
        my_color = None
        for pt in r['players']:
            if not pt:
                continue
            prof = get_profile(pt)
            color = 'blue' if r['colors']['blue'] == pt else 'red'
            if pt == t:
                my_color = color
            players.append({
                'name': prof.name,
                'avatar': prof.avatar,
                'color': color,
                'points': prof.points or 0,
            })
        socketio.emit('room_state', {
            'code': code,
            'players': players,
            'moves': list(r['moves']),
            'my_color': my_color,
            'waiting': len(r['players']) < 2,
            'finished': bool(r.get('finished')),
            'turn_started_at': r.get('move_started_at', time.time()),
            'turn_timeout': TURN_TIMEOUT,
        }, to=sid)


def persist_match(code):
    if code not in rooms:
        return
    r = rooms[code]
    try:
        m = db.session.get(GameMatch, code)
        if not m:
            m = GameMatch(code=code, moves_json='[]')
            db.session.add(m)
        if m.finished:
            db.session.rollback()
            return
        m.blue_token = r['colors'].get('blue')
        m.red_token = r['colors'].get('red')
        m.moves_json = json.dumps(r['moves'])
        db.session.commit()
    except Exception as e:
        print(f"[wallrush] persist {code} FAILED: {e}")
        db.session.rollback()


def award_points(winner_token, loser_token):
    if winner_token:
        p = db.session.get(GameProfile, winner_token)
        if p:
            p.points = (p.points or 0) + WIN_POINTS
    if loser_token:
        p = db.session.get(GameProfile, loser_token)
        if p:
            p.points = max(0, (p.points or 0) - LOSE_POINTS)
    db.session.commit()


def cleanup_finished_room_later(code, seconds):
    socketio.sleep(seconds)
    if code not in rooms:
        return
    r = rooms[code]
    if not r.get('finished'):
        return
    for t in r['players']:
        if t:
            token_room.pop(t, None)
    del rooms[code]


def broadcast_leaders_changed():
    try:
        socketio.emit('leaders_changed', {})
    except Exception as e:
        print(f"[wallrush] broadcast_leaders_changed failed: {e}")


def close_room(code, winner_token, loser_token, reason, keep_alive=False, skip_token=None):
    if code not in rooms:
        return
    r = rooms[code]
    if r.get('finished') and r.get('winner_token') is not None:
        return
    r['finished'] = True
    r['winner_token'] = winner_token
    r.pop('rematch_requester', None)

    blue = r['colors'].get('blue')
    red = r['colors'].get('red')
    has_two_players = bool(blue) and bool(red)

    with app.app_context():
        if has_two_players:
            try:
                award_points(winner_token, loser_token)
            except Exception as e:
                print(f"[wallrush] award_points {code} FAILED: {e}")
                db.session.rollback()

        try:
            m = db.session.get(GameMatch, code)
            if not m:
                m = GameMatch(code=code, moves_json='[]')
                db.session.add(m)
            if has_two_players:
                m.blue_token = blue
                m.red_token = red
                m.winner_id = winner_token
                m.finished = True
                m.moves_json = json.dumps(r['moves'])
            else:
                db.session.delete(m)
            db.session.commit()
            print(f"[wallrush] closed {code}: winner_token={winner_token} reason={reason} two_players={has_two_players}")
        except Exception as e:
            print(f"[wallrush] close {code} DB FAILED: {e}")
            db.session.rollback()

    for t in r['players']:
        if not t or t == skip_token:
            continue
        sid = sid_for(t)
        if not sid:
            continue
        if t == winner_token:
            reason_for_them = reason
        elif t == loser_token:
            reason_for_them = 'you_left' if reason == 'opponent_left' else reason
        else:
            reason_for_them = reason
        socketio.emit('match_ended', {
            'winner_token': winner_token,
            'reason': reason_for_them,
            'opponent_gone': reason == 'opponent_left',
        }, to=sid)

    if keep_alive:
        socketio.start_background_task(cleanup_finished_room_later, code, FINISHED_ROOM_TTL)
    else:
        for t in r['players']:
            if t:
                token_room.pop(t, None)
        del rooms[code]

    broadcast_leaders_changed()


def _start_rematch(code, r):
    r['moves'] = []
    r['finished'] = False
    r.pop('winner_token', None)
    r['move_started_at'] = time.time()
    r.pop('rematch_requester', None)
    with app.app_context():
        try:
            m = db.session.get(GameMatch, code)
            if m:
                m.moves_json = '[]'
                m.finished = False
                m.winner_id = None
                db.session.commit()
        except Exception as e:
            print(f"[wallrush] rematch {code} DB FAILED: {e}")
            db.session.rollback()
    send_room_state(code)


def abandon_finished_room(token):
    code = token_room.get(token)
    if not code or code not in rooms:
        return None
    if not rooms[code].get('finished'):
        return code
    r = rooms[code]
    if token in r['players']:
        r['players'].remove(token)
    for c, t in r['colors'].items():
        if t == token:
            r['colors'][c] = None
    token_room.pop(token, None)
    if not r['players']:
        del rooms[code]
    else:
        send_to_others(code, 'peer_left', {}, sender_token=token)
    return None


def current_turn_color(code):
    if code not in rooms:
        return None
    return 'blue' if len(rooms[code]['moves']) % 2 == 0 else 'red'


def timeout_watcher():
    while True:
        socketio.sleep(1)
        try:
            now = time.time()
            for code in list(rooms.keys()):
                r = rooms.get(code)
                if not r or r.get('finished') or len(r['players']) < 2:
                    continue
                started = r.get('move_started_at', now)
                if now - started >= TURN_TIMEOUT:
                    loser_color = current_turn_color(code)
                    if not loser_color:
                        continue
                    loser_token = r['colors'].get(loser_color)
                    winner_token = other_token(r, loser_token)
                    close_room(code, winner_token, loser_token, 'timeout', keep_alive=True)
        except Exception as e:
            print(f"[wallrush] timeout_watcher error: {e}")


def _columns(table):
    try:
        rows = db.session.execute(text(f"PRAGMA table_info({table})")).fetchall()
        return {r[1] for r in rows}
    except Exception:
        return set()


def migrate_schema():
    with app.app_context():
        prof_cols = _columns('game_profiles')
        if prof_cols and 'points' not in prof_cols:
            try:
                db.session.execute(text(
                    "ALTER TABLE game_profiles ADD COLUMN points INTEGER DEFAULT 0 NOT NULL"
                ))
                db.session.commit()
                print("[wallrush] migrated: game_profiles.points")
            except Exception as e:
                db.session.rollback()
                print(f"[wallrush] migrate points FAILED: {e}")

        match_cols = _columns('game_matches')
        if match_cols and 'winner_id' not in match_cols:
            try:
                db.session.execute(text(
                    "ALTER TABLE game_matches ADD COLUMN winner_id VARCHAR(64)"
                ))
                db.session.commit()
                print("[wallrush] migrated: game_matches.winner_id")
            except Exception as e:
                db.session.rollback()
                print(f"[wallrush] migrate winner_id FAILED: {e}")


def compute_leaders(range_key='all', limit=100):
    cutoff = None
    if range_key == 'week':
        cutoff = datetime.now() - timedelta(days=7)
    elif range_key == 'day':
        cutoff = datetime.now() - timedelta(days=1)

    if cutoff:
        sql = text("""
            SELECT p.token, p.name, p.avatar, p.points,
                   COUNT(m.code) AS games,
                   COALESCE(SUM(CASE WHEN m.winner_id = p.token THEN 1 ELSE 0 END), 0) AS wins,
                   MAX(m.created_at) AS last_played
            FROM game_profiles p
            LEFT JOIN game_matches m
              ON (m.blue_token = p.token OR m.red_token = p.token)
             AND m.finished = 1
             AND m.created_at >= :cutoff
            GROUP BY p.token, p.name, p.avatar, p.points
            ORDER BY p.points DESC, wins DESC, last_played DESC, p.created_at ASC
            LIMIT :lim
        """)
        params = {'lim': limit, 'cutoff': cutoff}
    else:
        sql = text("""
            SELECT p.token, p.name, p.avatar, p.points,
                   COUNT(m.code) AS games,
                   COALESCE(SUM(CASE WHEN m.winner_id = p.token THEN 1 ELSE 0 END), 0) AS wins,
                   MAX(m.created_at) AS last_played
            FROM game_profiles p
            LEFT JOIN game_matches m
              ON (m.blue_token = p.token OR m.red_token = p.token)
             AND m.finished = 1
            GROUP BY p.token, p.name, p.avatar, p.points
            ORDER BY p.points DESC, wins DESC, last_played DESC, p.created_at ASC
            LIMIT :lim
        """)
        params = {'lim': limit}

    try:
        rows = db.session.execute(sql, params).mappings().all()
    except Exception as e:
        print(f"[wallrush] compute_leaders FAILED: {e}")
        db.session.rollback()
        return []

    out = []
    for i, r in enumerate(rows):
        games = int(r['games'] or 0)
        wins = int(r['wins'] or 0)
        last = parse_dt(r['last_played'])
        out.append({
            'rank': i + 1,
            'token': r['token'],
            'name': r['name'],
            'avatar': r['avatar'],
            'points': int(r['points'] or 0),
            'games': games,
            'wins': wins,
            'losses': games - wins,
            'rate': round(wins * 100 / games, 1) if games else 0.0,
            'last_played': last.isoformat() if last else None,
        })
    return out


def recent_matches_for(token, limit=20):
    sql = text("""
        SELECT m.code, m.blue_token, m.red_token, m.winner_id, m.created_at,
               b.name AS blue_name, b.avatar AS blue_avatar,
               r.name AS red_name,  r.avatar AS red_avatar
        FROM game_matches m
        LEFT JOIN game_profiles b ON b.token = m.blue_token
        LEFT JOIN game_profiles r ON r.token = m.red_token
        WHERE (m.blue_token = :t OR m.red_token = :t) AND m.finished = 1
        ORDER BY m.created_at DESC
        LIMIT :lim
    """)
    try:
        return db.session.execute(sql, {'t': token, 'lim': limit}).mappings().all()
    except Exception as e:
        print(f"[wallrush] recent_matches_for FAILED: {e}")
        db.session.rollback()
        return []


def reload_state():
    with app.app_context():
        if not _columns('game_matches'):
            return
        cutoff = datetime.now() - timedelta(hours=24)
        for m in GameMatch.query.filter(
            GameMatch.finished == False,
            GameMatch.created_at > cutoff,
        ).all():
            players = [t for t in (m.blue_token, m.red_token) if t]
            if not players:
                db.session.delete(m)
                continue
            try:
                moves = json.loads(m.moves_json or '[]')
            except Exception:
                moves = []
            rooms[m.code] = {
                'players': players,
                'colors': {'blue': m.blue_token, 'red': m.red_token},
                'moves': moves,
                'finished': False,
                'move_started_at': time.time(),
            }
            for t in players:
                token_room[t] = m.code
        db.session.commit()


def purge_old_matches():
    with app.app_context():
        if not _columns('game_matches'):
            return
        cutoff = datetime.now() - timedelta(days=7)
        db.session.execute(text(
            "DELETE FROM game_matches WHERE created_at < :c"
        ), {'c': cutoff})
        db.session.commit()


@app.route('/')
def root_redirect():
    return redirect('/game/')


@app.route('/game/')
def index():
    return render_template('index.html')


@app.route('/game/leaders')
def leaders_page():
    return render_template('game_leaders.html')


@app.route('/game/api/leaders')
def api_leaders():
    range_key = request.args.get('range', 'all')
    if range_key not in LEADER_RANGES:
        range_key = 'all'
    return {'range': range_key, 'leaders': compute_leaders(range_key)}


@socketio.on('identify')
def on_identify(data):
    sid = request.sid
    token = data.get('token')
    if not token or not isinstance(token, str) or len(token) < 8:
        return
    sid_token[sid] = token
    token_sid[token] = sid
    disconnected_at.pop(token, None)
    profile = get_profile(token)
    emit('identified', {
        'profile': {'name': profile.name, 'avatar': profile.avatar},
        'token': token,
        'points': profile.points or 0,
    })
    code = token_room.get(token)
    if code and code in rooms:
        send_room_state(code)
        send_to_others(code, 'peer_online', {}, sender_token=token)


@socketio.on('disconnect')
def on_disconnect():
    sid = request.sid
    token = sid_token.pop(sid, None)
    if not token:
        return
    token_sid.pop(token, None)
    if token in queue:
        queue.remove(token)
    code = token_room.get(token)
    if not code or code not in rooms:
        return
    if rooms[code].get('rematch_requester') == token:
        rooms[code].pop('rematch_requester', None)
    disconnected_at[token] = time.time()
    send_to_others(code, 'peer_offline', {}, sender_token=token)
    socketio.start_background_task(check_disconnect_grace, token, code)


def check_disconnect_grace(token, code):
    socketio.sleep(DISCONNECT_GRACE)
    try:
        if token not in disconnected_at:
            return
        if time.time() - disconnected_at[token] < DISCONNECT_GRACE:
            return
        disconnected_at.pop(token, None)
        if code not in rooms:
            return
        r = rooms[code]
        if r.get('finished'):
            if token in r['players']:
                r['players'].remove(token)
            for c, t in r['colors'].items():
                if t == token:
                    r['colors'][c] = None
            token_room.pop(token, None)
            if not r['players']:
                del rooms[code]
            return
        survivor = other_token(r, token)
        if not survivor:
            del rooms[code]
            return
        close_room(code, survivor, token, 'opponent_left')
    except Exception as e:
        print(f"[wallrush] check_disconnect_grace error: {e}")


@socketio.on('find_match')
def on_find_match():
    sid = request.sid
    token = sid_token.get(sid)
    if not token:
        return
    existing = token_room.get(token)
    if existing and existing in rooms and not rooms[existing].get('finished'):
        send_room_state(existing)
        return
    if existing and existing in rooms and rooms[existing].get('finished'):
        abandon_finished_room(token)
    if token in queue:
        return
    queue.append(token)
    emit('queue_status', {'position': len(queue)})
    if len(queue) >= 2:
        t1, t2 = queue.pop(0), queue.pop(0)
        s1, s2 = sid_for(t1), sid_for(t2)
        if not s1 or not s2:
            if s1:
                queue.insert(0, t1)
            elif s2:
                queue.insert(0, t2)
            return
        code = gen_code()
        colors = {'blue': t1, 'red': t2}
        rooms[code] = {
            'players': [t1, t2],
            'moves': [],
            'colors': colors,
            'finished': False,
            'move_started_at': time.time(),
        }
        token_room[t1] = code
        token_room[t2] = code
        try:
            db.session.add(GameMatch(
                code=code,
                blue_token=colors['blue'],
                red_token=colors['red'],
                moves_json='[]',
            ))
            db.session.commit()
        except Exception as e:
            print(f"[wallrush] find_match insert FAILED: {e}")
            db.session.rollback()
        socketio.emit('matched', {'code': code}, to=s1)
        socketio.emit('matched', {'code': code}, to=s2)
        send_room_state(code)


@socketio.on('cancel_queue')
def on_cancel_queue():
    token = sid_token.get(request.sid)
    if token and token in queue:
        queue.remove(token)
    emit('queue_cancelled')


@socketio.on('create_room')
def on_create_room():
    sid = request.sid
    token = sid_token.get(sid)
    if not token:
        return
    existing = token_room.get(token)
    if existing and existing in rooms and not rooms[existing].get('finished'):
        emit('room_created', {'code': existing})
        send_room_state(existing)
        return
    if existing and existing in rooms and rooms[existing].get('finished'):
        abandon_finished_room(token)
    code = gen_code()
    colors = {'blue': token, 'red': None}
    rooms[code] = {
        'players': [token],
        'moves': [],
        'colors': colors,
        'finished': False,
        'move_started_at': time.time(),
    }
    token_room[token] = code
    try:
        db.session.add(GameMatch(
            code=code,
            blue_token=colors['blue'],
            red_token=colors['red'],
            moves_json='[]',
        ))
        db.session.commit()
    except Exception as e:
        print(f"[wallrush] create_room insert FAILED: {e}")
        db.session.rollback()
    emit('room_created', {'code': code})
    send_room_state(code)


@socketio.on('join_room_code')
def on_join_room_code(data):
    sid = request.sid
    token = sid_token.get(sid)
    if not token:
        return
    code = (data.get('code') or '').strip().upper()
    if code not in rooms:
        emit('error_msg', 'Room not found')
        return
    room = rooms[code]
    if room.get('finished'):
        emit('error_msg', 'Room already finished')
        return
    if token in room['players']:
        send_room_state(code)
        return
    if len(room['players']) >= 2:
        emit('error_msg', 'Room is full')
        return
    if room['colors']['blue'] is None:
        room['colors']['blue'] = token
    else:
        room['colors']['red'] = token
    room['players'].append(token)
    room['move_started_at'] = time.time()
    token_room[token] = code
    persist_match(code)
    send_room_state(code)
    send_to_others(code, 'room_started', {}, sender_token=token)


@socketio.on('leave_room')
def on_leave_room():
    sid = request.sid
    token = sid_token.get(sid)
    if not token:
        return
    code = token_room.get(token)
    if not code or code not in rooms:
        emit('left_room')
        return
    r = rooms[code]
    if r.get('rematch_requester') == token:
        r.pop('rematch_requester', None)
        send_to_others(code, 'rematch_declined', {}, sender_token=token)

    if token in disconnected_at:
        emit('left_room')
        return

    if not r.get('finished') and len(r['players']) >= 2:
        survivor = other_token(r, token)
        if survivor:
            close_room(code, survivor, token, 'opponent_left', skip_token=token)
            emit('left_room')
            return

    if token in r['players']:
        r['players'].remove(token)
    for c, t in r['colors'].items():
        if t == token:
            r['colors'][c] = None
    token_room.pop(token, None)
    if not r['players']:
        del rooms[code]
        try:
            m = db.session.get(GameMatch, code)
            if m and not m.finished:
                db.session.delete(m)
                db.session.commit()
        except Exception:
            db.session.rollback()
    else:
        persist_match(code)
        send_to_others(code, 'peer_left', {}, sender_token=token)
    emit('left_room')


@socketio.on('move')
def on_move(data):
    sid = request.sid
    token = sid_token.get(sid)
    if not token:
        return
    code = token_room.get(token)
    if not code or code not in rooms:
        return
    r = rooms[code]
    if r.get('finished') or len(r['players']) < 2:
        return
    my_color = 'blue' if r['colors']['blue'] == token else 'red'
    if current_turn_color(code) != my_color:
        return
    r['moves'].append(data)
    r['move_started_at'] = time.time()
    persist_match(code)
    send_to_others(code, 'peer_move', data, sender_token=token)
    if data.get('type') == 'move':
        to = data.get('to') or []
        if to:
            reached_goal = (to[0] == 0 and my_color == 'blue') or (to[0] == 8 and my_color == 'red')
            if reached_goal:
                close_room(code, token, other_token(r, token), 'win', keep_alive=True)
                return


@socketio.on('turn_timeout')
def on_turn_timeout():
    token = sid_token.get(request.sid)
    if not token:
        return
    code = token_room.get(token)
    if not code or code not in rooms:
        return
    r = rooms[code]
    if r.get('finished'):
        return
    my_color = 'blue' if r['colors']['blue'] == token else 'red'
    if current_turn_color(code) != my_color:
        emit('turn_timeout_denied')
        return
    if time.time() - r.get('move_started_at', time.time()) < TURN_TIMEOUT - 0.5:
        emit('turn_timeout_denied')
        return
    close_room(code, other_token(r, token), token, 'timeout', keep_alive=True)


@socketio.on('emoji')
def on_emoji(data):
    token = sid_token.get(request.sid)
    if not token:
        return
    code = token_room.get(token)
    if not code or code not in rooms:
        return
    now = time.time()
    if now - last_emoji.get(token, 0) < EMOJI_COOLDOWN:
        emit('emoji_denied')
        return
    last_emoji[token] = now
    send_to_others(code, 'peer_emoji', data, sender_token=token)


@socketio.on('reset_game')
def on_reset_game():
    token = sid_token.get(request.sid)
    if not token:
        return
    code = token_room.get(token)
    if not code or code not in rooms:
        return
    r = rooms[code]
    r['moves'] = []
    r['finished'] = False
    r.pop('winner_token', None)
    r['move_started_at'] = time.time()
    r.pop('rematch_requester', None)
    try:
        m = db.session.get(GameMatch, code)
        if m:
            m.moves_json = '[]'
            m.finished = False
            m.winner_id = None
            db.session.commit()
    except Exception as e:
        print(f"[wallrush] reset {code} DB FAILED: {e}")
        db.session.rollback()
    send_to_others(code, 'peer_reset', {}, sender_token=token)


@socketio.on('rematch_request')
def on_rematch_request():
    token = sid_token.get(request.sid)
    if not token:
        return
    code = token_room.get(token)
    if not code or code not in rooms:
        return
    r = rooms[code]
    if not r.get('finished'):
        emit('rematch_failed', 'Game is still in progress')
        return
    others = [t for t in r['players'] if t and t != token and sid_for(t)]
    if not others:
        emit('rematch_failed', 'Opponent is not available')
        return
    existing = r.get('rematch_requester')
    if existing and existing != token:
        _start_rematch(code, r)
        return
    r['rematch_requester'] = token
    send_to_others(code, 'rematch_invite', {}, sender_token=token)


@socketio.on('rematch_accept')
def on_rematch_accept():
    token = sid_token.get(request.sid)
    if not token:
        return
    code = token_room.get(token)
    if not code or code not in rooms:
        return
    r = rooms[code]
    if not r.get('finished'):
        return
    requester = r.get('rematch_requester')
    if not requester or requester == token:
        emit('rematch_failed', 'No pending rematch request')
        return
    if requester not in r['players'] or not sid_for(requester):
        r.pop('rematch_requester', None)
        emit('rematch_failed', 'Opponent is offline')
        return
    _start_rematch(code, r)


@socketio.on('rematch_decline')
def on_rematch_decline():
    token = sid_token.get(request.sid)
    if not token:
        return
    code = token_room.get(token)
    if not code or code not in rooms:
        return
    r = rooms[code]
    requester = r.pop('rematch_requester', None)
    if requester:
        sid = sid_for(requester)
        if sid:
            socketio.emit('rematch_declined', {}, to=sid)


@socketio.on('request_leaders')
def on_request_leaders(data):
    range_key = (data or {}).get('range', 'all')
    if range_key not in LEADER_RANGES:
        range_key = 'all'
    leaders = compute_leaders(range_key)
    emit('leaders_data', {
        'range': range_key,
        'leaders': leaders,
        'generated_at': datetime.now().isoformat(),
    })


@socketio.on('request_player')
def on_request_player(data):
    token = (data or {}).get('token')
    if not token:
        emit('player_data', {'error': 'Invalid request'})
        return
    prof = db.session.get(GameProfile, token)
    if not prof:
        emit('player_data', {'error': 'Player not found'})
        return
    formatted = []
    for m in recent_matches_for(token):
        is_blue = m['blue_token'] == token
        my_color = 'blue' if is_blue else 'red'
        opp_name = m['red_name'] if is_blue else m['blue_name']
        opp_avatar = m['red_avatar'] if is_blue else m['blue_avatar']
        created = parse_dt(m['created_at'])
        formatted.append({
            'code': m['code'],
            'my_color': my_color,
            'opponent': {'name': opp_name or 'Unknown', 'avatar': opp_avatar or '❓'},
            'won': (m['winner_id'] == token),
            'created_at': created.isoformat() if created else None,
        })
    emit('player_data', {
        'profile': {
            'token': prof.token,
            'name': prof.name,
            'avatar': prof.avatar,
            'points': prof.points or 0,
        },
        'matches': formatted,
    })


with app.app_context():
    db.create_all()
    migrate_schema()
    purge_old_matches()
    reload_state()
    socketio.start_background_task(timeout_watcher)


if __name__ == '__main__':
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)