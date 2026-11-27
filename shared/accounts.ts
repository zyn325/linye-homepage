export interface AccountUser { id: string; username: string; createdAt: number }
interface PasswordHash { salt: string; hash: string; iterations: number }
interface Session { accountId: string; expiresAt: number; version: number }
interface User extends AccountUser {
  canonical: string; password: PasswordHash; recoveryHash: string; roomToken: string; version: number;
  sessions: { hash: string; expiresAt: number }[];
}
export interface AccountStore {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<unknown>;
  delete(key: string): Promise<unknown>;
}
export interface AccountIdentity extends AccountUser { roomToken: string; sessionHash: string }
const encoder = new TextEncoder();
const ITERATIONS = 100000; // Web Crypto's supported PBKDF2 limit on Workers; versioned for future upgrades.
const SESSION_AGE = 30 * 24 * 60 * 60 * 1000;
const randomHex = (bytes = 32) => Array.from(crypto.getRandomValues(new Uint8Array(bytes)), b => b.toString(16).padStart(2, '0')).join('');
const unhex = (hex: string) => Uint8Array.from(hex.match(/../g) ?? [], pair => parseInt(pair, 16));
const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
export const digest = async (value: string) => hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
export function usernameInput(value: unknown): { username: string; canonical: string } {
  if (typeof value !== 'string') throw new AccountError('请输入用户名');
  const username = value.normalize('NFKC').trim();
  if (!/^[\p{L}\p{N}_-]{2,16}$/u.test(username)) throw new AccountError('用户名需为 2～16 个字，可使用中文、字母、数字、下划线或短横线');
  return { username, canonical: username.toLowerCase() };
}
function passwordInput(value: unknown): string {
  if (typeof value !== 'string' || [...value].length < 10 || [...value].length > 128) throw new AccountError('密码需为 10～128 个字符');
  return value;
}
async function hashPassword(password: string, salt = randomHex(16), iterations = ITERATIONS): Promise<PasswordHash> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: unhex(salt), iterations, hash: 'SHA-256' }, key, 256);
  return { salt, hash: hex(bits), iterations };
}
function equal(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}
async function verifyPassword(value: unknown, record?: PasswordHash) {
  const password = typeof value === 'string' && value.length <= 256 ? value : '';
  const expected = record ?? { salt: '00000000000000000000000000000000', hash: '0'.repeat(64), iterations: ITERATIONS };
  const computed = await hashPassword(password, expected.salt, expected.iterations);
  return equal(computed.hash, expected.hash) && !!record;
}
export class AccountError extends Error {
  constructor(message: string, public status = 400, public retryAfter?: number) { super(message); }
}
const publicUser = (user: User): AccountUser => ({ id: user.id, username: user.username, createdAt: user.createdAt });
export class AccountService {
  private queue = Promise.resolve();
  constructor(private store: AccountStore, private now = () => Date.now()) {}
  async handle(request: Request): Promise<Response> {
    // Serialize uniqueness checks and session updates, including across async hashing.
    const prior = this.queue;
    let release!: () => void;
    this.queue = new Promise(resolve => { release = resolve; });
    await prior;
    try { return await this.dispatch(request); }
    catch (error) {
      if (!(error instanceof AccountError)) console.error('Account operation failed');
      return this.json({ message: error instanceof AccountError ? error.message : '账号服务暂时不可用，请稍后重试' }, error instanceof AccountError ? error.status : 503,
        error instanceof AccountError && error.retryAfter ? { 'Retry-After': String(error.retryAfter) } : {});
    } finally { release(); }
  }
  private json(body: unknown, status = 200, headers: Record<string, string> = {}) {
    return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });
  }
  private async rate(key: string, limit: number, windowMs: number) {
    const storageKey = 'rate:' + await digest(key);
    const old = await this.store.get<{ count: number; resetAt: number }>(storageKey);
    const current = old && old.resetAt > this.now() ? old : { count: 0, resetAt: this.now() + windowMs };
    if (current.count >= limit) throw new AccountError('尝试次数较多，请稍后再试', 429, Math.ceil((current.resetAt - this.now()) / 1000));
    current.count++;
    await this.store.put(storageKey, current);
  }
  private async named(value: unknown) {
    const input = usernameInput(value);
    const id = await this.store.get<string>('name:' + await digest(input.canonical));
    return { ...input, user: id ? await this.store.get<User>('user:' + id) : undefined };
  }
  async resolveHash(sessionHash: string): Promise<AccountIdentity | null> {
    if (!/^[a-f0-9]{64}$/.test(sessionHash)) return null;
    const session = await this.store.get<Session>('session:' + sessionHash);
    if (!session || session.expiresAt <= this.now()) return null;
    const user = await this.store.get<User>('user:' + session.accountId);
    if (!user || user.version !== session.version || !user.sessions.some(s => s.hash === sessionHash)) return null;
    return { ...publicUser(user), roomToken: user.roomToken, sessionHash };
  }
  private async session(request: Request) {
    return this.resolveHash(request.headers.get('X-Session-Hash') || '');
  }
  private cookie(value: string, request: Request, clear = false) {
    const secure = request.headers.get('X-Cookie-Secure') === '1';
    return `${secure ? '__Host-' : ''}lightpath-session=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : SESSION_AGE / 1000}${secure ? '; Secure' : ''}`;
  }
  private async issue(user: User, request: Request, recoveryCode?: string) {
    const secret = randomHex();
    const hash = await digest(secret);
    const live = user.sessions.filter(session => session.expiresAt > this.now());
    const keep = live.slice(-9);
    for (const session of user.sessions) if (!keep.includes(session)) await this.store.delete('session:' + session.hash);
    const expiresAt = this.now() + SESSION_AGE;
    user.sessions = [...keep, { hash, expiresAt }];
    await this.store.put('user:' + user.id, user);
    await this.store.put<Session>('session:' + hash, { accountId: user.id, expiresAt, version: user.version });
    return this.json({ user: publicUser(user), ...(recoveryCode ? { recoveryCode } : {}) }, 200, { 'Set-Cookie': this.cookie(secret, request) });
  }
  private async revoke(user: User) {
    for (const session of user.sessions) await this.store.delete('session:' + session.hash);
    user.sessions = []; user.version++;
  }
  private async dispatch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === '/internal/resolve') return this.json({ identity: await this.session(request) });
    if (path === '/internal/guest-name') {
      const { username, user } = await this.named(new URL(request.url).searchParams.get('name'));
      return this.json({ allowed: !user, username });
    }
    if (path === '/api/auth/me' && request.method === 'GET') {
      const identity = await this.session(request);
      return this.json({ user: identity ? { id: identity.id, username: identity.username, createdAt: identity.createdAt } : null });
    }
    if (request.method !== 'POST') throw new AccountError('请求方式不支持', 405);
    const text = await request.text();
    if (text.length > 4096) throw new AccountError('请求内容过长', 413);
    let body: Record<string, unknown>;
    try { body = JSON.parse(text); if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error(); }
    catch { throw new AccountError('请求格式不正确'); }
    const ip = request.headers.get('X-Client-IP') || 'unknown';
    await this.rate('all:' + ip, 60, 60_000);
    if (path === '/api/auth/register') {
      await this.rate('register:' + ip, 6, 3600_000);
      const { username, canonical, user: existing } = await this.named(body.username);
      const password = passwordInput(body.password);
      if (existing) throw new AccountError('这个用户名已被使用，请换一个', 409);
      const recoveryCode = randomHex();
      const user: User = { id: crypto.randomUUID(), username, canonical, createdAt: this.now(), password: await hashPassword(password),
        recoveryHash: await digest(recoveryCode), roomToken: randomHex(), version: 1, sessions: [] };
      // Persist the user first; the name is published only after its record exists.
      await this.store.put('user:' + user.id, user);
      await this.store.put('name:' + await digest(canonical), user.id);
      return this.issue(user, request, recoveryCode);
    }
    if (path === '/api/auth/login') {
      const { canonical, user } = await this.named(body.username);
      await this.rate('login-ip:' + ip, 30, 15 * 60_000);
      await this.rate('login-name:' + canonical, 12, 15 * 60_000);
      if (!await verifyPassword(body.password, user?.password) || !user) throw new AccountError('用户名或密码不正确', 401);
      return this.issue(user, request);
    }
    if (path === '/api/auth/recover') {
      const { canonical, user } = await this.named(body.username);
      await this.rate('recover-ip:' + ip, 15, 15 * 60_000);
      await this.rate('recover-name:' + canonical, 8, 15 * 60_000);
      const code = typeof body.recoveryCode === 'string' ? body.recoveryCode.replace(/[\s-]/g, '').toLowerCase() : '';
      const hash = await digest(code);
      if (!user || !/^[a-f0-9]{64}$/.test(code) || !equal(hash, user.recoveryHash)) throw new AccountError('用户名或恢复码不正确', 401);
      const password = passwordInput(body.password);
      await this.revoke(user);
      const recoveryCode = randomHex();
      user.password = await hashPassword(password); user.recoveryHash = await digest(recoveryCode);
      return this.issue(user, request, recoveryCode);
    }
    const identity = await this.session(request);
    if (!identity) throw new AccountError('请先登录账号', 401);
    const user = (await this.store.get<User>('user:' + identity.id))!;
    if (path === '/api/auth/logout') {
      user.sessions = user.sessions.filter(session => session.hash !== identity.sessionHash);
      await this.store.delete('session:' + identity.sessionHash);
      await this.store.put('user:' + user.id, user);
      return this.json({ user: null }, 200, { 'Set-Cookie': this.cookie('', request, true) });
    }
    if (path === '/api/auth/password') {
      await this.rate('password:' + user.id, 8, 15 * 60_000);
      if (!await verifyPassword(body.currentPassword, user.password)) throw new AccountError('当前密码不正确', 401);
      const password = passwordInput(body.password);
      await this.revoke(user);
      user.password = await hashPassword(password);
      return this.issue(user, request);
    }
    throw new AccountError('接口不存在', 404);
  }
}
export async function accountRequest(request: Request, ip: string): Promise<Request> {
  const url = new URL(request.url);
  if (request.method !== 'GET') {
    if (request.headers.get('Origin') !== url.origin || request.headers.get('Sec-Fetch-Site') === 'cross-site') throw new AccountError('请在游戏网站内操作', 403);
    if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) throw new AccountError('请求格式不正确', 415);
  }
  const secure = url.protocol === 'https:';
  const name = (secure ? '__Host-' : '') + 'lightpath-session';
  const cookie = request.headers.get('Cookie')?.split(';').map(item => item.trim()).find(item => item.startsWith(name + '='))?.slice(name.length + 1) || '';
  const headers = new Headers(request.headers);
  headers.set('X-Session-Hash', /^[a-f0-9]{64}$/.test(cookie) ? await digest(cookie) : '');
  headers.set('X-Client-IP', ip); headers.set('X-Cookie-Secure', secure ? '1' : '0');
  return new Request(request, { headers });
}
