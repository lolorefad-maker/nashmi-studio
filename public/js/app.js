import { $, $$, h, esc, api, icons, state, modal, toast, fmt, applyWallpaper, getWallpaper, WALLPAPERS } from './core.js';
import { startI18n, setLang, isEn } from './i18n.js';

const CLIENT_NAV = [
  { route: 'overview', icon: 'layout-dashboard', label: 'الرئيسية' },
  { route: 'assistant', icon: 'bot', label: 'المساعد' },
  { route: 'analytics', icon: 'chart-no-axes-combined', label: 'التحليلات' },
  { route: 'studio', icon: 'palette', label: 'الاستوديو' },
  { route: 'designs', icon: 'images', label: 'تصاميمي' },
  { route: 'content', icon: 'pen-line', label: 'المحتوى' },
  { route: 'calendar', icon: 'calendar-days', label: 'التقويم' },
];
const ADMIN_NAV = [
  { route: 'admin', icon: 'layout-dashboard', label: 'لوحة الإدارة' },
  { route: 'clients', icon: 'users', label: 'العملاء' },
  { route: 'settings', icon: 'settings', label: 'الإعدادات' },
];

const CLIENT_DOCK = [
  { tip: 'مساعد الأعمال', icon: 'bot', href: '#/assistant' },
  { tip: 'تصميم جديد', icon: 'plus', href: '#/studio?new=1' },
  { tip: 'جدولة منشور', icon: 'calendar-plus', href: '#/calendar?new=1' },
  { tip: 'تحليل ذكي للنشاط', icon: 'sparkles', href: '#/analytics?ai=1' },
  { tip: 'التقرير الشهري PDF', icon: 'file-text', href: '/report', blank: true },
  { tip: 'هوية العلامة', icon: 'swatch-book', href: '#/brand' },
  { tip: 'الفريق والعلامات', icon: 'users', href: '#/team' },
  'sep',
  { tip: 'تغيير الخلفية', icon: 'image', action: 'wallpaper' },
  { tip: isEn ? 'العربية' : 'English', icon: 'languages', action: 'lang' },
  { tip: 'الإعدادات', icon: 'settings', href: '#/settings' },
  { tip: 'تسجيل الخروج', icon: 'log-out', action: 'logout' },
];
const ADMIN_DOCK = [
  { tip: 'تصدير العملاء Excel', icon: 'file-spreadsheet', href: '/api/admin/export', download: true },
  { tip: 'العملاء', icon: 'users', href: '#/clients' },
  'sep',
  { tip: 'تغيير الخلفية', icon: 'image', action: 'wallpaper' },
  { tip: isEn ? 'العربية' : 'English', icon: 'languages', action: 'lang' },
  { tip: 'تسجيل الخروج', icon: 'log-out', action: 'logout' },
];

const PAGES = {
  overview: () => import('./pages/overview.js'),
  analytics: () => import('./pages/analytics.js'),
  studio: () => import('./pages/studio.js'),
  designs: () => import('./pages/designs.js'),
  content: () => import('./pages/content.js'),
  calendar: () => import('./pages/calendar.js'),
  team: () => import('./pages/team.js'),
  assistant: () => import('./pages/assistant.js'),
  apps: () => import('./pages/apps.js'),
  automations: () => import('./pages/automations.js'),
  brand: () => import('./pages/brand.js'),
  settings: () => import('./pages/settings.js'),
  admin: () => import('./pages/admin.js'),
  clients: () => import('./pages/clients.js'),
};
const ADMIN_ONLY = new Set(['admin', 'clients']);
const CLIENT_ONLY = new Set(['overview', 'analytics', 'studio', 'designs', 'content', 'brand', 'calendar', 'team', 'assistant', 'apps', 'automations']);

let cleanup = null;
let renderSeq = 0;

export async function refreshMe() {
  state.me = await api('/auth/me');
  const { user, business, ai, appName, role } = state.me;
  $$('[data-app-name]').forEach((n) => (n.textContent = appName));
  $('#biz-name').textContent = user.role === 'admin' ? 'لوحة إدارة المنصة' : business?.name || '';
  $('#viewer-badge')?.classList.toggle('hidden', role !== 'viewer');
  $('#credit-count').textContent = user.role === 'admin' ? '∞' : user.credits;
  $('#ai-dot').classList.toggle('on', ai.connected);
  $('#credits').title = ai.connected ? `متصل بالنموذج: ${ai.model}` : 'وضع تجريبي — لم يتم ربط النموذج بعد';
  const av = $('#avatar');
  av.innerHTML = business?.logo ? `<img src="${business.logo}" alt="">` : esc((user.name || '?').trim()[0]);
}

