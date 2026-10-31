import { $, $$, esc, api, state, toast, icons, withBtn, fileToDataURL, isEn, t } from '../core.js';
import { setCredits } from '../app.js';
import { FORMATS, formatShape } from './overview.js';
import { buildPoster, loadFabric, loadFonts, syncSpecFromCanvas, placeImage, POSTER_FONTS, LAYOUTS, STYLES } from '../poster.js';
import { TEMPLATES, TEMPLATE_INDUSTRIES } from '../templates.js';
import { postModal } from './calendar.js';
import { createEditor } from '../editor.js';

const PROPS = ['data', 'selectable', 'hasControls', 'lockMovementX', 'lockMovementY', 'lockScalingX', 'lockScalingY', 'lockRotation', 'editable', 'hoverCursor', 'direction'];
// Appended to AI image prompts; English descriptors give the image model the clearest signal.
const IMG_STYLE = { photo: ['صورة واقعية', 'photorealistic commercial photography'], '3d': ['ثلاثي الأبعاد', '3D render, soft clay style'], illustration: ['رسم توضيحي', 'flat vector illustration'], watercolor: ['ألوان مائية', 'watercolor painting'] };
const IMG_LIGHT = { natural: ['طبيعية', 'soft natural daylight'], golden: ['ساعة ذهبية', 'warm golden hour sunlight'], studio: ['استوديو', 'professional studio softbox lighting'], dramatic: ['درامية', 'dramatic low-key lighting with deep shadows'], neon: ['نيون', 'night neon lighting'], soft: ['ناعمة', 'soft diffused pastel lighting'] };
const IMG_ANGLE = { front: ['أمامية', 'eye-level front view'], top: ['من الأعلى', 'top-down flat lay'], close: ['قريبة', 'close-up macro shot'], wide: ['واسعة', 'wide shot with environment'] };
const IDEAS = ['خصم 30% لنهاية الأسبوع', 'إطلاق منتج جديد', 'تهنئة بمناسبة قريبة', 'نحن نوظّف', 'افتتاح فرع جديد'];

const mix = (a, b, t) => '#' + [0, 2, 4].map((i) => Math.round(parseInt(a.slice(1 + i, 3 + i), 16) * (1 - t) + parseInt(b.slice(1 + i, 3 + i), 16) * t)
  .toString(16).padStart(2, '0')).join('');

function brandPalette() {
  const [primary = '#c9a46a', bg = '#111827', text = '#ffffff'] = state.me.business?.colors || [];
  return { bg, bg2: mix(bg, primary, 0.28), primary, text, muted: mix(text, bg, 0.3) };
}

function starterSpec() {
  const b = state.me.business || {};
  return {
    title: 'تصميم جديد', layout: 'hero', decor: 'orbs', font: b.font || 'Cairo',
    headline: b.name || t('اسم نشاطك'), subheadline: (b.description || '').slice(0, 90) || t('اكتب فكرتك في لوحة الذكاء الاصطناعي واضغط توليد'),
    body: '', cta: t('تواصل معنا'), badge: '', footer: b.instagram || b.website || '',
    palette: brandPalette(),
  };
}

