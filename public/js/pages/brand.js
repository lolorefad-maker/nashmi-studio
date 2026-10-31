import { $, esc, api, state, toast, withBtn, formData, fileToDataURL, icons, CURRENCIES, INDUSTRIES } from '../core.js';
import { refreshMe } from '../app.js';
import { POSTER_FONTS, loadFonts } from '../poster.js';

export async function render(view) {
  const { user, business: b = {} } = state.me;
  let logo = b.logo || null;
  let colors = [...(b.colors || ['#c9a46a', '#0f172a', '#ffffff'])];
  const opt = (list, value) => list.map((x) => `<option ${x === value ? 'selected' : ''}>${esc(x)}</option>`).join('');

  view.innerHTML = `
  <div class="page-head">
    <div><h1>هوية العلامة</h1><p>يستخدم الذكاء الاصطناعي هذه المعلومات في كل تصميم وتحليل ونص يكتبه لك</p></div>
    <button class="btn gold" id="save"><i data-lucide="save"></i>حفظ التغييرات</button>
  </div>
  <form id="f" class="grid g-main" onsubmit="return false">
    <div class="grid" style="gap:18px;align-content:start">
      <div class="card">
        <div class="card-head"><h3 class="card-title"><i data-lucide="store" style="width:18px"></i>معلومات النشاط</h3></div>
        <div class="form-grid">
          <label class="field"><span>اسم النشاط *</span><input class="input" name="name" required value="${esc(b.name)}"></label>
          <label class="field"><span>المجال</span><select class="select" name="industry"><option value="">اختر...</option>${opt(INDUSTRIES, b.industry)}</select></label>
          <label class="field"><span>الدولة</span><input class="input" name="country" value="${esc(b.country)}"></label>
          <label class="field"><span>المدينة</span><input class="input" name="city" value="${esc(b.city)}"></label>
          <label class="field"><span>انستغرام</span><input class="input" name="instagram" dir="ltr" placeholder="@yourbrand" value="${esc(b.instagram)}"></label>
          <label class="field"><span>الموقع الإلكتروني</span><input class="input" name="website" dir="ltr" placeholder="https://" value="${esc(b.website)}"></label>
          <label class="field full"><span>وصف النشاط</span><textarea class="textarea" name="description" rows="3" placeholder="ماذا تقدم؟ ما الذي يميزك؟">${esc(b.description)}</textarea></label>
          <label class="field"><span>الجمهور المستهدف</span><input class="input" name="audience" placeholder="مثال: عائلات، شباب 18-30" value="${esc(b.audience)}"></label>
          <label class="field"><span>نبرة العلامة</span><input class="input" name="tone" placeholder="مثال: فاخرة وهادئة" value="${esc(b.tone)}"></label>
          <label class="field"><span>العملة</span><select class="select" name="currency">${opt(CURRENCIES, b.currency || 'JOD')}</select></label>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h3 class="card-title"><i data-lucide="user-round" style="width:18px"></i>صاحب الحساب</h3></div>
        <div class="form-grid">
          <label class="field"><span>الاسم</span><input class="input" name="ownerName" value="${esc(user.name)}"></label>
          <label class="field"><span>الهاتف</span><input class="input" name="phone" dir="ltr" value="${esc(user.phone)}"></label>
        </div>
      </div>
    </div>

    <div class="grid" style="gap:18px;align-content:start">
      <div class="card tint-gold">
        <div class="card-head"><h3 class="card-title"><i data-lucide="badge-check" style="width:18px"></i>الشعار</h3></div>
        <div class="row" style="gap:16px">
          <div id="logo-box" style="width:96px;height:96px;border-radius:22px;background:rgba(0,0,0,.25);display:grid;place-items:center;overflow:hidden;border:1px solid var(--line)"></div>
          <div class="grid" style="gap:8px">
            <label class="btn sm"><i data-lucide="upload"></i>رفع الشعار<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" id="logo-in" hidden></label>
            <button class="btn sm ghost danger" type="button" id="logo-rm">إزالة</button>
            <span class="muted small">PNG شفاف · أقل من 1MB</span>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h3 class="card-title"><i data-lucide="palette" style="width:18px"></i>ألوان العلامة</h3></div>
        <p class="muted small" style="margin:-6px 0 12px">اللون 1: الأساسي · اللون 2: الخلفية · اللون 3: النص</p>
        <div class="row wrap" id="colors"></div>
      </div>
      <div class="card">
        <div class="card-head"><h3 class="card-title"><i data-lucide="type" style="width:18px"></i>خط العلامة</h3></div>
        <select class="select" name="font" id="font">${opt(POSTER_FONTS, b.font || 'Cairo')}</select>
        <p id="font-preview" style="font-size:30px;margin:16px 0 0;line-height:1.4">${esc(b.name || 'اسم علامتك')}</p>
      </div>
    </div>
  </form>`;

  const drawLogo = () => {
    $('#logo-box', view).innerHTML = logo ? `<img src="${logo}" alt="" style="width:100%;height:100%;object-fit:contain">` : '<i data-lucide="image" style="opacity:.5"></i>';
    icons();
  };
  const drawColors = () => {
    $('#colors', view).innerHTML = colors.map((c, i) => `<div style="text-align:center"><input type="color" value="${c}" data-ci="${i}"><div class="small muted num">${i + 1}</div></div>`).join('') +
      (colors.length < 5 ? '<button class="btn sm icon" type="button" id="add-color" aria-label="إضافة لون"><i data-lucide="plus"></i></button>' : '') +
      (colors.length > 3 ? '<button class="btn sm icon ghost" type="button" id="rm-color" aria-label="حذف لون"><i data-lucide="minus"></i></button>' : '');
    icons();
  };
  drawLogo();
  drawColors();

  const previewFont = async () => {
    const font = $('#font', view).value;
    await loadFonts([font]);
    $('#font-preview', view).style.fontFamily = `'${font}'`;
  };
  previewFont();
  $('#font', view).onchange = previewFont;

  $('#colors', view).addEventListener('input', (e) => { if (e.target.dataset.ci) colors[+e.target.dataset.ci] = e.target.value; });
  $('#colors', view).addEventListener('click', (e) => {
    if (e.target.closest('#add-color')) { colors.push('#888888'); drawColors(); }
    if (e.target.closest('#rm-color')) { colors.pop(); drawColors(); }
  });
  $('#logo-in', view).onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 1_000_000) return toast('حجم الشعار يجب أن يكون أقل من 1MB', 'err');
    logo = await fileToDataURL(file);
    drawLogo();
  };
  $('#logo-rm', view).onclick = () => { logo = null; drawLogo(); };

  $('#save', view).onclick = (e) => withBtn(e.currentTarget, async () => {
    const data = formData($('#f', view));
    if (!data.name?.trim()) throw new Error('اسم النشاط مطلوب');
    await api('/business', { method: 'PUT', body: { ...data, colors, logo, font: $('#font', view).value } });
    await refreshMe();
    toast('تم حفظ هوية العلامة');
  });
}
