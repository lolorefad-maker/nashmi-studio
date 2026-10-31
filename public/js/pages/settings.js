import { $, $$, esc, api, state, toast, withBtn, formData, applyWallpaper, getWallpaper, WALLPAPERS } from '../core.js';

const FEATURES = {
  free: ['30 نقطة شهرياً', '4 صور بالذكاء الاصطناعي شهرياً', 'علامة واحدة · عضو واحد', 'تصاميم بكل المقاسات', 'تحليلات أساسية'],
  pro: ['300 نقطة شهرياً', '3 علامات · 3 أعضاء لكل علامة', 'تحليل ذكي كامل + خطة 30 يوم', 'كاتب المحتوى', 'تصدير Excel'],
  business: ['1500 نقطة شهرياً', '15 علامة · 10 أعضاء لكل علامة', 'كل مزايا الاحترافي', 'أولوية في الدعم', 'مناسب للوكالات'],
};

export async function render(view) {
  const { user, plans, ai } = state.me;
  const admin = user.role === 'admin';
  const current = getWallpaper();

  view.innerHTML = `
  <div class="page-head"><div><h1>الإعدادات</h1><p>${esc(user.email)}</p></div></div>

  ${admin ? `
  <div class="card ${ai.connected ? 'tint-green' : 'tint-gold'}">
    <div class="row wrap" style="gap:14px"><span class="icon-chip"><i data-lucide="cpu"></i></span>
      <div class="spacer"><b>نموذج الذكاء الاصطناعي: ${ai.connected ? `متصل (${esc(ai.model)})` : 'وضع تجريبي'}</b>
        <p class="muted small" style="margin:2px 0 0">${ai.connected ? 'كل التصاميم والتحليلات تُولَّد من النموذج.' : 'أضف AI_BASE_URL في ملف ‎.env‎ ثم أعد تشغيل الخادم لربط النموذج.'}</p></div></div>
  </div>` : `
  <div class="card">
    <div class="card-head"><div><h3 class="card-title"><i data-lucide="gem" style="width:18px"></i>الباقة والنقاط</h3>
      <p class="card-sub">لديك <b class="num">${user.credits}</b> نقطة · تصميم = 1 · نص = 1 · صورة = 2 · تحليل = 3</p></div></div>
    <div class="grid g-3">${Object.entries(plans).map(([k, p]) => `
      <div class="card ${k === user.plan ? 'tint-gold' : ''}" style="box-shadow:none">
        <div class="row"><b class="spacer" style="font-size:17px">${p.label}</b>${k === user.plan ? '<span class="badge gold">باقتك</span>' : ''}</div>
        <div style="font-size:30px;font-weight:700;margin:8px 0"><span class="num">$${p.price}</span><small class="muted" style="font-size:13px"> / شهرياً</small></div>
        <ul style="padding-inline-start:18px;margin:0 0 14px;color:var(--ink-2);font-size:13.5px;line-height:1.9">${FEATURES[k].map((x) => `<li>${x}</li>`).join('')}</ul>
        ${k === user.plan ? '' : `<button class="btn sm" data-upgrade="${k}" style="width:100%">طلب ${p.price > (plans[user.plan]?.price || 0) ? 'الترقية' : 'التغيير'}</button>`}
      </div>`).join('')}</div>
  </div>`}

  ${admin ? '' : '<div class="card section-gap" id="report-card"><div class="skeleton" style="height:120px"></div></div>'}

  <div class="grid g-2 section-gap">
    <div class="card">
      <div class="card-head"><h3 class="card-title"><i data-lucide="key-round" style="width:18px"></i>تغيير كلمة المرور</h3></div>
      <form id="pw" class="grid" style="gap:12px" onsubmit="return false">
        <label class="field"><span>كلمة المرور الحالية</span><input class="input" type="password" name="current" autocomplete="current-password" required></label>
        <label class="field"><span>كلمة المرور الجديدة (8 أحرف على الأقل)</span><input class="input" type="password" name="next" autocomplete="new-password" minlength="8" required></label>
        <button class="btn primary" id="pw-btn" style="justify-self:start">تحديث كلمة المرور</button>
      </form>
    </div>
    <div class="card">
      <div class="card-head"><h3 class="card-title"><i data-lucide="image" style="width:18px"></i>خلفية لوحة التحكم</h3></div>
      <div class="wp-options">${Object.entries(WALLPAPERS).map(([k, w]) =>
        `<div class="wp-option ${k === current ? 'active' : ''}" data-wp="${k}" style="background:${w.thumb} center/cover" title="${w.label}"><span>${w.label}</span></div>`).join('')}</div>
    </div>
  </div>`;

  view.addEventListener('click', async (e) => {
    const wp = e.target.closest('[data-wp]')?.dataset.wp;
    if (wp) {
      applyWallpaper(wp);
      $$('[data-wp]', view).forEach((o) => o.classList.toggle('active', o.dataset.wp === wp));
    }
    const up = e.target.closest('[data-upgrade]');
    if (up) withBtn(up, async () => {
      await api('/upgrade-request', { method: 'POST', body: { plan: up.dataset.upgrade } });
      toast('تم إرسال طلبك للإدارة وسيتم التواصل معك قريباً');
      up.disabled = true;
      up.textContent = 'تم إرسال الطلب';
    });
  });

  if (!admin) reportSettings($('#report-card', view));

  $('#pw-btn', view).onclick = (e) => withBtn(e.currentTarget, async () => {
    const form = $('#pw', view);
    if (!form.reportValidity()) return;
    await api('/auth/password', { method: 'POST', body: formData(form) });
    form.reset();
    toast('تم تحديث كلمة المرور');
  });
}

