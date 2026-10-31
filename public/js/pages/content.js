import { $, $$, esc, api, toast, withBtn, icons, isEn } from '../core.js';
import { setCredits } from '../app.js';

const PLATFORMS = [['Instagram', 'camera'], ['Facebook', 'thumbs-up'], ['TikTok', 'music-2'], ['X', 'at-sign'], ['LinkedIn', 'briefcase'], ['WhatsApp', 'message-circle']];
const TONES = ['ودودة', 'فاخرة', 'حماسية', 'رسمية', 'مرحة'];

const copyBtn = (text) => `<button class="btn sm" data-copy="${esc(text)}"><i data-lucide="copy"></i>نسخ</button>`;

export async function render(view) {
  let platform = 'Instagram';
  let tone = 'ودودة';
  let lang = isEn ? 'en' : 'ar';

  view.innerHTML = `
  <div class="page-head">
    <div><h1>كاتب المحتوى الإعلاني</h1><p>نصوص منشورات، هاشتاغات وإعلانات ممولة مكتوبة بأسلوب علامتك</p></div>
  </div>
  <div class="grid g-main" style="grid-template-columns:minmax(0,1fr) minmax(0,1.4fr)">
    <div class="card" style="align-self:start">
      <label class="field"><span>عن ماذا تريد أن تكتب؟</span>
        <textarea class="textarea" id="topic" rows="4" placeholder="مثال: إطلاق مشروب الصيف الجديد بنكهة المانجو والباشن فروت، متوفر من يوم الخميس"></textarea></label>
      <div class="st-section"><span class="st-label">المنصة</span>
        <div class="chips">${PLATFORMS.map(([p, ic]) => `<span class="chip ${p === platform ? 'active' : ''}" data-platform="${p}"><i data-lucide="${ic}"></i>${p}</span>`).join('')}</div></div>
      <div class="st-section"><span class="st-label">النبرة</span>
        <div class="chips">${TONES.map((t) => `<span class="chip ${t === tone ? 'active' : ''}" data-tone="${t}">${t}</span>`).join('')}</div></div>
      <div class="st-section"><span class="st-label">اللغة</span>
        <div class="chips"><span class="chip ${lang === 'ar' ? 'active' : ''}" data-lang="ar">العربية</span><span class="chip ${lang === 'en' ? 'active' : ''}" data-lang="en">English</span></div></div>
      <button class="btn gold" id="go" style="width:100%;margin-top:18px;height:46px"><i data-lucide="pen-line"></i>اكتب المحتوى <span class="badge" style="background:rgba(0,0,0,.15);border:0">1 نقطة</span></button>
    </div>
    <div id="out">
      <div class="card empty"><span class="icon-chip"><i data-lucide="message-square-quote"></i></span>
        <h3>ستظهر النتائج هنا</h3><p class="small">3 صيغ مختلفة للمنشور + هاشتاغات + نص إعلان ممول جاهز</p></div>
    </div>
  </div>`;

  view.addEventListener('click', (e) => {
    const c = e.target.closest('[data-platform],[data-tone],[data-lang],[data-copy]');
    if (!c) return;
    const ds = c.dataset;
    if (ds.copy != null) {
      navigator.clipboard.writeText(ds.copy).then(() => toast('تم النسخ'), () => toast('تعذّر النسخ', 'err'));
      return;
    }
    const key = ds.platform ? 'platform' : ds.tone ? 'tone' : 'lang';
    if (key === 'platform') platform = ds.platform;
    if (key === 'tone') tone = ds.tone;
    if (key === 'lang') lang = ds.lang;
    $$(`[data-${key}]`, view).forEach((x) => x.classList.toggle('active', x === c));
  });

  $('#go', view).onclick = (e) => {
    const topic = $('#topic', view).value.trim();
    if (!topic) { toast('اكتب موضوع المنشور', 'err'); return; }
    withBtn(e.currentTarget, async () => {
      const res = await api('/ai/copy', { method: 'POST', body: { topic, platform, tone, lang } });
      setCredits(res.credits);
      const { captions = [], hashtags = [], ad = {} } = res.data;
      const tags = hashtags.join(' ');
      $('#out', view).innerHTML = `
        <div class="grid" style="gap:14px">
          ${captions.map((c, i) => `<div class="card ${['tint-blue', 'tint-violet', 'tint-gold'][i % 3]}">
            <div class="card-head"><span class="badge">صيغة ${i + 1}</span>${copyBtn(`${c}\n\n${tags}`)}</div>
            <p style="margin:0;white-space:pre-wrap;line-height:1.9">${esc(c)}</p></div>`).join('')}
          <div class="card"><div class="card-head"><h3 class="card-title"><i data-lucide="hash" style="width:17px"></i>هاشتاغات</h3>${copyBtn(tags)}</div>
            <div class="chips">${hashtags.map((t) => `<span class="chip" data-copy="${esc(t)}">${esc(t)}</span>`).join('')}</div></div>
          <div class="card dark"><div class="card-head"><h3 class="card-title"><i data-lucide="megaphone" style="width:17px"></i>إعلان ممول</h3>
            ${copyBtn(`${ad.headline || ''}\n${ad.primary_text || ''}\n${ad.cta || ''}`)}</div>
            <p class="muted small" style="margin:0">العنوان</p><p style="margin:2px 0 12px;font-weight:600">${esc(ad.headline)}</p>
            <p class="muted small" style="margin:0">النص الأساسي</p><p style="margin:2px 0 12px">${esc(ad.primary_text)}</p>
            <p class="muted small" style="margin:0">زر الإجراء</p><span class="badge gold" style="margin-top:4px">${esc(ad.cta)}</span>
          </div>
          <a class="btn" href="#/studio?new=1&prompt=${encodeURIComponent(topic)}" style="justify-self:start"><i data-lucide="palette"></i>حوّل الفكرة إلى تصميم</a>
        </div>`;
      icons();
      if (res.source === 'demo') toast('تم إنشاء المحتوى (وضع تجريبي)');
    });
  };
}
