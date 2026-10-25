const SIZE = 9;
const WALLS = 15;
const CELL = 52;
const WT = 8;
const W = SIZE * CELL;
const WALL_THRESH = CELL * 0.4;
const TURN_TIMEOUT = 60;
const EMOJI_COOLDOWN = 3;

const COLOR_THEMES = {
    blue: { primary: '#3b82f6', light: '#60a5fa', dark: '#1d4ed8', dim: 'rgba(59,130,246,0.18)' },
    red: { primary: '#ef4444', light: '#f87171', dark: '#b91c1c', dim: 'rgba(239,68,68,0.18)' },
};

const AI_POOL = [
    { name: 'NightHawk', avatar: '🦅' }, { name: 'SwiftFox', avatar: '🦊' },
    { name: 'SilverWolf', avatar: '🐺' }, { name: 'StormRaven', avatar: '🐦‍⬛' },
    { name: 'CrimsonLynx', avatar: '🐆' }, { name: 'FrostTiger', avatar: '🐯' },
    { name: 'EmberViper', avatar: '🐍' }, { name: 'VoidPhoenix', avatar: '🔥' },
    { name: 'JadeDragon', avatar: '🐉' }, { name: 'QuantumKoala', avatar: '🐨' },
    { name: 'PixelPanda', avatar: '🐼' }, { name: 'CobaltShark', avatar: '🦈' },
    { name: 'SkyOwl', avatar: '🦉' }, { name: 'GoldEagle', avatar: '🦅' },
    { name: 'IronBull', avatar: '🐂' }, { name: 'GhostBear', avatar: '🐻' },
    { name: 'NeonCobra', avatar: '🐍' }, { name: 'TitanWasp', avatar: '🐝' },
    { name: 'AmberOtter', avatar: '🦦' }, { name: 'CopperHare', avatar: '🐇' },
    { name: 'DuskMoth', avatar: '🦋' }, { name: 'MysticElk', avatar: '🦌' },
    { name: 'RogueLynx', avatar: '🐾' }, { name: 'StaticMole', avatar: '🐭' },
    { name: 'WispBat', avatar: '🦇' }, { name: 'ZephyrCrow', avatar: '🐦' },
    { name: 'AshMarten', avatar: '🦡' }, { name: 'BlazeIbis', avatar: '🦩' },
    { name: 'CosmicToad', avatar: '🐸' }, { name: 'DriftLoon', avatar: '🦆' },
];
function pickAI() { return AI_POOL[Math.floor(Math.random() * AI_POOL.length)]; }

class Game {
    constructor() { this.reset(); }
    reset() {
        this.pawns = [[8, 4], [0, 4]];
        this.wallsLeft = [WALLS, WALLS];
        this.hWalls = new Map();
        this.vWalls = new Map();
        this.turn = 0;
        this.winner = null;
        this.history = [];
    }
    isWallBetween([r1, c1], [r2, c2]) {
        if (r2 !== r1) {
            const hr = Math.min(r1, r2);
            return this.hWalls.has(`${hr},${c1}`) || this.hWalls.has(`${hr},${c1 - 1}`);
        }
        const vc = Math.min(c1, c2);
        return this.vWalls.has(`${r1},${vc}`) || this.vWalls.has(`${r1 - 1},${vc}`);
    }
    pawnMoves(player) {
        const [r, c] = this.pawns[player];
        const [or_, oc] = this.pawns[1 - player];
        const moves = [];
        for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            const nr = r + dr, nc = c + dc;
            if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
            if (this.isWallBetween([r, c], [nr, nc])) continue;
            if (nr === or_ && nc === oc) {
                const jr = r + 2 * dr, jc = c + 2 * dc;
                const ok = jr >= 0 && jr < SIZE && jc >= 0 && jc < SIZE
                    && !this.isWallBetween([or_, oc], [jr, jc]);
                if (ok) moves.push([jr, jc]);
                else for (const [pdr, pdc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                    if ((pdr === dr && pdc === dc) || (pdr === -dr && pdc === -dc)) continue;
                    const tr = or_ + pdr, tc = oc + pdc;
                    if (tr < 0 || tr >= SIZE || tc < 0 || tc >= SIZE) continue;
                    if (!this.isWallBetween([or_, oc], [tr, tc])) moves.push([tr, tc]);
                }
            } else moves.push([nr, nc]);
        }
        return moves;
    }
    _hvCross(hr, hc, vr, vc) {
        if (Math.abs(vc - hc) > 1 || Math.abs(vr - hr) > 1) return false;
        if (Math.abs(vc - hc) === 1 && Math.abs(vr - hr) === 1) return false;
        return true;
    }
    _hConflicts(r, c) {
        for (const dc of [-1, 0, 1]) if (this.hWalls.has(`${r},${c + dc}`)) return true;
        for (const k of this.vWalls.keys()) {
            const [vr, vc] = k.split(',').map(Number);
            if (this._hvCross(r, c, vr, vc)) return true;
        }
        return false;
    }
    _vConflicts(r, c) {
        for (const dr of [-1, 0, 1]) if (this.vWalls.has(`${r + dr},${c}`)) return true;
        for (const k of this.hWalls.keys()) {
            const [hr, hc] = k.split(',').map(Number);
            if (this._hvCross(hr, hc, r, c)) return true;
        }
        return false;
    }
    _hasPath(start, goalRow, hSet, vSet) {
        const seen = new Set([start.join(',')]);
        const queue = [start];
        while (queue.length) {
            const [r, c] = queue.shift();
            if (r === goalRow) return true;
            for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                const nr = r + dr, nc = c + dc;
                if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
                if (seen.has(`${nr},${nc}`)) continue;
                const blocked = dr !== 0
                    ? hSet.has(`${Math.min(r, nr)},${c}`) || hSet.has(`${Math.min(r, nr)},${c - 1}`)
                    : vSet.has(`${r},${Math.min(c, nc)}`) || vSet.has(`${r - 1},${Math.min(c, nc)}`);
                if (blocked) continue;
                seen.add(`${nr},${nc}`);
                queue.push([nr, nc]);
            }
        }
        return false;
    }
    canPlaceWall(player, r, c, orient) {
        if (this.wallsLeft[player] <= 0) return false;
        if (r < 0 || r > SIZE - 2 || c < 0 || c > SIZE - 2) return false;
        if (orient === 'H' ? this._hConflicts(r, c) : this._vConflicts(r, c)) return false;
        const nh = orient === 'H' ? new Set([...this.hWalls.keys(), `${r},${c}`]) : new Set(this.hWalls.keys());
        const nv = orient === 'V' ? new Set([...this.vWalls.keys(), `${r},${c}`]) : new Set(this.vWalls.keys());
        if (!this._hasPath(this.pawns[0], 0, nh, nv)) return false;
        if (!this._hasPath(this.pawns[1], 8, nh, nv)) return false;
        return true;
    }
    applyMove(player, move) {
        if (this.winner !== null || player !== this.turn) return false;
        if (move.type === 'move') {
            if (!this.pawnMoves(player).some(([r, c]) => r === move.to[0] && c === move.to[1])) return false;
            this.pawns[player] = [move.to[0], move.to[1]];
            if (move.to[0] === (player === 0 ? 0 : 8)) this.winner = player;
        } else if (move.type === 'wall') {
            if (!this.canPlaceWall(player, move.r, move.c, move.orient)) return false;
            (move.orient === 'H' ? this.hWalls : this.vWalls).set(`${move.r},${move.c}`, player);
            this.wallsLeft[player]--;
        } else return false;
        this.history.push(move);
        if (this.winner === null) this.turn = 1 - this.turn;
        return true;
    }
}

