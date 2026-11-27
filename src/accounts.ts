import type { AccountUser } from '../shared/accounts';
export type { AccountUser } from '../shared/accounts';
type FormMode = 'login' | 'register' | 'recover' | 'password';
export function createAccounts(button: HTMLButtonElement, onChange: (user: AccountUser | null) => void) {
  const host = document.createElement('div');
  host.innerHTML = `<dialog id="account-dialog"><button id="account-close" class="dialog-close" aria-label="关闭账号面板">×</button><p class="eyebrow">属于你的光路</p><h2 id="account-title">登录账号</h2>
    <div id="account-tabs" class="account-tabs"><button type="button" id="account-login-tab">登录</button><button type="button" id="account-register-tab">注册</button></div>
    <form id="account-form"><div class="form-field" id="account-name-field"><label for="account-name">用户名</label><input id="account-name" maxlength="32" autocomplete="username" autocapitalize="none" spellcheck="false" required /><p id="account-name-note" class="form-note">2～16 个字，支持中文、字母、数字、_ 和 -。英文字母不区分大小写。</p></div>
    <div id="account-current-field" class="form-field hidden"><label for="account-current">当前密码</label><input id="account-current" type="password" autocomplete="current-password" maxlength="128" /></div>
    <div id="account-recovery-field" class="form-field hidden"><label for="account-recovery">恢复码</label><input id="account-recovery" autocomplete="off" spellcheck="false" autocapitalize="none" maxlength="100" /><p class="form-note">使用注册时保存的恢复码。重设成功后，旧恢复码与所有旧登录状态都会失效。</p></div>
    <div class="form-field"><label id="account-password-label" for="account-password">密码</label><input id="account-password" type="password" autocomplete="current-password" maxlength="128" required /><p id="account-password-note" class="form-note hidden">使用 10～128 个字符，建议使用独立且难以猜测的密码。</p></div>
    <div id="account-confirm-field" class="form-field hidden"><label for="account-confirm">再次输入密码</label><input id="account-confirm" type="password" autocomplete="new-password" maxlength="128" /></div>
    <p id="account-error" class="form-error" role="alert"></p><button id="account-submit" class="primary full" type="submit">登录 ↗</button><button id="account-forgot" type="button" class="text-button">忘记密码？使用恢复码</button><p id="account-privacy" class="form-note">仅保存用户名、密码的加盐哈希与登录凭证。用户名会显示给对手；无需提供手机号或邮箱。</p></form>
    <div id="account-profile" class="hidden"><div class="account-avatar" aria-hidden="true">☼</div><p id="account-profile-name"></p><p id="account-created" class="form-note"></p><p class="form-note">账号名在全站唯一。登录后对局使用此名字，游客无法冒用注册身份。</p><button id="account-change-password" class="primary full">修改密码</button><button id="account-logout" class="text-button full">退出登录</button><p id="account-profile-error" class="form-error" role="alert"></p></div>
    <div id="account-save-recovery" class="hidden"><p class="form-note">请保存下面的恢复码。忘记密码时，它是找回账号的凭据；不要发给别人。这个页面关闭后不会再次显示。</p><textarea id="account-issued-code" readonly rows="3" aria-label="账号恢复码"></textarea><a id="account-download" class="primary full" download="光路棋账号恢复码.txt">下载恢复码</a><label class="account-checkbox"><input type="checkbox" id="account-saved" /> 我已妥善保存恢复码</label><button id="account-finish" class="primary full" disabled>完成，开始下棋 ↗</button><p class="form-note">本版未绑定邮箱。如果同时遗失密码和恢复码，将无法找回账号。</p></div>
  </dialog>`;
  document.body.append(host);
  const $ = <T extends HTMLElement = HTMLElement>(selector: string) => host.querySelector<T>(selector)!;
  const dialog = $<HTMLDialogElement>('#account-dialog');
  let user: AccountUser | null = null;
  let mode: FormMode = 'login';
  let busy = false, saving = false, downloadURL = '';
  function renderUser() { button.textContent = user ? user.username : '登录 / 注册'; button.title = user ? '我的账号 · ' + user.username : '登录或注册玩家账号'; }
  async function request(path: string, body?: unknown) {
    const response = await fetch('/api/auth/' + path, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin',
      cache: 'no-store', signal: AbortSignal.timeout(15000), ...(body !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
    if (!response.headers.get('Content-Type')?.includes('application/json')) throw new Error('账号服务暂时不可用，请稍后重试');
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || '操作失败，请重试');
    return result as { user: AccountUser | null; recoveryCode?: string };
  }
  function showForm(next: FormMode) {
    mode = next;
    $<HTMLFormElement>('#account-form').reset();
    $('#account-error').textContent = '';
    $('#account-title').textContent = { login: '欢迎回到光路棋', register: '为你的光路取个名字', recover: '使用恢复码找回账号', password: '设置新的密码' }[mode];
    $('#account-profile').classList.add('hidden'); $('#account-save-recovery').classList.add('hidden'); $('#account-form').classList.remove('hidden');
    $('#account-tabs').classList.toggle('hidden', mode === 'recover' || mode === 'password');
    $('#account-name-field').classList.toggle('hidden', mode === 'password');
    $<HTMLInputElement>('#account-name').required = mode !== 'password';
    $('#account-name-note').classList.toggle('hidden', mode !== 'register');
    $('#account-current-field').classList.toggle('hidden', mode !== 'password');
    $<HTMLInputElement>('#account-current').required = mode === 'password';
    $('#account-recovery-field').classList.toggle('hidden', mode !== 'recover');
    $<HTMLInputElement>('#account-recovery').required = mode === 'recover';
    $('#account-confirm-field').classList.toggle('hidden', mode === 'login');
    $<HTMLInputElement>('#account-confirm').required = mode !== 'login';
    $<HTMLInputElement>('#account-password').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
    $<HTMLInputElement>('#account-password').minLength = mode === 'login' ? 1 : 10;
    $('#account-password-label').textContent = mode === 'password' || mode === 'recover' ? '新密码' : '密码';
    $('#account-password-note').classList.toggle('hidden', mode === 'login');
    $('#account-forgot').classList.toggle('hidden', mode !== 'login');
    $('#account-privacy').classList.toggle('hidden', mode !== 'register');
    $('#account-login-tab').classList.toggle('active', mode === 'login');
    $('#account-register-tab').classList.toggle('active', mode === 'register');
    $('#account-submit').textContent = { login: '登录 ↗', register: '注册账号 ↗', recover: '重设密码并登录 ↗', password: '保存新密码 ↗' }[mode];
    queueMicrotask(() => $<HTMLInputElement>(mode === 'password' ? '#account-current' : '#account-name').focus());
  }
  function profile() {
    $('#account-form').classList.add('hidden'); $('#account-tabs').classList.add('hidden'); $('#account-save-recovery').classList.add('hidden');
    $('#account-profile').classList.remove('hidden'); $('#account-title').textContent = '我的账号';
    $('#account-profile-name').textContent = user?.username || '';
    $('#account-created').textContent = user ? '加入于 ' + new Date(user.createdAt).toLocaleDateString('zh-CN') : '';
    $('#account-profile-error').textContent = '';
  }
  function close() {
    if (busy) return;
    if (saving && !$<HTMLInputElement>('#account-saved').checked) { $<HTMLInputElement>('#account-saved').focus(); return; }
    saving = false; $<HTMLTextAreaElement>('#account-issued-code').value = '';
    if (downloadURL) { URL.revokeObjectURL(downloadURL); downloadURL = ''; }
    $<HTMLFormElement>('#account-form').reset(); dialog.close();
  }
  function changed(next: AccountUser | null) { user = next; renderUser(); onChange(user); }
  function showRecovery(code: string) {
    saving = true;
    $('#account-title').textContent = '保存你的账号恢复码';
    $('#account-form').classList.add('hidden'); $('#account-tabs').classList.add('hidden'); $('#account-profile').classList.add('hidden'); $('#account-save-recovery').classList.remove('hidden');
    $<HTMLTextAreaElement>('#account-issued-code').value = code.match(/.{1,8}/g)!.join('-');
    downloadURL = URL.createObjectURL(new Blob([`光路棋账号恢复码\n用户名：${user!.username}\n恢复码：${code}\n\n请妥善保管，勿向他人分享。\n找回账号：https://guangluqi.com\n`], { type: 'text/plain;charset=utf-8' }));
    $<HTMLAnchorElement>('#account-download').href = downloadURL;
    $<HTMLInputElement>('#account-saved').checked = false; $<HTMLButtonElement>('#account-finish').disabled = true;
  }
  button.onclick = () => {
    if (location.hostname.endsWith('.github.io')) { location.assign('https://guangluqi.com/?account=1'); return; }
    if (user) profile(); else showForm('login');
    dialog.showModal();
  };
  $('#account-login-tab').onclick = () => showForm('login');
  $('#account-register-tab').onclick = () => showForm('register');
  $('#account-forgot').onclick = () => showForm('recover');
  $('#account-change-password').onclick = () => showForm('password');
  $('#account-close').onclick = close;
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  $('#account-finish').onclick = close;
  $('#account-saved').onchange = () => { $<HTMLButtonElement>('#account-finish').disabled = !$<HTMLInputElement>('#account-saved').checked; };
  $<HTMLFormElement>('#account-form').onsubmit = async event => {
    event.preventDefault(); if (busy) return;
    const password = $<HTMLInputElement>('#account-password').value;
    if (mode !== 'login' && password !== $<HTMLInputElement>('#account-confirm').value) { $('#account-error').textContent = '两次输入的密码不一致'; return; }
    busy = true; $<HTMLButtonElement>('#account-submit').disabled = true; $('#account-error').textContent = '';
    try {
      const result = await request(mode === 'password' ? 'password' : mode, { username: $<HTMLInputElement>('#account-name').value, password,
        currentPassword: $<HTMLInputElement>('#account-current').value, recoveryCode: $<HTMLInputElement>('#account-recovery').value });
      changed(result.user); $<HTMLFormElement>('#account-form').reset();
      if (result.recoveryCode) showRecovery(result.recoveryCode); else { saving = false; dialog.close(); }
    } catch (error) { $('#account-error').textContent = error instanceof Error && error.name !== 'TimeoutError' ? error.message : '连接超时，请检查网络后重试'; }
    finally { busy = false; $<HTMLButtonElement>('#account-submit').disabled = false; }
  };
  $('#account-logout').onclick = async () => {
    if (busy) return; busy = true; $<HTMLButtonElement>('#account-logout').disabled = true;
    try { await request('logout', {}); changed(null); dialog.close(); }
    catch (error) { $('#account-profile-error').textContent = (error as Error).message; }
    finally { busy = false; $<HTMLButtonElement>('#account-logout').disabled = false; }
  };
  async function refresh() {
    try { const result = await request('me'); changed(result.user); }
    catch { button.title = '账号服务暂时无法连接，点击重试'; }
  }
  const ready = location.hostname.endsWith('.github.io') ? Promise.resolve() : refresh();
  return { ready, refresh, current: () => user, open: () => button.click() };
}
