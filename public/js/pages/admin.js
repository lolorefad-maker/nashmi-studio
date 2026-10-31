import { $, esc, api, fmt, state, LOCALE } from '../core.js';
import { barChart, legendHTML, SERIES } from '../charts.js';
import { ACTIVITY } from './overview.js';
import { openClient } from './clients.js';

const KINDS = [['design', 'تصاميم'], ['copy', 'نصوص'], ['analysis', 'تحليلات']];

function last30() {
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

export async function render(view) {
  const s = await api('/admin/stats');
  const { plans } = state.me;
  const t = s.totals;
  const days = last30();
  const labels = days.map((d) => new Date(d).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' }));
  const totalClients = Math.max(1, t.clients);

  view.innerHTML = `
  <div class="page-head">
    <div><h1>لوحة إدارة المنصة</h1><p>نظرة شاملة على العملاء والاستخدام والإيرادات</p></div>
    <div class="row wrap">
      <span class="badge ${s.ai.connected ? 'good' : 'warn'}"><i data-lucide="${s.ai.connected ? 'circle-check' : 'circle-alert'}"></i>${s.ai.connected ? `النموذج متصل · ${esc(s.ai.model)}` : 'النموذج غير متصل — وضع تجريبي'}</span>
      <a class="btn gold" href="/api/admin/export" download><i data-lucide="file-spreadsheet"></i>تصدير كل البيانات Excel</a>
    </div>
  </div>

  <div class="grid kpis">
    <div class="card kpi tint-blue hover"><div class="label"><span class="icon-chip"><i data-lucide="users"></i></span>إجمالي العملاء</div>
      <div class="value num">${fmt.num(t.clients)}</div><span class="delta up"><i data-lucide="trending-up"></i><span class="num">+${t.new7}</span> <span class="muted">خلال 7 أيام</span></span></div>
    <div class="card kpi tint-green hover"><div class="label"><span class="icon-chip"><i data-lucide="activity"></i></span>عملاء نشطون</div>
      <div class="value num">${fmt.num(t.active30)}</div><span class="delta"><span class="num">${Math.round((t.active30 / totalClients) * 100)}%</span>&nbsp;<span class="muted">دخلوا خلال 30 يوماً</span></span></div>
    <div class="card kpi tint-violet hover"><div class="label"><span class="icon-chip"><i data-lucide="images"></i></span>تصاميم محفوظة</div>
      <div class="value num">${fmt.num(t.designs)}</div><span class="delta"><span class="num">${fmt.num(t.aiCalls)}</span>&nbsp;<span class="muted">عملية ذكاء اصطناعي إجمالاً</span></span></div>
    <div class="card kpi tint-gold hover"><div class="label"><span class="icon-chip"><i data-lucide="badge-dollar-sign"></i></span>الإيراد الشهري المتوقع</div>
      <div class="value num">$${fmt.num(t.mrr)}</div><span class="delta"><span class="num">${fmt.num(t.aiMonth)}</span>&nbsp;<span class="muted">طلب AI هذا الشهر</span></span></div>
  </div>

  <div class="grid g-2 section-gap">
    <div class="card dark"><div class="card-head"><div><h3 class="card-title">التسجيلات اليومية</h3><p class="card-sub">آخر 30 يوماً</p></div></div>
      <div class="chart-box sm"><canvas id="c-sign"></canvas></div></div>
    <div class="card dark"><div class="card-head"><div><h3 class="card-title">استخدام الذكاء الاصطناعي</h3><p class="card-sub">آخر 30 يوماً</p></div>
      ${legendHTML(KINDS.map(([, l], i) => ({ label: l, color: SERIES[i] })))}</div>
      <div class="chart-box sm"><canvas id="c-use"></canvas></div></div>
  </div>

  <div class="grid g-main section-gap">
    <div class="card">
      <div class="card-head"><h3 class="card-title"><i data-lucide="radio" style="width:18px"></i>آخر النشاطات</h3><a class="btn sm" href="#/clients">كل العملاء<i data-lucide="arrow-left"></i></a></div>
      <div class="list">${s.activity.map((a) => {
        const [icon, label] = ACTIVITY[a.action] || ['dot', a.action];
        const meta = a.meta ? JSON.parse(a.meta) : {};
        const upgrade = a.action === 'upgrade_request';
        return `<div class="list-item" style="cursor:pointer" data-client="${a.user_id}">
          <span class="icon-chip" style="width:34px;height:34px;border-radius:11px"><i data-lucide="${icon}"></i></span>
          <div class="grow"><b>${esc(a.name)}</b> <span class="muted small">· ${esc(a.business || '')}</span>
            <p>${label}${upgrade ? ` → <span class="badge gold">${esc(plans[meta.plan]?.label || meta.plan)}</span>` : ''}</p></div>
          <span class="muted small">${fmt.ago(a.created_at)}</span></div>`;
      }).join('') || '<p class="muted">لا يوجد نشاط بعد</p>'}</div>
    </div>
    <div class="grid" style="gap:18px;align-content:start">
      <div class="card">
        <div class="card-head"><h3 class="card-title"><i data-lucide="gem" style="width:18px"></i>توزيع الباقات</h3></div>
        ${Object.entries(plans).map(([k, p]) => {
          const c = s.plans.find((x) => x.plan === k)?.c || 0;
          return `<div style="margin-bottom:12px"><div class="row small"><span class="spacer">${p.label}</span><b class="num">${c}</b></div>
            <div style="height:8px;border-radius:99px;background:rgba(255,255,255,.08);margin-top:6px;overflow:hidden">
            <div style="height:100%;width:${(c / totalClients) * 100}%;background:var(--gold);border-radius:99px"></div></div></div>`;
        }).join('')}
      </div>
      <div class="card">
        <div class="card-head"><h3 class="card-title"><i data-lucide="briefcase" style="width:18px"></i>أكثر المجالات</h3></div>
        <div class="list">${s.industries.map((i) => `<div class="list-item"><div class="grow small">${esc(i.industry)}</div><b class="num">${i.c}</b></div>`).join('') || '<p class="muted small">لا توجد بيانات</p>'}</div>
      </div>
    </div>
  </div>`;

  view.addEventListener('click', (e) => {
    const id = e.target.closest('[data-client]')?.dataset.client;
    if (id) openClient(id);
  });

  const signMap = Object.fromEntries(s.signups.map((r) => [r.day, r.c]));
  const charts = [
    barChart($('#c-sign', view), labels, [{ label: 'تسجيلات', data: days.map((d) => signMap[d] || 0), color: SERIES[0] }], { yFormat: (v) => (Number.isInteger(v) ? v : '') }),
    barChart($('#c-use', view), labels, KINDS.map(([k, l], i) => ({
      label: l, color: SERIES[i], data: days.map((d) => s.usage.find((u) => u.day === d && u.kind === k)?.c || 0),
    })), { stacked: true, yFormat: (v) => (Number.isInteger(v) ? v : '') }),
  ];
  return () => charts.forEach((c) => c.destroy());
}
