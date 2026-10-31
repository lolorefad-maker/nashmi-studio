// Shared helpers: DOM, API, formatting, toasts, modals, wallpaper.
import { LOCALE, isEn, t } from './i18n.js';

export { LOCALE, isEn, t };

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export const icons = () => window.lucide?.createIcons({ attrs: { 'stroke-width': 1.8 } });

export const state = { me: null };

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && !path.startsWith('/auth/login')) {
    location.href = '/login';
    throw new Error('unauthorized');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'حدث خطأ غير متوقع');
  return data;
}

// ---------- Formatting ----------
const CURRENCY = { JOD: 'د.أ', SAR: 'ر.س', AED: 'د.إ', KWD: 'د.ك', QAR: 'ر.ق', BHD: 'د.ب', OMR: 'ر.ع', EGP: 'ج.م', IQD: 'د.ع', MAD: 'د.م', USD: '$', EUR: '€' };
export const CURRENCIES = Object.keys(CURRENCY);
export const INDUSTRIES = ['مطاعم ومقاهي', 'أزياء وملابس', 'تجميل وعناية', 'عقارات', 'تعليم وتدريب', 'صحة وعيادات', 'تجارة إلكترونية',
  'خدمات ومقاولات', 'سياحة وسفر', 'تقنية وبرمجيات', 'سيارات', 'أخرى'];

export const fmt = {
  num: (n, d = 0) => (n == null ? '—' : Number(n).toLocaleString('en-US', { maximumFractionDigits: d })),
  compact: (n) => (n == null ? '—' : Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n)),
  cur: () => (isEn ? state.me?.business?.currency || 'JOD' : CURRENCY[state.me?.business?.currency] || CURRENCY.JOD),
  money: (n, d = 0) => (n == null ? '—' : `${fmt.num(n, d)}`),
  pct: (n) => (n == null ? '—' : `${n > 0 ? '+' : ''}${n}%`),
  month: (period, style = 'long') => {
    const [y, m] = period.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(LOCALE, { month: style });
  },
  monthYear: (period) => {
    const [y, m] = period.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' });
  },
  date: (s) => (s ? new Date(s.replace(' ', 'T') + (s.includes('Z') ? '' : 'Z')).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'),
  ago: (s) => {
    if (!s) return '—';
    const d = (Date.now() - new Date(s.replace(' ', 'T') + 'Z')) / 1000;
    if (d < 60) return 'الآن';
    if (d < 3600) return `قبل ${Math.floor(d / 60)} د`;
    if (d < 86400) return `قبل ${Math.floor(d / 3600)} س`;
    return `قبل ${Math.floor(d / 86400)} يوم`;
  },
};

export function delta(v, { invert = false, suffix = 'عن الشهر السابق' } = {}) {
  if (v == null) return '<span class="delta muted">لا توجد مقارنة</span>';
  const up = v >= 0;
  const good = invert ? !up : up;
  return `<span class="delta ${good ? 'up' : 'down'}"><i data-lucide="${up ? 'trending-up' : 'trending-down'}"></i>
    <span class="num">${fmt.pct(v)}</span> <span class="muted">${suffix}</span></span>`;
}

// ---------- Toasts & modals ----------
export function toast(msg, type = 'ok') {
  const el = h(`<div class="toast ${type}"><i data-lucide="${type === 'ok' ? 'check-circle-2' : type === 'err' ? 'alert-circle' : 'info'}"></i><span>${esc(msg)}</span></div>`);
  $('#toasts').append(el);
  icons();
  setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3600);
}

export function modal({ title, sub = '', body = '', wide = false, actions = [] }) {
  const el = h(`<div class="modal-backdrop">
    <div class="modal glass ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
      <div class="row" style="align-items:flex-start">
        <div class="spacer"><h2>${esc(title)}</h2>${sub ? `<p class="muted small" style="margin:0">${esc(sub)}</p>` : ''}</div>
        <button class="btn ghost sm icon" data-close aria-label="إغلاق"><i data-lucide="x"></i></button>
      </div>
      <div class="modal-body" style="margin-top:18px">${body}</div>
      ${actions.length ? `<div class="modal-actions">${actions.map((a, i) => `<button class="btn ${a.kind || ''}" data-act="${i}">${a.label}</button>`).join('')}</div>` : ''}
    </div></div>`);
  const close = () => { el.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => e.key === 'Escape' && close();
  document.addEventListener('keydown', onKey);
  el.addEventListener('mousedown', (e) => { if (e.target === el) close(); });
  $('[data-close]', el).onclick = close;
  actions.forEach((a, i) => {
    $(`[data-act="${i}"]`, el).onclick = async (e) => {
      if (!a.onClick) return close();
      const btn = e.currentTarget;
      btn.classList.add('loading');
      try { if ((await a.onClick(el)) !== false) close(); } finally { btn.classList.remove('loading'); }
    };
  });
  $('#modal-root').append(el);
  icons();
  return { el, close };
}

export function confirmDialog(title, text, label = 'تأكيد') {
  return new Promise((resolve) => {
    const m = modal({
      title, body: `<p class="muted" style="margin:0">${esc(text)}</p>`,
      actions: [{ label, kind: 'primary', onClick: () => resolve(true) }, { label: 'إلغاء', onClick: () => resolve(false) }],
    });
    $('[data-close]', m.el).addEventListener('click', () => resolve(false));
  });
}

export async function withBtn(btn, fn) {
  btn.classList.add('loading');
  try { return await fn(); } catch (e) { toast(e.message, 'err'); } finally { btn.classList.remove('loading'); }
}

export const formData = (form) => Object.fromEntries(new FormData(form).entries());

// ---------- Wallpaper ----------
// Jordan scenes, served from /img/wp (photos from Unsplash, free license).
const WP = (name) => ({ css: `url('/img/wp/${name}.jpg')`, thumb: `url('/img/wp/${name}-thumb.jpg')` }); // single quotes: thumbs go inside style="..."
export const WALLPAPERS = {
  petra: { label: 'البتراء — الخزنة', ...WP('petra') },
  siq: { label: 'السيق', ...WP('siq') },
  deir: { label: 'الدير', ...WP('deir') },
  rum: { label: 'وادي رم ليلاً', ...WP('rum') },
  camels: { label: 'وادي رم', ...WP('camels') },
  aurora: { label: 'تدرّج', css: 'linear-gradient(160deg,#6d4b8c,#1f3f5a 55%,#1f6f78)', thumb: 'linear-gradient(160deg,#6d4b8c,#1f6f78)' },
};
const DEFAULT_WP = 'petra';
const WP_KEY = 'ns_wp';

export function getWallpaper() {
  try {
    const k = localStorage.getItem(WP_KEY);
    return WALLPAPERS[k] ? k : DEFAULT_WP;
  } catch { return DEFAULT_WP; }
}
// Called without a key on page load (applies the saved choice); with a key when the viewer picks one.
export function applyWallpaper(key) {
  const k = WALLPAPERS[key] ? key : getWallpaper();
  const wp = WALLPAPERS[k];
  const el = $('.wallpaper');
  el?.style.setProperty('--wp', `${wp.css} center/cover, #2a1a12`);
  if (key) { try { localStorage.setItem(WP_KEY, k); } catch { /* storage unavailable */ } }
}

export function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
