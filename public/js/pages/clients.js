import { $, esc, api, fmt, state, modal, toast, withBtn } from '../core.js';
import { ACTIVITY } from './overview.js';

const statusBadge = (s) => (s === 'active' ? '<span class="badge good">نشط</span>' : '<span class="badge bad">موقوف</span>');

export async function openClient(id, onChange) {
  const { user: u, business: b, kpis, designs, activity } = await api(`/admin/users/${id}`);
  const { plans } = state.me;
  const info = (label, value, ltr = false) => `<div><p class="muted small" style="margin:0">${label}</p><p style="margin:2px 0 0;font-weight:500" ${ltr ? 'dir="ltr" class="num" style="text-align:right"' : ''}>${esc(value || '—')}</p></div>`;
  const m = modal({
    title: u.name, sub: `${u.business || ''} · عميل منذ ${fmt.date(u.created_at)}`, wide: true,
    body: `
      <div class="grid g-4" style="gap:14px">
        ${info('البريد', u.email, true)}${info('الهاتف', u.phone, true)}${info('المجال', u.industry)}${info('الموقع', [u.city, u.country].filter(Boolean).join('، '))}
        ${info('انستغرام', u.instagram, true)}${info('الموقع الإلكتروني', u.website, true)}${info('آخر دخول', u.last_login_at ? fmt.date(u.last_login_at) : '—')}
        <div><p class="muted small" style="margin:0">الحالة</p><div style="margin-top:4px">${statusBadge(u.status)}</div></div>
      </div>
      ${b?.description ? `<p class="small muted" style="margin:16px 0 0;line-height:1.8">${esc(b.description)}</p>` : ''}
      <div class="grid g-4 section-gap" style="gap:12px">
        ${[['آخر إيراد', kpis ? `${fmt.num(kpis.revenue)}` : '—'], ['هامش الربح', kpis ? `${kpis.margin}%` : '—'], ['صحة النشاط', kpis ? `${kpis.healthScore}/100` : '—'], ['تصاميم / طلبات AI', `${u.designs} / ${u.ai_calls}`]]
          .map(([l, v]) => `<div class="card mini" style="box-shadow:none"><div class="label">${l}</div><div class="value num" style="font-size:20px">${v}</div></div>`).join('')}
      </div>
      ${designs.length ? `<div class="section-gap"><p class="st-label">آخر التصاميم</p><div class="row" style="gap:8px;overflow-x:auto">
        ${designs.map((d) => `<img src="${d.thumbnail}" alt="${esc(d.title)}" title="${esc(d.title)}" style="width:92px;height:92px;object-fit:contain;border-radius:12px;background:rgba(0,0,0,.3);flex:none">`).join('')}</div></div>` : ''}
      <div class="card section-gap" style="box-shadow:none;background:rgba(255,255,255,.05)">
        <p class="st-label" style="margin-top:0">إدارة الحساب</p>
        <div class="row wrap" style="gap:10px">
          <select class="select" id="m-plan" style="width:auto;min-width:140px">${Object.entries(plans).map(([k, p]) => `<option value="${k}" ${k === u.plan ? 'selected' : ''}>باقة ${p.label}</option>`).join('')}</select>
          <button class="btn sm" id="m-plan-btn">تحديث الباقة</button>
          <span class="spacer"></span>
          <span class="small muted">النقاط: <b class="num" id="m-credits">${u.credits}</b></span>
          <input class="input num" id="m-add" type="number" value="50" style="width:90px;height:36px">
          <button class="btn sm" id="m-add-btn"><i data-lucide="plus"></i>إضافة نقاط</button>
        </div>
      </div>
      <p class="st-label section-gap">سجل النشاط</p>
      <div class="list" style="max-height:200px;overflow:auto">${activity.map((a) => {
        const [icon, label] = ACTIVITY[a.action] || ['dot', a.action];
        return `<div class="list-item"><i data-lucide="${icon}" style="width:15px;color:var(--ink-3)"></i><div class="grow small">${label}</div><span class="muted small">${fmt.ago(a.created_at)}</span></div>`;
      }).join('')}</div>`,
    actions: [
      { label: u.status === 'active' ? 'إيقاف الحساب' : 'تفعيل الحساب', kind: u.status === 'active' ? 'danger' : 'primary', onClick: async () => {
        await api(`/admin/users/${u.id}`, { method: 'PATCH', body: { status: u.status === 'active' ? 'suspended' : 'active' } });
        toast(u.status === 'active' ? 'تم إيقاف الحساب' : 'تم تفعيل الحساب');
        onChange?.();
      } },
      { label: 'إغلاق' },
    ],
  });
  $('#m-plan-btn', m.el).onclick = (e) => withBtn(e.currentTarget, async () => {
    await api(`/admin/users/${u.id}`, { method: 'PATCH', body: { plan: $('#m-plan', m.el).value } });
    toast('تم تحديث الباقة');
    onChange?.();
  });
  $('#m-add-btn', m.el).onclick = (e) => withBtn(e.currentTarget, async () => {
    const n = parseInt($('#m-add', m.el).value, 10);
    if (!Number.isInteger(n) || n === 0) throw new Error('أدخل عدداً صحيحاً');
    await api(`/admin/users/${u.id}`, { method: 'PATCH', body: { addCredits: n } });
    $('#m-credits', m.el).textContent = Math.max(0, Number($('#m-credits', m.el).textContent) + n);
    toast('تم تحديث النقاط');
    onChange?.();
  });
}

