import { $, esc, api, fmt, toast, modal, confirmDialog, withBtn, formData, icons, isEn } from '../core.js';
import { lineChart, barChart, legendHTML, SERIES } from '../charts.js';
import { setCredits } from '../app.js';
import { sourcesModal } from '../sources.js';

const FIELDS = [
  ['revenue', 'الإيرادات', 'wallet'], ['expenses', 'المصاريف', 'receipt'], ['orders', 'عدد الطلبات / المبيعات', 'shopping-bag'],
  ['new_customers', 'عملاء جدد', 'user-plus'], ['marketing_spend', 'الإنفاق الإعلاني', 'megaphone'],
  ['followers', 'عدد المتابعين', 'heart'], ['engagement_rate', 'معدل التفاعل %', 'activity'], ['website_visits', 'زيارات الموقع / الصفحة', 'mouse-pointer-click'],
];

const PRIORITY = { 'عالية': 'bad', 'متوسطة': 'warn', 'منخفضة': 'good' };

function reportHTML(r) {
  const swot = [
    ['strengths', 'نقاط القوة', 'shield-check', 'tint-green'], ['weaknesses', 'نقاط الضعف', 'triangle-alert', 'tint-rose'],
    ['opportunities', 'الفرص', 'rocket', 'tint-blue'], ['threats', 'التهديدات', 'cloud-lightning', 'tint-violet'],
  ];
  return `
    <div class="card tint-gold">
      <div class="card-head"><h3 class="card-title"><i data-lucide="sparkles" style="width:18px;color:var(--gold)"></i>الملخص التنفيذي</h3>
        <span class="badge">${fmt.date(r.created_at)}</span></div>
      <p class="report-summary" style="margin:0">${esc(r.summary)}</p>
    </div>
    <div class="grid g-4 section-gap swot">
      ${swot.map(([k, t, ic, tint]) => `<div class="card ${tint}"><h4><i data-lucide="${ic}" style="width:17px"></i>${t}</h4>
        <ul>${(r[k] || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`).join('')}
    </div>
    <div class="grid g-main section-gap">
      <div class="card">
        <div class="card-head"><h3 class="card-title"><i data-lucide="target" style="width:18px"></i>التوصيات حسب الأولوية</h3></div>
        <div class="grid" style="gap:10px">${(r.recommendations || []).map((x, i) => `
          <div class="rec"><div class="n num">${i + 1}</div><div class="spacer">
            <div class="row wrap" style="gap:8px;margin-bottom:4px"><h5 style="margin:0">${esc(x.title)}</h5>
              ${x.priority ? `<span class="badge ${PRIORITY[x.priority] || ''}">أولوية ${esc(x.priority)}</span>` : ''}</div>
            <p>${esc(x.detail)}</p>${x.impact ? `<p class="small" style="margin-top:6px;color:var(--gold)"><i data-lucide="trending-up" style="width:13px;vertical-align:-2px"></i> ${esc(x.impact)}</p>` : ''}
          </div></div>`).join('')}</div>
      </div>
      <div class="card">
        <div class="card-head"><h3 class="card-title"><i data-lucide="lightbulb" style="width:18px"></i>أفكار محتوى جاهزة للتصميم</h3></div>
        <div class="list">${(r.content_ideas || []).map((idea) => `
          <div class="list-item"><div class="grow small">${esc(idea)}</div>
            <a class="btn sm" href="#/studio?new=1&prompt=${encodeURIComponent(idea)}"><i data-lucide="palette"></i>صمّم</a></div>`).join('')}</div>
      </div>
    </div>
    <div class="card section-gap plan">
      <div class="card-head"><h3 class="card-title"><i data-lucide="calendar-range" style="width:18px"></i>خطة الـ 30 يوماً</h3></div>
      <div class="grid g-4">${(r.plan30 || []).map((w) => `<div class="card" style="background:rgba(255,255,255,.05);box-shadow:none">
        <div class="wk">${esc(w.week)}</div><h5>${esc(w.focus)}</h5><ul>${(w.actions || []).map((a) => `<li>${esc(a)}</li>`).join('')}</ul></div>`).join('')}</div>
    </div>`;
}

function nextPeriod(metrics) {
  const now = new Date();
  const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  if (!metrics.some((m) => m.period === current)) return current;
  const [y, m] = metrics.at(-1).period.split('-').map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthModal(existing, metrics, onSaved) {
  const v = existing || {};
  modal({
    title: existing ? `تعديل بيانات ${fmt.monthYear(existing.period)}` : 'إضافة بيانات شهر',
    sub: 'كلما كانت الأرقام أدق، كان التحليل أقوى',
    wide: true,
    body: `<form class="form-grid" id="mform">
      <label class="field full"><span>الشهر</span><input class="input" type="month" name="period" required value="${v.period || nextPeriod(metrics)}" ${existing ? 'readonly' : ''}></label>
      ${FIELDS.map(([k, label]) => `<label class="field"><span>${label}</span>
        <input class="input num" type="number" min="0" step="${k === 'engagement_rate' ? '0.01' : 'any'}" name="${k}" value="${v[k] ?? ''}" placeholder="0" style="text-align:right"></label>`).join('')}
    </form>`,
    actions: [
      { label: 'حفظ', kind: 'primary', onClick: async (el) => {
        const d = formData($('#mform', el));
        if (!d.period) { toast('اختر الشهر', 'err'); return false; }
        try { await api(`/metrics/${d.period}`, { method: 'PUT', body: d }); } catch (e) { toast(e.message, 'err'); return false; }
        toast('تم حفظ البيانات');
        onSaved();
      } },
      { label: 'إلغاء' },
    ],
  });
}

export async function render(view, { params }) {
  const { metrics, kpis } = await api('/metrics');
  const report = await api('/reports/latest');
  const cur = fmt.cur();
  const reload = () => window.dispatchEvent(new HashChangeEvent('hashchange'));

  view.innerHTML = `
  <div class="page-head">
    <div><h1>تحليلات النشاط</h1><p>${kpis ? `آخر تحديث: ${fmt.monthYear(kpis.period)} · ${metrics.length} شهر من البيانات` : 'أضف أرقامك الشهرية لتبدأ'}</p></div>
    <div class="row wrap">
      <button class="btn" id="sources"><i data-lucide="database-zap"></i>مصادر البيانات</button>
      <button class="btn" id="add"><i data-lucide="plus"></i>إضافة شهر</button>
      ${metrics.length ? '<a class="btn" href="/api/metrics/export" download><i data-lucide="file-spreadsheet"></i>تصدير Excel</a><a class="btn" href="/report" target="_blank"><i data-lucide="file-text"></i>تقرير PDF</a>' : ''}
      <button class="btn gold" id="analyze" ${metrics.length ? '' : 'disabled'}><i data-lucide="sparkles"></i>${report ? 'تحديث التحليل الذكي' : 'تحليل ذكي'} <span class="badge" style="background:rgba(0,0,0,.15);border:0">3 نقاط</span></button>
    </div>
  </div>

  ${!metrics.length ? `
  <div class="card empty">
    <span class="icon-chip"><i data-lucide="chart-no-axes-combined"></i></span>
    <h3>لا توجد بيانات بعد</h3>
    <p class="small">أدخل أرقام كل شهر (الإيرادات، المصاريف، الطلبات...) أو جرّب المنصة ببيانات تجريبية.</p>
    <div class="row" style="justify-content:center;margin-top:14px">
      <button class="btn" id="sample"><i data-lucide="wand-sparkles"></i>بيانات تجريبية</button>
      <button class="btn" id="sources2"><i data-lucide="file-up"></i>استيراد Excel / ربط متجر</button>
      <button class="btn primary" id="add2"><i data-lucide="plus"></i>إضافة أول شهر</button>
    </div>
  </div>` : `
  <div class="grid mini-kpis">
    ${[
      ['receipt', 'متوسط قيمة الطلب', `${fmt.num(kpis.aov, 2)} ${cur}`, 'الإيراد ÷ عدد الطلبات'],
      ['user-plus', 'تكلفة اكتساب العميل', kpis.cac == null ? '—' : `${fmt.num(kpis.cac, 2)} ${cur}`, 'الإعلانات ÷ العملاء الجدد'],
      ['megaphone', 'العائد على الإعلانات', kpis.roas == null ? '—' : `${kpis.roas}x`, 'ROAS — المستهدف 4x أو أكثر'],
      ['mouse-pointer-click', 'معدل التحويل', kpis.conversion == null ? '—' : `${kpis.conversion}%`, 'الطلبات ÷ الزيارات'],
      ['shopping-bag', 'الطلبات هذا الشهر', fmt.num(kpis.orders), kpis.aov ? `بمتوسط ${fmt.num(kpis.aov, 2)} ${cur}` : ''],
      ['heart', 'المتابعون', fmt.num(kpis.followers), kpis.followerGrowth != null ? `${fmt.pct(kpis.followerGrowth)} هذا الشهر` : ''],
      ['activity', 'معدل التفاعل', `${kpis.engagement}%`, 'المعدل الجيد 3% فأكثر'],
      ['landmark', 'إيرادات 12 شهر', `${fmt.compact(kpis.totalRevenue12)} ${cur}`, `ربح ${fmt.compact(kpis.totalProfit12)} ${cur}`],
    ].map(([ic, label, value, hint]) => `<div class="card mini"><div class="label"><i data-lucide="${ic}"></i>${label}</div>
      <div class="value num">${value}</div><div class="hint">${hint || '&nbsp;'}</div></div>`).join('')}
  </div>

  <div class="grid g-2 section-gap">
    <div class="card dark"><div class="card-head"><div><h3 class="card-title">الإيرادات مقابل المصاريف</h3><p class="card-sub">${cur}</p></div>
      ${legendHTML([{ label: 'الإيرادات' }, { label: 'المصاريف' }])}</div><div class="chart-box"><canvas id="c1"></canvas></div></div>
    <div class="card dark"><div class="card-head"><div><h3 class="card-title">صافي الربح الشهري</h3><p class="card-sub">${cur}</p></div></div>
      <div class="chart-box"><canvas id="c2"></canvas></div></div>
    <div class="card dark"><div class="card-head"><div><h3 class="card-title">نمو المتابعين</h3><p class="card-sub">إجمالي المتابعين نهاية كل شهر</p></div></div>
      <div class="chart-box sm"><canvas id="c3"></canvas></div></div>
    <div class="card dark"><div class="card-head"><div><h3 class="card-title">الطلبات والعملاء الجدد</h3><p class="card-sub">عدد شهري</p></div>
      ${legendHTML([{ label: 'الطلبات', color: SERIES[0] }, { label: 'عملاء جدد', color: SERIES[2] }])}</div>
      <div class="chart-box sm"><canvas id="c4"></canvas></div></div>
  </div>`}

  <div id="report" class="section-gap">${report ? reportHTML(report) : metrics.length ? `
    <div class="card empty tint-gold"><span class="icon-chip"><i data-lucide="sparkles"></i></span><h3>جاهز للتحليل الذكي</h3>
      <p class="small">سيقوم الذكاء الاصطناعي بتحليل أرقامك وإعداد تقرير SWOT وتوصيات وخطة تسويق لمدة 30 يوماً.</p></div>` : ''}</div>

  ${metrics.length ? `
  <div class="card section-gap">
    <div class="card-head"><h3 class="card-title"><i data-lucide="table-2" style="width:18px"></i>السجل الشهري</h3></div>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>الشهر</th>${FIELDS.map(([, l]) => `<th>${l}</th>`).join('')}<th>صافي الربح</th><th></th></tr></thead>
      <tbody>${[...metrics].reverse().map((m) => `<tr>
        <td><b>${fmt.monthYear(m.period)}</b>${m.source && m.source !== 'manual' ? ` <span class="badge" title="المصدر">${{ import: 'Excel', woocommerce: 'WooCommerce', shopify: 'Shopify' }[m.source] || m.source}</span>` : ''}</td>${FIELDS.map(([k]) => `<td class="num">${fmt.num(m[k], 2)}</td>`).join('')}
        <td class="num" style="color:${m.revenue - m.expenses >= 0 ? 'var(--good-ink)' : 'var(--critical-ink)'}">${fmt.num(m.revenue - m.expenses)}</td>
        <td><div class="row" style="gap:4px"><button class="btn sm icon ghost" data-edit="${m.period}" aria-label="تعديل"><i data-lucide="pencil"></i></button>
          <button class="btn sm icon ghost danger" data-del="${m.period}" aria-label="حذف"><i data-lucide="trash-2"></i></button></div></td></tr>`).join('')}</tbody>
    </table></div>
  </div>` : ''}`;

  const openAdd = () => monthModal(null, metrics, reload);
  $('#add', view).onclick = openAdd;
  $('#sources', view).onclick = () => sourcesModal(reload);
  $('#sources2', view)?.addEventListener('click', () => sourcesModal(reload));
  $('#add2', view)?.addEventListener('click', openAdd);
  $('#sample', view)?.addEventListener('click', (e) => withBtn(e.currentTarget, async () => {
    await api('/metrics/sample', { method: 'POST' });
    toast('تمت إضافة بيانات تجريبية');
    reload();
  }));
  view.addEventListener('click', async (e) => {
    const edit = e.target.closest('[data-edit]')?.dataset.edit;
    const del = e.target.closest('[data-del]')?.dataset.del;
    if (edit) monthModal(metrics.find((m) => m.period === edit), metrics, reload);
    if (del && await confirmDialog('حذف بيانات الشهر', `سيتم حذف بيانات ${fmt.monthYear(del)} نهائياً.`, 'حذف')) {
      await api(`/metrics/${del}`, { method: 'DELETE' });
      toast('تم الحذف');
      reload();
    }
  });

  const analyzeBtn = $('#analyze', view);
  analyzeBtn.onclick = () => withBtn(analyzeBtn, async () => {
    $('#report', view).innerHTML = `<div class="card"><div class="row"><span class="icon-chip"><i data-lucide="sparkles"></i></span>
      <div class="spacer"><b>جاري تحليل نشاطك...</b><p class="muted small" style="margin:2px 0 0">نراجع الأرقام ونجهز التوصيات وخطة الـ 30 يوماً</p></div></div>
      <div class="skeleton" style="height:14px;margin-top:18px;width:90%"></div><div class="skeleton" style="height:14px;margin-top:10px;width:70%"></div>
      <div class="skeleton" style="height:14px;margin-top:10px;width:80%"></div></div>`;
    icons();
    $('#report', view).scrollIntoView({ behavior: 'smooth', block: 'start' });
    try {
      const res = await api('/ai/analyze', { method: 'POST', body: { lang: isEn ? 'en' : 'ar' } });
      setCredits(res.credits);
      $('#report', view).innerHTML = reportHTML({ ...res.data, created_at: new Date().toISOString().replace('T', ' ').slice(0, 19) });
      icons();
      toast(res.source === 'demo' ? 'تم التحليل (وضع تجريبي)' : 'تم إنشاء التحليل الذكي');
    } catch (err) {
      $('#report', view).innerHTML = report ? reportHTML(report) : '';
      icons();
      throw err;
    }
  });

  if (params.add) openAdd();
  if (params.ai && metrics.length) {
    setTimeout(() => {
      $('#report', view).scrollIntoView({ behavior: 'smooth', block: 'start' });
      analyzeBtn.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.08)' }, { transform: 'scale(1)' }], { duration: 700, iterations: 2 });
    }, 300);
  }

  const charts = [];
  if (metrics.length) {
    const labels = metrics.map((m) => fmt.month(m.period));
    const money = (v) => `${fmt.num(v)} ${cur}`;
    charts.push(
      lineChart($('#c1', view), labels, [
        { label: 'الإيرادات', data: metrics.map((m) => m.revenue) },
        { label: 'المصاريف', data: metrics.map((m) => m.expenses) },
      ], { tooltipFormat: money }),
      barChart($('#c2', view), labels, [{ label: 'صافي الربح', data: metrics.map((m) => m.revenue - m.expenses), color: SERIES[2] }], { tooltipFormat: money }),
      lineChart($('#c3', view), labels, [{ label: 'المتابعون', data: metrics.map((m) => m.followers), color: SERIES[5] }]),
      barChart($('#c4', view), labels, [
        { label: 'الطلبات', data: metrics.map((m) => m.orders), color: SERIES[0] },
        { label: 'عملاء جدد', data: metrics.map((m) => m.new_customers), color: SERIES[2] },
      ]),
    );
  }
  return () => charts.forEach((c) => c.destroy());
}
