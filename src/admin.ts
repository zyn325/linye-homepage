import type { AdminStats, AdminPlayers } from '../shared/accounts';
export function mountAdmin(openLogin: () => void) {
  const host = document.createElement('section'); host.id = 'admin-page'; host.className = 'admin-page hidden';
  host.innerHTML = `<div class="admin-heading"><div><p class="eyebrow">制作者专属</p><h1>看看，有多少人来了。</h1></div><button id="admin-refresh" class="text-button">刷新数据 ↻</button></div>
  <p class="form-note">账号注册统计 · 北京时间。游客未计入注册人数。</p><p id="admin-error" class="form-error" role="alert"></p><button id="admin-login" class="primary hidden">登录制作者账号</button>
  <div id="admin-data" class="hidden"><div class="admin-metrics"><article><span>总注册人数</span><strong id="admin-total">—</strong></article><article><span>今日新增</span><strong id="admin-today">—</strong></article><article><span>近 7 天新增</span><strong id="admin-week">—</strong></article></div>
  <div class="admin-chart-heading"><h2>近 30 天注册趋势</h2><span>包含今天</span></div><div id="admin-chart" role="img" aria-label="近30天每日注册人数"></div><p id="admin-empty" class="form-note hidden">这段时间还没有新注册，发布视频后再来看看。</p>
  <details class="admin-daily"><summary>查看每日明细</summary><table><thead><tr><th>日期</th><th>新增人数</th></tr></thead><tbody id="admin-daily"></tbody></table></details>
  <section class="admin-players"><h2>注册玩家</h2><p class="form-note">玩家 ID 是账号的唯一编号。注册时间按北京时间显示。</p><table><thead><tr><th>用户名</th><th>玩家 ID</th><th>注册时间</th></tr></thead><tbody id="admin-players"></tbody></table><p id="admin-players-empty" class="form-note hidden">还没有注册玩家。</p><button id="admin-more" class="text-button hidden">加载更多玩家</button></section>
  <p class="form-note">总数包含已注册的制作者账号及验收测试账号；此处不等于访问或游玩人数。</p><p id="admin-updated" class="form-note"></p></div>`;
  document.querySelector('main')!.append(host);
  const $ = <T extends HTMLElement = HTMLElement>(q: string) => host.querySelector<T>(q)!;
  let busy = false, visible = false, generation = 0, nextCursor: string | null = null, loadingMore = false;
  function renderPlayers(data: AdminPlayers, append = false) {
    const rows = data.players.map(player => {
      const row = document.createElement('tr');
      for (const value of [player.username, player.id, new Date(player.createdAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })]) {
        const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
      }
      return row;
    });
    if (append) $('#admin-players').append(...rows); else $('#admin-players').replaceChildren(...rows);
    nextCursor = data.nextCursor;
    $('#admin-more').classList.toggle('hidden', !nextCursor);
    $('#admin-players-empty').classList.toggle('hidden', !!$('#admin-players').children.length);
  }
  async function request<T>(path: string): Promise<T> {
    const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(20000) });
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(data.message || '加载失败，请重试'), { status: response.status });
    return data;
  }
  function render(stats: AdminStats) {
    $('#admin-total').textContent = String(stats.total); $('#admin-today').textContent = String(stats.today); $('#admin-week').textContent = String(stats.last7Days);
    const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', '0 0 960 240');
    const peak = Math.max(1, ...stats.daily.map(day => day.count));
    const max = Math.ceil(peak / 3) * 3;
    for (let i = 0; i < 4; i++) {
      const line = document.createElementNS(ns, 'line'), y = 20 + i * 60;
      for (const [key, value] of Object.entries({ x1: 42, x2: 945, y1: y, y2: y, stroke: '#344042' })) line.setAttribute(key, String(value)); svg.append(line);
      const label = document.createElementNS(ns, 'text'); label.setAttribute('x', '3'); label.setAttribute('y', String(y + 4)); label.setAttribute('fill', '#96a4a2'); label.setAttribute('font-size', '12'); label.textContent = String(max * (3 - i) / 3); svg.append(label);
    }
    stats.daily.forEach((day, index) => {
      const x = 47 + index * 30, height = day.count / max * 180;
      const rect = document.createElementNS(ns, 'rect');
      for (const [key, value] of Object.entries({ x, y: 200 - height, width: 19, height: Math.max(day.count ? 2 : 0, height), fill: index === 29 ? '#f07867' : '#e8c995', rx: 2 })) rect.setAttribute(key, String(value));
      const title = document.createElementNS(ns, 'title'); title.textContent = `${day.date}：${day.count} 人`; rect.append(title); svg.append(rect);
      if ([0, 7, 14, 21, 29].includes(index)) { const label = document.createElementNS(ns, 'text'); label.setAttribute('x', String(x + 9)); label.setAttribute('y', '225'); label.setAttribute('text-anchor', 'middle'); label.setAttribute('fill', '#96a4a2'); label.setAttribute('font-size', '12'); label.textContent = day.date.slice(5); svg.append(label); }
    });
    $('#admin-chart').replaceChildren(svg); $('#admin-chart').setAttribute('aria-label', stats.daily.map(day => `${day.date}：${day.count} 人`).join('；'));
    $('#admin-empty').classList.toggle('hidden', stats.daily.some(day => day.count > 0));
    $('#admin-daily').replaceChildren(...stats.daily.slice().reverse().map(day => { const row = document.createElement('tr'); for (const value of [day.date, String(day.count)]) { const cell = document.createElement('td'); cell.textContent = value; row.append(cell); } return row; }));
    $('#admin-updated').textContent = '更新于 ' + new Date(stats.updatedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
  }
  async function refresh() {
    if (!visible) return;
    const ticket = ++generation; busy = true; $<HTMLButtonElement>('#admin-refresh').disabled = true;
    nextCursor = null; loadingMore = false; $<HTMLButtonElement>('#admin-more').disabled = false; $('#admin-players').replaceChildren();
    $('#admin-error').textContent = ''; $('#admin-data').classList.add('hidden'); $('#admin-login').classList.add('hidden');
    try {
      const [stats, players] = await Promise.all([request<AdminStats>('/api/admin/stats'), request<AdminPlayers>('/api/admin/players')]);
      if (ticket !== generation || !visible) return;
      render(stats); renderPlayers(players); $('#admin-data').classList.remove('hidden');
    } catch (error) { if (ticket === generation && visible) { $('#admin-error').textContent = error instanceof Error ? error.message : '数据加载失败，请检查网络后刷新。'; $('#admin-login').classList.toggle('hidden', (error as { status?: number }).status !== 401); } }
    finally { if (ticket === generation) { busy = false; $<HTMLButtonElement>('#admin-refresh').disabled = false; } }
  }
  $('#admin-refresh').onclick = () => { if (!busy) void refresh(); };
  $('#admin-more').onclick = async () => {
    if (!nextCursor || loadingMore || busy || !visible) return;
    const ticket = generation; loadingMore = true; $<HTMLButtonElement>('#admin-more').disabled = true; $('#admin-error').textContent = '';
    try {
      const data = await request<AdminPlayers>('/api/admin/players?after=' + encodeURIComponent(nextCursor));
      if (ticket === generation && visible) renderPlayers(data, true);
    } catch (error) { if (ticket === generation && visible) { $('#admin-error').textContent = error instanceof Error ? error.message : '加载失败，请重试'; if ([401, 403].includes((error as { status?: number }).status || 0)) { $('#admin-data').classList.add('hidden'); $('#admin-players').replaceChildren(); } } }
    finally { if (ticket === generation) { loadingMore = false; $<HTMLButtonElement>('#admin-more').disabled = false; } }
  };
  $('#admin-login').onclick = openLogin;
  return {
    show() { visible = true; host.classList.remove('hidden'); document.querySelector('#home')!.classList.add('hidden'); document.querySelector('#play')!.classList.add('hidden'); void refresh(); },
    hide() { visible = false; generation++; nextCursor = null; $('#admin-players').replaceChildren(); host.classList.add('hidden'); $('#admin-data').classList.add('hidden'); },
    refresh
  };
}