export function setCredits(n) {
  if (state.me) state.me.user.credits = n;
  $('#credit-count').textContent = n;
}

function buildChrome() {
  const admin = state.me.user.role === 'admin';
  $('#nav').innerHTML = (admin ? ADMIN_NAV : CLIENT_NAV)
    .map((n) => `<a href="#/${n.route}" data-route="${n.route}"><i data-lucide="${n.icon}"></i><span>${n.label}</span></a>`).join('');
  $('#dock').innerHTML = (admin ? ADMIN_DOCK : CLIENT_DOCK).map((d) => d === 'sep' ? '<div class="sep"></div>'
    : d.href ? `<a href="${d.href}" data-tip="${d.tip}" aria-label="${d.tip}" ${d.download ? 'download' : ''} ${d.blank ? 'target="_blank"' : ''}><i data-lucide="${d.icon}"></i></a>`
      : `<button data-tip="${d.tip}" aria-label="${d.tip}" data-action="${d.action}"><i data-lucide="${d.icon}"></i></button>`).join('');
  $('#dock').addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'wallpaper') wallpaperPicker();
    if (action === 'logout') logout();
    if (action === 'lang') setLang(isEn ? 'ar' : 'en');
  });
  $('#avatar').onclick = (e) => { e.stopPropagation(); accountMenu(); };
  $('.brand').onclick = (e) => { if (!admin) { e.preventDefault(); e.stopPropagation(); brandMenu(); } };
  if (admin) $('.brand-caret')?.remove();
  else {
    $('#bell').classList.remove('hidden');
    $('#bell').onclick = (e) => { e.stopPropagation(); notificationsMenu(); };
    notifTimer ??= setInterval(refreshNotifications, 60_000);
  }
  $('#credits').onclick = () => { if (!admin) location.hash = '#/settings'; };
}

function accountMenu() {
  const existing = $('.menu');
  if (existing) return existing.remove();
  const { user, plan } = state.me;
  const admin = user.role === 'admin';
  const m = h(`<div class="menu glass">
    <div class="who"><b>${esc(user.name)}</b><span>${esc(user.email)}</span>
      ${admin ? '<div style="margin-top:8px"><span class="badge gold">مدير المنصة</span></div>' : `<div style="margin-top:8px"><span class="badge gold">باقة ${esc(plan?.label || '')}</span></div>`}</div>
    ${admin ? '' : '<a href="#/brand"><i data-lucide="swatch-book"></i>هوية العلامة</a><a href="#/team"><i data-lucide="users"></i>الفريق والعلامات</a>'}
    <a href="#/settings"><i data-lucide="settings"></i>الإعدادات</a>
    <button data-wp><i data-lucide="image"></i>تغيير الخلفية</button>
    <button data-lang data-no-i18n><i data-lucide="languages"></i>${isEn ? 'العربية' : 'English'}</button>
    <button data-out><i data-lucide="log-out"></i>تسجيل الخروج</button>
  </div>`);
  document.body.append(m);
  icons();
  $('[data-wp]', m).onclick = () => { m.remove(); wallpaperPicker(); };
  $('[data-out]', m).onclick = logout;
  $('[data-lang]', m).onclick = () => setLang(isEn ? 'ar' : 'en');
  m.addEventListener('click', (e) => e.target.closest('a') && m.remove());
  setTimeout(() => document.addEventListener('click', function off(e) {
    if (!m.contains(e.target)) { m.remove(); document.removeEventListener('click', off); }
  }));
}

// In-app notifications (automations, failures). Polled every minute.
let notifTimer = null;
async function refreshNotifications() {
  try {
    const { unread } = await api('/biz/notifications');
    const c = $('#bell-count');
    c.textContent = unread > 9 ? '9+' : unread;
    c.classList.toggle('hidden', !unread);
  } catch { /* offline or signed out */ }
}

async function notificationsMenu() {
  const existing = $('.menu');
  if (existing) return existing.remove();
  const { items } = await api('/biz/notifications');
  const m = h(`<div class="menu glass notif-menu">
    <div class="who"><b>التنبيهات</b><span>نتائج الأتمتة والتنبيهات المهمة</span></div>
    ${items.map((n) => `<a class="notif ${n.read ? '' : 'unread'}" href="${esc(n.link || '#/automations')}"><b>${esc(n.title)}</b>${n.body ? `<p dir="auto">${esc(n.body)}</p>` : ''}
      <span class="muted small">${fmt.ago(n.created_at)}</span></a>`).join('') || '<p class="muted small" style="padding:10px 12px">لا توجد تنبيهات بعد</p>'}
  </div>`);
  document.body.append(m);
  api('/biz/notifications/read', { method: 'POST' }).then(refreshNotifications).catch(() => {});
  m.addEventListener('click', (e) => e.target.closest('a') && m.remove());
  setTimeout(() => document.addEventListener('click', function off(e) {
    if (!m.contains(e.target)) { m.remove(); document.removeEventListener('click', off); }
  }));
}

