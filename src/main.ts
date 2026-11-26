import './style.css';
import type { BoardView } from './board';
import { emptyGame, other, placeMove, type GameState, type Orientation, type Side } from './game/rules';

const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const sitePath = new URL('.', location.href).pathname;
const serviceOrigin = localStorage.getItem('lightpath-service') || location.origin;
const staticHosting = location.hostname.endsWith('.github.io');
const sideName = (side: Side) => side === 'red' ? '红方' : '蓝方';
$('#app').innerHTML = `
  <header class="site-header"><a href="${sitePath}" class="brand"><span class="brand-mark">╱</span><span>光路棋<small>LIGHTPATH</small></span></a><button class="text-button" id="rules-open">玩法说明 <span>↗</span></button></header>
  <main>
    <section id="home" class="home">
      <div class="intro"><p class="eyebrow"><span></span> 双人光学策略棋</p><h1>一面镜子，<br>另一种<span>可能。</span></h1><p class="intro-copy">让光转弯，让局势改变。<br>在十三乘十三的棋盘上，寻找通往对手的光路。</p>
        <div class="mode-cards"><button class="mode-card" id="open-ai"><span class="mode-icon">✳</span><span><strong>人机对战</strong><small>从第一束光开始练习</small></span><b>↗</b></button><button class="mode-card" id="open-friend"><span class="mode-icon">⌘</span><span><strong>好友对战</strong><small>分享房间，在线一决高下</small></span><b>↗</b></button></div>
        <p class="home-note">轮流落镜 · 反射与透射 · 光路相连即决胜</p>
      </div>
      <div class="hero-art" aria-label="光线经镜面折转的示意图"><div class="art-grid"></div><div class="hero-beam beam-a"></div><div class="hero-beam beam-b"></div><div class="hero-beam beam-c"></div><span class="art-source source-red">☼</span><span class="art-mirror mirror-a">╱</span><span class="art-mirror mirror-b">╲</span><span class="art-source source-blue">☼</span><div class="art-caption"><span>反射，透射，下一步。</span><small>13 × 13</small></div></div>
    </section>
    <section id="play" class="play hidden">
      <div class="play-heading"><button class="text-button" id="home-back">← 返回首页</button><span id="mode-label">人机对战</span><button class="text-button" id="invite-copy">复制邀请链接 ↗</button></div>
      <div class="match-layout"><section class="board-section"><div class="board-top"><span id="board-title">光路棋</span><span id="move-count">第 1 手</span></div><div id="board" role="application" aria-label="光路棋棋盘，选择格子后确认落子"></div><div class="board-legend"><span><i class="legend-red"></i>红方</span><span><i class="legend-blue"></i>蓝方</span><span><i class="legend-wall"></i>保护墙</span><span>▧ 禁放格</span></div></section>
      <aside class="match-panel"><div class="players"><div id="red-player" class="player red"><span class="avatar">☼</span><div><strong id="red-name">你</strong><small id="red-detail">红方 · 先手</small></div><span id="red-active" class="turn-dot"></span></div><div id="blue-player" class="player blue"><span class="avatar">☼</span><div><strong id="blue-name">电脑</strong><small id="blue-detail">蓝方 · 后手</small></div><span id="blue-active" class="turn-dot"></span></div></div>
      <div class="status-block"><p class="eyebrow" id="status-kicker">轮到你了</p><h2 id="status-title">让光走向何处？</h2><p id="status-copy">选择空格，放置一面镜子。</p></div>
      <div id="move-controls"><p class="field-label">镜面朝向 <span id="selected-coordinate">选择棋盘格子</span></p><div class="orientation-group"><button id="slash" class="orientation active" aria-label="正斜杠镜面" aria-pressed="true"><span>╱</span><small>正斜镜</small></button><button id="backslash" class="orientation" aria-label="反斜杠镜面" aria-pressed="false"><span>╲</span><small>反斜镜</small></button></div><button id="confirm-move" class="primary full" disabled>确认落子 <span>↗</span></button></div>
      <div id="room-controls" class="hidden"><div class="room-code">房间号 <strong id="room-code"></strong></div><button id="ready" class="primary full">准备开始</button></div>
      <div id="draw-request" class="notice hidden"><p>对手提出和棋</p><button id="accept-draw" class="small-button">同意</button><button id="decline-draw" class="text-button">继续对局</button></div>
      <button id="restart" class="primary full hidden">再来一局 ↗</button><label id="path-toggle" class="path-toggle hidden"><input type="checkbox" checked /> 显示获胜光路（虚线镜为透射）</label>
      <div class="secondary-actions"><button id="undo" class="text-button">↶ 悔棋</button><button id="offer-draw" class="text-button">和棋</button><button id="resign" class="text-button">认输</button></div>
      <details class="history"><summary>落子记录 <span id="history-count">0</span></summary><ol id="history-list"></ol></details>
      <p class="panel-tip">己方镜子可反射或透射<br>对方镜子必须反射</p></aside></div>
    </section>
  </main><footer><span>光路棋</span><span>每一折，皆有可能。</span></footer>
  <dialog id="setup"><form method="dialog" id="setup-form"><button class="dialog-close" aria-label="关闭" value="cancel" formnovalidate>×</button><p class="eyebrow" id="setup-kicker">独自推演</p><h2 id="setup-title">开始一场光路对决</h2><div class="form-field"><label for="nickname">你的昵称</label><input id="nickname" maxlength="16" placeholder="旅光者" autocomplete="nickname" /></div><div id="ai-settings"><div class="form-field"><label for="difficulty">电脑难度</label><select id="difficulty"><option value="easy">入门 · 熟悉反射与透射</option><option value="standard" selected>标准 · 兼顾进攻与防守</option></select></div><div class="form-field"><label for="human-side">选择阵营</label><select id="human-side"><option value="red">红方 · 先手</option><option value="blue">蓝方 · 后手</option></select></div></div><div id="friend-settings" class="hidden"><div class="form-field"><label for="join-code">加入已有房间</label><input id="join-code" maxlength="6" placeholder="输入 6 位房间号，或留空创建" /></div><p class="form-note">创建房间后，把邀请链接分享给朋友。双方准备后开局。</p></div><button type="button" id="start-game" class="primary full">开始对局 ↗</button></form></dialog>
  <dialog id="rules-dialog"><button class="dialog-close" id="rules-close" aria-label="关闭">×</button><p class="eyebrow">让光找到出路</p><h2>光路棋怎么玩</h2><div class="rules-copy"><h3>轮流放置镜子</h3><p>红方先行，每回合在空格放一面己方镜子，选择 / 或 \\ 朝向。落定后固定。光源格和四个斜纹禁放格禁止落镜，禁放格允许光通过。</p><h3>构筑你的光路</h3><p>红方光源位于 (5, 9)，向上或向左出光。蓝方位于 (9, 5)，向下或向右出光。光沿行列传播，镜面反射使光转向 90°。</p><div class="reflection-guide">╱　上 ↔ 右　下 ↔ 左<br>╲　上 ↔ 左　下 ↔ 右</div><p>遇到己方镜子，可以反射或透射，每次选择独立。遇到对方镜子，必须反射。系统自动寻找可行路径，无须手动选择光线。</p><h3>击中对方光源即可获胜</h3><p>光必须从开放侧进入对方光源。保护墙吸收光。光出界、返回己方光源或困于闭环，该路径终止。</p><p>每手落定后，先检查对手的击败光路，再检查自己。双方同时成路时，落子者输。</p><h3>和棋与封锁</h3><p>双方同意和棋，或 163 个可落子格全部占满且双方均未获胜时判和。光路被封锁时继续对局。</p></div></dialog>
  <div id="toast" role="status" aria-live="polite"></div>`;

