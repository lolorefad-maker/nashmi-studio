import { $, esc, api, fmt, delta, state, toast, withBtn, LOCALE } from '../core.js';
import { lineChart, legendHTML, SERIES } from '../charts.js';

export const FORMATS = {
  post: { label: 'منشور انستغرام', w: 1080, h: 1080, hint: '1080×1080' },
  portrait: { label: 'منشور طولي', w: 1080, h: 1350, hint: '1080×1350' },
  story: { label: 'ستوري / ريلز', w: 1080, h: 1920, hint: '1080×1920' },
  poster: { label: 'بوستر A4', w: 1240, h: 1754, hint: 'طباعة' },
  banner: { label: 'إعلان فيسبوك', w: 1200, h: 628, hint: '1200×628' },
  cover: { label: 'غلاف / بانر', w: 1640, h: 624, hint: '1640×624' },
};

export const ACTIVITY = {
  register: ['user-plus', 'إنشاء الحساب'], login: ['log-in', 'تسجيل دخول'], design_save: ['save', 'حفظ تصميم'],
  analysis: ['sparkles', 'تحليل ذكي للنشاط'], metrics_update: ['database', 'تحديث بيانات الشهر'],
  brand_update: ['swatch-book', 'تحديث هوية العلامة'], password_change: ['key-round', 'تغيير كلمة المرور'],
  admin_update: ['shield-check', 'تعديل من الإدارة'], upgrade_request: ['circle-arrow-up', 'طلب تغيير الباقة'],
  team_join: ['user-check', 'انضم إلى الفريق'], team_invite: ['send', 'أرسل دعوة لعضو'], team_remove: ['user-minus', 'أزال عضواً'],
  team_leave: ['log-out', 'غادر الفريق'], brand_create: ['store', 'أنشأ علامة جديدة'], brand_delete: ['trash-2', 'حذف علامة'],
  data_import: ['file-up', 'استورد بيانات من ملف'], integration_connect: ['plug', 'ربط متجر إلكتروني'], integration_sync: ['refresh-cw', 'مزامنة بيانات المتجر'],
  post_schedule: ['calendar-plus', 'جدول منشوراً'], social_connect: ['share-2', 'ربط حسابات التواصل'], report_send: ['mail', 'أرسل التقرير الشهري'],
};

const greeting = () => (new Date().getHours() < 12 ? 'صباح الخير' : 'مساء الخير');

export function formatShape(key, max = 34) {
  const f = FORMATS[key];
  const s = max / Math.max(f.w, f.h);
  return `<div class="shape" style="width:${Math.round(f.w * s)}px;height:${Math.round(f.h * s)}px"></div>`;
}