function distToGoal(game, player) {
    const goalRow = player === 0 ? 0 : 8;
    const [sr, sc] = game.pawns[player];
    const queue = [[sr, sc, 0]];
    const seen = new Set([`${sr},${sc}`]);
    while (queue.length) {
        const [r, c, d] = queue.shift();
        if (r === goalRow) return d;
        for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            const nr = r + dr, nc = c + dc;
            if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
            const k = `${nr},${nc}`;
            if (seen.has(k)) continue;
            if (game.isWallBetween([r, c], [nr, nc])) continue;
            seen.add(k);
            queue.push([nr, nc, d + 1]);
        }
    }
    return 999;
}
function bestPawnMove(game, player) {
    const moves = game.pawnMoves(player);
    if (!moves.length) return null;
    const goalRow = player === 0 ? 0 : 8;
    for (const m of moves) if (m[0] === goalRow) return m;
    const saved = game.pawns[player];
    const scored = [];
    for (const m of moves) {
        game.pawns[player] = m;
        scored.push({ move: m, d: distToGoal(game, player) });
        game.pawns[player] = saved;
    }
    scored.sort((a, b) => a.d - b.d);
    const best = scored[0].d;
    const pool = scored.filter(s => s.d <= best + 1).slice(0, 3);
    return pool[Math.floor(Math.random() * pool.length)].move;
}
function bestWall(game, player) {
    if (game.wallsLeft[player] <= 0) return null;
    const opp = 1 - player;
    const myD = distToGoal(game, player);
    const oppD = distToGoal(game, opp);
    const candidates = [];
    for (let r = 0; r < SIZE - 1; r++) {
        for (let c = 0; c < SIZE - 1; c++) {
            for (const orient of ['H', 'V']) {
                if (orient === 'H' ? game._hConflicts(r, c) : game._vConflicts(r, c)) continue;
                const set = orient === 'H' ? game.hWalls : game.vWalls;
                const key = `${r},${c}`;
                set.set(key, player);
                const nMy = distToGoal(game, player);
                const nOpp = distToGoal(game, opp);
                set.delete(key);
                if (nMy === 999 || nOpp === 999) continue;
                const score = 2 * (nOpp - oppD) - (nMy - myD);
                if (score > 0) candidates.push({ orient, r, c, score });
            }
        }
    }
    if (!candidates.length) return null;
    candidates.sort((a, b) => b.score - a.score);
    const top = candidates.slice(0, Math.min(3, candidates.length));
    return top[Math.floor(Math.random() * top.length)];
}
function aiMove(game) {
    const me = game.turn;
    const opp = 1 - me;
    const goalRow = me === 0 ? 0 : 8;
    for (const m of game.pawnMoves(me)) if (m[0] === goalRow) return { type: 'move', to: m };
    const myD = distToGoal(game, me);
    const oppD = distToGoal(game, opp);
    if (game.wallsLeft[me] > 0 && oppD <= myD + 2) {
        const w = bestWall(game, me);
        if (w) return { type: 'wall', orient: w.orient, r: w.r, c: w.c };
    }
    const m = bestPawnMove(game, me);
    if (m) return { type: 'move', to: m };
    return null;
}

/* ========== TAMPER GUARD ========== */
const TAMPER_BASELINES = new Map();
let tamperAlerted = false;
let lastTamperCheck = 0;

function snapshotTamper() {
    TAMPER_BASELINES.set('applyMove', Game.prototype.applyMove.toString());
    TAMPER_BASELINES.set('pawnMoves', Game.prototype.pawnMoves.toString());
    TAMPER_BASELINES.set('canPlaceWall', Game.prototype.canPlaceWall.toString());
    TAMPER_BASELINES.set('isWallBetween', Game.prototype.isWallBetween.toString());
    TAMPER_BASELINES.set('aiMove', aiMove.toString());
    TAMPER_BASELINES.set('render', render.toString());
}
function checkTamperNow() {
    const live = [
        ['applyMove', Game.prototype.applyMove],
        ['pawnMoves', Game.prototype.pawnMoves],
        ['canPlaceWall', Game.prototype.canPlaceWall],
        ['isWallBetween', Game.prototype.isWallBetween],
        ['aiMove', aiMove],
        ['render', render],
    ];
    for (const [name, fn] of live) {
        const base = TAMPER_BASELINES.get(name);
        if (base && fn.toString() !== base) return `Function "${name}" modified`;
    }
    return null;
}
function triggerTamperAlert(reason) {
    if (tamperAlerted) return;
    tamperAlerted = true;
    try { alert('⚠️ TAMPERING DETECTED\n\n' + reason + '\n\nThe game will reload.'); } catch { }
    setTimeout(() => location.reload(), 300);
}
function installTamperGuard() {
    snapshotTamper();
    const originalScripts = new Set();
    document.querySelectorAll('script[src]').forEach(s => originalScripts.add(s.src));
    new MutationObserver((muts) => {
        for (const m of muts) {
            for (const node of m.addedNodes) {
                if (node.nodeType !== 1) continue;
                if (node.tagName === 'SCRIPT' && node.src
                    && !originalScripts.has(node.src) && !node.src.includes('socket.io')) {
                    triggerTamperAlert('Injected script: ' + node.src);
                    return;
                }
                if (node.tagName === 'IFRAME' || node.tagName === 'EMBED' || node.tagName === 'OBJECT') {
                    triggerTamperAlert('Injected ' + node.tagName);
                    return;
                }
            }
        }
    }).observe(document.documentElement, { childList: true, subtree: true });
}
function periodicTamperCheck(now) {
    if (now - lastTamperCheck < 1000) return;
    lastTamperCheck = now;
    const issue = checkTamperNow();
    if (issue) triggerTamperAlert(issue);
}

/* ========== STATE ========== */
const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
canvas.width = W;
canvas.height = W;

let game = new Game();
let myPlayer = 0;
let mode = 'solo';
let socket = null;
let aiThinking = false;
let gameStarted = false;
let sessionToken = null;
let myProfile = { name: 'You', avatar: '🦊' };
let oppProfile = { name: 'Opponent', avatar: '🐺' };
let myColor = 'blue';
let oppColor = 'red';
let roomCode = null;
let roomWaiting = false;
let turnDeadline = 0;
let turnTimeoutEmitted = false;
let lastEmojiSent = 0;
let modalShownForGame = false;

const anim = { pawns: [[8, 4], [0, 4]] };
const pawnTween = [
    { from: [8, 4], to: [8, 4], startedAt: 0, duration: 160 },
    { from: [0, 4], to: [0, 4], startedAt: 0, duration: 160 },
];
const wallSpawn = new Map();
const impactParticles = [];
const ui = { hover: null, pulse: 0 };
const drag = { active: false, orient: null, hoverSlot: null };

function playerColors() { return myPlayer === 0 ? [myColor, oppColor] : [oppColor, myColor]; }

