const socket = (typeof io !== 'undefined' && location.protocol !== 'file:') ? io() : null;
const MY_TOKEN = (() => { try { return localStorage.getItem('wallrush.token'); } catch { return null; } })();

let currentRange = 'all';
let currentLeaders = [];

const $ = (id) => document.getElementById(id);

function setLiveState(connected) {
    const el = $('live-indicator');
    if (connected) {
        el.classList.remove('offline');
        el.textContent = 'Live';
    } else {
        el.classList.add('offline');
        el.textContent = 'Offline';
    }
}

function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function fmtDate(iso) {
    if (!iso) return '—';
    try {
        const d = new Date(iso);
        const diff = (Date.now() - d.getTime()) / 1000;
        if (diff < 60) return 'just now';
        if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
        if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
        if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
        return d.toLocaleDateString();
    } catch { return '—'; }
}

function renderPodium(leaders) {
    const podium = $('podium');
    podium.innerHTML = '';
    const top3 = leaders.slice(0, 3);
    const order = [];
    if (top3[1]) order.push({ l: top3[1], rank: 2 });
    if (top3[0]) order.push({ l: top3[0], rank: 1 });
    if (top3[2]) order.push({ l: top3[2], rank: 3 });
    for (const { l, rank } of order) {
        const card = document.createElement('div');
        card.className = `podium-card rank-${rank}`;
        card.dataset.token = l.token;
        card.innerHTML = `
            <span class="podium-avatar">${escapeHtml(l.avatar)}</span>
            <div class="podium-name">${escapeHtml(l.name)}</div>
            <div class="podium-wins">${l.wins}</div>
            <div class="podium-wins-label">wins</div>
        `;
        card.addEventListener('click', () => openPlayer(l.token));
        podium.appendChild(card);
    }
}

function renderList(leaders) {
    const list = $('leaderboard-list');
    list.innerHTML = '';
    for (const l of leaders.slice(3)) {
        const row = document.createElement('div');
        row.className = 'leader-row';
        if (l.token === MY_TOKEN) row.classList.add('is-me');
        row.dataset.token = l.token;
        const rankClass = l.rank <= 3 ? `top-${l.rank}` : '';
        row.innerHTML = `
            <div class="leader-rank ${rankClass}">${l.rank}</div>
            <div class="leader-avatar">${escapeHtml(l.avatar)}</div>
            <div class="leader-name">${escapeHtml(l.name)}</div>
            <div class="leader-stat wins">${l.wins}<span class="leader-stat-label">W</span></div>
            <div class="leader-stat losses">${l.losses}<span class="leader-stat-label">L</span></div>
            <div class="leader-rate">
                <span class="leader-rate-pct">${l.rate}%</span>
                <div class="leader-rate-bar"><div class="leader-rate-fill" style="width:${Math.min(100, l.rate)}%"></div></div>
            </div>
        `;
        row.addEventListener('click', () => openPlayer(l.token));
        list.appendChild(row);
    }
}

function renderUserStats(leaders) {
    const userCard = $('user-stats-card');
    const userContent = $('user-stats-content');
    
    // Find current user in leaders list
    const currentUser = leaders.find(l => l.token === MY_TOKEN);
    
    if (currentUser) {
        userCard.classList.remove('hidden');
        userContent.innerHTML = `
            <div class="user-stat">
                <div class="user-stat-value">${currentUser.rank}</div>
                <div class="user-stat-label">Rank</div>
            </div>
            <div class="user-stat">
                <div class="user-stat-value">${currentUser.points || 0}</div>
                <div class="user-stat-label">Points</div>
            </div>
            <div class="user-stat">
                <div class="user-stat-value">${currentUser.wins}</div>
                <div class="user-stat-label">Wins</div>
            </div>
            <div class="user-stat">
                <div class="user-stat-value">${currentUser.losses}</div>
                <div class="user-stat-label">Losses</div>
            </div>
            <div class="user-stat">
                <div class="user-stat-value">${currentUser.rate}%</div>
                <div class="user-stat-label">Win Rate</div>
            </div>
        `;
    } else if (MY_TOKEN) {
        // User is not in the leaderboard yet
        userCard.classList.remove('hidden');
        userContent.innerHTML = `
            <div style="text-align:center;width:100%;color:var(--muted)">
                <i class="fas fa-coffee" style="font-size:2rem;margin-bottom:8px;display:block"></i>
                Play your first match to appear on the leaderboard!
            </div>
        `;
    } else {
        // No user logged in, hide the card
        userCard.classList.add('hidden');
    }
}

