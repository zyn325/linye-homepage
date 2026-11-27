import { DurableObject } from 'cloudflare:workers';
import { emptyGame, other, placeMove, type GameState, type Side } from '../src/game/rules';
import { AccountService, accountRequest, AccountError, type AccountIdentity } from '../shared/accounts';

interface Env { ADMIN_USERNAME?: string; ADMIN_CREATED_BEFORE?: string; ROOMS: DurableObjectNamespace<ChessRoom>; ACCOUNTS: DurableObjectNamespace<AccountDirectory>; ASSETS: Fetcher }
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
}
type Identity = { name: string; token: string; accountId?: string; sessionHash?: string };
type Message = { type: string; version?: number; code?: unknown; name?: unknown; token?: unknown;
  x?: unknown; y?: unknown; orientation?: unknown };
function identity(message: Message): Identity {
  const name = typeof message.name === 'string' ? message.name.trim().slice(0, 16) : '';
  if (!name) throw new Error('请输入昵称');
  if (typeof message.token !== 'string' || !/^[a-f0-9]{64}$/.test(message.token)) throw new Error('身份信息无效，请重新进入');
  return { name, token: message.token };
}
function parseMessage(raw: string): Message {
  if (raw.length > 16384) throw new Error('请求过大');
  const message = JSON.parse(raw);
  if (!message || typeof message !== 'object' || typeof message.type !== 'string') throw new Error('请求格式无效');
  return message;
}
function errorText(error: unknown) { return error instanceof Error ? error.message : '操作失败，请重试'; }
function send(socket: WebSocket, data: unknown) {
  try { socket.send(JSON.stringify(data)); } catch { /* A disconnected client recovers the latest state on reconnect. */ }
}
function directory(env: Env) { return env.ACCOUNTS.get(env.ACCOUNTS.idFromName('accounts-v1')); }
async function authenticated(request: Request, env: Env): Promise<AccountIdentity | null> {
  const prepared = await accountRequest(request, request.headers.get('CF-Connecting-IP') || 'unknown');
  const response = await directory(env).fetch('https://accounts/internal/resolve', { headers: { 'X-Session-Hash': prepared.headers.get('X-Session-Hash') || '' } });
  if (!response.ok) throw new Error('账号服务暂时不可用');
  return (await response.json<{ identity: AccountIdentity | null }>()).identity;
}
async function playerIdentity(message: Message, account: AccountIdentity | null, env: Env): Promise<Identity> {
  if (account) return { name: account.username, token: account.roomToken, accountId: account.id, sessionHash: account.sessionHash };
  const credentials = identity(message);
  // Guests retain nicknames but are clearly distinguished from reserved account names.
  const response = await directory(env).fetch('https://accounts/internal/guest-name?name=' + encodeURIComponent(credentials.name));
  if (response.ok && !(await response.json<{ allowed: boolean }>()).allowed) credentials.name = '游客·' + credentials.name.slice(0, 13);
  return credentials;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/health') return Response.json({ ok: true });
    if ((url.pathname.startsWith('/api/auth/') || url.pathname.startsWith('/api/admin/'))) {
      try { return await directory(env).fetch(await accountRequest(request, request.headers.get('CF-Connecting-IP') || 'unknown')); }
      catch (error) { return Response.json({ message: errorText(error) }, { status: error instanceof AccountError ? error.status : 503, headers: { 'Cache-Control': 'no-store' } }); }
    }
    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      try {
        const text = await request.text();
        const account = await authenticated(new Request(request.url, { headers: request.headers }), env);
        if (account && request.headers.get('Origin') !== url.origin) throw new AccountError('请在游戏网站内操作', 403);
        const credentials = await playerIdentity(parseMessage(text), account, env);
        for (let attempt = 0; attempt < 5; attempt++) {
          const bytes = crypto.getRandomValues(new Uint8Array(3));
          const code = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
          const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
          const response = await stub.fetch('https://room/internal/create', {
            method: 'POST', body: JSON.stringify({ code, ...credentials })
          });
          if (response.status !== 409) return response;
        }
        return Response.json({ message: '房间创建繁忙，请重试' }, { status: 503 });
      } catch (error) { return Response.json({ message: errorText(error) }, { status: 400 }); }
    }
    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('WebSocket required', { status: 426 });
      const code = (url.searchParams.get('room') || '').toUpperCase();
      if (!/^[A-Z0-9]{6}$/.test(code)) return new Response('Invalid room', { status: 400 });
      try {
        const account = await authenticated(new Request(request.url, { headers: request.headers }), env);
        if (account && request.headers.get('Origin') !== url.origin) return new Response('Forbidden', { status: 403 });
        const headers = new Headers(request.headers);
        headers.delete('X-Account-Identity');
        if (account) headers.set('X-Account-Identity', encodeURIComponent(JSON.stringify(account)));
        return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(new Request(request, { headers }));
      } catch { return new Response('账号服务暂时不可用', { status: 503 }); }
    }
    if (url.pathname.startsWith('/api/')) return new Response('Not found', { status: 404 });
    return env.ASSETS.fetch(request);
  }
} satisfies ExportedHandler<Env>;

export class AccountDirectory extends DurableObject<Env> {
  private accounts: AccountService;
  constructor(ctx: DurableObjectState, env: Env) { super(ctx, env); this.accounts = new AccountService(ctx.storage, () => Date.now(), { username: env.ADMIN_USERNAME, createdBefore: Date.parse(env.ADMIN_CREATED_BEFORE || '') }); }
  fetch(request: Request) { return this.accounts.handle(request); }
}