type RoomView = { type: 'room'; code: string; side: Side; players: Partial<Record<Side, { name: string; ready: boolean; online: boolean }>>;
  state: GameState; started: boolean; version: number; drawOffer: Side | null; rematch: Side[] };
let mode: 'ai' | 'friend' = 'ai';
let setupMode: 'ai' | 'friend' = 'ai';
let state = emptyGame();
let human: Side = 'red';
let selected: { x: number; y: number } | null = null;
let orientation: Orientation = '/';
let difficulty: 'easy' | 'standard' = 'standard';
let nickname = localStorage.getItem('lightpath-name') || '旅光者';
let thinking = false;
let worker: Worker | null = null;
let generation = 0;
let room: RoomView | null = null;
let socket: WebSocket | null = null;
let online = false;
let reconnectTimer = 0;
let playVisible = false;
let toastTimer = 0;
let connectionAction: Record<string, unknown> | null = null;
let board: { update(view: BoardView): void } | null = null;
let boardLoading = false;
function toast(message: string) {
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => $('#toast').classList.remove('visible'), 3200);
}
function saveAI() {
  localStorage.setItem('lightpath-ai', JSON.stringify({ state, human, difficulty, nickname }));
}
function stopAI() { generation++; worker?.terminate(); worker = null; thinking = false; }
function beginAI() {
  if (mode !== 'ai' || state.outcome || state.turn === human) return;
  stopAI();
  thinking = true;
  update();
  const requestId = generation;
  worker = new Worker(new URL('./game/ai.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = event => {
    if (event.data.requestId !== generation) return;
    const move = event.data.move;
    stopAI();
    if (move) state = placeMove(state, move);
    saveAI(); update();
  };
  worker.onerror = () => { stopAI(); update(); toast('电脑思考中断，点击重试'); $('#status-copy').innerHTML = '<button id="retry-ai" class="text-button">重试电脑落子 ↻</button>'; $('#retry-ai').onclick = beginAI; };
  worker.postMessage({ state, difficulty, requestId });
}
function token() {
  let value = sessionStorage.getItem('lightpath-token');
  if (!value) {
    value = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
    sessionStorage.setItem('lightpath-token', value);
  }
  return value;
}
function closeConnection() {
  clearTimeout(reconnectTimer);
  connectionAction = null;
  if (socket) { socket.onclose = null; socket.close(); socket = null; }
  online = false;
}
function connect(action: Record<string, unknown>) {
  closeConnection();
  connectionAction = action;
  const endpoint = new URL('/ws', serviceOrigin);
  endpoint.protocol = endpoint.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(endpoint);
  socket = ws;
  ws.onopen = () => { online = true; ws.send(JSON.stringify(connectionAction)); update(); };
  ws.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.type === 'error') { toast(message.message); $('#start-game').removeAttribute('disabled'); $('#start-game').textContent = '进入房间 ↗'; return; }
    if (message.type !== 'room') return;
    const previousLength = state.moves.length;
    room = message;
    mode = 'friend'; human = message.side; state = message.state;
    if (state.moves.length !== previousLength || state.outcome) selected = null;
    sessionStorage.setItem('lightpath-room', message.code);
    connectionAction = { type: 'join', code: message.code, name: nickname, token: token() };
    history.replaceState(null, '', `${sitePath}?room=${message.code}`);
    ($('#setup') as HTMLDialogElement).close(); showPlay(); update();
  };
  ws.onclose = () => {
    online = false; update();
    if (connectionAction) reconnectTimer = window.setTimeout(() => { if (connectionAction) connect(connectionAction); }, 1800);
  };
  ws.onerror = () => toast('连接暂时不可用，正在重试');
}
function send(type: string, extra: Record<string, unknown> = {}) {
  if (!online || !socket || !room) { toast('正在连接，请稍候'); return; }
  socket.send(JSON.stringify({ type, version: room.version, ...extra }));
}
function showPlay() {
  playVisible = true;
  $('#home').classList.add('hidden');
  $('#play').classList.remove('hidden');
  if (!board && !boardLoading) {
    boardLoading = true;
    import('./board').then(({ createBoard }) => {
      board = createBoard($('#board'), (x, y) => { selected = { x, y }; update(); });
      update();
    }).catch(() => { boardLoading = false; toast('棋盘加载失败，请刷新后重试'); });
  }
  window.dispatchEvent(new Event('resize'));
}
function update() {
  const ended = !!state.outcome;
  const waiting = mode === 'friend' && !room?.started;
  const opponentOnline = mode === 'ai' || !!room?.players[other(human)]?.online;
  const interactive = playVisible && !ended && !waiting && !thinking && state.turn === human && (mode === 'ai' || (online && opponentOnline));
  board?.update({ state, selected, orientation, side: human, interactive, showRays: $<HTMLInputElement>('#path-toggle input').checked });
  $('#mode-label').textContent = mode === 'ai' ? `人机对战 · ${difficulty === 'easy' ? '入门' : '标准'}` : '好友对战';
  $('#move-count').textContent = ended ? `共 ${state.moves.length} 手` : `第 ${state.moves.length + 1} 手`;
  $('#invite-copy').classList.toggle('hidden', mode !== 'friend');
  for (const side of ['red', 'blue'] as Side[]) {
    const player = room?.players[side];
    $(`#${side}-name`).textContent = mode === 'ai' ? (human === side ? nickname : '电脑') : player?.name || '等待好友';
    $(`#${side}-detail`).textContent = mode === 'ai' ? `${sideName(side)} · ${side === 'red' ? '先手' : '后手'}` : !player ? `${sideName(side)} · 等待加入` : `${sideName(side)} · ${player.online ? (waiting ? (player.ready ? '已准备' : '未准备') : '在线') : '已断线'}`;
    $(`#${side}-active`).classList.toggle('active', !ended && !waiting && state.turn === side);
  }
  let kicker = '轮到你了'; let title = '让光走向何处？'; let copy = '选择空格，放置一面镜子。';
  if (ended) {
    kicker = '对局结束';
    title = state.outcome!.winner === 'draw' ? '这一局，平分秋色。' : state.outcome!.winner === human ? '你找到了光的出路。' : '对手的光先到了。';
    copy = state.outcome!.reason === 'connection' ? `${sideName(state.outcome!.winner as Side)}击中对方光源，获胜。` : state.outcome!.reason === 'resign' ? `${sideName(state.outcome!.winner as Side)}获胜，对方认输。` : state.outcome!.reason === 'full' ? '棋盘已满，双方均未连通光路。' : '双方同意和棋。';
  } else if (waiting) { kicker = '房间已创建'; title = room?.players.blue ? '准备好就开始。' : '等一位同行者。'; copy = room?.players.blue ? '双方点击准备后开始，红方先行。' : '复制邀请链接，分享给你的朋友。'; }
  else if (mode === 'friend' && (!online || !opponentOnline)) { kicker = '连接恢复中'; title = online ? '等待对手回来。' : '正在重新连接。'; copy = '棋盘已经保存，连接恢复后继续。'; }
  else if (thinking || state.turn !== human) { kicker = thinking ? '电脑正在思考' : '对手回合'; title = thinking ? '光正在寻找方向…' : '静候下一面镜子。'; copy = thinking ? '推演进攻，也留意你的光路。' : '你可以观察棋盘，规划下一步。'; }
  $('#status-kicker').textContent = kicker; $('#status-title').textContent = title; $('#status-copy').textContent = copy;
  $('#move-controls').classList.toggle('hidden', waiting || ended);
  $('#room-controls').classList.toggle('hidden', !waiting);
  if (room) { $('#room-code').textContent = room.code; $('#ready').textContent = room.players[human]?.ready ? '取消准备' : '准备开始'; }
  $('#selected-coordinate').textContent = selected ? `(${selected.x}, ${selected.y})` : '选择棋盘格子';
  for (const [id, value] of [['slash', '/'], ['backslash', '\\']] as const) {
    const button = $<HTMLButtonElement>(`#${id}`);
    button.classList.toggle('active', value === orientation); button.setAttribute('aria-pressed', String(value === orientation)); button.disabled = !interactive;
  }
  $<HTMLButtonElement>('#confirm-move').disabled = !interactive || !selected;
  $('#restart').classList.toggle('hidden', !ended);
  $('#restart').textContent = mode === 'friend' && room?.rematch.includes(human) ? '等待对手再来一局…' : '再来一局 ↗';
  $('#path-toggle').classList.toggle('hidden', !state.outcome?.path.length);
  $('#undo').classList.toggle('hidden', mode !== 'ai');
  $<HTMLButtonElement>('#undo').disabled = !state.moves.some(move => move.side === human) || ended;
  $<HTMLButtonElement>('#resign').disabled = ended || waiting;
  $('#offer-draw').classList.toggle('hidden', mode !== 'friend');
  $<HTMLButtonElement>('#offer-draw').disabled = ended || waiting || room?.drawOffer === human;
  $('#offer-draw').textContent = room?.drawOffer === human ? '已提出和棋' : '和棋';
  $('#draw-request').classList.toggle('hidden', mode !== 'friend' || room?.drawOffer !== other(human) || ended);
  $('#history-count').textContent = String(state.moves.length);
  $('#history-list').replaceChildren(...state.moves.map((move, index) => {
    const li = document.createElement('li'); li.textContent = `${index + 1}. ${sideName(move.side)}　(${move.x}, ${move.y})　${move.orientation}`; li.className = move.side; return li;
  }).reverse());
}
function openSetup(next: 'ai' | 'friend', code = '') {
  setupMode = next;
  $('#ai-settings').classList.toggle('hidden', next !== 'ai'); $('#friend-settings').classList.toggle('hidden', next !== 'friend');
  $('#setup-title').textContent = next === 'ai' ? '开始一场光路对决' : '邀请朋友，一起落镜';
  $('#setup-kicker').textContent = next === 'ai' ? '独自推演' : '在线相逢';
  $<HTMLInputElement>('#nickname').value = nickname;
  $<HTMLInputElement>('#join-code').value = code;
  $('#start-game').textContent = next === 'ai' ? '开始对局 ↗' : '进入房间 ↗';
  $('#start-game').removeAttribute('disabled');
  ($('#setup') as HTMLDialogElement).showModal();
}
$('#open-ai').onclick = () => openSetup('ai');
$('#open-friend').onclick = () => openSetup('friend');
$('#setup-form').addEventListener('submit', event => {
  if ((event as SubmitEvent).submitter?.getAttribute('value') === 'cancel') return;
  event.preventDefault();
  $('#start-game').click();
});
$('#start-game').onclick = () => {
  nickname = $<HTMLInputElement>('#nickname').value.trim() || '旅光者';
  localStorage.setItem('lightpath-name', nickname);
  if (setupMode === 'ai') {
    closeConnection(); stopAI(); mode = 'ai'; room = null; state = emptyGame(); selected = null;
    human = $<HTMLSelectElement>('#human-side').value as Side;
    difficulty = $<HTMLSelectElement>('#difficulty').value as 'easy' | 'standard';
    history.replaceState(null, '', sitePath);
    ($('#setup') as HTMLDialogElement).close(); showPlay(); saveAI(); update(); beginAI();
  } else {
    const code = $<HTMLInputElement>('#join-code').value.trim().toUpperCase();
    if (code && !/^[A-Z0-9]{6}$/.test(code)) { toast('请输入 6 位房间号'); return; }
    stopAI();
    if (staticHosting && serviceOrigin === location.origin) {
      toast('好友联机服务正在准备中，人机对战已开放');
      return;
    }
    $<HTMLButtonElement>('#start-game').disabled = true; $('#start-game').textContent = '连接中…';
    connect({ type: code ? 'join' : 'create', code, name: nickname, token: token() });
  }
};
$('#slash').onclick = () => { orientation = '/'; update(); };
$('#backslash').onclick = () => { orientation = '\\'; update(); };
$('#confirm-move').onclick = () => {
  if (!selected) return;
  if (mode === 'friend') send('move', { ...selected, orientation });
  else {
    try { state = placeMove(state, { ...selected, orientation, side: human }); selected = null; saveAI(); update(); beginAI(); }
    catch (error) { toast((error as Error).message); }
  }
};
$('#undo').onclick = () => {
  stopAI();
  let length = state.moves.length;
  do { length--; } while (length > 0 && state.moves[length]?.side !== human);
  const moves = state.moves.slice(0, Math.max(0, length));
  state = { moves, turn: moves.length % 2 === 0 ? 'red' : 'blue', outcome: null };
  selected = null; saveAI(); update(); beginAI();
};
$('#restart').onclick = () => {
  if (mode === 'friend') { send('rematch'); return; }
  stopAI(); state = emptyGame(); selected = null; saveAI(); update(); beginAI();
};
$('#resign').onclick = () => {
  if (!confirm('确认认输并结束本局？')) return;
  if (mode === 'friend') send('resign');
  else { stopAI(); state = { ...state, outcome: { winner: other(human), path: [], reason: 'resign' } }; saveAI(); update(); }
};
$('#ready').onclick = () => send('ready');
$('#offer-draw').onclick = () => send('draw');
$('#accept-draw').onclick = () => send('draw');
$('#decline-draw').onclick = () => send('decline');
$('#path-toggle input').onchange = update;
$('#invite-copy').onclick = async () => {
  if (!room) return;
  const url = `${serviceOrigin}${serviceOrigin === location.origin ? sitePath : '/'}?room=${room.code}`;
  try { await navigator.clipboard.writeText(url); toast('邀请链接已复制'); }
  catch { prompt('复制邀请链接', url); }
};
$('#home-back').onclick = () => {
  stopAI(); closeConnection(); playVisible = false; $('#play').classList.add('hidden'); $('#home').classList.remove('hidden'); history.replaceState(null, '', sitePath);
};
$('#rules-open').onclick = () => ($('#rules-dialog') as HTMLDialogElement).showModal();
$('#rules-close').onclick = () => ($('#rules-dialog') as HTMLDialogElement).close();
document.addEventListener('keydown', event => {
  if (!playVisible || document.querySelector('dialog[open]') || /INPUT|SELECT|TEXTAREA/.test((event.target as HTMLElement).tagName)) return;
  if (event.key.toLowerCase() === 'r') { orientation = orientation === '/' ? '\\' : '/'; update(); }
  if (event.key === 'Escape') { selected = null; update(); }
  if (event.key === 'Enter' && !$<HTMLButtonElement>('#confirm-move').disabled) $('#confirm-move').click();
});
const invite = new URLSearchParams(location.search).get('room');
if (staticHosting && serviceOrigin === location.origin) {
  $('#open-friend small').textContent = '联机服务准备中';
}
if (invite) {
  if (sessionStorage.getItem('lightpath-room') === invite.toUpperCase()) connect({ type: 'join', code: invite, name: nickname, token: token() });
  else openSetup('friend', invite);
} else {
  const saved = localStorage.getItem('lightpath-ai');
  if (saved) {
    try {
      const previous = JSON.parse(saved);
      let rebuilt = emptyGame();
      for (const move of previous.state.moves) rebuilt = placeMove(rebuilt, move);
      if (previous.state.outcome?.reason === 'resign' && !rebuilt.outcome) rebuilt.outcome = previous.state.outcome;
      state = rebuilt; human = previous.human === 'blue' ? 'blue' : 'red'; difficulty = previous.difficulty === 'easy' ? 'easy' : 'standard';
      const resume = document.createElement('button'); resume.className = 'text-button resume'; resume.textContent = '继续上次的人机对局 →';
      resume.onclick = () => {
        closeConnection(); stopAI();
        const latest = JSON.parse(localStorage.getItem('lightpath-ai') || saved);
        state = latest.state;
        human = latest.human === 'blue' ? 'blue' : 'red';
        difficulty = latest.difficulty === 'easy' ? 'easy' : 'standard';
        mode = 'ai'; room = null; selected = null;
        showPlay(); update(); beginAI();
      };
      $('.intro').append(resume);
    } catch { localStorage.removeItem('lightpath-ai'); }
  }
}
update();
