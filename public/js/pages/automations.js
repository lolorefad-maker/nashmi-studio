import { $, esc, api, fmt, toast, modal, confirmDialog, withBtn, icons } from '../core.js';
import { subnav, describeTrigger, stepDetail, STEP_INFO } from '../biz.js';

const IDEAS = [
  ['calendar-clock', 'تقرير أسبوعي ذكي', 'اعمل أتمتة تحلل أرقام نشاطي كل يوم أحد الساعة 9 الصبح وتبعتلي ملخص وتوصيات'],
  ['package-x', 'تنبيه نقص المخزون', 'كل يوم الصبح افحص نظام المخزون ونبهني بالمنتجات اللي كميتها قليلة'],
  ['user-plus', 'ترحيب بالعميل الجديد', 'لما ينضاف عميل جديد بنظام العملاء، اكتب رسالة ترحيب مخصصة ونبهني فيها'],
  ['wallet', 'متابعة الفواتير', 'كل يوم 1 بالشهر لخصلي المصاريف والفواتير غير المدفوعة'],
];

function runLog(result) {
  modal({
    title: result.status === 'ok' ? 'تم التشغيل بنجاح ✓' : 'توقف التشغيل', wide: true,
    body: `<ol class="steps" style="list-style:none;padding:0;display:grid;gap:8px">${result.log.map((l) => {
      const [ic, label] = STEP_INFO[l.type] || ['circle', l.type];
      return `<li class="card" style="box-shadow:none;padding:12px;background:rgba(255,255,255,.05)">
        <div class="row"><i data-lucide="${ic}" style="width:16px;color:var(--gold)"></i><b class="spacer">${l.step}. ${label}</b>
          <span class="badge ${l.ok ? 'good' : 'bad'}">${l.ok ? 'تم' : 'فشل'}</span></div>
        <p class="small" style="margin:8px 0 0;white-space:pre-wrap;color:var(--ink-2)" dir="auto">${esc(l.output || '')}</p></li>`;
    }).join('')}</ol>`,
  });
}

export async function render(view) {
  const list = await api('/biz/automations');
  const reload = () => window.dispatchEvent(new HashChangeEvent('hashchange'));

  view.innerHTML = `
  ${subnav('automations')}
  <div class="page-head" style="margin-top:0">
    <div><h1>الأتمتة</h1><p>مهام تشتغل لحالها: تقارير دورية، تنبيهات، متابعة عملاء، وإضافة بيانات — صمّمها بالكلام مع المساعد</p></div>
    <a class="btn gold" href="#/assistant?prompt=${encodeURIComponent('اعمل أتمتة ')}"><i data-lucide="sparkles"></i>اطلب أتمتة جديدة</a>
  </div>
  <div class="grid" style="gap:14px">${list.map((w) => `
    <div class="card" data-wf="${w.id}">
      <div class="row wrap" style="gap:12px">
        <span class="icon-chip"><i data-lucide="workflow"></i></span>
        <div class="spacer" style="min-width:200px"><b style="font-size:16px">${esc(w.name)}</b>
          <div class="muted small">${esc(w.description || '')}</div></div>
        ${w.last_status ? `<span class="badge ${w.last_status === 'ok' ? 'good' : 'bad'}">آخر تشغيل: ${w.last_status === 'ok' ? 'نجح' : 'فشل'}</span>` : ''}
        <label class="switch" title="تشغيل / إيقاف"><input type="checkbox" data-toggle="${w.id}" ${w.enabled ? 'checked' : ''}><span></span></label>
      </div>
      <div class="row wrap small" style="margin:14px 0 10px;gap:14px;color:var(--ink-2)">
        <span><i data-lucide="zap" style="width:14px;vertical-align:-2px;color:var(--gold)"></i> ${esc(describeTrigger(w.trigger))}</span>
        <span><i data-lucide="repeat" style="width:14px;vertical-align:-2px"></i> <span class="num">${w.runs}</span> تشغيل</span>
        ${w.last_run_at ? `<span><i data-lucide="history" style="width:14px;vertical-align:-2px"></i> ${fmt.ago(w.last_run_at)}</span>` : ''}
        ${w.enabled && w.next_run_at ? `<span><i data-lucide="clock" style="width:14px;vertical-align:-2px"></i> التالي: ${new Date(w.next_run_at).toLocaleString('ar-u-nu-latn', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span>` : ''}
      </div>
      <div class="chips" style="margin-bottom:14px">${w.steps.map((s, i) => {
        const [ic, label] = STEP_INFO[s.type] || ['circle', s.type];
        return `<span class="chip" style="cursor:default" title="${esc(stepDetail(s))}"><b class="num">${i + 1}</b><i data-lucide="${ic}"></i>${label}</span>`;
      }).join('')}</div>
      <div class="row wrap">
        <button class="btn sm primary" data-run="${w.id}"><i data-lucide="play"></i>تشغيل الآن</button>
        <button class="btn sm" data-runs="${w.id}"><i data-lucide="list"></i>السجل</button>
        <button class="btn sm ghost danger" data-delwf="${w.id}"><i data-lucide="trash-2"></i>حذف</button>
      </div>
    </div>`).join('')}</div>
  <div class="card section-gap">
    <div class="card-head"><h3 class="card-title"><i data-lucide="wand-sparkles" style="width:18px;color:var(--gold)"></i>${list.length ? 'أفكار أتمتة أخرى' : 'ابدأ بأول أتمتة'}</h3></div>
    <div class="grid g-2">${IDEAS.map(([ic, name, prompt]) => `<a class="qc" style="text-align:start;display:flex;gap:10px;align-items:center" href="#/assistant?prompt=${encodeURIComponent(prompt)}">
      <span class="icon-chip"><i data-lucide="${ic}"></i></span><div><b>${name}</b><span>${esc(prompt)}</span></div></a>`).join('')}</div>
  </div>`;
  icons();

  view.addEventListener('change', async (e) => {
    const id = e.target.dataset.toggle;
    if (!id) return;
    await api(`/biz/automations/${id}`, { method: 'PATCH', body: { enabled: e.target.checked } });
    toast(e.target.checked ? 'تم تشغيل الأتمتة' : 'تم إيقاف الأتمتة');
  });
  view.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-run],[data-runs],[data-delwf]');
    if (!t) return;
    const { run, runs, delwf } = t.dataset;
    if (run) withBtn(t, async () => { runLog(await api(`/biz/automations/${run}/run`, { method: 'POST', body: {} })); reload(); });
    if (runs) {
      const items = await api(`/biz/automations/${runs}/runs`);
      modal({
        title: 'سجل التشغيل', wide: true,
        body: items.length ? `<div class="list">${items.map((x) => `<div class="list-item"><span class="badge ${x.status === 'ok' ? 'good' : 'bad'}">${x.status === 'ok' ? 'نجح' : 'فشل'}</span>
          <div class="grow small">${x.log.map((l) => `${l.step}. ${(STEP_INFO[l.type] || [, l.type])[1]}${l.ok ? '' : ` — ${esc(l.output)}`}`).join(' · ')}</div>
          <span class="muted small">${fmt.ago(x.created_at)}</span></div>`).join('')}</div>` : '<p class="muted">لم تُشغّل بعد</p>',
      });
    }
    if (delwf && await confirmDialog('حذف الأتمتة', 'ستتوقف هذه الأتمتة نهائياً.', 'حذف')) {
      await api(`/biz/automations/${delwf}`, { method: 'DELETE' });
      reload();
    }
  });
}