// Monthly report delivery: email + WhatsApp on the 1st of each month.
async function reportSettings(card) {
  const r = await api('/report/settings');
  const data = await api('/report/data');
  card.innerHTML = `
    <div class="card-head"><div><h3 class="card-title"><i data-lucide="file-text" style="width:18px"></i>التقرير الشهري</h3>
      <p class="card-sub">تقرير PDF بأرقام الشهر والتوصيات، يُرسل تلقائياً أول كل شهر${r.last ? ` · آخر إرسال: ${r.last}` : ''}</p></div>
      <a class="btn sm" href="/report" target="_blank"><i data-lucide="eye"></i>عرض التقرير</a></div>
    <form id="rep" class="form-grid" onsubmit="return false">
      <label class="field full row" style="flex-direction:row;cursor:pointer"><input type="checkbox" name="enabled" ${r.enabled ? 'checked' : ''}> إرسال التقرير تلقائياً كل شهر</label>
      <label class="field"><span>البريد الإلكتروني ${r.mail ? '' : '<span class="badge warn">البريد غير مُعدّ على الخادم</span>'}</span>
        <input class="input" name="email" type="email" dir="ltr" placeholder="${esc(r.ownerEmail)}" value="${esc(r.email)}"></label>
      <label class="field"><span>رقم واتساب ${r.wa ? '' : '<span class="badge warn">واتساب غير مُعدّ على الخادم</span>'}</span>
        <input class="input" name="whatsapp" dir="ltr" placeholder="+9627XXXXXXXX" value="${esc(r.whatsapp)}"></label>
    </form>
    <div class="row wrap" style="margin-top:14px">
      <button class="btn primary sm" id="rep-save"><i data-lucide="save"></i>حفظ</button>
      <button class="btn sm" id="rep-send"><i data-lucide="send"></i>أرسل الآن</button>
      <a class="btn sm" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(data.summary)}"><i data-lucide="message-circle"></i>مشاركة الملخص عبر واتساب</a>
    </div>`;
  window.lucide?.createIcons();
  $('#rep-save', card).onclick = (e) => withBtn(e.currentTarget, async () => {
    const form = $('#rep', card);
    const d = formData(form);
    await api('/business/report-settings', { method: 'PUT', body: { enabled: form.enabled.checked, email: d.email, whatsapp: d.whatsapp } });
    toast('تم حفظ إعدادات التقرير');
  });
  $('#rep-send', card).onclick = (e) => withBtn(e.currentTarget, async () => {
    const res = await api('/report/send', { method: 'POST', body: {} });
    toast(`تم الإرسال عبر: ${res.sent.map((x) => (x === 'email' ? 'البريد' : 'واتساب')).join(' و ')}`);
  });
}
