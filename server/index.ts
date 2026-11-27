import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { resolve, extname, join } from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { emptyGame, other, placeMove, type GameState, type Side } from '../src/game/rules';
import { AccountService, accountRequest, AccountError, type AccountStore, type AccountIdentity } from '../shared/accounts';

interface Seat { name: string; token: string; ready: boolean; accountId?: string }
interface Room {
  code: string;
  seats: Partial<Record<Side, Seat>>;
  state: GameState;
  started: boolean;
  version: number;
  drawOffer: Side | null;
  rematch: Side[];
  history: GameState[];
  updatedAt: number;
}
interface Peer { room: string; side: Side; alive: boolean; account?: AccountIdentity }
const production = process.argv.includes('--production');
const dataDir = resolve(process.env.DATA_DIR || 'data');
mkdirSync(dataDir, { recursive: true });
const accountFile = join(dataDir, 'accounts.json');
const accountData = new Map<string, unknown>();
try { for (const [key, value] of Object.entries(JSON.parse(readFileSync(accountFile, 'utf8')))) accountData.set(key, value); }
catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
function persistAccounts() {
  writeFileSync(accountFile + '.tmp', JSON.stringify(Object.fromEntries(accountData)), { mode: 0o600 });
  renameSync(accountFile + '.tmp', accountFile);
}
const accountStore: AccountStore = {
  async get<T>(key: string) { return structuredClone(accountData.get(key)) as T | undefined; },
  async put(key, value) { accountData.set(key, structuredClone(value)); persistAccounts(); },
  async list<T>({ prefix, startAfter, limit }: { prefix: string; startAfter?: string; limit: number }) { return new Map([...accountData.entries()].filter(([key]) => key.startsWith(prefix) && (!startAfter || key > startAfter)).sort(([a], [b]) => a.localeCompare(b)).slice(0, limit).map(([key, value]) => [key, structuredClone(value) as T])); },
  async delete(key) { accountData.delete(key); persistAccounts(); }
};
const accounts = new AccountService(accountStore, () => Date.now(), { username: process.env.ADMIN_USERNAME, createdBefore: Date.parse(process.env.ADMIN_CREATED_BEFORE || '') });
async function accountFor(request: Request) {
  const prepared = await accountRequest(request, 'local');
  return accounts.resolveHash(prepared.headers.get('X-Session-Hash') || '');
}
async function guestName(name: string) {
  const response = await accounts.handle(new Request('http://accounts/internal/guest-name?name=' + encodeURIComponent(name)));
  return response.ok && !(await response.json()).allowed ? '游客·' + name.slice(0, 13) : name;
}
const rooms = new Map<string, Room>();
const peers = new Map<WebSocket, Peer>();
for (const filename of readdirSync(dataDir)) {
  if (!/^[A-Z0-9]{6}\.json$/.test(filename)) continue;
  try {
    const room = JSON.parse(readFileSync(join(dataDir, filename), 'utf8')) as Room;
    if (room.code === filename.slice(0, -5) && room.state && room.seats) rooms.set(room.code, room);
  } catch { console.error(`房间存档读取失败 ${filename}`); }
}
function persist(room: Room) {
  room.updatedAt = Date.now();
  const target = join(dataDir, `${room.code}.json`);
  writeFileSync(`${target}.tmp`, JSON.stringify(room), { mode: 0o600 });
  renameSync(`${target}.tmp`, target);
  rooms.set(room.code, room);
}
function connected(code: string, side: Side) {
  return [...peers.entries()].some(([socket, peer]) => peer.room === code && peer.side === side && socket.readyState === WebSocket.OPEN);
}
function send(socket: WebSocket, payload: unknown) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
}
function broadcast(code: string) {
  const room = rooms.get(code);
  if (!room) return;
  const players: Record<string, unknown> = {};
  for (const side of ['red', 'blue'] as Side[]) {
    const seat = room.seats[side];
    if (seat) players[side] = { name: seat.name, ready: seat.ready, online: connected(code, side), registered: !!seat.accountId };
  }
  for (const [socket, peer] of peers) {
    if (peer.room === code) send(socket, { type: 'room', code, side: peer.side, players, state: room.state,
      started: room.started, version: room.version, drawOffer: room.drawOffer, rematch: room.rematch });
  }
}
const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const vite = production ? null : await (await import('vite')).createServer({ server: { middlewareMode: true }, appType: 'spa' });
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url || '/', 'http://localhost').pathname;
  if ((pathname.startsWith('/api/auth/') || pathname.startsWith('/api/admin/'))) {
    try {
      let body = '';
      for await (const chunk of req) { body += chunk; if (body.length > 4096) throw new AccountError('请求内容过长', 413); }
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
      const request = new Request(`http://${req.headers.host}${req.url}`, { method: req.method, headers, ...(req.method !== 'GET' && req.method !== 'HEAD' ? { body } : {}) });
      const response = await accounts.handle(await accountRequest(request, req.socket.remoteAddress || 'local'));
      const outgoing: Record<string, string> = {}; response.headers.forEach((value, key) => { outgoing[key] = value; });
      res.writeHead(response.status, outgoing); res.end(await response.text());
    } catch (error) { res.writeHead(error instanceof AccountError ? error.status : 503, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify({ message: error instanceof AccountError ? error.message : '账号服务暂时不可用' })); }
    return;
  }
  if (pathname === '/health') { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}'); return; }
  if (pathname === '/api/rooms' && req.method === 'POST') {
    res.setHeader('content-type', 'application/json');
    try {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 16384) throw new Error('请求过大');
      }
      const message = JSON.parse(body);
      const request = new Request(`http://${req.headers.host}${req.url}`, { headers: { Cookie: req.headers.cookie || '' } });
      const account = await accountFor(request);
      if (account && req.headers.origin !== new URL(request.url).origin) throw new Error('请在游戏网站内操作');
      const name = account?.username ?? await guestName(typeof message.name === 'string' ? message.name.trim().slice(0, 16) : '');
      const token = account?.roomToken ?? message.token;
      if (!name || typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new Error('昵称或身份信息无效');
      let code: string;
      do { code = randomBytes(3).toString('hex').toUpperCase(); } while (rooms.has(code));
      persist({ code, seats: { red: { name, token, ready: false, ...(account ? { accountId: account.id } : {}) } }, state: emptyGame(), started: false,
        version: 0, drawOffer: null, rematch: [], history: [], updatedAt: Date.now() });
      res.end(JSON.stringify({ code }));
    } catch (error) {
      res.statusCode = 400;
      res.end(JSON.stringify({ message: error instanceof Error ? error.message : '创建房间失败' }));
    }
    return;
  }
  if (vite) { vite.middlewares(req, res); return; }
  try {
    const root = resolve('dist');
    let path = resolve(root, `.${decodeURIComponent(pathname)}`);
    if (path !== root && !path.startsWith(root + '/')) { res.writeHead(403); res.end(); return; }
    if (!extname(pathname)) path = join(root, 'index.html');
    const body = readFileSync(path);
    res.writeHead(200, { 'content-type': mime[extname(path)] || 'application/octet-stream', 'cache-control': path.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' });
    res.end(body);
  } catch { res.writeHead(404); res.end('Not found'); }
});
const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
server.on('upgrade', async (req, socket, head) => {
  if (new URL(req.url || '/', 'http://localhost').pathname !== '/ws') return;
  try {
    const url = `http://${req.headers.host}${req.url}`;
    const account = await accountFor(new Request(url, { headers: { Cookie: req.headers.cookie || '' } }));
    if (account && req.headers.origin !== new URL(url).origin) { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, client => wss.emit('connection', client, account));
  } catch { socket.destroy(); }
});
function bind(socket: WebSocket, room: Room, side: Side, account: AccountIdentity | null) {
  const previous = peers.get(socket);
  peers.set(socket, { room: room.code, side, alive: true, ...(account ? { account } : {}) });
  if (previous && previous.room !== room.code) broadcast(previous.room);
  broadcast(room.code);
}
wss.on('connection', (socket, account: AccountIdentity | null) => {
  socket.on('pong', () => { const peer = peers.get(socket); if (peer) peer.alive = true; });
  let messageQueue = Promise.resolve();
  socket.on('message', raw => { messageQueue = messageQueue.then(async () => {
    try {
      const message = JSON.parse(raw.toString());
      if (!message || typeof message.type !== 'string') throw new Error('请求格式无效');
      if (message.type === 'ping') { send(socket, { type: 'pong' }); return; }
      if (account && !await accounts.resolveHash(account.sessionHash)) { send(socket, { type: 'error', message: '登录已失效，请重新登录' }); socket.close(4001); return; }
      if (message.type === 'create' || message.type === 'join') {
        const name = account?.username ?? await guestName(typeof message.name === 'string' ? message.name.trim().slice(0, 16) : '');
        const token = account?.roomToken ?? message.token;
        if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new Error('身份信息无效，请重新进入');
        if (!name) throw new Error('请输入昵称');
        if (message.type === 'create') {
          let code: string;
          do { code = randomBytes(4).toString('hex').slice(0, 6).toUpperCase(); } while (rooms.has(code));
          const room: Room = { code, seats: { red: { name, token, ready: false, ...(account ? { accountId: account.id } : {}) } }, state: emptyGame(), started: false,
            version: 0, drawOffer: null, rematch: [], history: [], updatedAt: Date.now() };
          persist(room);
          bind(socket, room, 'red', account);
        } else {
          const code = String(message.code).trim().toUpperCase();
          const stored = rooms.get(code);
          if (!stored) throw new Error('没有找到这个房间，请检查房间号');
          const room = structuredClone(stored);
          const existing = (['red', 'blue'] as Side[]).find(side => room.seats[side]?.token === token);
          const side = existing ?? (!room.seats.blue ? 'blue' : null);
          if (!side) throw new Error('房间已满，请创建新房间');
          if (!existing) { room.seats[side] = { name, token, ready: false, ...(account ? { accountId: account.id } : {}) }; room.version++; persist(room); }
          bind(socket, room, side, account);
        }
        return;
      }
      const peer = peers.get(socket);
      if (!peer) throw new Error('请先进入房间');
      const stored = rooms.get(peer.room);
      if (!stored) throw new Error('房间不存在');
      if (message.version !== stored.version) { broadcast(stored.code); throw new Error('棋盘已更新，请根据最新局面操作'); }
      const room = structuredClone(stored);
      const { side } = peer;
      if (message.type === 'ready') {
        if (room.started) throw new Error('对局已经开始');
        room.seats[side]!.ready = !room.seats[side]!.ready;
        room.started = !!room.seats.red?.ready && !!room.seats.blue?.ready;
      } else if (message.type === 'move') {
        if (!room.started || !connected(room.code, other(side))) throw new Error('请等待对手连接并准备');
        room.state = placeMove(room.state, { side, x: message.x, y: message.y, orientation: message.orientation });
        room.drawOffer = null;
      } else if (message.type === 'resign') {
        if (!room.started || room.state.outcome) throw new Error('当前无法认输');
        room.state.outcome = { winner: other(side), path: [], reason: 'resign' };
        room.drawOffer = null;
      } else if (message.type === 'draw') {
        if (!room.started || room.state.outcome) throw new Error('当前无法和棋');
        if (room.drawOffer === other(side)) {
          room.state.outcome = { winner: 'draw', path: [], reason: 'agreement' };
          room.drawOffer = null;
        } else room.drawOffer = side;
      } else if (message.type === 'decline') {
        if (room.drawOffer !== other(side)) throw new Error('没有待处理的和棋请求');
        room.drawOffer = null;
      } else if (message.type === 'rematch') {
        if (!room.state.outcome) throw new Error('请先完成本局');
        if (!room.rematch.includes(side)) room.rematch.push(side);
        if (room.rematch.length === 2) {
          room.history = [...room.history, room.state].slice(-20);
          room.state = emptyGame();
          room.drawOffer = null;
          room.rematch = [];
        }
      } else throw new Error('未知操作');
      room.version++;
      persist(room);
      broadcast(room.code);
    } catch (error) { send(socket, { type: 'error', message: error instanceof Error ? error.message : '操作失败，请重试' }); }
  }); });
  socket.on('close', () => { const peer = peers.get(socket); peers.delete(socket); if (peer) broadcast(peer.room); });
  socket.on('error', () => {});
});
const heartbeat = setInterval(() => {
  for (const socket of wss.clients) {
    const peer = peers.get(socket);
    if (peer && !peer.alive) { socket.terminate(); continue; }
    if (peer) peer.alive = false;
    socket.ping();
  }
}, 20000);
heartbeat.unref();
const port = Number(process.env.PORT || 5173);
server.listen(port, '0.0.0.0', () => console.log(`光路棋已启动 http://localhost:${port}`));
