import test from 'node:test';
import assert from 'node:assert/strict';
import { AccountService, accountRequest, digest, usernameInput, type AccountStore } from '../shared/accounts';
function fixture() {
  const data = new Map<string, unknown>(); let now = Date.now();
  const store: AccountStore = { async get<T>(key: string) { return structuredClone(data.get(key)) as T | undefined; },
    async put(key, value) { data.set(key, structuredClone(value)); }, async delete(key) { data.delete(key); } };
  const service = new AccountService(store, () => now);
  async function call(action: string, body?: unknown, cookie = '', ip = 'test') {
    const request = new Request('https://guangluqi.com/api/auth/' + action, { method: body === undefined ? 'GET' : 'POST',
      headers: { Origin: 'https://guangluqi.com', 'Content-Type': 'application/json', Cookie: cookie }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    return service.handle(await accountRequest(request, ip));
  }
  return { service, data, call, advance(ms: number) { now += ms; } };
}
const password = 'LongPassphrase_2026!';
const cookieFrom = (response: Response) => response.headers.get('Set-Cookie')!.split(';')[0];
test('normalization reserves names case-insensitively and concurrent registration has one winner', async () => {
  assert.deepEqual(usernameInput(' ＡＢc玩家 '), { username: 'ABc玩家', canonical: 'abc玩家' });
  for (const name of ['x', '<img>', 'two words', '😀😀', 'a'.repeat(17)]) assert.throws(() => usernameInput(name));
  const f = fixture();
  const responses = await Promise.all([f.call('register', { username: '光路玩家', password }), f.call('register', { username: '光路玩家', password })]);
  assert.deepEqual(responses.map(r => r.status), [200, 409]);
  const first = await responses[0].json();
  assert.equal(first.user.username, '光路玩家'); assert.match(first.recoveryCode, /^[a-f0-9]{64}$/);
  const raw = JSON.stringify([...f.data.values()]);
  assert.equal(raw.includes(password), false); assert.equal(raw.includes(first.recoveryCode), false);
  assert.match(responses[0].headers.get('Set-Cookie')!, /__Host-lightpath-session=.*HttpOnly.*SameSite=Lax.*Secure/);
  const me = await (await f.call('me', undefined, cookieFrom(responses[0]))).json(); assert.equal(me.user.id, first.user.id);
});
test('login verifies passwords, sessions are opaque, expire and logout revokes server-side', async () => {
  const f = fixture();
  await f.call('register', { username: 'TestPlayer', password });
  assert.equal((await f.call('register', { username: 'testplayer', password })).status, 409);
  assert.equal((await f.call('login', { username: 'TestPlayer', password: 'wrong' })).status, 401);
  const login = await f.call('login', { username: 'testplayer', password });
  assert.equal(login.status, 200); const cookie = cookieFrom(login);
  assert.deepEqual(Object.keys(await login.clone().json()), ['user']);
  assert.equal((await (await f.call('me', undefined, cookie)).json()).user.username, 'TestPlayer');
  assert.equal((await f.call('logout', {}, cookie)).status, 200);
  assert.equal((await (await f.call('me', undefined, cookie)).json()).user, null);
  const next = await f.call('login', { username: 'TestPlayer', password }); f.advance(31 * 86400_000);
  assert.equal((await (await f.call('me', undefined, cookieFrom(next))).json()).user, null);
});
test('password change and recovery revoke old sessions and rotate the recovery code', async () => {
  const f = fixture(); const registered = await f.call('register', { username: '恢复玩家', password });
  const initial = await registered.clone().json(), originalCookie = cookieFrom(registered);
  const second = await f.call('login', { username: '恢复玩家', password });
  assert.equal((await f.call('password', { currentPassword: 'wrong', password: 'NewPassword_2026' }, originalCookie)).status, 401);
  const changed = await f.call('password', { currentPassword: password, password: 'NewPassword_2026' }, originalCookie);
  assert.equal(changed.status, 200);
  assert.equal((await (await f.call('me', undefined, cookieFrom(second))).json()).user, null);
  assert.equal((await f.call('login', { username: '恢复玩家', password })).status, 401);
  const recovered = await f.call('recover', { username: '恢复玩家', recoveryCode: initial.recoveryCode, password: 'RecoveredPassword_2026' });
  assert.equal(recovered.status, 200); const result = await recovered.clone().json(); assert.notEqual(result.recoveryCode, initial.recoveryCode);
  assert.equal((await (await f.call('me', undefined, cookieFrom(changed))).json()).user, null);
  assert.equal((await f.call('recover', { username: '恢复玩家', recoveryCode: initial.recoveryCode, password })).status, 401);
  assert.equal((await f.call('login', { username: '恢复玩家', password: 'RecoveredPassword_2026' })).status, 200);
});
test('authentication rejects cross-origin changes, forged session headers, short passwords and brute force', async () => {
  const f = fixture();
  for (const origin of ['', 'https://evil.example']) await assert.rejects(accountRequest(new Request('https://guangluqi.com/api/auth/login', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{}' }), 'test'), /网站内/);
  const forged = await accountRequest(new Request('https://guangluqi.com/api/auth/me', { headers: { 'X-Session-Hash': 'a'.repeat(64) } }), 'test');
  assert.equal(forged.headers.get('X-Session-Hash'), '');
  assert.equal((await f.call('register', { username: '短密码', password: 'short' })).status, 400);
  for (let i = 0; i < 12; i++) assert.equal((await f.call('login', { username: 'nobody', password: 'wrong' }, '', 'brute')).status, 401);
  const limited = await f.call('login', { username: 'nobody', password: 'wrong' }, '', 'brute');
  assert.equal(limited.status, 429); assert.ok(Number(limited.headers.get('Retry-After')) > 0);
});
test('verified identity and reserved guest names are internal and do not expose secrets in me', async () => {
  const f = fixture(); const response = await f.call('register', { username: '唯一玩家', password });
  const cookie = cookieFrom(response), hash = await digest(cookie.split('=')[1]);
  const identity = await f.service.resolveHash(hash); assert.ok(identity); assert.match(identity.roomToken, /^[a-f0-9]{64}$/);
  const me = await (await f.call('me', undefined, cookie)).json(); assert.equal('roomToken' in me.user, false); assert.equal('sessionHash' in me.user, false);
  const reserved = await (await f.service.handle(new Request('https://accounts/internal/guest-name?name=' + encodeURIComponent('唯一玩家')))).json();
  assert.equal(reserved.allowed, false);
});