export async function render(view) {
  const { plans } = state.me;
  view.innerHTML = `
  <div class="page-head">
    <div><h1>العملاء</h1><p id="count">...</p></div>
    <a class="btn gold" href="/api/admin/export" download><i data-lucide="file-spreadsheet"></i>تصدير Excel</a>
  </div>
  <div class="card">
    <div class="row wrap" style="margin-bottom:14px">
      <div style="position:relative;flex:1;min-width:220px">
        <i data-lucide="search" style="position:absolute;inset-inline-start:14px;top:13px;width:18px;color:var(--ink-3)"></i>
        <input class="input" id="q" placeholder="ابحث بالاسم، البريد، الهاتف أو اسم النشاط" style="padding-inline-start:42px">
      </div>
      <select class="select" id="plan" style="width:auto"><option value="">كل الباقات</option>${Object.entries(plans).map(([k, p]) => `<option value="${k}">${p.label}</option>`).join('')}</select>
      <select class="select" id="status" style="width:auto"><option value="">كل الحالات</option><option value="active">نشط</option><option value="suspended">موقوف</option></select>
    </div>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>العميل</th><th>النشاط</th><th>العلامات</th><th>المدينة</th><th>الباقة</th><th>النقاط</th><th>التصاميم</th><th>طلبات AI</th><th>التسجيل</th><th>آخر دخول</th><th>الحالة</th></tr></thead>
      <tbody id="rows"><tr><td colspan="11"><div class="skeleton" style="height:18px"></div></td></tr></tbody>
    </table></div>
  </div>`;

  let timer;
  const load = async () => {
    const qs = new URLSearchParams({ q: $('#q', view).value.trim(), plan: $('#plan', view).value, status: $('#status', view).value });
    const users = await api(`/admin/users?${qs}`);
    $('#count', view).textContent = `${users.length} عميل`;
    $('#rows', view).innerHTML = users.map((u) => `
      <tr class="click" data-id="${u.id}">
        <td><b>${esc(u.name)}</b><div class="muted small" dir="ltr" style="text-align:right">${esc(u.email)}</div></td>
        <td>${esc(u.business || '—')}<div class="muted small">${esc(u.industry || '')}</div></td>
        <td class="num">${u.brands}${u.memberships ? ` <span class="muted small">+${u.memberships} فريق</span>` : ''}</td>
        <td>${esc(u.city || '—')}</td>
        <td><span class="badge ${u.plan === 'free' ? '' : 'gold'}">${plans[u.plan]?.label || u.plan}</span></td>
        <td class="num">${u.credits}</td><td class="num">${u.designs}</td><td class="num">${u.ai_calls}</td>
        <td class="small">${fmt.date(u.created_at)}</td><td class="small">${fmt.ago(u.last_login_at)}</td>
        <td>${statusBadge(u.status)}</td>
      </tr>`).join('') || '<tr><td colspan="11" class="muted" style="text-align:center;padding:30px">لا يوجد عملاء مطابقون</td></tr>';
  };
  load();
  $('#q', view).oninput = () => { clearTimeout(timer); timer = setTimeout(load, 250); };
  $('#plan', view).onchange = load;
  $('#status', view).onchange = load;
  view.addEventListener('click', (e) => {
    const id = e.target.closest('tr[data-id]')?.dataset.id;
    if (id) openClient(id, load);
  });
}
