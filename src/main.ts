import './style.css';
import { createAccounts, type AccountUser } from './accounts';
import type { BoardView } from './board';
import { difficultyNames, parseDifficulty, type Difficulty } from './game/ai';
import { lessons, lessonState } from './game/tutorial';
import { invitationCode } from './game/invitation';
import { emptyGame, legalMove, other, placeMove, restoreGame, type GameState, type Orientation, type Side } from './game/rules';

const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const sitePath = new URL('.', location.href).pathname;
const serviceOrigin = localStorage.getItem('lightpath-service') || location.origin;
const staticHosting = location.hostname.endsWith('.github.io');
const onlineSite = 'https://guangluqi.com';
const sideName = (side: Side) => side === 'red' ? '红方' : '蓝方';
$('#app').innerHTML = `
  <header class="site-header"><a href="${sitePath}" class="brand"><span class="brand-mark">╱</span><span>光路棋<small>LIGHTPATH</small></span></a><div class="header-actions"><button class="text-button" id="rules-open">玩法说明 <span>↗</span></button><button id="account-open" class="text-button account-trigger">登录 / 注册</button></div></header>
  <main>
    <section id="home" class="home">
      <div class="intro"><p class="eyebrow"><span></span> 双人光学策略棋</p><h1>一面镜子，<br>另一种<span>可能。</span></h1><p class="intro-copy">让光转弯，让局势改变。<br>在十三乘十三的棋盘上，寻找通往对手的光路。</p>
        <div class="mode-cards"><button class="mode-card" id="open-ai"><span class="mode-icon">✳</span><span><strong>人机对战</strong><small>从第一束光开始练习</small></span><b>↗</b></button><button class="mode-card" id="open-friend"><span class="mode-icon">⌘</span><span><strong>好友对战</strong><small>分享房间，在线一决高下</small></span><b>↗</b></button></div>
        <button class="learn-link" id="open-tutorial"><span>初次见面？</span> 4 步学会光路棋 <b>→</b></button><p class="home-note">轮流落镜 · 反射与透射 · 光路相连即决胜</p>
      </div>
      <div class="hero-art" aria-label="光线经镜面折转的示意图"><div class="art-grid"></div><div class="hero-beam beam-a"></div><div class="hero-beam beam-b"></div><div class="hero-beam beam-c"></div><span class="art-source source-red">☼</span><span class="art-mirror mirror-a">╱</span><span class="art-mirror mirror-b">╲</span><span class="art-source source-blue">☼</span><div class="art-caption"><span>反射，透射，下一步。</span><small>13 × 13</small></div></div>
    </section>
    <section id="play" class="play hidden">
      <div class="play-heading"><button class="text-button" id="home-back">← 返回首页</button><span id="mode-label">人机对战</span><button class="text-button" id="invite-copy">邀请好友 ↗</button></div>
      <div class="match-layout"><section class="board-section"><div class="board-top"><span id="board-title">光路棋</span><span id="move-count">第 1 手</span></div><div id="board" role="application" aria-label="光路棋棋盘，选择格子后确认落子"></div><p id="last-move" class="last-move" aria-live="polite"></p><div class="board-legend"><span><i class="legend-red"></i>红方</span><span><i class="legend-blue"></i>蓝方</span><span><i class="legend-wall"></i>保护墙</span><span>▧ 禁放格</span></div></section>
      <aside class="match-panel"><div id="connection-notice" class="connection-notice hidden" role="status"><span id="connection-label"></span><button id="reconnect-now" class="text-button">立即重连 ↻</button></div><div class="players"><div id="red-player" class="player red"><span class="avatar">☼</span><div><strong id="red-name">你</strong><small id="red-detail">红方 · 先手</small></div><span id="red-active" class="turn-dot"></span></div><div id="blue-player" class="player blue"><span class="avatar">☼</span><div><strong id="blue-name">电脑</strong><small id="blue-detail">蓝方 · 后手</small></div><span id="blue-active" class="turn-dot"></span></div></div>
      <div class="status-block"><p class="eyebrow" id="status-kicker">轮到你了</p><h2 id="status-title">让光走向何处？</h2><p id="status-copy">选择空格，放置一面镜子。</p></div>
      <div id="tutorial-controls" class="tutorial-controls hidden"><div class="lesson-progress" id="lesson-progress"></div><p id="lesson-hint"></p><button id="lesson-next" class="primary full hidden">下一课 →</button><button id="lesson-reset" class="text-button">重试这一课 ↻</button></div><div id="move-controls"><p class="field-label">镜面朝向 <span id="selected-coordinate">选择棋盘格子</span></p><div class="orientation-group"><button id="slash" class="orientation active" aria-label="正斜杠镜面" aria-pressed="true"><span>╱</span><small>正斜镜</small></button><button id="backslash" class="orientation" aria-label="反斜杠镜面" aria-pressed="false"><span>╲</span><small>反斜镜</small></button></div><button id="confirm-move" class="primary full" disabled>确认落子 <span>↗</span></button></div>
      <div id="room-controls" class="hidden"><div class="room-code">房间号 <strong id="room-code"></strong></div><button id="ready" class="primary full">准备开始</button></div>
      <div id="draw-request" class="notice hidden"><p>对手提出和棋</p><button id="accept-draw" class="small-button">同意</button><button id="decline-draw" class="text-button">继续对局</button></div>
      <button id="restart" class="primary full hidden">再来一局 ↗</button><label id="path-toggle" class="path-toggle hidden"><input type="checkbox" checked /> 显示获胜光路（虚线镜为透射）</label>
      <section id="ray-review" class="ray-review hidden" aria-label="获胜光路讲解"><p class="field-label">这束光如何抵达 <span id="ray-position"></span></p><p id="ray-description" aria-live="polite"></p><div class="ray-buttons"><button id="ray-prev" class="text-button" aria-label="上一个光路节点">← 上一步</button><button id="ray-play" class="text-button">播放光路 ▷</button><button id="ray-next" class="text-button" aria-label="下一个光路节点">下一步 →</button></div><button id="ray-full" class="text-button">查看完整光路</button></section><div class="secondary-actions"><button id="undo" class="text-button">↶ 悔棋</button><button id="offer-draw" class="text-button">和棋</button><button id="resign" class="text-button">认输</button></div>
      <details class="history"><summary>落子记录 <span id="history-count">0</span></summary><ol id="history-list"></ol></details>
      <p class="panel-tip">己方镜子可反射或透射<br>对方镜子必须反射</p></aside></div>
    </section>
  </main><footer><span>光路棋</span><span>每一折，皆有可能。</span></footer>
  <dialog id="setup"><form method="dialog" id="setup-form"><button class="dialog-close" aria-label="关闭" value="cancel" formnovalidate>×</button><p class="eyebrow" id="setup-kicker">独自推演</p><h2 id="setup-title">开始一场光路对决</h2><div class="form-field"><label for="nickname">你的昵称</label><input id="nickname" maxlength="16" placeholder="旅光者" autocomplete="nickname" /><p id="account-note">游客可以直接开始对局，也可以登录以使用唯一账号名。</p></div><div id="ai-settings"><div class="form-field"><label for="difficulty">电脑难度</label><select id="difficulty"><option value="easy">入门 · 熟悉反射与透射</option><option value="standard" selected>标准 · 进攻、防守与识别封锁</option><option value="hard">挑战 · 多步推演，争夺关键位置</option></select><p id="difficulty-note" class="form-note">识别直接威胁，兼顾光路与光源防守。</p></div><div class="form-field"><label for="human-side">选择阵营</label><select id="human-side"><option value="red">红方 · 先手</option><option value="blue">蓝方 · 后手</option></select></div></div><div id="friend-settings" class="hidden"><div class="form-field"><label for="join-code">加入已有房间</label><input id="join-code" maxlength="200" placeholder="输入房间号或粘贴邀请链接，留空创建" /></div><p class="form-note">创建房间后，把邀请链接分享给朋友。双方准备后开局。</p></div><button type="button" id="start-game" class="primary full">开始对局 ↗</button></form></dialog>
  <dialog id="rules-dialog"><button class="dialog-close" id="rules-close" aria-label="关闭">×</button><p class="eyebrow">让光找到出路</p><h2>光路棋怎么玩</h2><div class="rules-copy"><h3>轮流放置镜子</h3><p>红方先行，每回合在空格放一面己方镜子，选择 / 或 \\ 朝向。落定后固定。同阵营的镜子不能沿镜面方向在对角相邻格首尾相接成直线，例如 (1, 1) 与 (2, 2) 的两面 / 镜，以及 (1, 2) 与 (2, 1) 的两面 \\ 镜。不同阵营可以这样连接，隔有空格也允许。光源格和四个斜纹禁放格禁止落镜，禁放格允许光通过。</p><h3>构筑你的光路</h3><p>红方光源位于 (5, 9)，向上或向左出光。蓝方位于 (9, 5)，向下或向右出光。光沿行列传播，镜面反射使光转向 90°。</p><div class="reflection-guide">╱　上 ↔ 右　下 ↔ 左<br>╲　上 ↔ 左　下 ↔ 右</div><p>遇到己方镜子，可以反射或透射，每次选择独立。遇到对方镜子，必须反射。系统自动寻找可行路径，无须手动选择光线。</p><h3>击中对方光源即可获胜</h3><p>光必须从开放侧进入对方光源。保护墙吸收光。光出界、返回己方光源或困于闭环，该路径终止。</p><p>每手落定后，先检查对手的击败光路，再检查自己。双方同时成路时，落子者输。</p><h3>和棋与封锁</h3><p>双方同意和棋，或 163 个可落子格全部占满且双方均未获胜时判和；若轮到的一方已无合法落子，也自动判和。每手仍先检查胜负。光路被封锁时继续对局。</p></div></dialog>
  <dialog id="invite-dialog"><button class="dialog-close" id="invite-close" aria-label="关闭邀请面板">×</button><p class="eyebrow">带一位朋友来</p><h2>同一束光，两个人的棋局。</h2><p class="form-note">朋友打开链接或在首页输入房间号，双方准备后即可开始。</p><div class="invite-code"><span>房间号</span><strong id="invite-code"></strong><button id="code-copy" class="text-button">复制房间号</button></div><label class="field-label" for="invite-url">邀请链接</label><input id="invite-url" readonly /><button id="link-copy" class="primary full">复制邀请链接 ↗</button><button id="native-share" class="text-button full hidden">通过系统分享…</button><p class="form-note">断线后保留当前页面，或用原浏览器重新连接。不要把房主的页面交给朋友操作。</p></dialog>
  <div id="toast" role="status" aria-live="polite"></div>`;