function render(leaders) {
    console.log('Rendering leaders:', leaders);
    currentLeaders = leaders || [];
    const emptyEl = $('empty-state');
    if (!leaders || leaders.length === 0) {
        console.log('No leaders data, showing empty state');
        $('podium').innerHTML = '';
        $('leaderboard-list').innerHTML = '';
        $('user-stats-card').classList.add('hidden');
        emptyEl.classList.remove('hidden');
        return;
    }
    console.log('Hiding empty state, rendering leaders list');
    emptyEl.classList.add('hidden');
    renderUserStats(leaders);
    renderPodium(leaders);
    renderList(leaders);
}

function requestLeaders(range) {
    currentRange = range;
    if (!socket || !socket.connected) return;
    socket.emit('request_leaders', { range });
}

function openPlayer(token) {
    if (!socket || !socket.connected) return;
    const modal = $('player-modal');
    $('player-header').innerHTML = '<div style="color:var(--muted);text-align:center;padding:20px">Loading…</div>';
    $('match-list').innerHTML = '';
    modal.classList.remove('hidden');
    requestAnimationFrame(() => modal.classList.add('show'));
    socket.emit('request_player', { token });
}

function closePlayer() {
    const modal = $('player-modal');
    modal.classList.remove('show');
    setTimeout(() => modal.classList.add('hidden'), 250);
}

function renderPlayer(data) {
    if (!data) return;
    if (data.error) {
        $('player-header').innerHTML =
            `<div style="color:var(--bad);text-align:center;padding:20px">${escapeHtml(data.error)}</div>`;
        $('match-list').innerHTML = '';
        return;
    }
    const p = data.profile;
    const matches = data.matches || [];
    const total = matches.length;
    const wins = matches.filter(m => m.won).length;
    $('player-header').innerHTML = `
        <div class="player-header-avatar">${escapeHtml(p.avatar)}</div>
        <div class="player-header-name">${escapeHtml(p.name)}</div>
        <div class="player-header-stats">
            ${total} recent match${total === 1 ? '' : 'es'} · ${wins} win${wins === 1 ? '' : 's'}
        </div>
    `;
    const list = $('match-list');
    list.innerHTML = '';
    if (matches.length === 0) {
        list.innerHTML = '<div style="color:var(--muted);text-align:center;padding:20px">No completed matches yet</div>';
        return;
    }
    for (const m of matches) {
        const row = document.createElement('div');
        row.className = `match-row ${m.won ? 'win' : 'loss'}`;
        row.innerHTML = `
            <span class="match-outcome">${m.won ? 'Win' : 'Loss'}</span>
            <div class="match-opponent">
                <span class="match-opponent-avatar">${escapeHtml(m.opponent.avatar)}</span>
                <span>vs <span class="match-opponent-name">${escapeHtml(m.opponent.name)}</span></span>
            </div>
            <span class="match-date">${fmtDate(m.created_at)}</span>
        `;
        list.appendChild(row);
    }
}

$('filters').addEventListener('click', (e) => {
    const chip = e.target.closest('.filter-chip');
    if (!chip) return;
    const range = chip.dataset.range;
    if (!range || range === currentRange) return;
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    requestLeaders(range);
});

$('close-player').addEventListener('click', closePlayer);
$('player-modal').addEventListener('click', (e) => {
    if (e.target === $('player-modal')) closePlayer();
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePlayer();
});

if (socket) {
    socket.on('connect', () => {
        setLiveState(true);
        requestLeaders(currentRange);
    });
    socket.on('disconnect', () => setLiveState(false));
    socket.on('leaders_data', (data) => {
        console.log('Received leaders data:', data);
        console.log('Current range:', currentRange);
        if (!data) return;
        // If ranges don't match, still update currentRange to match what we received
        if (data.range !== currentRange) {
            currentRange = data.range;
            // Update the active filter chip to match
            document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
            document.querySelector(`.filter-chip[data-range="${currentRange}"]`)?.classList.add('active');
        }
        // Ensure we always pass an array to render, even if data.leaders is missing
        const leadersArray = Array.isArray(data.leaders) ? data.leaders : [];
        console.log('Passing to render:', leadersArray, 'length:', leadersArray.length);
        render(leadersArray);
    });
    socket.on('leaders_changed', () => requestLeaders(currentRange));
    socket.on('player_data', renderPlayer);
    setLiveState(socket.connected);
    // If socket is already connected, request data immediately
    if (socket.connected) {
        requestLeaders(currentRange);
    }
} else {
    setLiveState(false);
    // Even if socket is null, check if we have any hardcoded data or try to fetch via HTTP
    console.log('Socket not available, showing empty state');
    $('empty-state').classList.remove('hidden');
}