export class ChessRoom extends DurableObject<Env> {
  private room: Room | null = null;
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => { this.room = await ctx.storage.get<Room>('room') ?? null; });
  }
  private connected(side: Side) {
    return this.ctx.getWebSockets().some(socket => socket.readyState === WebSocket.OPEN
      && (socket.deserializeAttachment() as { side: Side } | null)?.side === side);
  }
  private broadcast() {
    const room = this.room;
    if (!room) return;
    const players: Record<string, unknown> = {};
    for (const side of ['red', 'blue'] as Side[]) {
      const seat = room.seats[side];
      if (seat) players[side] = { name: seat.name, ready: seat.ready, online: this.connected(side), registered: !!seat.accountId };
    }
    for (const socket of this.ctx.getWebSockets()) {
      const peer = socket.deserializeAttachment() as { side?: Side } | null;
      if (peer?.side) send(socket, { type: 'room', code: room.code, side: peer.side, players,
        state: room.state, started: room.started, version: room.version, drawOffer: room.drawOffer, rematch: room.rematch });
    }
  }
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/internal/create' && request.method === 'POST') {
      return this.ctx.blockConcurrencyWhile(async () => {
        if (this.room) return new Response('Conflict', { status: 409 });
        const { code, ...credentials } = await request.json<Identity & { code: string }>();
        const room: Room = { code, seats: { red: { ...credentials, ready: false } }, state: emptyGame(),
          started: false, version: 0, drawOffer: null, rematch: [], history: [] };
        await this.ctx.storage.put('room', room);
        this.room = room;
        return Response.json({ code });
      });
    }
    if (!this.room) return new Response('Room not found', { status: 404 });
    // Browser WebSockets authenticate in the first message. Connections remain
    // unbound until the room has validated the player token.
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    const accountHeader = request.headers.get('X-Account-Identity');
    pair[1].serializeAttachment(accountHeader ? { account: JSON.parse(decodeURIComponent(accountHeader)) } : null);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
  async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer) {
    try {
      if (typeof raw !== 'string') throw new Error('请求格式无效');
      const message = parseMessage(raw);
      if (message.type === 'ping') { send(socket, { type: 'pong' }); return; }
      // Serialize the entire read/validate/write operation, including across
      // storage awaits, so simultaneous moves cannot overwrite each other.
      await this.ctx.blockConcurrencyWhile(async () => {
        try {
          if (!this.room) throw new Error('房间不存在');
          const room = structuredClone(this.room);
          const peer = socket.deserializeAttachment() as { side?: Side; account?: AccountIdentity } | null;
          if (peer?.account) {
            const response = await directory(this.env).fetch('https://accounts/internal/resolve', { headers: { 'X-Session-Hash': peer.account.sessionHash } });
            const live = await response.json<{ identity: AccountIdentity | null }>();
            if (!live.identity) { send(socket, { type: 'error', message: '登录已失效，请重新登录' }); socket.close(4001, '登录已失效'); return; }
          }
          if (message.type === 'join') {
            const credentials = await playerIdentity(message, peer?.account ?? null, this.env);
            if (String(message.code).toUpperCase() !== room.code) throw new Error('房间号不匹配');
            const existing = (['red', 'blue'] as Side[]).find(side => room.seats[side]?.token === credentials.token);
            const side = existing ?? (!room.seats.blue ? 'blue' : null);
            if (!side) throw new Error('房间已满，请创建新房间');
            if (!existing) {
              room.seats[side] = { ...credentials, ready: false };
              room.version++;
              await this.ctx.storage.put('room', room);
              this.room = room;
            }
            // Attachments survive hibernation and identify each authenticated player.
            socket.serializeAttachment({ side, ...(peer?.account ? { account: peer.account } : {}) });
            this.broadcast();
            return;
          }
          if (!peer?.side) throw new Error('请先进入房间');
          if (message.version !== room.version) { this.broadcast(); throw new Error('棋盘已更新，请根据最新局面操作'); }
          const { side } = peer;
          if (message.type === 'ready') {
            if (room.started) throw new Error('对局已经开始');
            room.seats[side]!.ready = !room.seats[side]!.ready;
            room.started = !!room.seats.red?.ready && !!room.seats.blue?.ready;
          } else if (message.type === 'move') {
            if (!room.started || !this.connected(other(side))) throw new Error('请等待对手连接并准备');
            room.state = placeMove(room.state, { side, x: message.x as number, y: message.y as number,
              orientation: message.orientation as '/' | '\\' });
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
              room.state = emptyGame(); room.drawOffer = null; room.rematch = [];
            }
          } else throw new Error('未知操作');
          room.version++;
          await this.ctx.storage.put('room', room);
          this.room = room;
          this.broadcast();
        } catch (error) { send(socket, { type: 'error', message: errorText(error) }); }
      });
    } catch (error) { send(socket, { type: 'error', message: errorText(error) }); }
  }
  webSocketClose(socket: WebSocket, code: number, reason: string) {
    socket.serializeAttachment(null);
    // Abrupt disconnects arrive with reserved close codes such as 1005/1006.
    // These codes cannot be sent in a WebSocket close frame.
    const replyCode = code === 1005 || code === 1006 || code === 1015 ? 1000 : code;
    socket.close(replyCode, reason);
    this.broadcast();
  }
  webSocketError(socket: WebSocket) {
    socket.serializeAttachment(null);
    socket.close(1011, '连接异常，请重新连接');
    this.broadcast();
  }
}