export async function render(view) {
  const data = await api('/overview');
  const { kpis, metrics, counts, recentDesigns, latestReport, activity, upcoming } = data;
  const { user, business } = state.me;
  const first = (user.name || '').split(' ')[0];
  const cur = fmt.cur();

  view.innerHTML = `
  <div class="page-head">
    <div>
      <p class="muted small" style="margin:0">${new Date().toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      <h1>${greeting()}، ${esc(first)} 👋</h1>
      <p>هذه نظرة شاملة على أداء <b>${esc(business?.name || 'نشاطك')}</b> ${kpis ? `لشهر ${fmt.monthYear(kpis.period)}` : ''}</p>
    </div>
    <div class="row wrap">
      <a class="btn" href="#/analytics?ai=1"><i data-lucide="sparkles"></i>تحليل ذكي</a>
      <a class="btn gold" href="#/studio?new=1"><i data-lucide="plus"></i>تصميم جديد</a>
    </div>
  </div>

  <div class="grid kpis">
    <div class="card kpi tint-blue hover">
      <div class="label"><span class="icon-chip"><i data-lucide="wallet"></i></span>الإيرادات الشهرية</div>
      <div class="value num">${fmt.money(kpis?.revenue)}<small>${cur}</small></div>
      ${delta(kpis?.revGrowth)}
    </div>
    <div class="card kpi tint-gold hover">
      <div class="label"><span class="icon-chip"><i data-lucide="piggy-bank"></i></span>صافي الربح</div>
      <div class="value num">${fmt.money(kpis?.profit)}<small>${cur}</small></div>
      <span class="delta"><i data-lucide="percent"></i>هامش الربح <b class="num">${kpis?.margin ?? '—'}%</b></span>
    </div>
    <div class="card kpi tint-violet hover">
      <div class="label"><span class="icon-chip"><i data-lucide="users"></i></span>عملاء جدد</div>
      <div class="value num">${fmt.num(kpis?.newCustomers)}</div>
      ${delta(kpis?.customerGrowth)}
    </div>
    <div class="card kpi tint-green hover">
      <div class="row" style="justify-content:space-between;align-items:flex-start">
        <div>
          <div class="label"><span class="icon-chip"><i data-lucide="heart-pulse"></i></span>صحة النشاط</div>
          <p class="small muted" style="margin:14px 0 0;max-width:150px">مؤشر يجمع الربحية والنمو وكفاءة التسويق</p>
        </div>
        <div class="ring" style="--p:${kpis?.healthScore ?? 0}"><div class="num">${kpis?.healthScore ?? '—'}</div></div>
      </div>
    </div>
  </div>

  ${kpis ? '' : `
  <div class="card section-gap row wrap" style="gap:16px">
    <span class="icon-chip"><i data-lucide="database"></i></span>
    <div class="spacer"><b>ابدأ بإضافة أرقام نشاطك</b><p class="muted small" style="margin:2px 0 0">أدخل الإيرادات والمصاريف والطلبات لكل شهر لتحصل على تحليل كامل وتوصيات ذكية.</p></div>
    <button class="btn" id="sample"><i data-lucide="wand-sparkles"></i>جرّب ببيانات تجريبية</button>
    <a class="btn primary" href="#/analytics?add=1"><i data-lucide="plus"></i>إضافة بيانات</a>
  </div>`}

  <div class="grid g-main section-gap">
    <div class="card dark">
      <div class="card-head">
        <div><h3 class="card-title">الإيرادات مقابل المصاريف</h3><p class="card-sub">آخر ${metrics.length || 12} شهر · ${cur}</p></div>
        ${legendHTML([{ label: 'الإيرادات' }, { label: 'المصاريف' }])}
      </div>
      <div class="chart-box">${metrics.length ? '<canvas id="c-rev"></canvas>' : '<div class="empty"><p>لا توجد بيانات بعد</p></div>'}</div>
    </div>

    <div class="card tint-gold" style="display:flex;flex-direction:column">
      <div class="card-head">
        <h3 class="card-title"><i data-lucide="sparkles" style="width:18px;color:var(--gold)"></i>رؤى الذكاء الاصطناعي</h3>
        ${latestReport ? `<span class="badge">${fmt.ago(latestReport.created_at)}</span>` : ''}
      </div>
      ${latestReport ? `
        <p style="margin:0 0 14px;line-height:1.85;color:var(--ink)">${esc(latestReport.summary)}</p>
        <div class="list">${(latestReport.recommendations || []).slice(0, 3).map((r) => `
          <div class="list-item"><span class="icon-chip" style="width:30px;height:30px;border-radius:10px"><i data-lucide="lightbulb"></i></span>
          <div class="grow"><b>${esc(r.title)}</b><p>${esc(r.impact || '')}</p></div></div>`).join('')}</div>
        <a class="btn sm" style="margin-top:auto;align-self:flex-start" href="#/analytics"><i data-lucide="arrow-left"></i>التقرير الكامل</a>
      ` : `
        <p class="muted" style="margin:0 0 18px">احصل على تحليل كامل لنشاطك: نقاط القوة والضعف، فرص النمو، وخطة تسويق لمدة 30 يوماً.</p>
        <a class="btn gold" style="margin-top:auto;align-self:flex-start" href="#/analytics?ai=1"><i data-lucide="sparkles"></i>حلّل نشاطي الآن</a>`}
    </div>
  </div>

  <div class="grid g-main section-gap">
    <div class="card">
      <div class="card-head">
        <div><h3 class="card-title">أحدث التصاميم</h3><p class="card-sub">${counts.designs} تصميم · ${counts.designsThisMonth} هذا الشهر</p></div>
        <a class="btn sm" href="#/designs">عرض الكل<i data-lucide="arrow-left"></i></a>
      </div>
      ${recentDesigns.length ? `<div class="grid design-grid" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px">
        ${recentDesigns.map((d) => `<a class="card design-tile hover" href="#/studio?id=${d.id}" style="padding:8px">
          <div class="thumb">${d.thumbnail ? `<img src="${d.thumbnail}" alt="" loading="lazy">` : ''}</div>
          <div class="meta"><b>${esc(d.title)}</b></div></a>`).join('')}</div>`
        : `<div class="empty"><span class="icon-chip"><i data-lucide="image-plus"></i></span><h3>لا توجد تصاميم بعد</h3>
           <p class="small">اكتب فكرتك وسيصمم لك الذكاء الاصطناعي إعلاناً جاهزاً للنشر</p>
           <a class="btn gold" href="#/studio?new=1"><i data-lucide="sparkles"></i>أول تصميم</a></div>`}
    </div>

    <div class="grid" style="gap:18px;align-content:start">
      <div class="card">
        <div class="card-head"><h3 class="card-title">إنشاء سريع</h3></div>
        <div class="grid quick-create">
          ${Object.entries(FORMATS).map(([k, f]) => `<a class="qc" href="#/studio?new=1&format=${k}">${formatShape(k)}<b>${f.label}</b><span class="num">${f.hint}</span></a>`).join('')}
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h3 class="card-title"><i data-lucide="calendar-days" style="width:17px"></i>منشورات قادمة</h3>
          <a class="btn sm" href="#/calendar">التقويم<i data-lucide="arrow-left"></i></a></div>
        <div class="list">${upcoming.map((p) => `<a class="list-item" href="#/calendar">
          <div style="width:40px;height:40px;border-radius:10px;overflow:hidden;background:rgba(0,0,0,.3);flex:none">${p.thumbnail ? `<img src="${p.thumbnail}" alt="" style="width:100%;height:100%;object-fit:cover">` : ''}</div>
          <div class="grow"><b class="small" style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.caption || 'منشور بدون نص')}</b>
            <p>${new Date(p.scheduled_at).toLocaleString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</p></div>
          ${p.status === 'due' ? '<span class="badge warn">جاهز للنشر</span>' : ''}</a>`).join('')
          || '<p class="muted small" style="margin:0">لا توجد منشورات مجدولة — <a href="#/calendar?new=1" style="color:var(--gold)">جدول أول منشور</a></p>'}</div>
      </div>
      <div class="card">
        <div class="card-head"><h3 class="card-title">آخر النشاطات</h3></div>
        <div class="list">${activity.slice(0, 5).map((a) => {
          const [icon, label] = ACTIVITY[a.action] || ['dot', a.action];
          return `<div class="list-item"><i data-lucide="${icon}" style="width:16px;color:var(--ink-3)"></i><div class="grow small">${label}${a.name ? ` <span class="muted">· ${esc(a.name)}</span>` : ''}</div><span class="muted small">${fmt.ago(a.created_at)}</span></div>`;
        }).join('') || '<p class="muted small">لا يوجد نشاط بعد</p>'}</div>
      </div>
    </div>
  </div>`;

  $('#sample', view)?.addEventListener('click', (e) => withBtn(e.currentTarget, async () => {
    await api('/metrics/sample', { method: 'POST' });
    toast('تمت إضافة بيانات تجريبية لـ 12 شهراً');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }));

  const charts = [];
  if (metrics.length) {
    charts.push(lineChart($('#c-rev', view), metrics.map((m) => fmt.month(m.period)), [
      { label: 'الإيرادات', data: metrics.map((m) => m.revenue), color: SERIES[0] },
      { label: 'المصاريف', data: metrics.map((m) => m.expenses), color: SERIES[1] },
    ], { tooltipFormat: (v) => `${fmt.num(v)} ${cur}` }));
  }
  return () => charts.forEach((c) => c.destroy());
}
