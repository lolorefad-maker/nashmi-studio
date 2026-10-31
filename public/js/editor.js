// Canva-style editing tools for the studio canvas: contextual inspector, elements library,
// text effects, photo filters & lighting, smart guides, layers and keyboard shortcuts.
import { $, $$, esc, api, state, toast, icons, withBtn, fileToDataURL } from './core.js';
import { loadFonts, placeImage, heavyWeight, FONT_GROUPS, STYLES } from './poster.js';
import { setCredits } from './app.js';

const AR = /[؀-ۿ]/;
const hex = (v, d = '#ffffff') => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : d);
const rgba = (h, a) => { const n = parseInt(h.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };

// ---------- Photo filters ----------
// CSS approximations are only for the preview thumbnails; the canvas uses Fabric's filters.
const PRESETS = {
  none: { label: 'أصلي', css: 'none', make: () => [] },
  warm: { label: 'دافئ', css: 'sepia(.25) saturate(1.25) brightness(1.04)', make: (F) => [new F.ColorMatrix({ matrix: warmth(0.6) }), new F.Saturation({ saturation: 0.15 })] },
  cool: { label: 'بارد', css: 'hue-rotate(-12deg) saturate(.9) brightness(1.03)', make: (F) => [new F.ColorMatrix({ matrix: warmth(-0.6) })] },
  bw: { label: 'أبيض وأسود', css: 'grayscale(1) contrast(1.1)', make: (F) => [new F.Grayscale(), new F.Contrast({ contrast: 0.1 })] },
  sepia: { label: 'سيبيا', css: 'sepia(.8)', make: (F) => [new F.Sepia()] },
  vintage: { label: 'كلاسيكي', css: 'sepia(.45) contrast(.9) brightness(1.05) saturate(.8)', make: (F) => [new F.Vintage()] },
  drama: { label: 'درامي', css: 'contrast(1.35) saturate(1.2) brightness(.92)', make: (F) => [new F.Contrast({ contrast: 0.25 }), new F.Saturation({ saturation: 0.2 }), new F.Brightness({ brightness: -0.06 })] },
  cinema: { label: 'سينمائي', css: 'contrast(1.15) saturate(1.3) hue-rotate(-5deg)', make: (F) => [new F.Kodachrome()] },
  polaroid: { label: 'بولارويد', css: 'contrast(1.1) brightness(1.08) saturate(1.1) sepia(.15)', make: (F) => [new F.Polaroid()] },
  fade: { label: 'باهت', css: 'contrast(.82) brightness(1.1) saturate(.75)', make: (F) => [new F.Contrast({ contrast: -0.18 }), new F.Brightness({ brightness: 0.06 }), new F.Saturation({ saturation: -0.25 })] },
};
function warmth(t) { return [1 + 0.12 * t, 0, 0, 0, 0, 0, 1 + 0.03 * t, 0, 0, 0, 0, 0, 1 - 0.14 * t, 0, 0, 0, 0, 0, 1, 0]; }
const ADJUST = [
  ['brightness', 'السطوع', 'sun'], ['contrast', 'التباين', 'contrast'], ['saturation', 'التشبّع', 'droplet'],
  ['warmth', 'الدفء (الإضاءة)', 'thermometer-sun'], ['vibrance', 'الحيوية', 'sparkle'], ['blur', 'التمويه', 'aperture'],
];
const AI_EDITS = [
  ['إزالة الخلفية', 'Remove the background completely and place the subject on a clean pure white background'],
  ['خلفية استوديو', 'Place the subject in a professional photo studio with a soft seamless backdrop and studio lighting'],
  ['إضاءة ذهبية', 'Relight the scene with warm golden-hour sunlight and soft long shadows'],
  ['إضاءة استوديو', 'Relight with professional softbox studio lighting, crisp highlights, even exposure'],
  ['أجواء نيون', 'Relight with moody night neon lighting in pink and blue tones'],
  ['تحسين الجودة', 'Enhance sharpness, clarity and color balance like a professional photo retouch'],
];

// ---------- Text effects ----------
const EFFECTS = { none: 'بدون', shadow: 'ظل', lift: 'رفع', hollow: 'مفرّغ', outline: 'إطار', neon: 'نيون', background: 'خلفية' };
function applyEffect(t, effect, color, intensity) {
  const F = window.fabric;
  const size = t.fontSize;
  const k = intensity / 50;
  const base = t.data?.baseFill || (typeof t.fill === 'string' && t.fill !== 'transparent' ? t.fill : '#ffffff');
  t.set({ shadow: null, stroke: null, strokeWidth: 0, textBackgroundColor: '', fill: base, paintFirst: 'fill' });
  if (effect === 'shadow') t.set('shadow', new F.Shadow({ color: rgba(color, 0.55), blur: size * 0.12 * k, offsetX: size * 0.06 * k, offsetY: size * 0.06 * k }));
  if (effect === 'lift') t.set('shadow', new F.Shadow({ color: 'rgba(0,0,0,0.45)', blur: size * 0.35 * k, offsetX: 0, offsetY: size * 0.08 * k }));
  if (effect === 'hollow') t.set({ fill: 'transparent', stroke: base, strokeWidth: Math.max(1, size * 0.025 * k) });
  if (effect === 'outline') t.set({ stroke: color, strokeWidth: Math.max(1, size * 0.07 * k), paintFirst: 'stroke' });
  if (effect === 'neon') t.set({ fill: '#ffffff', shadow: new F.Shadow({ color, blur: size * 0.45 * k, offsetX: 0, offsetY: 0 }) });
  if (effect === 'background') t.set('textBackgroundColor', rgba(color, Math.min(1, 0.35 + k * 0.5)));
  t.data = { ...(t.data || {}), effect, effectColor: color, effectIntensity: intensity, baseFill: base };
}

// ---------- Shapes, frames, icons, text presets ----------
const STAR = (n, r1, r2) => Array.from({ length: n * 2 }, (_, i) => {
  const r = i % 2 ? r2 : r1;
  const a = (Math.PI * i) / n - Math.PI / 2;
  return { x: r * Math.cos(a), y: r * Math.sin(a) };
});
const SHAPES = [
  ['rect', 'square', 'مربع'], ['round', 'square-round-corner', 'زوايا دائرية'], ['circle', 'circle', 'دائرة'], ['triangle', 'triangle', 'مثلث'],
  ['star', 'star', 'نجمة'], ['hexagon', 'hexagon', 'سداسي'], ['heart', 'heart', 'قلب'], ['arrow', 'move-right', 'سهم'],
  ['line', 'minus', 'خط'], ['dashed', 'ellipsis', 'خط منقّط'], ['badge', 'badge', 'شارة'], ['pill', 'rectangle-horizontal', 'زر'],
];
const FRAMES = [['frame-circle', 'circle-dashed', 'إطار دائري'], ['frame-round', 'square-dashed', 'إطار مربع'], ['frame-arch', 'door-open', 'إطار قوس']];
const ICON_TOPICS = [
  ['', 'الكل'], ['shopping', 'تسوق'], ['coffee', 'طعام وشراب'], ['phone', 'تواصل'], ['star', 'تقييم'], ['heart', 'قلوب'],
  ['arrow', 'أسهم'], ['map', 'مواقع'], ['clock', 'وقت'], ['gift', 'عروض'], ['truck', 'توصيل'], ['user', 'أشخاص'],
];
const EXTRA_KEYWORDS = { coffee: ['coffee', 'cup', 'utensils', 'pizza', 'cake', 'ice-cream', 'croissant', 'sandwich', 'wine', 'beer', 'cookie', 'salad', 'soup', 'chef', 'milk', 'apple'],
  shopping: ['shopping', 'cart', 'bag', 'store', 'tag', 'credit-card', 'wallet', 'package', 'receipt', 'percent', 'barcode'], gift: ['gift', 'percent', 'tag', 'party', 'sparkle', 'badge', 'ticket', 'crown'] };
const TEXT_PRESETS = [
  { label: 'عرض خاص', items: [{ text: 'عرض خاص', font: 'Lalezar', size: 13, effect: 'outline' }, { text: 'لفترة محدودة', font: 'Tajawal', size: 4.5, dy: 11 }] },
  { label: 'جديدنا', items: [{ text: 'جديدنا', font: 'Reem Kufi', size: 12, effect: 'lift' }, { text: 'اكتشف التشكيلة', font: 'Readex Pro', size: 4, dy: 10 }] },
  { label: 'فخم', items: [{ text: 'تجربة فاخرة', font: 'Aref Ruqaa', size: 10, effect: 'shadow' }, { text: 'منذ 2010', font: 'Markazi Text', size: 4, dy: 9 }] },
  { label: 'نيون', items: [{ text: 'افتتاح', font: 'Lemonada', size: 11, effect: 'neon' }] },
  { label: 'SALE', items: [{ text: 'BIG SALE', font: 'Bebas Neue', size: 16, effect: 'hollow' }, { text: 'up to 50% off', font: 'Montserrat', size: 4.5, dy: 12 }] },
  { label: 'Elegant', items: [{ text: 'Grand Opening', font: 'Playfair Display', size: 9, italic: true }, { text: 'JOIN US THIS FRIDAY', font: 'Montserrat', size: 3.5, dy: 8 }] },
];

export function createEditor(ctx) {
  const f = window.fabric;
  const F = f.Image.filters;
  const { canvas, view, size, getSpec, getLang, pushHistory, PROPS } = ctx;
  const panel = () => $('#props', view);
  const u = () => Math.min(size().W, size().H) / 100;
  const pal = () => getSpec().palette || STYLES.luxury;
  const uploads = [];
  let clipboard = null;

  const textOf = (o) => (!o ? null : o.type === 'group' ? o.getObjects().find((c) => c.text != null) : o.text != null ? o : null);
  const kind = (o) => {
    if (!o) return 'page';
    if (o.type === 'activeSelection') return 'multi';
    if (o.data?.role === 'bg') return 'page';
    if (textOf(o)) return 'text';
    if (o.type === 'image') return 'image';
    return 'shape';
  };
  const render = () => canvas.requestRenderAll();
  const commit = () => { render(); pushHistory(); };

  function addObject(o, { center = true } = {}) {
    const { W, H } = size();
    if (center) o.set({ left: W / 2, top: H / 2, originX: 'center', originY: 'center' });
    o.data = { ...(o.data || {}), role: o.data?.role === 'photo' ? 'photo' : 'user' };
    canvas.add(o);
    canvas.setActiveObject(o);
    render();
    return o;
  }

  // ---------- inspector building blocks ----------
  const slider = (id, label, min, max, step, value, unit = '') => `<div class="prop-row"><span>${label}</span>
    <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}"><b class="num small" id="${id}-v" style="min-width:38px">${value}${unit}</b></div>`;
  const section = (title, body, icon = '') => `<div class="st-section"><span class="st-label">${icon ? `<i data-lucide="${icon}" style="width:13px;vertical-align:-2px"></i> ` : ''}${title}</span>${body}</div>`;
  const bindSlider = (id, fn, unit = '') => {
    const el = $(`#${id}`, panel());
    if (!el) return;
    el.oninput = () => { $(`#${id}-v`, panel()).textContent = el.value + unit; fn(Number(el.value)); render(); };
    el.onchange = pushHistory;
  };

  function fontPicker(current) {
    const group = (title, list) => `<div class="fp-group">${title}</div>${list.map((fam) =>
      `<button class="fp-item ${fam === current ? 'active' : ''}" data-font="${esc(fam)}" style="font-family:'${esc(fam)}'">${AR.test(title) && FONT_GROUPS.arabic.includes(fam) ? 'أبجد هوز' : 'Aa Bb'} — ${esc(fam)}</button>`).join('')}`;
    return `<div class="font-picker"><button class="select fp-btn" id="fp-btn" style="font-family:'${esc(current)}';text-align:start">${esc(current)}</button>
      <div class="fp-menu hidden" id="fp-menu"><input class="input" id="fp-q" placeholder="ابحث عن خط" style="height:36px;margin-bottom:6px">
        <div id="fp-list">${group('خطوط عربية', FONT_GROUPS.arabic)}${group('خطوط إنجليزية', FONT_GROUPS.latin)}</div></div></div>`;
  }

  function colorField(id, value, { gradient = null } = {}) {
    return `<div class="row" style="gap:8px"><input type="color" id="${id}" value="${hex(value)}">
      ${gradient ? `<label class="small row" style="gap:6px;cursor:pointer"><input type="checkbox" id="${id}-grad" ${gradient.on ? 'checked' : ''}> تدرّج</label>
      <input type="color" id="${id}-2" value="${hex(gradient.c2, '#c9a46a')}" class="${gradient.on ? '' : 'hidden'}">` : ''}</div>`;
  }

  // Linear gradient across the object's own box at the given angle (degrees).
  function gradientFill(o, c1, c2, angle = 90) {
    const w = o.width || 100;
    const h = o.height || 100;
    const a = (angle * Math.PI) / 180;
    const dx = Math.cos(a) / 2;
    const dy = Math.sin(a) / 2;
    return new f.Gradient({ type: 'linear', gradientUnits: 'pixels',
      coords: { x1: w * (0.5 - dx), y1: h * (0.5 - dy), x2: w * (0.5 + dx), y2: h * (0.5 + dy) },
      colorStops: [{ offset: 0, color: c1 }, { offset: 1, color: c2 }] });
  }
  const gradOf = (o, prop = 'fill') => (o?.[prop] && typeof o[prop] === 'object' && o[prop].colorStops ? o[prop].colorStops.map((s) => s.color) : null);

  function bindColor(id, target, prop = 'fill', { onSolid } = {}) {
    const p = panel();
    const c1 = $(`#${id}`, p);
    const g = $(`#${id}-grad`, p);
    const c2 = $(`#${id}-2`, p);
    const apply = () => {
      if (g?.checked) target.set(prop, gradientFill(target, c1.value, c2.value, target.data?.gradAngle ?? 90));
      else { target.set(prop, c1.value); onSolid?.(c1.value); }
      if (target.group) target.group.addWithUpdate();
      render();
    };
    c1.oninput = apply; c1.onchange = pushHistory;
    if (g) g.onchange = () => { c2.classList.toggle('hidden', !g.checked); apply(); pushHistory(); };
    if (c2) { c2.oninput = apply; c2.onchange = pushHistory; }
  }

  // ---------- common controls ----------
  function commonHTML(o) {
    const r = o.getBoundingRect(true, true);
    const locked = Boolean(o.data?.locked);
    return section('الموضع والحجم', `
      <div class="pos-grid">
        <label>X<input class="input num" id="pos-x" type="number" value="${Math.round(o.left)}"></label>
        <label>Y<input class="input num" id="pos-y" type="number" value="${Math.round(o.top)}"></label>
        <label>W<input class="input num" id="pos-w" type="number" value="${Math.round(r.width)}"></label>
        <label>H<input class="input num" id="pos-h" type="number" value="${Math.round(r.height)}"></label>
        <label>↻<input class="input num" id="pos-a" type="number" value="${Math.round(o.angle || 0)}"></label>
      </div>
      <div class="tool-row" style="margin-top:8px">
        ${[['left', 'align-horizontal-justify-start', 'يمين/يسار الصفحة'], ['hcenter', 'align-horizontal-justify-center', 'توسيط أفقي'], ['right', 'align-horizontal-justify-end', 'الطرف الآخر'],
           ['top', 'align-vertical-justify-start', 'أعلى'], ['vcenter', 'align-vertical-justify-center', 'توسيط عمودي'], ['bottom', 'align-vertical-justify-end', 'أسفل']]
          .map(([k, ic, tip]) => `<button class="tbtn" data-align-page="${k}" title="${tip}"><i data-lucide="${ic}"></i></button>`).join('')}
      </div>`, 'move') +
      section('الشفافية والترتيب', `${slider('op', 'الشفافية', 0, 100, 1, Math.round((o.opacity ?? 1) * 100), '%')}
      <div class="tool-row">
        <button class="tbtn" data-act="front" title="إلى الأمام"><i data-lucide="bring-to-front"></i></button>
        <button class="tbtn" data-act="forward" title="خطوة للأمام"><i data-lucide="arrow-up"></i></button>
        <button class="tbtn" data-act="backward" title="خطوة للخلف"><i data-lucide="arrow-down"></i></button>
        <button class="tbtn" data-act="back" title="إلى الخلف"><i data-lucide="send-to-back"></i></button>
        <button class="tbtn" data-act="flipx" title="قلب أفقي"><i data-lucide="flip-horizontal-2"></i></button>
        <button class="tbtn" data-act="flipy" title="قلب عمودي"><i data-lucide="flip-vertical-2"></i></button>
        <button class="tbtn ${locked ? 'active' : ''}" data-act="lock" title="قفل"><i data-lucide="${locked ? 'lock' : 'lock-open'}"></i></button>
      </div>`, 'layers') +
      `<div class="st-section row">
        <button class="btn sm" data-act="dup" style="flex:1"><i data-lucide="copy"></i>تكرار</button>
        <button class="btn sm danger" data-act="delete" style="flex:1"><i data-lucide="trash-2"></i>حذف</button>
      </div>`;
  }

  function bindCommon(o) {
    const p = panel();
    const num = (id) => Number($(`#${id}`, p).value);
    $('#pos-x', p).onchange = () => { o.set('left', num('pos-x')); o.setCoords(); commit(); };
    $('#pos-y', p).onchange = () => { o.set('top', num('pos-y')); o.setCoords(); commit(); };
    $('#pos-w', p).onchange = () => { o.scaleToWidth(Math.max(4, num('pos-w'))); o.setCoords(); commit(); };
    $('#pos-h', p).onchange = () => { o.scaleToHeight(Math.max(4, num('pos-h'))); o.setCoords(); commit(); };
    $('#pos-a', p).onchange = () => { o.rotate(num('pos-a')); o.setCoords(); commit(); };
    bindSlider('op', (v) => o.set('opacity', v / 100), '%');
  }

  // ---------- panels ----------
  function pagePanel() {
    const bg = canvas.getObjects().find((x) => x.data?.role === 'bg');
    const grad = gradOf(bg);
    const bgImg = canvas.getObjects().find((x) => x.data?.role === 'bgimage' && x.type === 'image');
    return `<h3><i data-lucide="file-image" style="width:18px"></i>الصفحة</h3>
      <p class="muted small" style="margin:0 0 6px">اختر عنصراً لتعديله، أو عدّل خلفية التصميم</p>
      ${section('الخلفية', `${colorField('bg-c', grad ? grad[0] : bg?.fill || getSpec().palette?.bg, { gradient: { on: Boolean(grad), c2: grad?.[1] || getSpec().palette?.bg2 } })}
        ${slider('bg-angle', 'زاوية التدرّج', 0, 360, 5, bg?.data?.gradAngle ?? 135, '°')}
        <div class="row" style="margin-top:10px"><label class="btn sm" style="flex:1"><i data-lucide="image-plus"></i>صورة خلفية<input type="file" accept="image/*" id="bg-img" hidden></label>
          ${bgImg ? '<button class="btn sm ghost danger" id="bg-img-rm"><i data-lucide="x"></i>إزالة</button>' : ''}</div>`, 'paint-bucket')}
      ${section('الطبقات', layersHTML(), 'layers')}
      <div class="st-section small muted" style="line-height:1.9"><b style="color:var(--ink-2)">اختصارات</b><br>
        Ctrl+C / Ctrl+V نسخ ولصق · Ctrl+D تكرار<br>Ctrl+G تجميع · Ctrl+Shift+G فك التجميع<br>الأسهم تحريك (Shift ×10) · Delete حذف<br>Ctrl+Z تراجع · Ctrl+S حفظ</div>`;
  }

  function layersHTML() {
    const objs = canvas.getObjects().slice().reverse();
    const label = (o) => {
      const t = textOf(o);
      if (t) return t.text.replace(/\s+/g, ' ').slice(0, 28) || 'نص';
      return { image: 'صورة', rect: o.data?.role === 'photo' ? 'إطار صورة' : 'مستطيل', circle: 'دائرة', polygon: 'شكل', path: 'شكل', group: 'مجموعة', line: 'خط', triangle: 'مثلث' }[o.type] || o.type;
    };
    const ic = (o) => (textOf(o) ? 'type' : o.type === 'image' ? 'image' : o.type === 'group' ? 'group' : 'shapes');
    return `<div class="layers">${objs.map((o) => {
      const i = canvas.getObjects().indexOf(o);
      const isBg = o.data?.role === 'bg';
      return `<div class="layer ${canvas.getActiveObject() === o ? 'active' : ''}" data-layer="${i}">
        <i data-lucide="${isBg ? 'square' : ic(o)}"></i><span>${esc(isBg ? 'الخلفية' : label(o))}</span>
        ${isBg ? '' : `<button data-layer-vis="${i}" title="إظهار/إخفاء"><i data-lucide="${o.visible === false ? 'eye-off' : 'eye'}"></i></button>
        <button data-layer-lock="${i}" title="قفل"><i data-lucide="${o.data?.locked ? 'lock' : 'lock-open'}"></i></button>`}</div>`;
    }).join('')}</div>`;
  }

  function textPanel(o) {
    const t = textOf(o);
    const ar = AR.test(t.text);
    const grad = gradOf(t);
    const eff = t.data?.effect || 'none';
    return `<div class="row" style="margin-bottom:10px"><h3 class="spacer"><i data-lucide="type" style="width:18px"></i>النص</h3>
        <button class="btn ghost sm icon" data-act="deselect" aria-label="إلغاء التحديد"><i data-lucide="x"></i></button></div>
      <textarea class="textarea" id="p-text" rows="3" style="min-height:70px" dir="auto">${esc(t.text)}</textarea>
      ${section('الخط', `${fontPicker(t.fontFamily)}
        <div class="row" style="margin-top:8px;gap:8px">
          <input class="input num" type="number" id="p-size" value="${Math.round(t.fontSize)}" min="6" max="1000" style="width:80px;height:38px">
          <div class="tool-row" style="margin:0">
            <button class="tbtn ${t.fontWeight >= 600 ? 'active' : ''}" data-style="bold" title="عريض"><i data-lucide="bold"></i></button>
            <button class="tbtn ${t.fontStyle === 'italic' ? 'active' : ''}" data-style="italic" title="مائل"><i data-lucide="italic"></i></button>
            <button class="tbtn ${t.underline ? 'active' : ''}" data-style="underline" title="تسطير"><i data-lucide="underline"></i></button>
            <button class="tbtn ${t.linethrough ? 'active' : ''}" data-style="strike" title="يتوسطه خط"><i data-lucide="strikethrough"></i></button>
          </div>
        </div>
        ${t.type === 'textbox' ? `<div class="tool-row" style="margin-top:8px">${[['right', 'align-right'], ['center', 'align-center'], ['left', 'align-left']]
          .map(([a, ic]) => `<button class="tbtn ${t.textAlign === a ? 'active' : ''}" data-talign="${a}"><i data-lucide="${ic}"></i></button>`).join('')}</div>` : ''}`, 'case-sensitive')}
      ${section('اللون', colorField('t-color', grad ? grad[0] : t.data?.baseFill || t.fill, { gradient: { on: Boolean(grad), c2: grad?.[1] } }), 'palette')}
      ${section('المسافات', `${slider('lh', 'تباعد الأسطر', 0.7, 2.5, 0.05, (t.lineHeight || 1.16).toFixed(2))}
        ${ar ? '<p class="muted small" style="margin:4px 0 0">تباعد الحروف غير متاح للنص العربي حتى لا تنفصل الحروف</p>' : slider('ls', 'تباعد الحروف', -100, 800, 10, t.charSpacing || 0)}`, 'between-horizontal-start')}
      ${section('التأثيرات', `<div class="effects">${Object.entries(EFFECTS).map(([k, l]) =>
        `<button class="effect ${k === eff ? 'active' : ''}" data-effect="${k}"><span class="fx fx-${k}" style="font-family:'${esc(t.fontFamily)}'">Aa</span>${l}</button>`).join('')}</div>
        <div id="fx-opts" class="${eff === 'none' ? 'hidden' : ''}" style="margin-top:10px">
          <div class="prop-row"><span>لون التأثير</span><input type="color" id="fx-color" value="${hex(t.data?.effectColor, '#000000')}"></div>
          ${slider('fx-int', 'الشدة', 5, 100, 1, t.data?.effectIntensity ?? 50)}</div>`, 'wand-sparkles')}
      ${o.type === 'group' ? section('الزر', `<div class="prop-row"><span>لون الزر</span><input type="color" id="btn-fill" value="${hex(o.getObjects().find((c) => c.type === 'rect')?.fill)}"></div>
        ${slider('btn-r', 'استدارة الزوايا', 0, 100, 1, Math.round(o.getObjects().find((c) => c.type === 'rect')?.rx || 0))}`, 'mouse-pointer-click') : ''}
      ${commonHTML(o)}`;
  }

  function imagePanel(o) {
    const src = o.getSrc?.() || '';
    const adj = o.data?.adjust || {};
    const preset = o.data?.preset || 'none';
    const radius = o.clipPath && o.clipPath.type === 'rect' ? Math.round(o.clipPath.rx || 0) : 0;
    const quota = state.me.images;
    return `<div class="row" style="margin-bottom:10px"><h3 class="spacer"><i data-lucide="image" style="width:18px"></i>الصورة</h3>
        <button class="btn ghost sm icon" data-act="deselect" aria-label="إلغاء التحديد"><i data-lucide="x"></i></button></div>
      ${section('الفلاتر', `<div class="filters">${Object.entries(PRESETS).map(([k, p]) =>
        `<button class="filter ${k === preset ? 'active' : ''}" data-preset="${k}"><img src="${src}" alt="" style="filter:${p.css}"><span>${p.label}</span></button>`).join('')}</div>`, 'images')}
      ${section('الإضاءة والألوان', ADJUST.map(([k, l]) => slider(`adj-${k}`, l, k === 'blur' ? 0 : -100, 100, 1, adj[k] || 0)).join('') +
        '<button class="btn sm ghost" id="adj-reset" style="margin-top:4px"><i data-lucide="rotate-ccw"></i>إعادة الضبط</button>', 'sun')}
      ${section('الشكل', `${slider('img-radius', 'استدارة الزوايا', 0, Math.round(Math.min(o.width, o.height) / 2), 1, radius)}
        ${slider('img-shadow', 'الظل', 0, 100, 1, o.data?.shadow || 0)}
        <label class="btn sm" style="width:100%;margin-top:6px"><i data-lucide="replace"></i>استبدال الصورة<input type="file" accept="image/*" id="img-replace" hidden></label>`, 'square-round-corner')}
      ${section('تعديل بالذكاء الاصطناعي', `<p class="muted small" style="margin:0 0 8px">Nano Banana — 2 نقاط${quota?.limit != null ? ` · متبقي ${Math.max(0, quota.limit - quota.used)} من ${quota.limit}` : ''}</p>
        <div class="chips">${AI_EDITS.map(([l, p]) => `<span class="chip" data-ai-edit="${esc(p)}">${l}</span>`).join('')}</div>
        <textarea class="textarea" id="ai-edit-q" rows="2" style="min-height:56px;margin-top:8px" placeholder="أو اكتب التعديل: مثلاً اجعل الإضاءة دافئة وأضف بخار فوق الكوب"></textarea>
        <button class="btn gold sm" id="ai-edit-go" style="width:100%;margin-top:8px"><i data-lucide="wand-sparkles"></i>تطبيق التعديل</button>`, 'sparkles')}
      ${commonHTML(o)}`;
  }

  function shapePanel(o) {
    const target = o.type === 'group' ? o.getObjects()[0] : o;
    const strokeShape = Boolean(o.data?.icon); // line icons are drawn with strokes
    const grad = gradOf(target);
    const isFrame = o.data?.role === 'photo';
    return `<div class="row" style="margin-bottom:10px"><h3 class="spacer"><i data-lucide="${isFrame ? 'frame' : 'shapes'}" style="width:18px"></i>${isFrame ? 'إطار صورة' : 'الشكل'}</h3>
        <button class="btn ghost sm icon" data-act="deselect" aria-label="إلغاء التحديد"><i data-lucide="x"></i></button></div>
      ${isFrame ? `<label class="btn gold sm" style="width:100%;margin-bottom:6px"><i data-lucide="image-plus"></i>ضع صورة في الإطار<input type="file" accept="image/*" id="frame-fill" hidden></label>
        <p class="muted small" style="margin:0">أو اختر صورة من تبويب "الرفع" بينما الإطار محدد</p>` : ''}
      ${section(strokeShape ? 'لون الأيقونة' : 'التعبئة', colorField('s-fill', strokeShape ? target.stroke : grad ? grad[0] : target.fill, { gradient: strokeShape ? null : { on: Boolean(grad), c2: grad?.[1] } }), 'paint-bucket')}
      ${strokeShape ? slider('s-sw', 'سماكة الخط', 0.5, 6, 0.25, target.strokeWidth || 2) : section('الحدود', `<div class="prop-row"><span>اللون</span><input type="color" id="s-stroke" value="${hex(target.stroke, '#ffffff')}"></div>
        ${slider('s-sw', 'السماكة', 0, 40, 1, Math.round(target.strokeWidth || 0))}
        ${target.type === 'rect' ? slider('s-r', 'استدارة الزوايا', 0, Math.round(Math.min(target.width, target.height) / 2), 1, Math.round(target.rx || 0)) : ''}`, 'square-dashed')}
      ${section('الظل', slider('s-shadow', 'الظل', 0, 100, 1, o.data?.shadow || 0), 'cloud')}
      ${commonHTML(o)}`;
  }

  function multiPanel() {
    return `<h3><i data-lucide="group" style="width:18px"></i>عناصر متعددة</h3>
      ${section('محاذاة إلى الصفحة', `<div class="tool-row">${[['left', 'align-horizontal-justify-start'], ['hcenter', 'align-horizontal-justify-center'], ['right', 'align-horizontal-justify-end'],
        ['top', 'align-vertical-justify-start'], ['vcenter', 'align-vertical-justify-center'], ['bottom', 'align-vertical-justify-end']]
        .map(([k, ic]) => `<button class="tbtn" data-align-page="${k}"><i data-lucide="${ic}"></i></button>`).join('')}</div>`)}
      <div class="st-section grid" style="gap:8px">
        <button class="btn sm" data-act="group"><i data-lucide="group"></i>تجميع (Ctrl+G)</button>
        <button class="btn sm" data-act="dup"><i data-lucide="copy"></i>تكرار</button>
        <button class="btn sm danger" data-act="delete"><i data-lucide="trash-2"></i>حذف المحدد</button>
      </div>`;
  }

  function renderInspector() {
    const o = canvas.getActiveObject();
    const k = kind(o);
    const p = panel();
    p.innerHTML = k === 'page' ? pagePanel() : k === 'multi' ? multiPanel() : k === 'text' ? textPanel(o) : k === 'image' ? imagePanel(o) : shapePanel(o);
    if (o?.type === 'group' && !textOf(o) && k === 'shape') p.insertAdjacentHTML('beforeend', '<div class="st-section"><button class="btn sm" style="width:100%" data-act="ungroup"><i data-lucide="ungroup"></i>فك التجميع</button></div>');
    icons();
    if (k === 'page') bindPage();
    if (k === 'text') bindText(o);
    if (k === 'image') bindImage(o);
    if (k === 'shape') bindShape(o);
    if (k === 'text' || k === 'image' || k === 'shape') bindCommon(o);
  }

  // ---------- binders ----------
  function bindPage() {
    const p = panel();
    const bg = canvas.getObjects().find((x) => x.data?.role === 'bg');
    if (!bg) return;
    const apply = () => {
      const g = $('#bg-c-grad', p).checked;
      const angle = Number($('#bg-angle', p).value);
      bg.data = { ...bg.data, gradAngle: angle };
      bg.set('fill', g ? gradientFill(bg, $('#bg-c', p).value, $('#bg-c-2', p).value, angle) : $('#bg-c', p).value);
      canvas.backgroundColor = $('#bg-c', p).value;
      render();
    };
    $('#bg-c', p).oninput = apply; $('#bg-c', p).onchange = pushHistory;
    $('#bg-c-2', p).oninput = apply; $('#bg-c-2', p).onchange = pushHistory;
    $('#bg-c-grad', p).onchange = () => { $('#bg-c-2', p).classList.toggle('hidden', !$('#bg-c-grad', p).checked); apply(); pushHistory(); };
    bindSlider('bg-angle', () => apply(), '°');
    $('#bg-img', p).onchange = async (e) => {
      const file = e.target.files[0];
      if (file) { await ctx.setBackgroundImage(await ctx.shrink(await fileToDataURL(file))); renderInspector(); }
    };
    $('#bg-img-rm', p)?.addEventListener('click', () => {
      canvas.getObjects().filter((x) => x.data?.role === 'bgimage').forEach((x) => canvas.remove(x));
      commit(); renderInspector();
    });
  }

  function bindText(o) {
    const p = panel();
    const t = textOf(o);
    const refresh = () => {
      if (o.type === 'group') {
        const r = o.getObjects().find((c) => c.type === 'rect');
        if (r) r.set('width', t.width + t.fontSize * 2.2);
        o.addWithUpdate();
      }
      render();
    };
    $('#p-text', p).oninput = (e) => {
      t.set('text', e.target.value);
      if (AR.test(e.target.value)) t.set({ direction: 'rtl', charSpacing: 0 }); else t.set('direction', 'ltr');
      refresh();
    };
    $('#p-text', p).onchange = pushHistory;
    $('#p-size', p).onchange = (e) => { t.set('fontSize', Math.max(6, Number(e.target.value))); refresh(); pushHistory(); };
    $$('[data-style]', p).forEach((b) => (b.onclick = () => {
      const s = b.dataset.style;
      if (s === 'bold') t.set('fontWeight', t.fontWeight >= 600 ? 400 : heavyWeight(t.fontFamily));
      if (s === 'italic') t.set('fontStyle', t.fontStyle === 'italic' ? 'normal' : 'italic');
      if (s === 'underline') t.set('underline', !t.underline);
      if (s === 'strike') t.set('linethrough', !t.linethrough);
      b.classList.toggle('active');
      refresh(); pushHistory();
    }));
    $$('[data-talign]', p).forEach((b) => (b.onclick = () => {
      t.set('textAlign', b.dataset.talign);
      $$('[data-talign]', p).forEach((x) => x.classList.toggle('active', x === b));
      commit();
    }));
    bindColor('t-color', t, 'fill', { onSolid: (c) => { t.data = { ...(t.data || {}), baseFill: c }; } });
    bindSlider('lh', (v) => { t.set('lineHeight', v); refresh(); });
    bindSlider('ls', (v) => { t.set('charSpacing', v); refresh(); });
    $$('[data-effect]', p).forEach((b) => (b.onclick = () => {
      const eff = b.dataset.effect;
      applyEffect(t, eff, $('#fx-color', p).value, Number($('#fx-int', p).value));
      $$('[data-effect]', p).forEach((x) => x.classList.toggle('active', x === b));
      $('#fx-opts', p).classList.toggle('hidden', eff === 'none');
      refresh(); pushHistory();
    }));
    const reFx = () => { applyEffect(t, t.data?.effect || 'none', $('#fx-color', p).value, Number($('#fx-int', p).value)); refresh(); };
    $('#fx-color', p).oninput = reFx; $('#fx-color', p).onchange = pushHistory;
    bindSlider('fx-int', reFx);
    if (o.type === 'group') {
      const r = o.getObjects().find((c) => c.type === 'rect');
      $('#btn-fill', p).oninput = (e) => { r.set('fill', e.target.value); render(); };
      $('#btn-fill', p).onchange = pushHistory;
      bindSlider('btn-r', (v) => { r.set({ rx: v, ry: v }); o.addWithUpdate(); });
    }
    // Font picker
    const menu = $('#fp-menu', p);
    $('#fp-btn', p).onclick = () => { menu.classList.toggle('hidden'); $('#fp-q', p).focus(); };
    $('#fp-q', p).oninput = (e) => {
      const q = e.target.value.trim().toLowerCase();
      $$('.fp-item', p).forEach((it) => it.classList.toggle('hidden', q && !it.dataset.font.toLowerCase().includes(q)));
    };
    $('#fp-list', p).onclick = async (e) => {
      const fam = e.target.closest('[data-font]')?.dataset.font;
      if (!fam) return;
      await loadFonts([fam]);
      t.set({ fontFamily: fam, fontWeight: t.fontWeight >= 600 ? heavyWeight(fam) : 400 });
      if (t.data?.effect) applyEffect(t, t.data.effect, t.data.effectColor || '#000000', t.data.effectIntensity ?? 50);
      refresh(); pushHistory(); renderInspector();
    };
  }

  function rebuildFilters(img) {
    const adj = img.data?.adjust || {};
    const list = [...PRESETS[img.data?.preset || 'none'].make(F)];
    if (adj.brightness) list.push(new F.Brightness({ brightness: adj.brightness / 250 }));
    if (adj.contrast) list.push(new F.Contrast({ contrast: adj.contrast / 200 }));
    if (adj.saturation) list.push(new F.Saturation({ saturation: adj.saturation / 100 }));
    if (adj.warmth) list.push(new F.ColorMatrix({ matrix: warmth(adj.warmth / 100) }));
    if (adj.vibrance) list.push(new F.Vibrance({ vibrance: adj.vibrance / 100 }));
    if (adj.blur) list.push(new F.Blur({ blur: adj.blur / 250 }));
    img.filters = list;
    img.applyFilters();
    render();
  }

  function shadowFor(o, v) {
    o.data = { ...(o.data || {}), shadow: v };
    o.set('shadow', v ? new f.Shadow({ color: `rgba(0,0,0,${0.15 + v / 250})`, blur: v * u() * 0.25, offsetX: 0, offsetY: v * u() * 0.06 }) : null);
  }

  function bindImage(img) {
    const p = panel();
    $$('[data-preset]', p).forEach((b) => (b.onclick = () => {
      img.data = { ...(img.data || {}), preset: b.dataset.preset };
      $$('[data-preset]', p).forEach((x) => x.classList.toggle('active', x === b));
      rebuildFilters(img); pushHistory();
    }));
    ADJUST.forEach(([k]) => bindSlider(`adj-${k}`, (v) => { img.data = { ...(img.data || {}), adjust: { ...(img.data?.adjust || {}), [k]: v } }; rebuildFilters(img); }));
    $('#adj-reset', p).onclick = () => { img.data = { ...(img.data || {}), adjust: {}, preset: 'none' }; rebuildFilters(img); pushHistory(); renderInspector(); };
    bindSlider('img-radius', (v) => {
      if (img.clipPath?.absolutePositioned) img.clipPath.set({ rx: v * img.scaleX, ry: v * img.scaleY });
      else img.clipPath = v ? new f.Rect({ width: img.width, height: img.height, rx: v, ry: v, originX: 'center', originY: 'center' }) : null;
      img.dirty = true;
    });
    bindSlider('img-shadow', (v) => shadowFor(img, v));
    $('#img-replace', p).onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const url = await ctx.shrink(await fileToDataURL(file));
      img.setSrc(url, () => { rebuildFilters(img); commit(); renderInspector(); });
    };
    const runEdit = (instruction, btn) => withBtn(btn, async () => {
      if (!instruction.trim()) throw new Error('اكتب التعديل المطلوب');
      ctx.busy(true);
      try {
        const res = await api('/ai/image', { method: 'POST', body: { prompt: instruction, mode: 'edit', reference: await sourceOf(img), aspect: img.width > img.height * 1.2 ? 'landscape' : img.height > img.width * 1.2 ? 'portrait' : 'square' } });
        setCredits(res.credits);
        if (state.me.images) state.me.images.used += 1;
        const url = await ctx.shrink(res.data.dataUrl, 1600, { keepPng: false });
        await new Promise((r) => img.setSrc(url, r));
        rebuildFilters(img); commit(); renderInspector();
        toast('تم تعديل الصورة ✨');
      } finally { ctx.busy(false); }
    });
    $$('[data-ai-edit]', p).forEach((c) => (c.onclick = () => { $('#ai-edit-q', p).value = c.textContent.trim(); $('#ai-edit-q', p).dataset.prompt = c.dataset.aiEdit; }));
    $('#ai-edit-go', p).onclick = (e) => {
      const q = $('#ai-edit-q', p);
      runEdit(q.dataset.prompt && q.value.trim() === $$('[data-ai-edit]', p).find((c) => c.dataset.aiEdit === q.dataset.prompt)?.textContent.trim() ? q.dataset.prompt : q.value, e.currentTarget);
    };
  }

  // The original (unfiltered) pixels of an image as a data URL, for AI edits.
  async function sourceOf(img) {
    const src = img._originalElement || img.getElement();
    const w = src.naturalWidth || src.width;
    const h = src.naturalHeight || src.height;
    const s = Math.min(1, 1600 / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.round(w * s);
    c.height = Math.round(h * s);
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.92);
  }

  function bindShape(o) {
    const p = panel();
    const parts = o.type === 'group' ? o.getObjects() : [o];
    const target = parts[0];
    if (o.data?.icon) {
      const c = $('#s-fill', p);
      c.oninput = () => { parts.forEach((x) => x.set('stroke', c.value)); render(); };
      c.onchange = pushHistory;
      bindSlider('s-sw', (v) => parts.forEach((x) => x.set('strokeWidth', v)));
    } else {
      const c1 = $('#s-fill', p);
      const g = $('#s-fill-grad', p);
      const c2 = $('#s-fill-2', p);
      const apply = () => { parts.forEach((x) => x.set('fill', g?.checked ? gradientFill(x, c1.value, c2.value, 90) : c1.value)); if (o.type === 'group') o.addWithUpdate(); render(); };
      c1.oninput = apply; c1.onchange = pushHistory;
      if (g) g.onchange = () => { c2.classList.toggle('hidden', !g.checked); apply(); pushHistory(); };
      if (c2) { c2.oninput = apply; c2.onchange = pushHistory; }
      $('#s-stroke', p).oninput = (e) => { parts.forEach((x) => x.set('stroke', e.target.value)); render(); };
      $('#s-stroke', p).onchange = pushHistory;
      bindSlider('s-sw', (v) => parts.forEach((x) => x.set({ strokeWidth: v, stroke: x.stroke || $('#s-stroke', p).value })));
      bindSlider('s-r', (v) => target.set({ rx: v, ry: v }));
    }
    bindSlider('s-shadow', (v) => shadowFor(o, v));
    $('#frame-fill', p)?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) { await placeImage(canvas, await ctx.shrink(await fileToDataURL(file)), { ...size(), slot: o }); commit(); }
    });
  }

  // ---------- actions ----------
  function alignToPage(o, where) {
    const { W, H } = size();
    const r = o.getBoundingRect(true, true);
    const dx = { left: -r.left, hcenter: W / 2 - (r.left + r.width / 2), right: W - (r.left + r.width) }[where];
    const dy = { top: -r.top, vcenter: H / 2 - (r.top + r.height / 2), bottom: H - (r.top + r.height) }[where];
    o.set({ left: o.left + (dx || 0), top: o.top + (dy || 0) });
    o.setCoords();
  }

  function setLock(o, locked) {
    o.data = { ...(o.data || {}), locked };
    o.set({ lockMovementX: locked, lockMovementY: locked, lockScalingX: locked, lockScalingY: locked, lockRotation: locked, hasControls: !locked, editable: !locked });
  }

  function act(name) {
    const o = canvas.getActiveObject();
    const bg = canvas.getObjects().find((x) => x.data?.role === 'bg');
    const keepBgBottom = () => { if (bg) bg.sendToBack(); };
    if (name === 'deselect') { canvas.discardActiveObject(); render(); return; }
    if (!o) return;
    const items = o.type === 'activeSelection' ? o.getObjects() : [o];
    if (name === 'delete') { items.forEach((x) => { if (x.data?.role !== 'bg') canvas.remove(x); }); canvas.discardActiveObject(); render(); }
    if (name === 'dup') duplicate(o);
    if (name === 'front') { o.bringToFront(); commit(); }
    if (name === 'forward') { o.bringForward(); commit(); }
    if (name === 'backward') { o.sendBackwards(); keepBgBottom(); commit(); }
    if (name === 'back') { o.sendToBack(); keepBgBottom(); commit(); }
    if (name === 'flipx') { o.set('flipX', !o.flipX); commit(); }
    if (name === 'flipy') { o.set('flipY', !o.flipY); commit(); }
    if (name === 'lock') { setLock(o, !o.data?.locked); commit(); }
    if (name === 'group' && o.type === 'activeSelection') { const g = o.toGroup(); g.data = { role: 'user' }; commit(); }
    if (name === 'ungroup' && o.type === 'group') { o.toActiveSelection(); canvas.getActiveObject()?.getObjects().forEach((x) => { x.data = { ...(x.data || {}), role: 'user' }; }); commit(); }
    renderInspector();
  }

  function duplicate(o, offset = 3) {
    o.clone((c) => {
      canvas.discardActiveObject();
      c.set({ left: c.left + offset * u(), top: c.top + offset * u(), evented: true });
      if (c.type === 'activeSelection') {
        c.canvas = canvas;
        c.forEachObject((x) => { x.data = { ...(x.data || {}), role: 'user' }; canvas.add(x); });
        c.setCoords();
      } else {
        c.data = { ...(o.data || {}), role: o.data?.role === 'photo' ? 'photo' : 'user', locked: false };
        canvas.add(c);
      }
      canvas.setActiveObject(c);
      commit();
    }, PROPS);
  }

  // ---------- elements library ----------
  function shape(kindName) {
    const p = pal();
    const s = u();
    const fill = p.primary;
    const o = {
      rect: () => new f.Rect({ width: 30 * s, height: 30 * s, fill }),
      round: () => new f.Rect({ width: 30 * s, height: 30 * s, rx: 5 * s, ry: 5 * s, fill }),
      circle: () => new f.Circle({ radius: 15 * s, fill }),
      triangle: () => new f.Triangle({ width: 30 * s, height: 26 * s, fill }),
      star: () => new f.Polygon(STAR(5, 16 * s, 7 * s), { fill }),
      hexagon: () => new f.Polygon(Array.from({ length: 6 }, (_, i) => ({ x: 15 * s * Math.cos((Math.PI / 3) * i), y: 15 * s * Math.sin((Math.PI / 3) * i) })), { fill }),
      heart: () => new f.Path('M 0 -8 C -6 -16 -18 -12 -16 -2 C -14 6 0 14 0 16 C 0 14 14 6 16 -2 C 18 -12 6 -16 0 -8 Z', { fill, scaleX: 1.6 * s / 1.6, scaleY: 1.6 * s / 1.6 }),
      arrow: () => new f.Path('M 0 -4 L 22 -4 L 22 -10 L 34 0 L 22 10 L 22 4 L 0 4 Z', { fill, scaleX: s, scaleY: s }),
      line: () => new f.Rect({ width: 40 * s, height: 0.6 * s, fill }),
      dashed: () => new f.Line([0, 0, 40 * s, 0], { stroke: fill, strokeWidth: 0.6 * s, strokeDashArray: [2 * s, 1.4 * s] }),
      badge: () => new f.Polygon(STAR(14, 15 * s, 12.5 * s), { fill }),
      pill: () => new f.Rect({ width: 34 * s, height: 10 * s, rx: 5 * s, ry: 5 * s, fill }),
    }[kindName]?.();
    if (o) addObject(o);
  }

  function frame(kindName) {
    const s = u();
    const common = { fill: rgba(hex(pal().primary, '#c9a46a'), 0.25), stroke: rgba('#ffffff', 0.7), strokeWidth: 0.3 * s, strokeDashArray: [1.5 * s, 1.2 * s] };
    let o;
    if (kindName === 'frame-circle') o = new f.Rect({ width: 36 * s, height: 36 * s, rx: 18 * s, ry: 18 * s, ...common });
    if (kindName === 'frame-round') o = new f.Rect({ width: 40 * s, height: 40 * s, rx: 4 * s, ry: 4 * s, ...common });
    if (kindName === 'frame-arch') o = new f.Rect({ width: 32 * s, height: 44 * s, rx: 16 * s, ry: 16 * s, ...common });
    o.data = { role: 'photo', userFrame: true };
    addObject(o);
    toast('اختر صورة من تبويب "الرفع" أو من لوحة الإطار لتملأه');
  }

  // [kebab-name, PascalName] pairs from the bundled Lucide set (~1500 line icons).
  let ICONS = null;
  function iconSearch(q) {
    ICONS ??= Object.keys(window.lucide?.icons || {}).map((p) => [p.replace(/[A-Z0-9]+/g, (m, i) => (i ? '-' : '') + m.toLowerCase()), p]);
    const words = EXTRA_KEYWORDS[q] || (q ? [q.toLowerCase()] : []);
    return (words.length ? ICONS.filter(([n]) => words.some((w) => n.includes(w))) : ICONS).slice(0, 96).map(([, p]) => p);
  }
  function iconSVG(pascal, color = '#ffffff') {
    const node = window.lucide?.icons?.[pascal];
    if (!node) return null;
    const el = window.lucide.createElement(node);
    el.setAttribute('stroke', color);
    el.setAttribute('width', '96');
    el.setAttribute('height', '96');
    return el.outerHTML;
  }
  function addIcon(name) {
    const svg = iconSVG(name, pal().primary);
    if (!svg) return;
    f.loadSVGFromString(svg, (objects, options) => {
      const g = f.util.groupSVGElements(objects, options);
      g.scaleToWidth(18 * u());
      g.data = { role: 'user', icon: name };
      if (g.type !== 'group') { g.data.icon = name; }
      addObject(g);
    });
  }

  async function addTextPreset(i) {
    const preset = TEXT_PRESETS[i];
    await loadFonts(preset.items.map((x) => x.font));
    const { W, H } = size();
    const p = pal();
    const made = preset.items.map((it) => {
      const ar = AR.test(it.text);
      const t = new f.Textbox(it.text, {
        width: W * 0.75, fontSize: it.size * u(), fontFamily: it.font, fontWeight: heavyWeight(it.font), fontStyle: it.italic ? 'italic' : 'normal',
        fill: p.text, textAlign: 'center', direction: ar ? 'rtl' : 'ltr', originX: 'center', originY: 'top', left: W / 2, top: H * 0.4 + (it.dy || 0) * u(),
      });
      if (it.effect) applyEffect(t, it.effect, it.effect === 'neon' ? p.primary : '#000000', 50);
      t.data = { ...(t.data || {}), role: 'user' };
      return t;
    });
    made.forEach((t) => canvas.add(t));
    canvas.setActiveObject(made.length > 1 ? new f.ActiveSelection(made, { canvas }) : made[0]);
    commit();
  }

  function addText(level) {
    const ar = getLang() === 'ar';
    const { W } = size();
    const conf = { heading: [9, 800, ar ? 'أضف عنواناً' : 'Add a heading'], sub: [5.5, 600, ar ? 'أضف عنواناً فرعياً' : 'Add a subheading'], body: [3.6, 400, ar ? 'أضف نصاً هنا' : 'Add body text'] }[level];
    addObject(new f.Textbox(conf[2], {
      width: W * 0.7, fontSize: conf[0] * u(), fontWeight: conf[1] >= 600 ? heavyWeight(getSpec().font) : 400,
      fontFamily: getSpec().font, fill: pal().text, textAlign: 'center', direction: ar ? 'rtl' : 'ltr',
    }));
  }

  async function insertUpload(url) {
    const active = canvas.getActiveObject();
    await placeImage(canvas, url, { ...size(), slot: active?.data?.role === 'photo' ? active : null });
    commit();
  }

  function libraryPanes() {
    return `
      <div data-pane="elements" class="hidden">
        ${section('الأشكال', `<div class="el-grid">${SHAPES.map(([k, ic, l]) => `<button class="el-btn" data-shape="${k}"><i data-lucide="${ic}"></i>${l}</button>`).join('')}</div>`, 'shapes')}
        ${section('إطارات الصور', `<div class="el-grid">${FRAMES.map(([k, ic, l]) => `<button class="el-btn" data-frame="${k}"><i data-lucide="${ic}"></i>${l}</button>`).join('')}</div>`, 'frame')}
        ${section('الأيقونات', `<input class="input" id="icon-q" placeholder="ابحث بالإنجليزية: coffee, phone, star…" style="height:38px" dir="ltr">
          <div class="chips" style="margin:8px 0">${ICON_TOPICS.map(([k, l]) => `<span class="chip" data-icon-topic="${k}">${l}</span>`).join('')}</div>
          <div class="icon-grid" id="icon-grid"></div>`, 'smile')}
      </div>
      <div data-pane="text" class="hidden">
        ${section('إضافة نص', `<div class="grid" style="gap:8px">
          <button class="add-text h" data-add-text="heading">أضف عنواناً</button>
          <button class="add-text s" data-add-text="sub">أضف عنواناً فرعياً</button>
          <button class="add-text b" data-add-text="body">أضف نصاً عادياً</button></div>`, 'type')}
        ${section('تنسيقات جاهزة', `<div class="text-presets">${TEXT_PRESETS.map((p, i) =>
          `<button class="text-preset" data-text-preset="${i}" style="font-family:'${p.items[0].font}'"><span class="fx-${p.items[0].effect || 'none'}">${esc(p.items[0].text)}</span></button>`).join('')}</div>`, 'sparkles')}
      </div>
      <div data-pane="uploads" class="hidden">
        ${section('صورك', `<label class="btn gold" style="width:100%"><i data-lucide="upload"></i>رفع صور<input type="file" accept="image/*" multiple id="up-in" hidden></label>
          <p class="muted small" style="margin:8px 0">انقر على صورة لإضافتها — أو حدّد إطاراً أولاً لتملأه</p>
          <div class="up-grid" id="up-grid"></div>`, 'upload')}
      </div>`;
  }

  function drawUploads() {
    const logo = state.me.business?.logo;
    $('#up-grid', view).innerHTML = [...(logo ? [logo] : []), ...uploads].map((u2, i) =>
      `<button class="up-item" data-upload="${i - (logo ? 1 : 0)}"><img src="${u2}" alt=""></button>`).join('') || '<p class="muted small">لم ترفع صوراً بعد</p>';
  }

  function drawIcons(q = '') {
    const grid = $('#icon-grid', view);
    grid.innerHTML = iconSearch(q).map((n) => `<button class="icon-item" data-icon="${n}" title="${n}">${iconSVG(n, 'currentColor') || ''}</button>`).join('');
  }

  function bindLibrary() {
    let timer;
    $('#icon-q', view).oninput = (e) => { clearTimeout(timer); timer = setTimeout(() => drawIcons(e.target.value.trim()), 200); };
    $('#up-in', view).onchange = async (e) => {
      for (const file of [...e.target.files].slice(0, 12)) uploads.unshift(await ctx.shrink(await fileToDataURL(file)));
      e.target.value = '';
      drawUploads();
    };
    view.addEventListener('click', (e) => {
      const t = e.target.closest('[data-shape],[data-frame],[data-icon],[data-icon-topic],[data-add-text],[data-text-preset],[data-upload],[data-act],[data-align-page],[data-layer],[data-layer-vis],[data-layer-lock]');
      if (!t) return;
      const d = t.dataset;
      if (d.shape) shape(d.shape);
      if (d.frame) frame(d.frame);
      if (d.icon) addIcon(d.icon);
      if (d.iconTopic != null) { $$('[data-icon-topic]', view).forEach((c) => c.classList.toggle('active', c === t)); drawIcons(d.iconTopic); }
      if (d.addText) addText(d.addText);
      if (d.textPreset != null) addTextPreset(Number(d.textPreset));
      if (d.upload != null) {
        const logo = state.me.business?.logo;
        insertUpload(Number(d.upload) < 0 ? logo : uploads[Number(d.upload)]);
      }
      if (d.act) act(d.act);
      if (d.alignPage) { const o = canvas.getActiveObject(); if (o) { alignToPage(o, d.alignPage); commit(); renderInspector(); } }
      if (d.layerVis != null) { e.stopPropagation(); const o = canvas.item(Number(d.layerVis)); o.set('visible', o.visible === false); commit(); renderInspector(); return; }
      if (d.layerLock != null) { e.stopPropagation(); const o = canvas.item(Number(d.layerLock)); setLock(o, !o.data?.locked); commit(); renderInspector(); return; }
      if (d.layer != null) { const o = canvas.item(Number(d.layer)); if (o && o.data?.role !== 'bg') { canvas.setActiveObject(o); render(); renderInspector(); } }
    });
    drawUploads();
    drawIcons('');
  }

  // ---------- smart guides ----------
  let guides = [];
  canvas.on('object:moving', (e) => {
    const o = e.target;
    const { W, H } = size();
    const tol = 8 / canvas.getZoom();
    const r = o.getBoundingRect(true, true);
    guides = [];
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const snapX = [[W / 2, cx], [0, r.left], [W, r.left + r.width]].find(([target, v]) => Math.abs(target - v) < tol);
    const snapY = [[H / 2, cy], [0, r.top], [H, r.top + r.height]].find(([target, v]) => Math.abs(target - v) < tol);
    if (snapX) { o.set('left', o.left + (snapX[0] - snapX[1])); guides.push(['v', snapX[0]]); }
    if (snapY) { o.set('top', o.top + (snapY[0] - snapY[1])); guides.push(['h', snapY[0]]); }
  });
  canvas.on('mouse:up', () => { if (guides.length) { guides = []; render(); } });
  canvas.on('after:render', () => {
    if (!guides.length) return;
    const c = canvas.getContext();
    const { W, H } = size();
    const z = canvas.getZoom();
    c.save();
    c.strokeStyle = '#ff3d9a';
    c.lineWidth = 1;
    c.setLineDash([5, 4]);
    for (const [dir, v] of guides) {
      c.beginPath();
      if (dir === 'v') { c.moveTo(v * z, 0); c.lineTo(v * z, H * z); } else { c.moveTo(0, v * z); c.lineTo(W * z, v * z); }
      c.stroke();
    }
    c.restore();
  });

  // ---------- keyboard ----------
  function onKey(e) {
    const o = canvas.getActiveObject();
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && k === 'c' && o) { o.clone((c) => { clipboard = c; }, PROPS); e.preventDefault(); return true; }
    if (mod && k === 'v' && clipboard) { duplicate(clipboard, 4); e.preventDefault(); return true; }
    if (mod && k === 'd' && o) { duplicate(o); e.preventDefault(); return true; }
    if (mod && k === 'g' && o) { act(e.shiftKey ? 'ungroup' : 'group'); e.preventDefault(); return true; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && o) { act('delete'); e.preventDefault(); return true; }
    if (o && e.key.startsWith('Arrow') && !o.data?.locked) {
      const step = e.shiftKey ? 10 : 1;
      if (e.key === 'ArrowLeft') o.set('left', o.left - step);
      if (e.key === 'ArrowRight') o.set('left', o.left + step);
      if (e.key === 'ArrowUp') o.set('top', o.top - step);
      if (e.key === 'ArrowDown') o.set('top', o.top + step);
      o.setCoords();
      render();
      clearTimeout(onKey.t);
      onKey.t = setTimeout(pushHistory, 400);
      e.preventDefault();
      return true;
    }
    return false;
  }

  return { renderInspector, libraryPanes, bindLibrary, onKey, act, textOf };
}