// Agencies and teams: switch between the brands this person can access.
function brandMenu() {
  const existing = $('.menu');
  if (existing) return existing.remove();
  const { businesses, business } = state.me;
  const ROLE = { owner: 'مالك', editor: 'محرر', viewer: 'مشاهد' };
  const m = h(`<div class="menu glass brand-menu">
    <div class="who"><b>علاماتك التجارية</b><span>بدّل بين العلامات التي تديرها</span></div>
    ${businesses.map((b) => `<button data-biz="${b.id}">
      <span class="brand-dot">${b.logo ? `<img src="${b.logo}" alt="">` : esc(b.name.trim()[0] || '؟')}</span>
      <span class="spacer" style="text-align:start">${esc(b.name)}<small class="muted" style="display:block;font-size:11.5px">${ROLE[b.role] || ''}</small></span>
      ${b.id === business.id ? '<i data-lucide="check" style="color:var(--gold)"></i>' : ''}</button>`).join('')}
    <div style="height:1px;background:var(--line-2);margin:6px 0"></div>
    <a href="#/team?brand=new"><i data-lucide="plus"></i>إضافة علامة جديدة</a>
    <a href="#/team"><i data-lucide="users"></i>الفريق والعلامات</a>
  </div>`);
  document.body.append(m);
  icons();
  m.addEventListener('click', async (e) => {
    const id = e.target.closest('[data-biz]')?.dataset.biz;
    if (e.target.closest('a')) m.remove();
    if (!id || Number(id) === business.id) return;
    await api(`/workspace/brands/${id}/activate`, { method: 'POST' });
    location.hash = '#/overview';
    location.reload();
  });
  setTimeout(() => document.addEventListener('click', function off(e) {
    if (!m.contains(e.target)) { m.remove(); document.removeEventListener('click', off); }
  }));
}

export function wallpaperPicker() {
  const current = getWallpaper();
  const m = modal({
    title: 'خلفية لوحة التحكم', sub: 'اختر الخلفية التي تناسب ذوقك',
    body: `<div class="wp-options">${Object.entries(WALLPAPERS).map(([k, w]) =>
      `<div class="wp-option ${k === current ? 'active' : ''}" data-wp="${k}" style="background:${w.thumb} center/cover" title="${w.label}"><span>${w.label}</span></div>`).join('')}</div>`,
  });
  m.el.addEventListener('click', (e) => {
    const k = e.target.closest('[data-wp]')?.dataset.wp;
    if (!k) return;
    applyWallpaper(k);
    $$('.wp-option', m.el).forEach((o) => o.classList.toggle('active', o.dataset.wp === k));
  });
}

async function logout() {
  await api('/auth/logout', { method: 'POST' }).catch(() => {});
  location.href = '/login';
}

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  const [route, ...rest] = path.split('/').filter(Boolean);
  return { route, sub: rest, params: Object.fromEntries(new URLSearchParams(qs || '')) };
}

async function render() {
  const seq = ++renderSeq;
  const admin = state.me.user.role === 'admin';
  let { route, sub, params } = parseHash();
  if (!route || !PAGES[route] || (admin && CLIENT_ONLY.has(route)) || (!admin && ADMIN_ONLY.has(route))) {
    route = admin ? 'admin' : 'overview';
    history.replaceState(null, '', `#/${route}`);
  }
  const navRoute = { apps: 'assistant', automations: 'assistant' }[route] || route;
  $$('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === navRoute));
  if (!admin) refreshNotifications();
  $('.menu')?.remove();

  if (typeof cleanup === 'function') { try { cleanup(); } catch { /* ignore */ } }
  cleanup = null;
  try {
    const mod = await PAGES[route]();
    if (seq !== renderSeq) return;
    // Fresh element per page so listeners from the previous page never leak.
    const old = $('#view');
    const view = old.cloneNode(false);
    view.className = 'view';
    old.replaceWith(view);
    cleanup = await mod.render(view, { sub, params });
    icons();
    window.scrollTo({ top: 0 });
  } catch (err) {
    console.error(err);
    if (seq === renderSeq) toast(err.message || 'تعذّر تحميل الصفحة', 'err');
  }
}

async function boot() {
  startI18n();
  applyWallpaper();
  try {
    await refreshMe();
  } catch {
    return;
  }
  buildChrome();
  icons();
  window.addEventListener('hashchange', render);
  render();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