function loadToken() {
    let t = null;
    try { t = localStorage.getItem('wallrush.token'); } catch { }
    if (!t) {
        t = (crypto.randomUUID ? crypto.randomUUID() : 'tk_' + Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/-/g, '');
        try { localStorage.setItem('wallrush.token', t); } catch { }
    }
    return t;
}
function saveSolo() {
    if (mode !== 'solo' || !gameStarted) return;
    if (game.winner !== null) { clearSolo(); return; }
    try {
        localStorage.setItem('wallrush.solo', JSON.stringify({
            moves: game.history, myColor, oppColor, myProfile, oppProfile,
        }));
    } catch { }
}
function clearSolo() { try { localStorage.removeItem('wallrush.solo'); } catch { } }
function loadSolo() {
    try {
        const s = localStorage.getItem('wallrush.solo');
        return s ? JSON.parse(s) : null;
    } catch { return null; }
}

/* ========== MATH BG ========== */
function initMathBg() {
    const c = document.getElementById('math-bg');
    const g = c.getContext('2d');
    let W = 0, H = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    function resize() {
        W = window.innerWidth; H = window.innerHeight;
        c.width = W * dpr; c.height = H * dpr;
        c.style.width = W + 'px'; c.style.height = H + 'px';
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);
    const symbols = ['∑', 'π', '√', '∫', '∞', '≠', '±', '≈', '∆', 'θ', 'λ', 'µ', 'σ', 'Ω', 'α', 'β', 'γ', 'δ', 'φ', 'ψ'];
    const particles = [];
    for (let i = 0; i < 28; i++) particles.push({
        x: Math.random() * W, y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.15, vy: (Math.random() - 0.5) * 0.15,
        size: 22 + Math.random() * 44,
        symbol: symbols[Math.floor(Math.random() * symbols.length)],
        alpha: 0.05 + Math.random() * 0.09,
        rot: Math.random() * Math.PI * 2, vr: (Math.random() - 0.5) * 0.004,
    });
    function draw() {
        g.clearRect(0, 0, W, H);
        const gs = 56;
        g.strokeStyle = 'rgba(74,158,255,0.045)';
        g.lineWidth = 1;
        g.beginPath();
        for (let x = 0; x <= W; x += gs) { g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, H); }
        for (let y = 0; y <= H; y += gs) { g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); }
        g.stroke();
        g.fillStyle = 'rgba(74,158,255,0.08)';
        for (let x = 0; x <= W; x += gs) for (let y = 0; y <= H; y += gs) {
            g.beginPath(); g.arc(x, y, 1, 0, Math.PI * 2); g.fill();
        }
        g.textAlign = 'center'; g.textBaseline = 'middle';
        for (const p of particles) {
            p.x += p.vx; p.y += p.vy; p.rot += p.vr;
            if (p.x < -60) p.x = W + 60; if (p.x > W + 60) p.x = -60;
            if (p.y < -60) p.y = H + 60; if (p.y > H + 60) p.y = -60;
            g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
            g.font = `${p.size}px "Times New Roman", serif`;
            g.fillStyle = `rgba(238,241,242,${p.alpha})`;
            g.fillText(p.symbol, 0, 0); g.restore();
        }
        requestAnimationFrame(draw);
    }
    draw();
}

/* ========== TIMER UI ========== */
let timerEls = null;
function ensureTimerUI() {
    if (timerEls) return;
    const panel = document.querySelector('.panel');
    const status = document.getElementById('status');
    if (!panel || !status) return;
    const wrap = document.createElement('div');
    wrap.className = 'turn-timer';
    wrap.innerHTML = '<div class="turn-timer-bar"><div class="turn-timer-fill"></div></div><div class="turn-timer-text">20s</div>';
    panel.insertBefore(wrap, status);
    const style = document.createElement('style');
    style.textContent = `
        .turn-timer { margin-bottom: 8px; opacity: 0.95; transition: opacity 0.3s; }
        .turn-timer.hidden { display: none; }
        .turn-timer.danger .turn-timer-fill { background: var(--bad); }
        .turn-timer-bar { height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px; overflow: hidden; }
        .turn-timer-fill { height: 100%; width: 100%; background: var(--accent); transition: width 0.15s linear, background 0.3s; }
        .turn-timer-text { text-align: center; font-size: 0.72rem; color: var(--muted); margin-top: 4px; font-variant-numeric: tabular-nums; font-weight: 600; }
    `;
    document.head.appendChild(style);
    timerEls = { wrap, fill: wrap.querySelector('.turn-timer-fill'), text: wrap.querySelector('.turn-timer-text') };
}
function resetTurnTimer() {
    turnDeadline = Date.now() + TURN_TIMEOUT * 1000;
    turnTimeoutEmitted = false;
}
function updateTimerUI() {
    ensureTimerUI();
    if (!timerEls) return;
    if (game.winner !== null || roomWaiting || (mode === 'solo' && game.turn !== myPlayer)) {
        timerEls.wrap.classList.add('hidden');
        return;
    }
    timerEls.wrap.classList.remove('hidden');
    const remaining = Math.max(0, turnDeadline - Date.now()) / 1000;
    timerEls.fill.style.width = (remaining / TURN_TIMEOUT * 100) + '%';
    timerEls.text.textContent = Math.ceil(remaining) + 's';
    timerEls.wrap.classList.toggle('danger', remaining < 5);
    if (remaining <= 0 && game.turn === myPlayer && !turnTimeoutEmitted && game.winner === null) {
        turnTimeoutEmitted = true;
        if (mode === 'multi' && socket && socket.connected) {
            socket.emit('turn_timeout');
        } else if (mode === 'solo') {
            game.winner = 1 - myPlayer;
            clearSolo();
            updatePanel();
            showWinModal('timeout');
        }
    }
}

/* ========== RECTS ========== */
const hRect = (r, c) => ({ x: c * CELL, y: (r + 1) * CELL - WT / 2, w: 2 * CELL, h: WT });
const vRect = (r, c) => ({ x: (c + 1) * CELL - WT / 2, y: r * CELL, w: WT, h: 2 * CELL });