type RoomView = { type: 'room'; code: string; side: Side; players: Partial<Record<Side, { name: string; ready: boolean; online: boolean; registered?: boolean }>>;
  state: GameState; started: boolean; version: number; drawOffer: Side | null; rematch: Side[] };
let mode: 'ai' | 'friend' | 'tutorial' = 'ai';
let setupMode: 'ai' | 'friend' = 'ai';
let state = emptyGame();
let human: Side = 'red';
let selected: { x: number; y: number } | null = null;
let orientation: Orientation = '/';
let difficulty: Difficulty = 'standard';
let accountUser: AccountUser | null = null;
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
let lessonIndex = 0;
let lessonSolved = false;
let replayIndex = -1;
let replayTimer = 0;
let resultKey = '';
let reconnectAttempts = 0;
let handshakeTimer = 0;
let heartbeatTimer = 0;
let lastMessageAt = 0;
let pending = false;
let pendingTimer = 0;
let sessionWasConnected = false;
const replayNodes = () => state.outcome?.path.filter((step, index, path) => index === 0 || index === path.length - 1 || step.action) ?? [];
function stopReplay() { clearInterval(replayTimer); replayTimer = 0; }
function clearPending() { pending = false; clearTimeout(pendingTimer); }
function inviteURL() { return `${serviceOrigin}${serviceOrigin === location.origin ? sitePath : '/'}?room=${room?.code ?? ''}`; }
function startLesson(index: number) {
  stopAI(); closeConnection(); stopReplay();
  mode = 'tutorial'; room = null; human = 'red'; lessonIndex = index; lessonSolved = false;
  state = lessonState(index); selected = null; orientation = '/';
  history.replaceState(null, '', sitePath);
  showPlay(); update();
}
function difficultyNote() {
  const descriptions: Record<Difficulty, string> = {
    easy: '优先抓住直接获胜机会，走法更宽松。适合刚学会规则的玩家。',
    standard: '检查对手的直接回应，识别光源封锁并争夺关键落点。',
    hard: '进一步推演关键回应及后续走法。通常思考几秒，复杂局面可能更久。'
  };
  $('#difficulty-note').textContent = descriptions[parseDifficulty($<HTMLSelectElement>('#difficulty').value)];
}
function syncAccount(user: AccountUser | null) {
  const changedIdentity = (accountUser?.id ?? null) !== (user?.id ?? null);
  accountUser = user;
  if (changedIdentity && mode === 'friend') {
    closeConnection(); room = null; sessionStorage.removeItem('lightpath-room');
    playVisible = false; $('#play').classList.add('hidden'); $('#home').classList.remove('hidden');
    history.replaceState(null, '', sitePath);
    toast(user ? '已登录，请重新进入好友房间' : '已退出账号，好友连接已断开');
  } else if (user && mode === 'friend' && connectionAction) {
    // Password changes rotate the cookie. Rebind the socket to the new session.
    connect(connectionAction);
  }
  if (user) nickname = user.username;
  else if (changedIdentity) nickname = localStorage.getItem('lightpath-guest-name') || '旅光者';
  if (user || changedIdentity) localStorage.setItem('lightpath-name', nickname);
  $<HTMLInputElement>('#nickname').value = nickname;
  $<HTMLInputElement>('#nickname').readOnly = !!user;
  $('#account-note').textContent = user ? '已登录：对局使用你的唯一账号名。' : '游客可以直接开始对局，也可以登录以使用唯一账号名。';
  update();
}
const accounts = createAccounts($<HTMLButtonElement>('#account-open'), syncAccount);
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
  clearTimeout(reconnectTimer); clearTimeout(handshakeTimer); clearInterval(heartbeatTimer); clearPending();
  connectionAction = null;
  if (socket) { socket.onclose = null; socket.close(); socket = null; }
  online = false;
}
function connect(action: Record<string, unknown>) {
  closeConnection();
  connectionAction = action;
  const endpoint = new URL('/ws', serviceOrigin);
  endpoint.protocol = endpoint.protocol === 'https:' ? 'wss:' : 'ws:';
  endpoint.searchParams.set('room', String(action.code));
  const ws = new WebSocket(endpoint);
  socket = ws;
  handshakeTimer = window.setTimeout(() => { if (socket === ws && !online) ws.close(); }, 12000);
  ws.onopen = () => {
    if (socket !== ws) return;
    lastMessageAt = Date.now(); ws.send(JSON.stringify(action));
    heartbeatTimer = window.setInterval(() => {
      if (socket !== ws) return;
      if (Date.now() - lastMessageAt > 45000) { ws.close(); return; }
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
    }, 15000);
  };
  ws.onmessage = event => {
    if (socket !== ws) return;
    lastMessageAt = Date.now();
    const message = JSON.parse(event.data);
    if (message.type === 'pong') return;
    clearPending();
    if (message.type === 'error') {
      if (message.message.includes('登录已失效')) { closeConnection(); void accounts.refresh(); }
      toast(message.message);
      if (!room || room.code !== action.code) closeConnection();
      $('#start-game').removeAttribute('disabled'); $('#start-game').textContent = '进入房间 ↗'; update(); return;
    }
    if (message.type !== 'room') return;
    clearTimeout(handshakeTimer);
    if (!online && sessionWasConnected) toast('连接已恢复，棋盘已同步');
    online = true; sessionWasConnected = true; reconnectAttempts = 0;
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
    if (socket !== ws) return;
    online = false; clearPending(); clearTimeout(handshakeTimer); clearInterval(heartbeatTimer); reconnectAttempts++; update();
    if (!sessionWasConnected && reconnectAttempts >= 3) {
      closeConnection(); $('#start-game').removeAttribute('disabled'); $('#start-game').textContent = '重新进入房间 ↗';
      toast('暂时无法进入房间，请检查房间号和网络后重试'); return;
    }
    if (connectionAction) reconnectTimer = window.setTimeout(() => { if (connectionAction) connect(connectionAction); }, Math.min(1500 * 2 ** Math.min(reconnectAttempts - 1, 3), 12000));
  };
  ws.onerror = () => { if (socket === ws) ws.close(); };
}
function send(type: string, extra: Record<string, unknown> = {}) {
  if (!online || !socket || socket.readyState !== WebSocket.OPEN || !room) { toast('正在连接，请稍候'); return; }
  if (pending) return;
  pending = true;
  socket.send(JSON.stringify({ type, version: room.version, ...extra }));
  pendingTimer = window.setTimeout(() => { clearPending(); toast('操作尚未确认，正在同步棋盘'); if (connectionAction) connect(connectionAction); update(); }, 8000);
  update();
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
  const tutorial = mode === 'tutorial';
  const lesson = lessons[lessonIndex];
  const ended = !!state.outcome;
  const key = state.outcome ? JSON.stringify(state.outcome) + state.moves.length : '';
  if (key !== resultKey) { resultKey = key; stopReplay(); replayIndex = -1; $<HTMLInputElement>('#path-toggle input').checked = true; }
  const waiting = mode === 'friend' && !room?.started;
  const opponentOnline = mode === 'ai' || !!room?.players[other(human)]?.online;
  const interactive = playVisible && !ended && !waiting && !thinking && !pending && (!tutorial || !lessonSolved) && state.turn === human && (mode !== 'friend' || (online && opponentOnline));
  const nodes = replayNodes();
  const path = state.outcome?.path;
  const replayNode = replayIndex >= 0 ? nodes[replayIndex] : null;
  board?.update({ state, selected, orientation, side: human, interactive,
    showRays: tutorial || $<HTMLInputElement>('#path-toggle input').checked,
    highlight: tutorial && !lessonSolved ? lesson.target : undefined,
    rayPath: tutorial && lessonSolved && lesson.path ? lesson.path : undefined,
    raySide: tutorial ? 'red' : undefined,
    rayLimit: replayNode && path ? path.indexOf(replayNode) + 1 : undefined });
  $('#mode-label').textContent = tutorial ? `新手练习 · ${lessonIndex + 1} / ${lessons.length}` : mode === 'ai' ? `人机对战 · ${difficultyNames[difficulty]}` : '好友对战';
  $('#move-count').textContent = ended ? `共 ${state.moves.length} 手` : `第 ${state.moves.length + 1} 手`;
  $('#invite-copy').classList.toggle('hidden', mode !== 'friend');
  for (const side of ['red', 'blue'] as Side[]) {
    const player = room?.players[side];
    $(`#${side}-name`).textContent = tutorial ? (side === 'red' ? '你 · 红方' : '示例蓝方') : mode === 'ai' ? (human === side ? nickname : '电脑') : player?.name || '等待好友';
    $(`#${side}-detail`).textContent = mode !== 'friend' ? `${sideName(side)} · ${side === 'red' ? '先手' : '后手'}${accountUser && side === human ? ' · 已注册' : ''}` : !player ? `${sideName(side)} · 等待加入` : `${sideName(side)} · ${player.online ? (waiting ? (player.ready ? '已准备' : '未准备') : '在线') : '已断线'}${player.registered ? ' · 已注册' : ' · 游客'}`;
    $(`#${side}-active`).classList.toggle('active', !ended && !waiting && state.turn === side);
  }
  let kicker = '轮到你了'; let title = '让光走向何处？'; let copy = '选择空格，放置一面镜子。';
  if (ended) {
    kicker = '对局结束';
    title = state.outcome!.winner === 'draw' ? '这一局，平分秋色。' : state.outcome!.winner === human ? '你找到了光的出路。' : '对手的光先到了。';
    copy = state.outcome!.reason === 'connection' ? `${sideName(state.outcome!.winner as Side)}击中对方光源，获胜。` : state.outcome!.reason === 'resign' ? `${sideName(state.outcome!.winner as Side)}获胜，对方认输。` : state.outcome!.reason === 'full' ? '棋盘已满，双方均未连通光路。' : state.outcome!.reason === 'no-moves' ? `${sideName(state.turn)}已无合法落子，自动和棋。` : '双方同意和棋。';
  } else if (waiting) { kicker = '房间已创建'; title = room?.players.blue ? '准备好就开始。' : '等一位同行者。'; copy = room?.players.blue ? '双方点击准备后开始，红方先行。' : '复制邀请链接，分享给你的朋友。'; }
  else if (mode === 'friend' && (!online || !opponentOnline)) { kicker = '连接恢复中'; title = online ? '等待对手回来。' : '正在重新连接。'; copy = '棋盘已经保存，连接恢复后继续。'; }
  else if (thinking || state.turn !== human) { kicker = thinking ? '电脑正在思考' : '对手回合'; title = thinking ? '光正在寻找方向…' : '静候下一面镜子。'; copy = thinking ? '推演进攻，也留意你的光路。' : '你可以观察棋盘，规划下一步。'; }
  if (mode === 'friend' && ended && room?.rematch.includes(other(human)) && !room.rematch.includes(human)) copy += ' 对手想再来一局，点击下方按钮即可开始。';
  if (mode === 'friend' && pending) copy = '正在确认操作，请稍候…';
  if (tutorial) { kicker = `第 ${lessonIndex + 1} 课 / 共 ${lessons.length} 课`; title = lessonSolved ? '这一课，你学会了。' : lesson.title; copy = lessonSolved ? lesson.success : lesson.description; }
  const last = state.moves.at(-1);
  $('#last-move').textContent = last ? `上一手 · ${sideName(last.side)} (${last.x}, ${last.y}) ${last.orientation}　方框标记` : tutorial ? '金色方框是本课练习位置' : '选择格子 → 选择镜面 → 确认落子';
  $('#tutorial-controls').classList.toggle('hidden', !tutorial);
  $('#lesson-hint').textContent = lesson.hint;
  $('#lesson-progress').replaceChildren(...lessons.map((_, index) => {
    const dot = document.createElement('span'); dot.className = index === lessonIndex ? 'current' : index < lessonIndex ? 'complete' : ''; dot.textContent = String(index + 1); return dot;
  }));
  $('#lesson-next').classList.toggle('hidden', !tutorial || !lessonSolved);
  $('#lesson-next').textContent = lessonIndex === lessons.length - 1 ? '开始入门人机对战 ↗' : '下一课 →';
  $('#connection-notice').classList.toggle('hidden', mode !== 'friend');
  $('#connection-notice').classList.toggle('disconnected', !online);
  $('#connection-label').textContent = !online ? `正在连接${reconnectAttempts ? ` · 第 ${reconnectAttempts} 次重试` : '…'}` : !room?.players[other(human)] ? '已连接 · 等待好友加入' : !opponentOnline ? '对手已断线 · 为你保留棋局' : '双方在线 · 棋局自动保存';
  $('#reconnect-now').classList.toggle('hidden', online);
  const invalidSelection = selected && !legalMove(state.moves, { ...selected, orientation, side: human });
  if (interactive && invalidSelection) copy = '同阵营镜子不能首尾相接成直线，请切换朝向或选择其他格子。';
  $('#status-kicker').textContent = kicker; $('#status-title').textContent = title; $('#status-copy').textContent = copy;
  $('#move-controls').classList.toggle('hidden', waiting || ended || (tutorial && lessonSolved));
  $('#room-controls').classList.toggle('hidden', !waiting);
  $<HTMLButtonElement>('#ready').disabled = !online || pending || !room?.players[other(human)]?.online;
  if (room) { $('#room-code').textContent = room.code; $('#ready').textContent = room.players[human]?.ready ? '取消准备' : '准备开始'; }
  $('#selected-coordinate').textContent = selected ? `(${selected.x}, ${selected.y})` : '选择棋盘格子';
  for (const [id, value] of [['slash', '/'], ['backslash', '\\']] as const) {
    const button = $<HTMLButtonElement>(`#${id}`);
    button.classList.toggle('active', value === orientation); button.setAttribute('aria-pressed', String(value === orientation)); button.disabled = !interactive;
  }
  $<HTMLButtonElement>('#confirm-move').disabled = !interactive || !selected || !!invalidSelection;
  $('#restart').classList.toggle('hidden', !ended || tutorial);
  $<HTMLButtonElement>('#restart').disabled = mode === 'friend' && (!online || pending || !!room?.rematch.includes(human));
  $('#restart').textContent = mode === 'friend' && room?.rematch.includes(human) ? '等待对手再来一局…' : '再来一局 ↗';
  $('#path-toggle').classList.toggle('hidden', tutorial || !path?.length);
  $('#ray-review').classList.toggle('hidden', tutorial || !path?.length);
  $('#ray-position').textContent = replayIndex >= 0 ? `${replayIndex + 1} / ${nodes.length}` : '完整路线';
  $('#ray-play').textContent = replayTimer ? '暂停 Ⅱ' : '播放光路 ▷';
  $<HTMLButtonElement>('#ray-prev').disabled = replayIndex === 0;
  $<HTMLButtonElement>('#ray-next').disabled = replayIndex === nodes.length - 1;
  const winner = state.outcome?.winner;
  const event = replayNode;
  $('#ray-description').textContent = event && path ? replayIndex === 0 ? `${sideName(winner as Side)}光源出发。` : replayIndex === nodes.length - 1 ? '从开放侧进入对方光源，光路连通。' : `(${event.x}, ${event.y}) ${event.action === 'transmit' ? '透过己方镜子，继续直行。' : '镜面反射，转向 90°。'}` : path?.length ? `这条获胜光路经过 ${path.filter(step => step.action === 'reflect').length} 次反射、${path.filter(step => step.action === 'transmit').length} 次透射。可逐步查看。` : '';
  $('.secondary-actions').classList.toggle('hidden', tutorial);
  $('.history').classList.toggle('hidden', tutorial);
  $('#undo').classList.toggle('hidden', mode !== 'ai');
  $<HTMLButtonElement>('#undo').disabled = !state.moves.some(move => move.side === human) || ended;
  $<HTMLButtonElement>('#resign').disabled = ended || waiting || thinking || (mode === 'friend' && (!online || pending));
  $('#offer-draw').classList.toggle('hidden', mode !== 'friend');
  $<HTMLButtonElement>('#offer-draw').disabled = ended || waiting || !online || pending || room?.drawOffer === human;
  $('#offer-draw').textContent = room?.drawOffer === human ? '已提出和棋' : '和棋';
  $('#draw-request').classList.toggle('hidden', mode !== 'friend' || room?.drawOffer !== other(human) || ended);
  $<HTMLButtonElement>('#accept-draw').disabled = pending || !online;
  $<HTMLButtonElement>('#decline-draw').disabled = pending || !online;
  $('#history-count').textContent = String(state.moves.length);
  $('#history-list').replaceChildren(...state.moves.map((move, index) => {
    const li = document.createElement('li'); li.textContent = `${index + 1}. ${sideName(move.side)}　(${move.x}, ${move.y})　${move.orientation}`; li.className = move.side; return li;
  }).reverse());
}
function openSetup(next: 'ai' | 'friend', code = '') {
  setupMode = next;
  if (next === 'ai') { $<HTMLSelectElement>('#difficulty').value = difficulty; difficultyNote(); }
  $('#ai-settings').classList.toggle('hidden', next !== 'ai'); $('#friend-settings').classList.toggle('hidden', next !== 'friend');
  $('#setup-title').textContent = next === 'ai' ? '开始一场光路对决' : '邀请朋友，一起落镜';
  $('#setup-kicker').textContent = next === 'ai' ? '独自推演' : '在线相逢';
  $<HTMLInputElement>('#nickname').value = nickname;
  $<HTMLInputElement>('#nickname').readOnly = !!accountUser;
  $<HTMLInputElement>('#join-code').value = code;
  $('#start-game').textContent = next === 'ai' ? '开始对局 ↗' : '进入房间 ↗';
  $('#start-game').removeAttribute('disabled');
  ($('#setup') as HTMLDialogElement).showModal();
}
$('#open-ai').onclick = () => openSetup('ai');
$('#open-friend').onclick = () => {
  if (staticHosting) { location.assign(`${onlineSite}/?mode=friend`); return; }
  openSetup('friend');
};
$('#setup-form').addEventListener('submit', event => {
  if ((event as SubmitEvent).submitter?.getAttribute('value') === 'cancel') return;
  event.preventDefault();
  $('#start-game').click();
});
$('#start-game').onclick = async () => {
  await accounts.ready;
  nickname = accountUser?.username || $<HTMLInputElement>('#nickname').value.trim() || '旅光者';
  if (!accountUser) localStorage.setItem('lightpath-guest-name', nickname);
  localStorage.setItem('lightpath-name', nickname);
  if (setupMode === 'ai') {
    closeConnection(); stopAI(); mode = 'ai'; room = null; state = emptyGame(); selected = null;
    human = $<HTMLSelectElement>('#human-side').value as Side;
    difficulty = parseDifficulty($<HTMLSelectElement>('#difficulty').value);
    history.replaceState(null, '', sitePath);
    ($('#setup') as HTMLDialogElement).close(); showPlay(); saveAI(); update(); beginAI();
  } else {
    const input = $<HTMLInputElement>('#join-code').value.trim();
    const code = invitationCode(input) || '';
    if (input && !code) { toast('请输入 6 位房间号'); return; }
    stopAI(); sessionWasConnected = false; reconnectAttempts = 0;
    if (staticHosting && serviceOrigin === location.origin) {
      toast('好友联机服务正在准备中，人机对战已开放');
      return;
    }
    $<HTMLButtonElement>('#start-game').disabled = true; $('#start-game').textContent = '连接中…';
    try {
      let roomCode = code;
      if (!roomCode) {
        const response = await fetch(new URL('/api/rooms', serviceOrigin), {
          signal: AbortSignal.timeout(12000),
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'create', name: nickname, token: token() })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || '创建房间失败，请重试');
        roomCode = result.code;
      }
      connect({ type: 'join', code: roomCode, name: nickname, token: token() });
    } catch (error) {
      toast(error instanceof Error ? error.message : '连接失败，请重试');
      $('#start-game').removeAttribute('disabled'); $('#start-game').textContent = '进入房间 ↗';
    }
  }
};
$('#slash').onclick = () => { orientation = '/'; update(); };
$('#backslash').onclick = () => { orientation = '\\'; update(); };
$('#confirm-move').onclick = () => {
  if ($<HTMLButtonElement>('#confirm-move').disabled || !selected || !legalMove(state.moves, { ...selected, orientation, side: human })) return;
  if (mode === 'tutorial') {
    const target = lessons[lessonIndex].target;
    if (selected.x !== target.x || selected.y !== target.y || orientation !== target.orientation) { toast(lessons[lessonIndex].hint); return; }
    state = placeMove(state, { ...selected, orientation, side: 'red' });
    selected = null; lessonSolved = true; update(); return;
  }
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
$('#path-toggle input').onchange = () => { stopReplay(); update(); };
$('#invite-copy').onclick = () => {
  if (!room) return;
  $('#invite-code').textContent = room.code;
  $<HTMLInputElement>('#invite-url').value = inviteURL();
  $('#native-share').classList.toggle('hidden', !navigator.share);
  ($('#invite-dialog') as HTMLDialogElement).showModal();
};
async function copyText(value: string, success: string) {
  try { await navigator.clipboard.writeText(value); toast(success); }
  catch { const input = $<HTMLInputElement>('#invite-url'); input.focus(); input.select(); toast('请长按或使用复制快捷键复制链接'); }
}
$('#invite-close').onclick = () => ($('#invite-dialog') as HTMLDialogElement).close();
$('#link-copy').onclick = () => { void copyText(inviteURL(), '邀请链接已复制，发给朋友即可'); };
$('#code-copy').onclick = () => { if (room) void copyText(room.code, '房间号已复制'); };
$('#native-share').onclick = async () => {
  try { await navigator.share({ title: '一起玩光路棋', text: `来一局光路棋，房间号 ${room?.code}`, url: inviteURL() }); }
  catch (error) { if ((error as Error).name !== 'AbortError') toast('分享暂时不可用，可以复制邀请链接'); }
};
$('#reconnect-now').onclick = () => { if (connectionAction) connect(connectionAction); update(); };
$('#open-tutorial').onclick = () => startLesson(0);
$('#lesson-reset').onclick = () => startLesson(lessonIndex);
$('#lesson-next').onclick = () => {
  if (lessonIndex < lessons.length - 1) startLesson(lessonIndex + 1);
  else { localStorage.setItem('lightpath-tutorial-done', '1'); difficulty = 'easy'; openSetup('ai'); }
};
$('#difficulty').onchange = difficultyNote;
function setReplay(index: number) {
  stopReplay(); replayIndex = Math.max(0, Math.min(replayNodes().length - 1, index));
  $<HTMLInputElement>('#path-toggle input').checked = true; update();
}
$('#ray-prev').onclick = () => setReplay(replayIndex < 0 ? replayNodes().length - 2 : replayIndex - 1);
$('#ray-next').onclick = () => setReplay(replayIndex < 0 ? 0 : replayIndex + 1);
$('#ray-full').onclick = () => { stopReplay(); replayIndex = -1; $<HTMLInputElement>('#path-toggle input').checked = true; update(); };
$('#ray-play').onclick = () => {
  if (replayTimer) { stopReplay(); update(); return; }
  if (replayIndex < 0 || replayIndex === replayNodes().length - 1) replayIndex = 0;
  $<HTMLInputElement>('#path-toggle input').checked = true;
  replayTimer = window.setInterval(() => {
    replayIndex++;
    if (replayIndex >= replayNodes().length - 1) { replayIndex = replayNodes().length - 1; stopReplay(); }
    update();
  }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 1400 : 850);
  update();
};
window.addEventListener('online', () => { if (mode === 'friend' && connectionAction && !online) { connect(connectionAction); update(); } });
window.addEventListener('offline', () => { if (mode === 'friend') { online = false; socket?.close(); update(); } });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopReplay();
  else if (mode === 'friend' && connectionAction && (!online || Date.now() - lastMessageAt > 40000)) { connect(connectionAction); update(); }
});
$('#home-back').onclick = () => {
  stopAI(); closeConnection(); stopReplay(); playVisible = false; $('#play').classList.add('hidden'); $('#home').classList.remove('hidden'); history.replaceState(null, '', sitePath);
};
$('#rules-open').onclick = () => ($('#rules-dialog') as HTMLDialogElement).showModal();
$('#rules-close').onclick = () => ($('#rules-dialog') as HTMLDialogElement).close();
document.addEventListener('keydown', event => {
  if (!playVisible || document.querySelector('dialog[open]') || /INPUT|SELECT|TEXTAREA/.test((event.target as HTMLElement).tagName)) return;
  if (event.key.toLowerCase() === 'r' && !$<HTMLButtonElement>('#slash').disabled) { orientation = orientation === '/' ? '\\' : '/'; update(); }
  if (event.key === 'Escape') { selected = null; update(); }
  if (event.key === 'Enter' && !$<HTMLButtonElement>('#confirm-move').disabled) $('#confirm-move').click();
});
const invite = new URLSearchParams(location.search).get('room');
async function initialize() {
await accounts.ready;
if (invite) {
  if (sessionStorage.getItem('lightpath-room') === invite.toUpperCase()) connect({ type: 'join', code: invite, name: nickname, token: token() });
  else openSetup('friend', invite);
} else {
  const saved = localStorage.getItem('lightpath-ai');
  if (saved) {
    try {
      const previous = JSON.parse(saved);
      const rebuilt = restoreGame(previous.state);
      state = rebuilt; human = previous.human === 'blue' ? 'blue' : 'red'; difficulty = parseDifficulty(previous.difficulty);
      const resume = document.createElement('button'); resume.className = 'text-button resume'; resume.textContent = '继续上次的人机对局 →';
      resume.onclick = () => {
        closeConnection(); stopAI();
        const latest = JSON.parse(localStorage.getItem('lightpath-ai') || saved);
        state = restoreGame(latest.state);
        human = latest.human === 'blue' ? 'blue' : 'red';
        difficulty = parseDifficulty(latest.difficulty);
        mode = 'ai'; room = null; selected = null;
        showPlay(); update(); beginAI();
      };
      $('.intro').append(resume);
    } catch { localStorage.removeItem('lightpath-ai'); }
  }
}
if (!invite && new URLSearchParams(location.search).get('mode') === 'friend') openSetup('friend');
if (new URLSearchParams(location.search).get('account') === '1') accounts.open();
update();
}
void initialize();
update();