export async function render(view, { params }) {
  view.classList.add('studio-view');
  view.innerHTML = `
  <div class="studio">
    <aside class="card st-side">
      <div class="side-tabs" id="side-tabs">
        <button class="active" data-tab="ai"><i data-lucide="sparkles"></i><span>ذكاء</span></button>
        <button data-tab="tpl"><i data-lucide="layout-template"></i><span>قوالب</span></button>
        <button data-tab="elements"><i data-lucide="shapes"></i><span>عناصر</span></button>
        <button data-tab="text"><i data-lucide="type"></i><span>نصوص</span></button>
        <button data-tab="uploads"><i data-lucide="upload"></i><span>الرفع</span></button>
      </div>
      <div id="format-box" style="margin-top:16px"><span class="st-label">المقاس</span>
        <div class="format-grid">${Object.entries(FORMATS).map(([k, f]) => `<div class="format-opt" data-format="${k}">${formatShape(k, 26)}${f.label}</div>`).join('')}</div>
      </div>

      <div data-pane="tpl" class="hidden">
        <div class="st-section"><span class="st-label">قوالب جاهزة — مجاناً بدون نقاط</span>
          <div class="chips" id="tpl-filters">
            <span class="chip active" data-tpl-filter="">الكل</span>
            ${TEMPLATE_INDUSTRIES.map((i) => `<span class="chip" data-tpl-filter="${i}">${i}</span>`).join('')}
          </div>
          <label class="row small" style="margin:12px 0;cursor:pointer"><input type="checkbox" id="tpl-brand"> طبّق ألوان هويتي على القوالب</label>
          <div class="tpl-grid" id="tpl-grid"></div>
        </div>
      </div>

      <div data-pane="ai">
      <div class="st-section">
      <h3><i data-lucide="sparkles" style="width:18px;color:var(--gold)"></i>صمّم بالذكاء الاصطناعي</h3>
      <p class="muted small" style="margin:0 0 14px">اكتب فكرة الإعلان وسنصمم لك بوستر جاهز بهوية نشاطك</p>
      <textarea class="textarea" id="prompt" rows="4" placeholder="مثال: إعلان خصم 30% على القهوة المختصة نهاية الأسبوع، مع ذكر التوصيل المجاني">${esc(params.prompt || '')}</textarea>
      <div class="chips" style="margin-top:10px">${IDEAS.map((i) => `<span class="chip" data-idea="${esc(i)}">${i}</span>`).join('')}</div>
      <label class="btn sm" id="attach-btn" style="margin-top:12px"><i data-lucide="paperclip"></i>إرفاق صورة<input type="file" accept="image/png,image/jpeg,image/webp" id="attach-in" hidden></label>
      <div class="attach-preview hidden" id="attach-preview">
        <img alt=""><div class="spacer"><b class="small">صورة مرفقة</b><div class="muted small">ستظهر الصورة في التصميم</div></div>
        <button class="btn sm icon ghost" id="attach-rm" aria-label="إزالة الصورة"><i data-lucide="x"></i></button>
      </div>
      </div>
      <div class="st-section"><span class="st-label">الأسلوب</span>
        <div class="chips" id="styles">
          <span class="chip" data-style="brand"><i data-lucide="swatch-book"></i>هويتي</span>
          ${Object.entries(STYLES).map(([k, s]) => `<span class="chip" data-style="${k}">${s.label}</span>`).join('')}
        </div>
      </div>
      <div class="st-section"><span class="st-label">لغة التصميم</span>
        <div class="chips"><span class="chip" data-lang="ar">العربية</span><span class="chip" data-lang="en">English</span></div>
      </div>
      <button class="btn gold" id="generate" style="width:100%;margin-top:18px;height:46px"><i data-lucide="wand-sparkles"></i>توليد التصميم <span class="badge" style="background:rgba(0,0,0,.15);border:0">1 نقطة</span></button>
      <div class="st-section"><span class="st-label">صورة بالذكاء الاصطناعي <span class="badge" style="margin-inline-start:4px">2 نقاط</span></span>
        <p class="small muted" id="img-quota" style="margin:-2px 0 8px"></p>
        <textarea class="textarea" id="img-prompt" rows="2" style="min-height:64px" placeholder="مثال: كوب قهوة على طاولة خشبية بإضاءة دافئة"></textarea>
        <div class="img-opts">
          <span class="st-label">النمط</span><div class="chips" data-opt="style">${Object.entries(IMG_STYLE).map(([k, [l]], i) => `<span class="chip ${i ? '' : 'active'}" data-img-opt="${k}">${l}</span>`).join('')}</div>
          <span class="st-label">الإضاءة</span><div class="chips" data-opt="light">${Object.entries(IMG_LIGHT).map(([k, [l]], i) => `<span class="chip ${i ? '' : 'active'}" data-img-opt="${k}">${l}</span>`).join('')}</div>
          <span class="st-label">الزاوية</span><div class="chips" data-opt="angle">${Object.entries(IMG_ANGLE).map(([k, [l]], i) => `<span class="chip ${i ? '' : 'active'}" data-img-opt="${k}">${l}</span>`).join('')}</div>
        </div>
        <label class="row small hidden" id="img-ref-row" style="margin-top:8px;cursor:pointer"><input type="checkbox" id="img-ref" checked> ضع منتجي (الصورة المرفقة) داخل الصورة</label>
        <div class="row" style="margin-top:8px">
          <button class="btn sm" id="img-insert" style="flex:1"><i data-lucide="image-plus"></i>إدراج صورة</button>
          <button class="btn sm" id="img-bg" style="flex:1"><i data-lucide="wallpaper"></i>كخلفية</button>
        </div>
      </div>
      </div>

      <div id="design-box">
      <div class="st-section"><span class="st-label">التنسيق — تبديل مجاني</span>
        <div class="chips" id="layouts">${Object.entries(LAYOUTS).map(([k, l]) => `<span class="chip" data-layout="${k}">${l}</span>`).join('')}</div>
      </div>
      <div class="st-section"><span class="st-label">ألوان التصميم</span>
        <div class="swatches" id="palettes">
          ${[['brand', brandPalette()], ...Object.entries(STYLES)].map(([k, p]) =>
            `<div class="swatch" data-palette="${k}" title="${k === 'brand' ? 'هويتي' : p.label}" style="background:linear-gradient(135deg,${p.bg},${p.bg2})"><span style="background:${p.primary}"></span></div>`).join('')}
        </div>
      </div>
      <div class="st-section"><span class="st-label">خط التصميم</span>
        <select class="select" id="font">${POSTER_FONTS.map((f) => `<option value="${f}" style="font-family:'${f}'">${f}</option>`).join('')}</select>
      </div>
      </div>
      <div id="library"></div>
    </aside>

    <section class="st-main">
      <div class="st-toolbar glass">
        <input class="title-input" id="title" value="تصميم جديد" aria-label="اسم التصميم">
        <span class="badge" id="fmt-badge"></span>
        <div class="sep"></div>
        <button class="btn ghost sm icon" id="undo" data-tip="تراجع" aria-label="تراجع"><i data-lucide="undo-2"></i></button>
        <button class="btn ghost sm icon" id="redo" aria-label="إعادة"><i data-lucide="redo-2"></i></button>
        <div class="sep"></div>
        <div class="dl-wrap"><button class="btn sm" id="dl-btn"><i data-lucide="download"></i>تنزيل</button>
          <div class="menu glass dl-menu hidden" id="dl-menu">
            <button data-dl="png"><i data-lucide="image"></i>PNG — جودة عالية</button>
            <button data-dl="png-t"><i data-lucide="layers"></i>PNG بخلفية شفافة</button>
            <button data-dl="jpg"><i data-lucide="file-image"></i>JPG — حجم أصغر</button>
            <button data-dl="pdf"><i data-lucide="file-text"></i>PDF للطباعة</button>
          </div></div>
        <button class="btn sm" id="schedule"><i data-lucide="calendar-plus"></i>جدولة</button>
        <button class="btn primary sm" id="save"><i data-lucide="save"></i><span>حفظ</span></button>
      </div>
      <div class="st-stage" id="stage">
        <div class="st-canvas-wrap"><canvas id="cv"></canvas></div>
        <div class="zoom-bar glass"><button class="btn ghost sm icon" data-zoom="out" aria-label="تصغير"><i data-lucide="zoom-out"></i></button>
          <b class="num small" id="zoom-v">100%</b><button class="btn ghost sm icon" data-zoom="in" aria-label="تكبير"><i data-lucide="zoom-in"></i></button>
          <button class="btn ghost sm icon" data-zoom="fit" aria-label="ملاءمة"><i data-lucide="maximize"></i></button></div>
        <div class="st-overlay hidden" id="busy"><div><div class="orb"></div><b>جاري تصميم إعلانك...</b><p class="muted small">نكتب النصوص ونختار الألوان والتنسيق</p></div></div>
      </div>
    </section>

    <aside class="card st-props" id="props"></aside>
  </div>`;
  icons();

  await Promise.all([loadFabric(), loadFonts(['Cairo'])]);
  const f = window.fabric;
  f.Object.prototype.set({
    transparentCorners: false, cornerColor: '#ffffff', cornerStrokeColor: '#c9a46a', borderColor: '#e8c48a',
    cornerStyle: 'circle', cornerSize: 11, padding: 4, borderScaleFactor: 1.5,
  });

  // ---------- state ----------
  let format = FORMATS[params.format] ? params.format : 'post';
  let W = FORMATS[format].w;
  let H = FORMATS[format].h;
  let style = 'brand';
  let lang = isEn ? 'en' : 'ar';
  let spec = starterSpec();
  let designId = params.id ? Number(params.id) : null;
  let lastPrompt = '';
  let attached = null; // product photo attached to the prompt; re-placed on every layout
  let hist = [];
  let hIndex = -1;
  let restoring = false;
  let dirty = false;
  let autosaveTimer = null;

  const canvas = new f.Canvas($('#cv', view), { preserveObjectStacking: true, selection: true });
  const stage = $('#stage', view);

  let zoomFactor = 1; // user zoom on top of "fit to screen"
  const fit = () => {
    const sw = stage.clientWidth - 48;
    const sh = stage.clientHeight - 48;
    const zoom = Math.max(0.05, Math.min(sw / W, sh / H)) * zoomFactor;
    canvas.setDimensions({ width: Math.round(W * zoom), height: Math.round(H * zoom) });
    canvas.setZoom(zoom);
    stage.classList.toggle('zoomed', zoomFactor > 1);
    const zv = $('#zoom-v', view);
    if (zv) zv.textContent = `${Math.round(zoomFactor * 100)}%`;
    canvas.requestRenderAll();
  };
  const ro = new ResizeObserver(fit);
  ro.observe(stage);

  const setFormatUI = () => {
    $$('[data-format]', view).forEach((e) => e.classList.toggle('active', e.dataset.format === format));
    $('#fmt-badge', view).textContent = `${t(FORMATS[format].label)} · ${W}×${H}`;
  };
  const setActiveChips = () => {
    $$('[data-style]', view).forEach((e) => e.classList.toggle('active', e.dataset.style === style));
    $$('[data-layout]', view).forEach((e) => e.classList.toggle('active', e.dataset.layout === spec.layout));
    $$('[data-lang]', view).forEach((e) => e.classList.toggle('active', e.dataset.lang === lang));
    $('#font', view).value = spec.font;
  };

  // ---------- history ----------
  const snapshot = () => JSON.stringify(canvas.toJSON(PROPS));
  const pushHistory = () => {
    if (restoring) return;
    hist = hist.slice(0, hIndex + 1);
    hist.push(snapshot());
    if (hist.length > 50) hist.shift();
    hIndex = hist.length - 1;
    markDirty();
  };
  const restore = (i) => {
    if (i < 0 || i >= hist.length) return;
    restoring = true;
    hIndex = i;
    canvas.loadFromJSON(hist[i], () => { restoring = false; canvas.requestRenderAll(); renderProps(); markDirty(); });
  };
  let debounce;
  const queueHistory = () => { if (restoring) return; clearTimeout(debounce); debounce = setTimeout(pushHistory, 200); };
  canvas.on('object:modified', queueHistory);
  canvas.on('object:added', queueHistory);
  canvas.on('object:removed', queueHistory);
  canvas.on('text:changed', () => { queueHistory(); syncPropsText(); });

  function markDirty() {
    dirty = true;
    $('#save span', view).textContent = 'حفظ •';
    if (designId) { clearTimeout(autosaveTimer); autosaveTimer = setTimeout(() => save(true), 2500); }
  }

  // ---------- building ----------
  async function rebuild({ keepUser = true } = {}) {
    const userObjs = keepUser ? canvas.getObjects().filter((o) => !o.data?.role || o.data.role === 'user' || o.data.userFrame) : [];
    // Attached-photo backgrounds are re-created for each layout; AI-generated backgrounds are kept.
    const bgImgs = keepUser ? canvas.getObjects().filter((o) => o.data?.role === 'bgimage' && !(attached && o.data?.attached)) : [];
    restoring = true;
    canvas.clear();
    await loadFonts([spec.font]);
    await buildPoster(canvas, spec, { W, H, logo: state.me.business?.logo, brandName: state.me.business?.name });
    bgImgs.forEach((o, i) => canvas.insertAt(o, 1 + i)); // photo backgrounds sit right above the base fill
    userObjs.forEach((o) => canvas.add(o));
    if (attached) await placeAttached();
    restoring = false;
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    setActiveChips();
    renderProps();
    pushHistory();
  }

  async function loadDesign(id) {
    const d = await api(`/designs/${id}`);
    const json = JSON.parse(d.canvas_json);
    spec = json.spec || spec;
    format = FORMATS[d.format] ? d.format : 'post';
    W = d.width; H = d.height;
    lastPrompt = d.prompt || '';
    $('#title', view).value = d.title;
    const fonts = new Set();
    const walk = (objs = []) => objs.forEach((o) => { if (o.fontFamily) fonts.add(o.fontFamily); walk(o.objects); });
    walk(json.objects);
    await loadFonts([...fonts]);
    restoring = true;
    await new Promise((r) => canvas.loadFromJSON(json, r));
    restoring = false;
    const att = canvas.getObjects().find((o) => o.type === 'image' && (o.data?.role === 'attached' || o.data?.attached));
    if (att) showAttached(att.getSrc());
    setFormatUI(); setActiveChips(); fit(); renderProps(); pushHistory();
    clearTimeout(autosaveTimer); // opening a design is not an edit
    dirty = false;
    $('#save span', view).textContent = 'محفوظ';
  }

  // ---------- AI generate ----------
  $('#generate', view).onclick = (e) => {
    const prompt = $('#prompt', view).value.trim();
    if (!prompt) { toast('اكتب فكرة التصميم أولاً', 'err'); $('#prompt', view).focus(); return; }
    withBtn(e.currentTarget, async () => {
      $('#busy', view).classList.remove('hidden');
      try {
        const res = await api('/ai/design', { method: 'POST', body: { prompt, format: `${FORMATS[format].label} ${W}x${H}`, style, lang, hasImage: Boolean(attached) } });
        setCredits(res.credits);
        spec = res.data;
        if (style === 'brand') spec.palette = { ...spec.palette, ...brandPalette() };
        lastPrompt = prompt;
        $('#title', view).value = spec.title || 'تصميم جديد';
        await rebuild({ keepUser: false });
        toast(res.source === 'demo' ? 'تم إنشاء التصميم (وضع تجريبي)' : 'تم إنشاء التصميم ✨');
      } finally {
        $('#busy', view).classList.add('hidden');
      }
    });
  };

  // ---------- side tabs & templates ----------
  let tplFilter = TEMPLATE_INDUSTRIES.includes(state.me.business?.industry) ? state.me.business.industry : '';
  const thumbCache = new Map();
  let tplRun = 0;

  const templateSpec = (t) => {
    const b = state.me.business || {};
    const useBrand = $('#tpl-brand', view)?.checked;
    return { ...structuredClone(t.spec), title: t.name, footer: b.instagram || b.website || b.name || '', palette: useBrand ? brandPalette() : { ...t.spec.palette } };
  };

  async function thumbFor(t) {
    const key = `${t.id}|${format}|${$('#tpl-brand', view).checked}`;
    if (thumbCache.has(key)) return thumbCache.get(key);
    const scale = 220 / Math.max(W, H);
    const sc = new f.StaticCanvas(document.createElement('canvas'), { width: Math.round(W * scale), height: Math.round(H * scale), enableRetinaScaling: false });
    sc.setZoom(scale);
    await buildPoster(sc, templateSpec(t), { W, H, logo: state.me.business?.logo, brandName: state.me.business?.name });
    sc.renderAll();
    const url = sc.toDataURL({ format: 'jpeg', quality: 0.82 });
    sc.dispose();
    thumbCache.set(key, url);
    return url;
  }

  async function renderTemplates() {
    const run = ++tplRun;
    const list = TEMPLATES.filter((t) => !tplFilter || t.industry === tplFilter);
    $$('[data-tpl-filter]', view).forEach((c) => c.classList.toggle('active', c.dataset.tplFilter === tplFilter));
    $('#tpl-grid', view).innerHTML = list.map((t) => `<button class="tpl" data-tpl="${t.id}"><div class="tpl-img" style="aspect-ratio:${W}/${H}"></div><span>${t.name}</span></button>`).join('');
    await loadFonts([...new Set(list.map((t) => t.spec.font))]);
    for (const t of list) {
      if (run !== tplRun) return; // filter or format changed mid-render
      const url = await thumbFor(t);
      const slot = $(`[data-tpl="${t.id}"] .tpl-img`, view);
      if (slot) slot.innerHTML = `<img src="${url}" alt="">`;
    }
  }

  $('#side-tabs', view).addEventListener('click', (e) => {
    const tab = e.target.closest('[data-tab]')?.dataset.tab;
    if (!tab) return;
    $$('[data-tab]', view).forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    $$('[data-pane]', view).forEach((p) => p.classList.toggle('hidden', p.dataset.pane !== tab));
    const library = ['elements', 'text', 'uploads'].includes(tab);
    $('#format-box', view).classList.toggle('hidden', library);
    $('#design-box', view).classList.toggle('hidden', library);
    if (tab === 'tpl') renderTemplates();
  });
  $('#tpl-brand', view).onchange = renderTemplates;

  // ---------- AI images ----------
  const aspect = () => (W / H > 1.2 ? 'landscape' : H / W > 1.2 ? 'portrait' : 'square');
  async function aiImage(btn, asBackground) {
    const prompt = $('#img-prompt', view).value.trim();
    if (!prompt) { toast('اكتب وصف الصورة', 'err'); $('#img-prompt', view).focus(); return; }
    await withBtn(btn, async () => {
      $('#busy', view).classList.remove('hidden');
      try {
        const reference = attached && $('#img-ref', view).checked ? attached : undefined;
        const opt = (k, map) => map[$(`[data-opt="${k}"] .chip.active`, view)?.dataset.imgOpt]?.[1];
        const styled = [prompt, opt('style', IMG_STYLE), opt('light', IMG_LIGHT), opt('angle', IMG_ANGLE)].filter(Boolean).join(', ');
        const res = await api('/ai/image', { method: 'POST', body: { prompt: styled, aspect: aspect(), palette: spec.palette, reference } });
        setCredits(res.credits);
        if (state.me.images) { state.me.images.used += 1; drawQuota(); }
        const url = await shrinkImage(res.data.dataUrl, 1600, { keepPng: false });
        if (asBackground) await setBackgroundImage(url);
        else await placeImage(canvas, url, { W, H });
        renderProps();
        toast(res.source === 'demo' ? 'تم إنشاء صورة فنية (وضع تجريبي)' : 'تم إنشاء الصورة ✨');
      } finally {
        $('#busy', view).classList.add('hidden');
      }
    });
  }

  function setBackgroundImage(url, { fromAttachment = false } = {}) {
    return new Promise((resolve) => f.Image.fromURL(url, (img) => {
      canvas.getObjects().filter((o) => o.data?.role === 'bgimage').forEach((o) => canvas.remove(o));
      img.scale(Math.max(W / img.width, H / img.height));
      img.set({ left: W / 2, top: H / 2, originX: 'center', originY: 'center' });
      img.data = { role: 'bgimage', attached: fromAttachment };
      // Tinted veil keeps the text readable over any photo: lighter at the top, denser where the copy sits.
      const n = parseInt((spec.palette?.bg || '#000000').slice(1), 16);
      const tint = (a) => `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
      const veil = new f.Rect({ left: 0, top: 0, width: W, height: H });
      veil.set('fill', new f.Gradient({
        type: 'linear', gradientUnits: 'pixels', coords: { x1: 0, y1: 0, x2: 0, y2: H },
        colorStops: [{ offset: 0, color: tint(0.42) }, { offset: 0.45, color: tint(0.66) }, { offset: 1, color: tint(0.84) }],
      }));
      veil.data = { role: 'bgimage' };
      canvas.insertAt(img, 1);
      canvas.insertAt(veil, 2);
      canvas.requestRenderAll();
      pushHistory();
      resolve();
    }));
  }
  // ---------- attached photo ----------
  // Layouts with a photo frame (product layout) get the photo inside it; the others use it as a veiled background.
  async function placeAttached() {
    if (canvas.getObjects().some((o) => o.data?.role === 'photo')) {
      const img = await placeImage(canvas, attached, { W, H });
      img.data = { role: 'attached' };
    } else if (!canvas.getObjects().some((o) => o.data?.role === 'bgimage' && !o.data?.attached)) {
      // An AI scene already in the background usually features the product — don't cover it.
      await setBackgroundImage(attached, { fromAttachment: true });
    }
  }

  function showAttached(url) {
    attached = url;
    const box = $('#attach-preview', view);
    $('img', box).src = url || '';
    box.classList.toggle('hidden', !url);
    $('#attach-btn', view).classList.toggle('hidden', Boolean(url));
    $('#img-ref-row', view).classList.toggle('hidden', !url);
  }

  // Large phone photos are scaled down so saved designs stay light (PNG keeps transparency).
  const shrinkImage = (url, max = 1600, { keepPng = true } = {}) => new Promise((resolve) => {
    const im = new Image();
    im.onload = () => {
      const s = Math.min(1, max / Math.max(im.width, im.height));
      const c = document.createElement('canvas');
      c.width = Math.round(im.width * s);
      c.height = Math.round(im.height * s);
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      resolve(c.toDataURL(keepPng && url.startsWith('data:image/png') ? 'image/png' : 'image/jpeg', 0.9));
    };
    im.onerror = () => resolve(url);
    im.src = url;
  });

  $('#attach-in', view).onchange = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 15_000_000) return toast('الصورة كبيرة جداً (الحد 15MB)', 'err');
    showAttached(await shrinkImage(await fileToDataURL(file)));
    syncSpecFromCanvas(canvas, spec);
    await rebuild();
  };
  $('#attach-rm', view).onclick = async () => {
    canvas.getObjects().filter((o) => o.data?.role === 'attached' || o.data?.role === 'bgimage').forEach((o) => canvas.remove(o));
    showAttached(null);
    syncSpecFromCanvas(canvas, spec);
    await rebuild();
  };

  function drawQuota() {
    const q = state.me.images;
    const el = $('#img-quota', view);
    if (!q || q.limit == null) { el.textContent = state.me.ai?.images ? 'بواسطة Nano Banana' : ''; return; }
    el.textContent = `متبقي ${Math.max(0, q.limit - q.used)} من ${q.limit} صور هذا الشهر`;
    $('#img-insert', view).disabled = $('#img-bg', view).disabled = q.used >= q.limit;
  }
  drawQuota();

  $('#img-insert', view).onclick = (e) => aiImage(e.currentTarget, false);
  $('#img-bg', view).onclick = (e) => aiImage(e.currentTarget, true);

  // ---------- side panel events ----------
  view.addEventListener('click', (e) => {
    const t = e.target.closest('[data-idea],[data-format],[data-style],[data-lang],[data-layout],[data-palette],[data-tpl],[data-tpl-filter]');
    if (!t) return;
    const ds = t.dataset;
    if (ds.tplFilter != null) { tplFilter = ds.tplFilter; renderTemplates(); return; }
    if (ds.tpl) {
      spec = templateSpec(TEMPLATES.find((x) => x.id === ds.tpl));
      $('#title', view).value = spec.title;
      rebuild({ keepUser: false });
      return;
    }
    if (ds.idea) { $('#prompt', view).value = ds.idea; $('#prompt', view).focus(); }
    if (ds.lang) { lang = ds.lang; setActiveChips(); }
    if (ds.style) { style = ds.style; setActiveChips(); }
    if (ds.format && ds.format !== format) {
      format = ds.format; W = FORMATS[format].w; H = FORMATS[format].h;
      setFormatUI(); fit();
      syncSpecFromCanvas(canvas, spec);
      rebuild();
      if (!$('[data-pane="tpl"]', view).classList.contains('hidden')) renderTemplates();
    }
    if (ds.layout) { syncSpecFromCanvas(canvas, spec); spec.layout = ds.layout; rebuild(); }
    if (ds.palette) {
      syncSpecFromCanvas(canvas, spec);
      spec.palette = ds.palette === 'brand' ? brandPalette() : (({ label, ...p }) => p)(STYLES[ds.palette]);
      $$('[data-palette]', view).forEach((s) => s.classList.toggle('active', s === t));
      rebuild();
    }
  });
  $('#font', view).onchange = async (e) => {
    spec.font = e.target.value;
    await loadFonts([spec.font]);
    const apply = (o) => { if (o.fontFamily) o.set('fontFamily', spec.font); o.getObjects?.().forEach(apply); if (o.type === 'group') o.addWithUpdate(); };
    canvas.getObjects().forEach(apply);
    canvas.requestRenderAll();
    pushHistory();
  };

  // ---------- editor (inspector, elements, guides, shortcuts) ----------
  const editor = createEditor({
    canvas, view, PROPS, pushHistory,
    size: () => ({ W, H }), getSpec: () => spec, getLang: () => lang,
    shrink: (url, max, opts) => shrinkImage(url, max, opts),
    setBackgroundImage: (url) => setBackgroundImage(url),
    busy: (on) => $('#busy', view).classList.toggle('hidden', !on),
  });
  const renderProps = () => editor.renderInspector();
  function syncPropsText() {
    const ta = $('#p-text', view);
    const tt = editor.textOf(canvas.getActiveObject());
    if (ta && tt && document.activeElement !== ta) ta.value = tt.text;
  }
  canvas.on('selection:created', renderProps);
  canvas.on('selection:updated', renderProps);
  canvas.on('selection:cleared', renderProps);
  canvas.on('object:modified', () => { if (canvas.getActiveObject()) renderProps(); });
  $('#library', view).innerHTML = editor.libraryPanes();
  editor.bindLibrary();

  // AI image option chips (one active per group)
  view.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-img-opt]');
    if (!chip) return;
    $$('.chip', chip.parentElement).forEach((c) => c.classList.toggle('active', c === chip));
  });

  // Zoom
  view.addEventListener('click', (e) => {
    const z = e.target.closest('[data-zoom]')?.dataset.zoom;
    if (!z) return;
    zoomFactor = z === 'fit' ? 1 : Math.min(4, Math.max(0.25, zoomFactor * (z === 'in' ? 1.25 : 0.8)));
    fit();
  });

  // ---------- export & save ----------
  const exportURL = (type = 'png') => {
    canvas.discardActiveObject(); canvas.requestRenderAll();
    // Crop height is given in display pixels so the output is exactly W×H despite on-screen rounding.
    const m = W / canvas.getWidth();
    return canvas.toDataURL({ format: type === 'jpg' ? 'jpeg' : 'png', quality: 0.95, multiplier: m, left: 0, top: 0, width: canvas.getWidth(), height: H / m });
  };
  const fileName = () => ($('#title', view).value || 'design').replace(/[\\/:*?"<>|]/g, '');
  const download = (type) => {
    let url;
    if (type === 'png-t') {
      // Transparent export: hide the base fill and background photos for one render.
      const hidden = canvas.getObjects().filter((o) => ['bg', 'bgimage'].includes(o.data?.role) && o.visible !== false);
      const bgColor = canvas.backgroundColor;
      hidden.forEach((o) => o.set('visible', false));
      canvas.backgroundColor = null;
      url = exportURL('png');
      hidden.forEach((o) => o.set('visible', true));
      canvas.backgroundColor = bgColor;
      canvas.requestRenderAll();
    } else url = exportURL(type === 'pdf' ? 'jpg' : type);
    if (type === 'pdf') {
      const w = window.open('', '_blank');
      if (!w) return toast('اسمح بالنوافذ المنبثقة لتنزيل PDF', 'err');
      w.document.write(`<!doctype html><title>${esc(fileName())}</title><style>@page{size:${W}px ${H}px;margin:0}html,body{margin:0}img{width:100%;display:block}</style><img src="${url}" onload="setTimeout(()=>print(),300)">`);
      w.document.close();
      return;
    }
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName()}.${type === 'png-t' ? 'png' : type}`;
    a.click();
    toast('تم تنزيل التصميم بجودة كاملة');
  };
  $('#dl-btn', view).onclick = (e) => { e.stopPropagation(); $('#dl-menu', view).classList.toggle('hidden'); };
  $('#dl-menu', view).onclick = (e) => {
    const type = e.target.closest('[data-dl]')?.dataset.dl;
    if (!type) return;
    $('#dl-menu', view).classList.add('hidden');
    download(type);
  };
  view.addEventListener('click', (e) => { if (!e.target.closest('.dl-wrap')) $('#dl-menu', view)?.classList.add('hidden'); });

  async function save(silent = false) {
    clearTimeout(autosaveTimer);
    const json = canvas.toJSON(PROPS);
    json.spec = syncSpecFromCanvas(canvas, { ...spec });
    const body = {
      title: $('#title', view).value.trim() || 'تصميم بدون عنوان', format, width: W, height: H,
      canvas_json: JSON.stringify(json), prompt: lastPrompt,
      thumbnail: canvas.toDataURL({ format: 'jpeg', quality: 0.75, multiplier: 420 / Math.max(canvas.getWidth(), canvas.getHeight()) }),
    };
    if (designId) await api(`/designs/${designId}`, { method: 'PUT', body });
    else {
      designId = (await api('/designs', { method: 'POST', body })).id;
      history.replaceState(null, '', `#/studio?id=${designId}`);
    }
    dirty = false;
    $('#save span', view).textContent = silent ? 'حُفظ تلقائياً' : 'محفوظ';
    if (!silent) toast('تم حفظ التصميم في تصاميمك');
  }
  $('#save', view).onclick = (e) => withBtn(e.currentTarget, () => save());
  $('#schedule', view).onclick = (e) => withBtn(e.currentTarget, async () => {
    await save(true);
    postModal({ designId, image: exportURL('jpg'), title: $('#title', view).value, caption: spec.subheadline || '' });
  });
  $('#title', view).oninput = markDirty;
  $('#undo', view).onclick = () => restore(hIndex - 1);
  $('#redo', view).onclick = () => restore(hIndex + 1);

  const onKey = (e) => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) || canvas.getActiveObject()?.isEditing;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); save().catch((err) => toast(err.message, 'err')); return; }
    if (typing) return;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); restore(e.shiftKey ? hIndex + 1 : hIndex - 1); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); restore(hIndex + 1); return; }
    editor.onKey(e);
  };
  document.addEventListener('keydown', onKey);

  // ---------- init ----------
  setFormatUI();
  fit();
  if (designId) {
    try { await loadDesign(designId); } catch (err) { toast(err.message, 'err'); designId = null; await rebuild(); }
  } else {
    await rebuild();
    dirty = false;
    $('#save span', view).textContent = 'حفظ';
    if (params.prompt) $('#prompt', view).focus();
  }

  return () => {
    document.removeEventListener('keydown', onKey);
    ro.disconnect();
    clearTimeout(autosaveTimer);
    if (dirty && designId) save(true).catch(() => {});
    canvas.dispose();
  };
}