/* ========== PHYSICS ========== */
function easeInOutQuad(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
function easeOutBack(t) {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
function markWallSpawned(key, owner) {
    wallSpawn.set(key, { startedAt: performance.now(), owner });
    const isH = key[0] === 'H';
    const [r, c] = key.slice(1).split(',').map(Number);
    const rect = isH ? hRect(r, c) : vRect(r, c);
    const colorName = playerColors()[owner];
    spawnImpact(rect.x + rect.w / 2, rect.y + rect.h / 2, COLOR_THEMES[colorName]);
}
function setPawnTarget(player, pos) {
    const t = pawnTween[player];
    t.from = [...anim.pawns[player]];
    t.to = [...pos];
    t.startedAt = performance.now();
}
function spawnImpact(x, y, theme) {
    for (let i = 0; i < 10; i++) {
        const ang = (Math.PI * 2 * i) / 10 + (Math.random() - 0.5) * 0.3;
        const spd = 1.2 + Math.random() * 2.0;
        impactParticles.push({
            x, y,
            vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
            life: 1, color: theme.primary,
            size: 1.6 + Math.random() * 1.8,
        });
    }
}
function wallScale(key, now) {
    const s = wallSpawn.get(key);
    if (!s) return 1;
    const u = Math.min(1, (now - s.startedAt) / 220);
    return u >= 1 ? 1 : 0.82 + 0.18 * easeOutBack(u);
}
function snapPawns() {
    anim.pawns[0] = [...game.pawns[0]];
    anim.pawns[1] = [...game.pawns[1]];
    pawnTween[0] = { from: [...game.pawns[0]], to: [...game.pawns[0]], startedAt: performance.now(), duration: 160 };
    pawnTween[1] = { from: [...game.pawns[1]], to: [...game.pawns[1]], startedAt: performance.now(), duration: 160 };
}
function resetVisuals() {
    wallSpawn.clear();
    impactParticles.length = 0;
    snapPawns();
}
function stepPhysics(now) {
    for (let p = 0; p < 2; p++) {
        const t = pawnTween[p];
        const u = Math.min(1, (now - t.startedAt) / t.duration);
        const e = easeInOutQuad(u);
        anim.pawns[p][0] = t.from[0] + (t.to[0] - t.from[0]) * e;
        anim.pawns[p][1] = t.from[1] + (t.to[1] - t.from[1]) * e;
    }
    for (let i = impactParticles.length - 1; i >= 0; i--) {
        const p = impactParticles[i];
        p.x += p.vx; p.y += p.vy;
        p.vx *= 0.90; p.vy *= 0.90;
        p.life -= 0.045;
        if (p.life <= 0) impactParticles.splice(i, 1);
    }
    const live = new Set([
        ...[...game.hWalls.keys()].map(k => 'H' + k),
        ...[...game.vWalls.keys()].map(k => 'V' + k),
    ]);
    for (const k of [...wallSpawn.keys()]) if (!live.has(k)) wallSpawn.delete(k);
}

/* ========== RENDER ========== */
function drawGoalZones() {
    const colors = playerColors();
    const top = COLOR_THEMES[colors[0]];
    const bot = COLOR_THEMES[colors[1]];
    const topGrad = ctx.createLinearGradient(0, 0, 0, CELL);
    topGrad.addColorStop(0, top.dim);
    topGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, 0, W, CELL);
    const botGrad = ctx.createLinearGradient(0, W - CELL, 0, W);
    botGrad.addColorStop(0, 'rgba(0,0,0,0)');
    botGrad.addColorStop(1, bot.dim);
    ctx.fillStyle = botGrad;
    ctx.fillRect(0, W - CELL, W, CELL);
}
function drawBoardBase() {
    ctx.clearRect(0, 0, W, W);
    ctx.fillStyle = '#EEF1F2';
    ctx.fillRect(0, 0, W, W);
    drawGoalZones();
    ctx.strokeStyle = '#D8DEE4';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < SIZE; i++) {
        const p = i * CELL + 0.5;
        ctx.moveTo(0, p); ctx.lineTo(W, p);
        ctx.moveTo(p, 0); ctx.lineTo(p, W);
    }
    ctx.stroke();
    ctx.strokeStyle = '#C5CCD3';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, W - 2);
    ctx.fillStyle = '#B8C0CC';
    for (let i = 0; i <= SIZE; i++) for (let j = 0; j <= SIZE; j++) {
        ctx.beginPath(); ctx.arc(i * CELL, j * CELL, 1.5, 0, Math.PI * 2); ctx.fill();
    }
}
function drawValidMoves(moves) {
    const pulse = 0.5 + 0.5 * Math.sin(ui.pulse / 400);
    for (const [r, c] of moves) {
        const cx = (c + 0.5) * CELL, cy = (r + 0.5) * CELL;
        const isHover = ui.hover && ui.hover.type === 'cell' && ui.hover.r === r && ui.hover.c === c;
        const rad = CELL * (isHover ? 0.17 : 0.10) + pulse * CELL * 0.015;
        const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad * 2.6);
        halo.addColorStop(0, `rgba(74,158,255,${0.28 + pulse * 0.12 + (isHover ? 0.15 : 0)})`);
        halo.addColorStop(1, 'rgba(74,158,255,0)');
        ctx.beginPath(); ctx.arc(cx, cy, rad * 2.6, 0, Math.PI * 2);
        ctx.fillStyle = halo; ctx.fill();
        ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(74,158,255,${0.85 + pulse * 0.15})`; ctx.fill();
        ctx.beginPath(); ctx.arc(cx - rad * 0.25, cy - rad * 0.25, rad * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill();
    }
}
function drawWallShape(rect, theme, scale = 1, flash = 0) {
    const { x, y, w, h } = rect;
    const cx = x + w / 2, cy = y + h / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cy);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(x + 1, y + 2, w, h);
    ctx.fillStyle = theme.primary;
    ctx.fillRect(x, y, w, h);
    const grad = ctx.createLinearGradient(x, y, x + (h > w ? w : 0), y + (h > w ? 0 : h));
    grad.addColorStop(0, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = theme.dark;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    if (flash > 0) {
        ctx.globalAlpha = flash * 0.55;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x, y, w, h);
        ctx.globalAlpha = 1;
    }
    ctx.restore();
}
function drawWallPreview(rect, valid) {
    const { x, y, w, h } = rect;
    const pulse = 0.6 + 0.4 * Math.sin(ui.pulse / 200);
    ctx.fillStyle = valid ? `rgba(74,255,120,${0.5 * pulse})` : `rgba(255,90,90,${0.5 * pulse})`;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = valid ? 'rgba(74,255,120,0.95)' : 'rgba(255,90,90,0.95)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    ctx.setLineDash([]);
}
function drawPawn(r, c, colors) {
    const cx = (c + 0.5) * CELL, cy = (r + 0.5) * CELL;
    const rad = CELL * 0.3;
    ctx.beginPath(); ctx.arc(cx, cy + 2, rad, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fill();
    const grad = ctx.createRadialGradient(cx - rad * 0.35, cy - rad * 0.35, 1, cx, cy, rad);
    grad.addColorStop(0, colors.light);
    grad.addColorStop(1, colors.dark);
    ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.fillStyle = grad; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx - rad * 0.35, cy - rad * 0.35, rad * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.72)'; ctx.fill();
}
function drawParticles() {
    for (const p of impactParticles) {
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
}
function render() {
    drawBoardBase();
    if (!game.winner && game.turn === myPlayer && !drag.active && !roomWaiting) {
        drawValidMoves(game.pawnMoves(myPlayer));
    }
    if (drag.active && drag.hoverSlot) {
        const { r, c, orient, valid } = drag.hoverSlot;
        drawWallPreview(orient === 'H' ? hRect(r, c) : vRect(r, c), valid);
    }
    const colors = playerColors();
    const now = performance.now();
    for (const [key, owner] of game.hWalls) {
        const [r, c] = key.split(',').map(Number);
        const k = 'H' + key;
        const s = wallSpawn.get(k);
        const flash = s ? Math.max(0, 1 - (now - s.startedAt) / 260) : 0;
        drawWallShape(hRect(r, c), COLOR_THEMES[colors[owner]], wallScale(k, now), flash);
    }
    for (const [key, owner] of game.vWalls) {
        const [r, c] = key.split(',').map(Number);
        const k = 'V' + key;
        const s = wallSpawn.get(k);
        const flash = s ? Math.max(0, 1 - (now - s.startedAt) / 260) : 0;
        drawWallShape(vRect(r, c), COLOR_THEMES[colors[owner]], wallScale(k, now), flash);
    }
    drawParticles();
    drawPawn(...anim.pawns[0], COLOR_THEMES[colors[0]]);
    drawPawn(...anim.pawns[1], COLOR_THEMES[colors[1]]);
}

/* ========== LOOP ========== */
function loop(now) {
    ui.pulse = now;
    periodicTamperCheck(now);
    stepPhysics(now);
    updateTimerUI();
    render();
    requestAnimationFrame(loop);
}

/* ========== APPLY MOVE HELPER ========== */
function applyGameMove(player, move, animate = true) {
    const ok = game.applyMove(player, move);
    if (!ok) return false;
    if (animate) {
        playMoveSound(player, move);
        if (move.type === 'wall') {
            markWallSpawned((move.orient === 'H' ? 'H' : 'V') + move.r + ',' + move.c, player);
        } else if (move.type === 'move') {
            setPawnTarget(player, move.to);
        }
    }
    return true;
}

/* ========== DRAG ========== */
function findSlotForDrag(x, y, orient) {
    if (orient === 'H') {
        const r = Math.round(y / CELL - 1);
        if (r < 0 || r > SIZE - 2) return null;
        if (Math.abs(y - (r + 1) * CELL) > WALL_THRESH * 2.5) return null;
        const c = Math.max(0, Math.min(SIZE - 2, Math.round(x / CELL - 1)));
        if (Math.abs(x - (c + 1) * CELL) > CELL) return null;
        return { r, c };
    } else {
        const c = Math.round(x / CELL - 1);
        if (c < 0 || c > SIZE - 2) return null;
        if (Math.abs(x - (c + 1) * CELL) > WALL_THRESH * 2.5) return null;
        const r = Math.max(0, Math.min(SIZE - 2, Math.round(y / CELL - 1)));
        if (Math.abs(y - (r + 1) * CELL) > CELL) return null;
        return { r, c };
    }
}
function updateDragPreview(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) * (canvas.width / rect.width);
    const y = (clientY - rect.top) * (canvas.height / rect.height);
    if (x < 0 || x > canvas.width || y < 0 || y > canvas.height) { drag.hoverSlot = null; return; }
    const slot = findSlotForDrag(x, y, drag.orient);
    if (!slot) { drag.hoverSlot = null; return; }
    const valid = game.canPlaceWall(myPlayer, slot.r, slot.c, drag.orient);
    drag.hoverSlot = { r: slot.r, c: slot.c, orient: drag.orient, valid };
}
function setupWallDrag() {
    document.querySelectorAll('.wall-piece').forEach(piece => {
        piece.addEventListener('pointerdown', (e) => {
            if (roomWaiting) return;
            if (game.winner !== null || game.turn !== myPlayer) return;
            if (game.wallsLeft[myPlayer] <= 0) { toast('No walls left'); return; }
            if (mode === 'solo' && aiThinking) return;
            e.preventDefault();
            drag.active = true;
            drag.orient = piece.dataset.orient;
            drag.hoverSlot = null;
            piece.setPointerCapture(e.pointerId);
            updatePanel();
        });
        piece.addEventListener('pointermove', (e) => {
            if (!drag.active) return;
            updateDragPreview(e.clientX, e.clientY);
        });
        piece.addEventListener('pointerup', (e) => {
            if (!drag.active) return;
            const slot = drag.hoverSlot;
            drag.active = false; drag.orient = null; drag.hoverSlot = null;
            try { piece.releasePointerCapture(e.pointerId); } catch { }
            if (slot && slot.valid) {
                const move = { type: 'wall', orient: slot.orient, r: slot.r, c: slot.c };
                if (applyGameMove(myPlayer, move)) { sendMove(move); afterMove(); }
            } else if (slot && !slot.valid) toast('Cannot place wall there');
            updatePanel();
        });
        piece.addEventListener('pointercancel', () => {
            drag.active = false; drag.orient = null; drag.hoverSlot = null;
            updatePanel();
        });
    });
}

/* ========== INPUT ========== */
function getCanvasPos(e) {
    const r = canvas.getBoundingClientRect();
    return {
        x: (e.clientX - r.left) * (canvas.width / r.width),
        y: (e.clientY - r.top) * (canvas.height / r.height),
    };
}
function hitCell(x, y) {
    const r = Math.floor(y / CELL), c = Math.floor(x / CELL);
    if (r >= 0 && r < SIZE && c >= 0 && c < SIZE) return { r, c };
    return null;
}
canvas.addEventListener('mousemove', (e) => {
    if (drag.active) return;
    const { x, y } = getCanvasPos(e);
    const cell = hitCell(x, y);
    ui.hover = cell ? { type: 'cell', ...cell } : null;
    if (!game || game.winner !== null || game.turn !== myPlayer || roomWaiting) {
        canvas.style.cursor = 'default';
    } else if (cell && game.pawnMoves(myPlayer).some(([r, c]) => r === cell.r && c === cell.c)) {
        canvas.style.cursor = 'pointer';
    } else {
        canvas.style.cursor = 'default';
    }
});
canvas.addEventListener('mouseleave', () => { ui.hover = null; });
canvas.addEventListener('click', (e) => {
    if (drag.active || roomWaiting) return;
    if (!game || game.winner !== null || game.turn !== myPlayer) return;
    const { x, y } = getCanvasPos(e);
    const cell = hitCell(x, y);
    if (!cell) return;
    const move = { type: 'move', to: [cell.r, cell.c] };
    if (applyGameMove(myPlayer, move)) { sendMove(move); afterMove(); }
    else toast('Not a valid move');
});

function afterMove() {
    resetTurnTimer();
    updatePanel();
    if (mode === 'solo') {
        if (game.winner !== null) clearSolo();
        else saveSolo();
    }
    if (game.winner !== null) { showWinModal(); return; }
    if (mode === 'solo' && game.turn !== myPlayer) scheduleAI();
}
function scheduleAI() {
    if (aiThinking) return;
    aiThinking = true;
    updatePanel();
    const delay = 350 + Math.random() * 300;
    setTimeout(() => {
        if (mode !== 'solo' || game.winner !== null || game.turn === myPlayer) {
            aiThinking = false; updatePanel(); return;
        }
        const move = aiMove(game);
        if (move) applyGameMove(game.turn, move);
        aiThinking = false;
        resetTurnTimer();
        updatePanel();
        if (mode === 'solo') {
            if (game.winner !== null) clearSolo();
            else saveSolo();
        }
        if (game.winner !== null) showWinModal();
    }, delay);
}

/* ========== EMOJI ========== */
function showEmoji(side, emoji) {
    const layer = side === 'user'
        ? document.getElementById('user-emoji-float')
        : document.getElementById('opp-emoji-float');
    const el = document.createElement('span');
    el.className = 'floating-emoji';
    el.textContent = emoji;
    el.style.left = (30 + Math.random() * 40) + '%';
    layer.appendChild(el);
    setTimeout(() => el.remove(), 2400);
}
document.querySelectorAll('.emoji-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const now = Date.now();
        if (now - lastEmojiSent < EMOJI_COOLDOWN * 1000) {
            const left = Math.ceil((EMOJI_COOLDOWN * 1000 - (now - lastEmojiSent)) / 1000);
            toast(`Wait ${left}s before sending another emoji`);
            return;
        }
        lastEmojiSent = now;
        showEmoji('user', btn.dataset.emoji);
        if (socket && socket.connected && mode === 'multi') {
            socket.emit('emoji', { emoji: btn.dataset.emoji });
        }
    });
});

/* ========== WIN MODAL ========== */
let flowersTimer = null;
let closeModalTimeout = null;

function startFlowers() {
    if (flowersTimer) { clearInterval(flowersTimer); flowersTimer = null; }
    const container = document.getElementById('flowers');
    container.innerHTML = '';
    const emojis = ['🌸', '🌺', '🌻', '🌹', '💐', '🏵️', '🌼', '🌷'];
    const spawnOne = () => {
        const f = document.createElement('span');
        f.className = 'flower';
        f.textContent = emojis[Math.floor(Math.random() * emojis.length)];
        f.style.left = Math.random() * 100 + '%';
        f.style.fontSize = (22 + Math.random() * 30) + 'px';
        f.style.setProperty('--dx', (Math.random() - 0.5) * 300 + 'px');
        f.style.setProperty('--rot', (Math.random() - 0.5) * 1080 + 'deg');
        f.style.animationDuration = (3 + Math.random() * 2) + 's';
        container.appendChild(f);
        setTimeout(() => f.remove(), 6000);
    };
    for (let i = 0; i < 15; i++) setTimeout(spawnOne, i * 55);
    flowersTimer = setInterval(spawnOne, 180);
}
function stopFlowers() {
    if (flowersTimer) { clearInterval(flowersTimer); flowersTimer = null; }
    const c = document.getElementById('flowers');
    if (c) c.innerHTML = '';
}

function resetRematchUI() {
    const winAgain = document.getElementById('win-again');
    const winExit = document.getElementById('win-exit');
    winAgain.textContent = 'Play Again';
    winAgain.disabled = false;
    winAgain.dataset.mode = 'play';
    winExit.textContent = 'Return to Menu';
    winExit.dataset.mode = 'menu';
}

function showWinModal(reason) {
    if (modalShownForGame) return;
    if (game.winner === null) return;
    modalShownForGame = true;
    if (closeModalTimeout) { clearTimeout(closeModalTimeout); closeModalTimeout = null; }
    resetRematchUI();
    const modal = document.getElementById('win-modal');
    const title = document.getElementById('win-title');
    const sub = document.getElementById('win-sub');
    const emoji = document.getElementById('win-emoji');
    if (game.winner === myPlayer) {
        title.textContent = 'Victory!';
        title.className = 'win-title win';
        sub.textContent = reason === 'timeout' ? `${oppProfile.name} timed out`
            : reason === 'opponent_left' ? `${oppProfile.name} left the game`
                : `${myProfile.name} wins`;
        emoji.textContent = '🏆';
    } else {
        title.textContent = 'Defeat';
        title.className = 'win-title lose';
        sub.textContent = reason === 'timeout' ? 'You ran out of time'
            : reason === 'you_left' ? 'You left the game'
                : reason === 'opponent_left' ? 'Opponent left'
                    : `${oppProfile.name} wins`;
        emoji.textContent = '💀';
    }
    modal.classList.remove('hidden');
    requestAnimationFrame(() => modal.classList.add('show'));
    startFlowers();
}
function closeWinModal() {
    const modal = document.getElementById('win-modal');
    modal.classList.remove('show');
    if (closeModalTimeout) clearTimeout(closeModalTimeout);
    closeModalTimeout = setTimeout(() => modal.classList.add('hidden'), 350);
    stopFlowers();
    resetRematchUI();
}

document.getElementById('win-again').addEventListener('click', () => {
    const btn = document.getElementById('win-again');
    if (btn.dataset.mode === 'menu') {
        document.getElementById('leave-btn').click();
        return;
    }
    if (mode === 'solo') {
        document.getElementById('reset').click();
        return;
    }
    if (btn.dataset.mode === 'accept') {
        if (socket && socket.connected) socket.emit('rematch_accept');
        btn.disabled = true;
        btn.textContent = 'Starting…';
        return;
    }
    if (btn.dataset.mode === 'waiting') return;
    if (!socket || !socket.connected) { toast('Not connected'); return; }
    socket.emit('rematch_request');
    btn.textContent = 'Waiting for opponent…';
    btn.disabled = true;
    btn.dataset.mode = 'waiting';
});

document.getElementById('win-exit').addEventListener('click', () => {
    const btn = document.getElementById('win-exit');
    if (btn.dataset.mode === 'decline') {
        if (socket && socket.connected) socket.emit('rematch_decline');
        resetRematchUI();
        return;
    }
    document.getElementById('leave-btn').click();
});

/* ========== PANEL ========== */
function applyColorsToUI() {
    const userRibbon = document.getElementById('user-ribbon');
    const oppRibbon = document.getElementById('opp-ribbon');
    userRibbon.classList.remove('blue', 'red');
    oppRibbon.classList.remove('blue', 'red');
    userRibbon.classList.add(myColor);
    oppRibbon.classList.add(oppColor);
    const theme = COLOR_THEMES[myColor];
    document.getElementById('piece-h').style.setProperty('--piece-color', theme.primary);
    document.getElementById('piece-h').style.setProperty('--piece-light', theme.light);
    document.getElementById('piece-v').style.setProperty('--piece-color', theme.primary);
    document.getElementById('piece-v').style.setProperty('--piece-light', theme.light);
}
function updateNames() {
    document.getElementById('user-avatar').textContent = myProfile.avatar;
    document.getElementById('user-name').textContent = myProfile.name;
    document.getElementById('opp-avatar').textContent = oppProfile.avatar;
    document.getElementById('opp-name').textContent = oppProfile.name;
    applyColorsToUI();
}
function updatePanel() {
    const el = document.getElementById('status');
    el.className = 'status';
    if (roomWaiting) {
        el.textContent = 'Waiting for opponent…';
        el.classList.add('thinking');
    } else if (game.winner !== null) {
        if (game.winner === myPlayer) { el.textContent = 'You win! 🎉'; el.classList.add('win'); }
        else { el.textContent = 'You lose'; el.classList.add('lose'); }
    } else if (drag.active) {
        el.textContent = drag.hoverSlot
            ? (drag.hoverSlot.valid ? 'Release to place' : 'Invalid spot')
            : 'Drag onto the board';
    } else if (aiThinking) {
        el.textContent = 'Opponent is thinking…';
        el.classList.add('thinking');
    } else if (game.turn === myPlayer) {
        el.textContent = 'Your turn';
    } else {
        el.textContent = 'Opponent’s turn';
    }
    const myWalls = game.wallsLeft[myPlayer];
    const oppWalls = game.wallsLeft[1 - myPlayer];
    document.getElementById('user-wall-badge').textContent = `🧱 ${myWalls}`;
    document.getElementById('opp-wall-badge').textContent = `🧱 ${oppWalls}`;
    document.getElementById('wall-count').textContent = myWalls;
    const disabled = roomWaiting
        || game.winner !== null
        || game.turn !== myPlayer
        || myWalls <= 0
        || (mode === 'solo' && aiThinking);
    document.querySelectorAll('.wall-piece').forEach(p => p.classList.toggle('disabled', disabled));
    const roomInfo = document.getElementById('room-info');
    const leaveBtn = document.getElementById('leave-btn');
    leaveBtn.classList.remove('hidden');
    leaveBtn.textContent = mode === 'multi' ? 'Leave Room' : 'Exit Game';
    if (mode === 'multi' && roomCode) {
        roomInfo.classList.remove('hidden');
        document.getElementById('room-code-display').textContent = roomCode;
    } else {
        roomInfo.classList.add('hidden');
    }
}

let toastTimer;
function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

/* ========== MENU ========== */
const landingStatus = document.getElementById('landing-status');
function setLandingStatus(html) { landingStatus.innerHTML = html; }
function resetLandingButtons() {
    ['solo-btn', 'online-btn', 'create-btn', 'join-btn'].forEach(id => {
        document.getElementById(id).disabled = false;
    });
}
function enterGameView() {
    document.getElementById('landing').classList.add('hidden');
    document.getElementById('game').classList.remove('hidden');
    resetTurnTimer();
}
function returnToLanding() {
    document.getElementById('game').classList.add('hidden');
    document.getElementById('landing').classList.remove('hidden');
    resetLandingButtons();
    setLandingStatus('');
    closeWinModal();
}

function applyRoomState(state) {
    if (state.finished) {
        returnToLanding();
        return;
    }
    closeWinModal();
    modalShownForGame = false;
    roomCode = state.code;
    roomWaiting = !!state.waiting;
    myColor = state.my_color || 'blue';
    oppColor = myColor === 'blue' ? 'red' : 'blue';
    if (state.players.length >= 1) {
        const meIn = state.players.find(p => p.color === myColor);
        const opIn = state.players.find(p => p.color === oppColor);
        if (meIn) myProfile = { name: meIn.name, avatar: meIn.avatar };
        if (opIn) oppProfile = { name: opIn.name, avatar: opIn.avatar };
        else oppProfile = { name: 'Waiting…', avatar: '⏳' };
    }
    game.reset();
    resetVisuals();
    for (const m of state.moves) applyGameMove(game.turn, m, false);
    snapPawns();
    updateNames();
    updatePanel();
    enterGameView();
}

document.getElementById('solo-btn').addEventListener('click', () => {
    mode = 'solo';
    myPlayer = 0;
    gameStarted = true;
    roomCode = null;
    roomWaiting = false;
    modalShownForGame = false;
    const saved = loadSolo();
    if (saved) {
        myColor = saved.myColor;
        oppColor = saved.oppColor;
        myProfile = saved.myProfile;
        oppProfile = saved.oppProfile;
        game.reset();
        resetVisuals();
        for (const m of saved.moves) applyGameMove(game.turn, m, false);
        snapPawns();
        if (game.winner !== null) {
            clearSolo();
            game.reset();
            resetVisuals();
        }
    } else {
        myColor = Math.random() < 0.5 ? 'blue' : 'red';
        oppColor = myColor === 'blue' ? 'red' : 'blue';
        const ai = pickAI();
        oppProfile = { name: ai.name, avatar: ai.avatar };
        game.reset();
        resetVisuals();
    }
    updateNames();
    updatePanel();
    enterGameView();
    if (game.turn !== myPlayer) scheduleAI();
});
let matchInterval = null;
let joinTimeout = null;
let searchingForMatch = false;
let opponentOnline = true;
let audioContext = null;
let audioMuted = false;

try { audioMuted = localStorage.getItem('wallrush.muted') === '1'; } catch { }

function ensureAudio() {
    if (!audioContext) {
        try { audioContext = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
    }
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => { });
}
function playTone(frequency, duration, type = 'sine', volume = 0.045) {
    if (audioMuted) return;
    ensureAudio();
    if (!audioContext) return;
    const now = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(audioContext.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
}
function playMoveSound(player, move) {
    const mine = player === myPlayer;
    if (move.type === 'wall') {
        playTone(mine ? 155 : 112, 0.16, 'triangle', 0.055);
        setTimeout(() => playTone(mine ? 105 : 82, 0.11, 'square', 0.025), 45);
    } else {
        playTone(mine ? 620 : 390, 0.13, 'sine', 0.04);
    }
}
function setupAudioControl() {
    const host = document.querySelector('.landing-content') || document.body;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'mute-btn';
    btn.className = 'mute-btn';
    const update = () => { btn.textContent = audioMuted ? '🔇 Sound off' : '🔊 Sound on'; };
    update();
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        audioMuted = !audioMuted;
        try { localStorage.setItem('wallrush.muted', audioMuted ? '1' : '0'); } catch { }
        ensureAudio();
        update();
    });
    host.appendChild(btn);
    document.addEventListener('pointerdown', ensureAudio, { once: true, passive: true });
}

function setOpponentPresence(online) {
    opponentOnline = online;
    const name = document.getElementById('opp-name');
    if (!name) return;
    let badge = document.getElementById('opponent-presence');
    if (!badge) {
        badge = document.createElement('span');
        badge.id = 'opponent-presence';
        name.parentElement?.appendChild(badge);
    }
    badge.textContent = online ? '● Online' : '● Offline — waiting for reconnect';
    badge.className = online ? 'presence-online' : 'presence-offline';
}

function persistSearching(value) {
    searchingForMatch = value;
    try { localStorage.setItem('wallrush.searching', value ? '1' : '0'); } catch { }
}

function stopMatchmaking() {
    if (matchInterval) {
        clearInterval(matchInterval);
        matchInterval = null;
    }
    if (searchingForMatch) persistSearching(false);
}

document.getElementById('online-btn').addEventListener('click', () => {
    ensureAudio();
    if (!socket || !socket.connected) {
        setLandingStatus('Connecting…');
        return;
    }
    stopMatchmaking();
    resetLandingButtons();
    document.getElementById('online-btn').disabled = true;
    setLandingStatus('Searching for opponent…');
    persistSearching(true);
    socket.emit('find_match');
    matchInterval = setInterval(() => {
        if (mode === 'multi' || roomCode) { stopMatchmaking(); return; }
        if (socket && socket.connected) socket.emit('find_match');
    }, 3000);
});
document.getElementById('create-btn').addEventListener('click', () => {
    ensureAudio();
    stopMatchmaking();
    if (!socket || !socket.connected) { setLandingStatus('Connecting…'); return; }
    resetLandingButtons();
    document.getElementById('create-btn').disabled = true;
    setLandingStatus('Creating room…');
    socket.emit('create_room');
});
document.getElementById('join-btn').addEventListener('click', () => {
    ensureAudio();
    stopMatchmaking();
    const code = document.getElementById('code-input').value.trim().toUpperCase();
    if (code.length !== 6) { setLandingStatus('Enter a 6-character code'); return; }
    if (!socket || !socket.connected) { setLandingStatus('Connecting…'); return; }
    resetLandingButtons();
    document.getElementById('join-btn').disabled = true;
    setLandingStatus('Joining room…');
    socket.emit('join_room_code', { code });
    clearTimeout(joinTimeout);
    joinTimeout = setTimeout(() => {
        joinTimeout = null;
        resetLandingButtons();
        setLandingStatus('Joining timed out — the room may have expired. Please try again.');
    }, 10000);
});
document.getElementById('code-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('join-btn').click();
});
document.getElementById('leave-btn').addEventListener('click', () => {
    stopMatchmaking();
    clearTimeout(joinTimeout);
    if (mode === 'multi' && socket && socket.connected) socket.emit('leave_room');
    closeWinModal();
    returnToLanding();
    mode = 'solo';
    roomCode = null;
    roomWaiting = false;
    game.reset();
    resetVisuals();
    turnTimeoutEmitted = false;
    resetTurnTimer();
});

/* ========== RESET ========== */
document.getElementById('reset').addEventListener('click', () => {
    closeWinModal();
    modalShownForGame = false;
    if (mode === 'solo') {
        myColor = Math.random() < 0.5 ? 'blue' : 'red';
        oppColor = myColor === 'blue' ? 'red' : 'blue';
        const ai = pickAI();
        oppProfile = { name: ai.name, avatar: ai.avatar };
        clearSolo();
    }
    game.reset();
    resetVisuals();
    drag.active = false; drag.orient = null; drag.hoverSlot = null;
    aiThinking = false;
    resetTurnTimer();
    updateNames();
    updatePanel();
    if (socket && socket.connected && mode === 'multi') socket.emit('reset_game');
    if (mode === 'solo' && game.turn !== myPlayer) scheduleAI();
});

/* ========== NETWORK ========== */
function sendMove(move) {
    if (socket && socket.connected && mode === 'multi') socket.emit('move', move);
}
function initSocket() {
    if (typeof io === 'undefined' || location.protocol === 'file:') return;
    try { socket = io(); } catch { return; }
    socket.on('connect', () => { socket.emit('identify', { token: sessionToken }); });
    socket.on('identified', (data) => {
        if (data.profile && mode !== 'multi') myProfile = data.profile;
        updateNames();
        let wasSearching = false;
        try { wasSearching = localStorage.getItem('wallrush.searching') === '1'; } catch { }
        if (wasSearching && mode !== 'multi') {
            searchingForMatch = true;
            document.getElementById('online-btn').disabled = true;
            setLandingStatus('Reconnected — resuming search…');
            socket.emit('find_match');
            stopMatchmaking();
            searchingForMatch = true;
            matchInterval = setInterval(() => {
                if (mode === 'multi' || roomCode || !socket?.connected) return;
                socket.emit('find_match');
            }, 3000);
        }
    });
    socket.on('queue_status', ({ position, queue_size, reconnected }) => {
        const count = queue_size || position || 1;
        setLandingStatus(position > 1
            ? `Searching… (${count} in queue) · position ${position}`
            : (reconnected ? 'Reconnected — waiting for opponent…' : 'Waiting for opponent…'));
    });
    socket.on('matched', ({ code }) => {
        stopMatchmaking();
        setLandingStatus(`Matched! Room <strong>${code}</strong>`);
    });
    socket.on('room_created', ({ code }) => {
        setLandingStatus(
            `Room code: <strong>${code}</strong> <button class="copy-code" data-code="${code}">Copy</button><br>Waiting for opponent to join…`
        );
        document.querySelectorAll('.copy-code').forEach(btn => {
            btn.onclick = () => {
                navigator.clipboard?.writeText(btn.dataset.code);
                toast('Code copied');
            };
        });
    });
    socket.on('room_state', (state) => {
        clearTimeout(joinTimeout);
        stopMatchmaking();
        if (state.finished) {
            returnToLanding();
            return;
        }
        mode = 'multi';
        myPlayer = state.my_color === 'blue' ? 0 : 1;
        applyRoomState(state);
        setOpponentPresence(!state.waiting);
        if (state.turn_started_at && state.turn_timeout) {
            const elapsed = Date.now() / 1000 - state.turn_started_at;
            turnDeadline = Date.now() + Math.max(0, state.turn_timeout - elapsed) * 1000;
            turnTimeoutEmitted = false;
        } else {
            resetTurnTimer();
        }
    });
    socket.on('room_started', () => {
        roomWaiting = false;
        resetTurnTimer();
        updatePanel();
        toast('Opponent joined');
    });
    socket.on('peer_online', () => {
        setOpponentPresence(true);
        toast('Opponent reconnected');
    });
    socket.on('peer_offline', () => {
        setOpponentPresence(false);
        toast('Opponent disconnected — waiting…');
    });
    socket.on('peer_move', (move) => {
        applyGameMove(game.turn, move);
        resetTurnTimer();
        updatePanel();
        if (game.winner !== null) showWinModal();
    });
    socket.on('peer_emoji', ({ emoji }) => showEmoji('opp', emoji));
    socket.on('emoji_denied', () => toast('Emoji cooldown'));
    socket.on('peer_reset', () => {
        closeWinModal();
        modalShownForGame = false;
        game.reset();
        resetVisuals();
        resetTurnTimer();
        updatePanel();
    });
    socket.on('peer_left', () => {
        toast('Opponent left the room');
        if (game.winner !== null) {
            resetRematchUI();
            const winAgain = document.getElementById('win-again');
            winAgain.textContent = 'Return to Menu';
            winAgain.disabled = false;
            winAgain.dataset.mode = 'menu';
            const winExit = document.getElementById('win-exit');
            winExit.textContent = 'Return to Menu';
            winExit.dataset.mode = 'menu';
        } else {
            roomWaiting = true;
            oppProfile = { name: 'Waiting…', avatar: '⏳' };
            updateNames();
            updatePanel();
        }
    });
    socket.on('match_ended', ({ winner_token, reason, opponent_gone }) => {
        if (mode !== 'multi') return;
        if (winner_token === sessionToken) game.winner = myPlayer;
        else game.winner = 1 - myPlayer;
        updatePanel();
        showWinModal(reason);
        if (opponent_gone || reason === 'you_left') {
            const winAgain = document.getElementById('win-again');
            const winExit = document.getElementById('win-exit');
            winAgain.textContent = 'Return to Menu';
            winAgain.disabled = false;
            winAgain.dataset.mode = 'menu';
            winExit.textContent = 'Return to Menu';
            winExit.dataset.mode = 'menu';
        }
    });
    socket.on('rematch_invite', () => {
        if (game.winner === null) return;
        const modal = document.getElementById('win-modal');
        if (!modal.classList.contains('show')) return;
        const winAgain = document.getElementById('win-again');
        const winExit = document.getElementById('win-exit');
        if (winAgain.dataset.mode === 'waiting') {
            if (socket && socket.connected) socket.emit('rematch_accept');
            return;
        }
        winAgain.textContent = 'Accept Rematch';
        winAgain.disabled = false;
        winAgain.dataset.mode = 'accept';
        winExit.textContent = 'Decline Rematch';
        winExit.dataset.mode = 'decline';
        toast('Opponent wants a rematch');
    });
    socket.on('rematch_declined', () => {
        toast('Opponent declined the rematch');
        resetRematchUI();
    });
    socket.on('rematch_failed', (msg) => {
        toast(msg || 'Cannot rematch');
        resetRematchUI();
    });
    socket.on('turn_timeout_denied', () => { resetTurnTimer(); });
    socket.on('left_room', () => {
        roomCode = null;
        roomWaiting = false;
        mode = 'solo';
        game.reset();
        returnToLanding();
    });
    socket.on('error_msg', (msg) => {
        stopMatchmaking();
        clearTimeout(joinTimeout);
        setLandingStatus(msg);
        resetLandingButtons();
    });
    socket.on('queue_cancelled', () => {
        stopMatchmaking();
        resetLandingButtons();
        setLandingStatus('Search cancelled');
    });
    socket.on('disconnect', () => {
        if (mode === 'multi') {
            setOpponentPresence(false);
            toast('Connection lost — reconnecting…');
        }
    });
}

/* ========== BOOT ========== */
initMathBg();
sessionToken = loadToken();
installTamperGuard();
initSocket();
setupAudioControl();
setupWallDrag();
ensureTimerUI();
updateNames();
updatePanel();
resetTurnTimer();
requestAnimationFrame(loop);

document.addEventListener('keydown', (e) => {
    if (document.getElementById('game').classList.contains('hidden')) return;
    if (e.key === 'r' || e.key === 'R') document.getElementById('reset').click();
    const idx = parseInt(e.key, 10);
    if (idx >= 1 && idx <= 8) {
        const btns = document.querySelectorAll('.emoji-btn');
        if (btns[idx - 1]) btns[idx - 1].click();
    }
});
