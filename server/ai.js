// AI layer: prompts and output shaping for designs, analyses, copy and images.
// Text goes through llm.js (Nashmi model, else Gemini); when neither answers, a built-in generator keeps the product working.
import { complete, provider, llmStatus } from './llm.js';

const BASE = (process.env.AI_BASE_URL || '').replace(/\/+$/, '');
const KEY = process.env.AI_API_KEY || '';
const MODEL = process.env.AI_MODEL || 'nashmi';

export const FONTS = ['Cairo', 'Tajawal', 'Almarai', 'Changa', 'El Messiri', 'Reem Kufi', 'Lalezar', 'Amiri', 'IBM Plex Sans Arabic', 'Readex Pro'];
export const LAYOUTS = ['hero', 'split', 'sale', 'minimal', 'frame', 'diagonal'];
const DECOR = ['orbs', 'lines', 'dots', 'waves', 'none'];

export const STYLE_PALETTES = {
  luxury:  { bg: '#0d0d0f', bg2: '#2a2419', primary: '#c9a46a', text: '#f6efe2', muted: '#b3a993' },
  modern:  { bg: '#1e1b4b', bg2: '#4338ca', primary: '#22d3ee', text: '#ffffff', muted: '#c7d2fe' },
  minimal: { bg: '#f7f5f0', bg2: '#e9e4d8', primary: '#111111', text: '#111111', muted: '#5f5f5f' },
  bold:    { bg: '#dc2626', bg2: '#7f1d1d', primary: '#facc15', text: '#ffffff', muted: '#fde68a' },
  nature:  { bg: '#14532d', bg2: '#166534', primary: '#bef264', text: '#f0fdf4', muted: '#bbf7d0' },
  pastel:  { bg: '#fce7f3', bg2: '#e0e7ff', primary: '#db2777', text: '#1f2937', muted: '#4b5563' },
};

const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';

export function aiStatus() {
  const s = llmStatus();
  return {
    connected: s.connected,
    provider: s.provider,
    model: s.connected ? (s.provider === 'gemini' ? `Gemini · ${s.model}` : s.model) : MODEL,
    images: GEMINI_KEY ? `Nano Banana · ${GEMINI_MODEL}` : null,
  };
}

function extractJSON(text) {
  const cleaned = String(text).replace(/```(?:json)?/gi, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('No JSON object in model output');
  return JSON.parse(cleaned.slice(start, end + 1));
}

async function chatJSON(system, user, { temperature = 0.7 } = {}) {
  const { text } = await complete({ system, messages: [{ role: 'user', content: user }], json: true, temperature });
  return extractJSON(text);
}

// Runs the model when configured; otherwise (or on failure) returns the fallback. Reports which one answered.
async function withFallback(callModel, fallback) {
  if (provider()) {
    try {
      return { data: await callModel(), source: 'model' };
    } catch (err) {
      console.error('[ai] model call failed, using built-in generator:', err.message);
    }
  }
  return { data: fallback(), source: 'demo' };
}

export function businessContext(b) {
  if (!b) return 'لا توجد معلومات عن النشاط التجاري.';
  return [
    `اسم النشاط: ${b.name}`,
    b.industry && `المجال: ${b.industry}`,
    (b.city || b.country) && `الموقع: ${[b.city, b.country].filter(Boolean).join('، ')}`,
    b.description && `الوصف: ${b.description}`,
    b.audience && `الجمهور المستهدف: ${b.audience}`,
    b.tone && `نبرة العلامة: ${b.tone}`,
    b.instagram && `انستغرام: ${b.instagram}`,
    b.website && `الموقع الإلكتروني: ${b.website}`,
  ].filter(Boolean).join('\n');
}

const isHex = (s) => /^#[0-9a-f]{6}$/i.test(s || '');

function brandPalette(b) {
  let colors = [];
  try { colors = JSON.parse(b?.colors || '[]'); } catch { /* ignore */ }
  const [primary = '#c9a46a', bg = '#111827', text = '#ffffff'] = colors;
  return { bg, bg2: bg, primary, text, muted: text };
}

function normalizeDesign(spec, { style, business }) {
  const base = style === 'brand' ? brandPalette(business) : STYLE_PALETTES[style] || STYLE_PALETTES.luxury;
  const palette = { ...base };
  for (const k of Object.keys(base)) if (isHex(spec.palette?.[k])) palette[k] = spec.palette[k];
  if (style === 'brand') Object.assign(palette, brandPalette(business)); // brand colors always win
  const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  return {
    title: str(spec.title, 60) || str(spec.headline, 60) || 'تصميم جديد',
    layout: LAYOUTS.includes(spec.layout) ? spec.layout : 'hero',
    headline: str(spec.headline, 80),
    subheadline: str(spec.subheadline, 140),
    body: str(spec.body, 220),
    cta: str(spec.cta, 40),
    badge: str(spec.badge, 24),
    footer: str(spec.footer, 80),
    palette,
    font: FONTS.includes(spec.font) ? spec.font : (business?.font && FONTS.includes(business.font) ? business.font : 'Cairo'),
    decor: DECOR.includes(spec.decor) ? spec.decor : 'orbs',
  };
}

// ---------- Design generation ----------

const INTENTS = [
  { key: 'sale', re: /خصم|تخفيض|عرض|اوفر|أوفر|sale|discount|offer|%|٪/i, layout: 'sale' },
  { key: 'product', re: /جديد|منتج|تشكيلة|أطلق|إطلاق|اطلاق|أطلقنا|نكهة|مشروب|طبق|جرّب|جرب|new|product|collection|launch|flavou?r|drink|try/i, layout: 'split' },
  { key: 'opening', re: /افتتاح|قريبا|قريباً|opening|soon/i, layout: 'hero' },
  { key: 'event', re: /فعالية|حفل|ورشة|مؤتمر|event|workshop|webinar/i, layout: 'frame' },
  { key: 'hiring', re: /توظيف|وظيفة|مطلوب|hiring|job|vacancy/i, layout: 'minimal' },
  { key: 'holiday', re: /عيد|رمضان|مبارك|تهنئة|eid|ramadan|holiday|greeting/i, layout: 'frame' },
];

const COPY = {
  ar: {
    sale: { h: 'عرض خاص', s: 'لفترة محدودة فقط', c: 'اطلب الآن' },
    opening: { h: 'افتتاح قريب', s: 'كونوا أول من يزورنا', c: 'تابعونا' },
    product: { h: 'جديدنا وصل', s: 'اكتشف تشكيلتنا الجديدة', c: 'اطلب الآن' },
    event: { h: 'انضم إلينا', s: 'فعالية مميزة بانتظارك', c: 'سجّل الآن' },
    hiring: { h: 'نحن نوظّف', s: 'انضم إلى فريقنا', c: 'قدّم الآن' },
    holiday: { h: 'كل عام وأنتم بخير', s: 'أطيب التهاني من عائلتنا لكم', c: '' },
    general: { h: 'جودة تستحقها', s: 'تجربة مختلفة بانتظارك', c: 'تواصل معنا' },
  },
  en: {
    sale: { h: 'Special Offer', s: 'For a limited time only', c: 'Order now' },
    opening: { h: 'Opening Soon', s: 'Be the first to visit us', c: 'Follow us' },
    product: { h: 'Just Arrived', s: 'Discover our new collection', c: 'Order now' },
    event: { h: 'Join Us', s: 'A special event awaits you', c: 'Register now' },
    hiring: { h: "We're Hiring", s: 'Join our team', c: 'Apply now' },
    holiday: { h: 'Season’s Greetings', s: 'Warm wishes from our family to yours', c: '' },
    general: { h: 'Quality You Deserve', s: 'A different experience awaits', c: 'Contact us' },
  },
};

function fallbackDesign({ prompt, style, lang, business, hasImage }) {
  const intent = INTENTS.find((i) => i.re.test(prompt)) || { key: 'general', layout: 'hero' };
  // A product photo reads best in the product layout's frame; sales and greetings keep theirs (photo becomes the background).
  const layout = hasImage && ['hero', 'minimal', 'diagonal'].includes(intent.layout) ? 'split' : intent.layout;
  const copy = COPY[lang]?.[intent.key] || COPY.ar[intent.key];
  const pctMatch = prompt.match(/(\d{1,2})\s*(%|٪|بالمية|percent)/i);
  const badge = pctMatch ? (lang === 'en' ? `${pctMatch[1]}% OFF` : `خصم ${pctMatch[1]}%`) : '';
  const trimmed = prompt.replace(/\s+/g, ' ').trim();
  const subheadline = trimmed.length > 8 && trimmed.length <= 90 ? trimmed : copy.s;
  const decor = ['orbs', 'lines', 'dots', 'waves'][Math.floor(Math.random() * 4)];
  return normalizeDesign({
    title: `${copy.h} — ${business?.name || ''}`.trim(),
    layout,
    headline: copy.h,
    subheadline,
    cta: copy.c,
    badge,
    footer: business?.instagram || business?.website || business?.name || '',
    decor,
  }, { style, business });
}

export async function generateDesign({ prompt, format, style = 'luxury', lang = 'ar', hasImage = false, business }) {
  const system = `أنت مصمم جرافيك ومسوّق محترف تصمم إعلانات وبوسترات تجارية للشركات وصفحات التواصل الاجتماعي.
أعد فقط كائن JSON صالح (بدون أي شرح) بهذا الشكل:
{"title": "اسم قصير للتصميم", "layout": "${LAYOUTS.join('|')}", "headline": "عنوان رئيسي قصير وقوي (2-5 كلمات)",
 "subheadline": "سطر داعم (حتى 12 كلمة)", "body": "نص إضافي اختياري قصير", "cta": "دعوة لاتخاذ إجراء (2-3 كلمات)",
 "badge": "شارة اختيارية مثل خصم 30% أو جديد", "footer": "سطر التواصل أو الحساب",
 "palette": {"bg":"#hex","bg2":"#hex","primary":"#hex","text":"#hex","muted":"#hex"},
 "font": "${FONTS.join('|')}", "decor": "${DECOR.join('|')}"}
قواعد: لغة النصوص ${lang === 'en' ? 'الإنجليزية' : 'العربية'}. ألوان متناسقة وتباين عالٍ بين النص والخلفية.
الأسلوب المطلوب: ${style}. اختر layout مناسباً: sale للعروض والخصومات، split للمنتجات، frame للمناسبات والفعاليات، minimal للإعلانات الرسمية، hero و diagonal للإعلانات العامة.
إذا أرفق العميل صورة فاختر split لإبرازها في إطار الصورة، إلا للعروض (sale) والمناسبات (frame) حيث تصبح الصورة خلفية.`;
  const user = `${businessContext(business)}\n\nمقاس التصميم: ${format}\nالمطلوب: ${prompt}${hasImage ? '\nمرفق: صورة للمنتج أو الموضوع ستوضع داخل التصميم.' : ''}`;
  return withFallback(
    async () => normalizeDesign(await chatJSON(system, user, { temperature: 0.85 }), { style, business }),
    () => fallbackDesign({ prompt, style, lang, business, hasImage }),
  );
}

// ---------- Image generation ----------

const IMAGE_MODEL = process.env.AI_IMAGE_MODEL || '';
const SIZES = { square: [1024, 1024], portrait: [1024, 1536], landscape: [1536, 1024] };

// Deterministic abstract artwork in the brand palette, used until an image model is configured.
function fallbackImage({ prompt, aspect, palette, business }) {
  const [w, h] = SIZES[aspect] || SIZES.square;
  const brand = brandPalette(business);
  const p = { ...brand, ...(palette || {}) };
  let seed = [...prompt].reduce((s, c) => (s * 31 + c.charCodeAt(0)) >>> 0, 7);
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const colors = [p.primary, p.bg2 || p.bg, p.text, p.primary];
  const blobs = Array.from({ length: 6 }, (_, i) => {
    const r = (0.18 + rnd() * 0.32) * Math.max(w, h);
    return `<circle cx="${(rnd() * w).toFixed(0)}" cy="${(rnd() * h).toFixed(0)}" r="${r.toFixed(0)}" fill="${colors[i % colors.length]}" opacity="${(0.25 + rnd() * 0.45).toFixed(2)}"/>`;
  }).join('');
  const rings = Array.from({ length: 5 }, (_, i) =>
    `<circle cx="${w * 0.62}" cy="${h * 0.42}" r="${(0.08 + i * 0.07) * Math.min(w, h)}" fill="none" stroke="${p.text}" stroke-opacity="${(0.22 - i * 0.035).toFixed(2)}" stroke-width="2"/>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.bg}"/><stop offset="1" stop-color="${p.bg2 || p.bg}"/></linearGradient>
    <filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${Math.round(Math.min(w, h) / 9)}"/></filter>
    <filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .06 0"/></filter></defs>
    <rect width="100%" height="100%" fill="url(#g)"/><g filter="url(#b)">${blobs}</g>${rings}<rect width="100%" height="100%" filter="url(#n)"/></svg>`;
  return { dataUrl: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`, width: w, height: h };
}

// ---------- Nano Banana (Google Gemini image models) ----------
const GEMINI_ASPECT = { square: '1:1', portrait: '9:16', landscape: '16:9' };

function imagePrompt({ prompt, business, withReference, mode }) {
  if (mode === 'edit') {
    return `Edit the attached image: ${prompt}. Keep the main subject exactly as it is (shape, colors, labels, details) unless the instruction says otherwise. ` +
      'Photorealistic result, natural blending, no added text, letters, logos or watermarks.';
  }
  const brand = `${business?.name || 'a local business'}${business?.industry ? ` (${business.industry})` : ''}`;
  return withReference
    ? `Use the attached photo as the product. Keep the product exactly as it is — same shape, colors, label and details. ` +
      `Create a professional commercial advertising photo of it for ${brand}: ${prompt}. ` +
      'Studio-quality lighting, premium mood, clean composition with empty space for headline text. No text, no letters, no logos, no watermarks.'
    : `Professional commercial advertising photo for ${brand}: ${prompt}. ` +
      'High quality, premium lighting, clean composition with empty space for headline text. No text, no letters, no logos, no watermarks.';
}

async function geminiImage({ prompt, aspect, reference, business, mode }) {
  const parts = [];
  const ref = /^data:(image\/[\w.+-]+);base64,(.+)$/.exec(reference || '');
  if (ref) parts.push({ inline_data: { mime_type: ref[1], data: ref[2] } });
  parts.push({ text: imagePrompt({ prompt, business, withReference: Boolean(ref), mode: ref ? mode : null }) });

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: GEMINI_ASPECT[aspect] || '1:1' } },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`Gemini ${res.status}: ${data.error?.message || ''}`.slice(0, 400));
    err.userMessage = res.status === 429
      ? 'خدمة الصور (Nano Banana) غير مفعّلة بعد على حساب Google — يلزم تفعيل الدفع (Billing). تواصل مع إدارة المنصة'
      : res.status === 400 || res.status === 403
        ? 'تعذّر الاتصال بخدمة الصور — تحقق من مفتاح Google في الإعدادات'
        : 'خدمة الصور مشغولة حالياً، حاول بعد قليل';
    throw err;
  }
  const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData || p.inline_data);
  const inline = part?.inlineData || part?.inline_data;
  if (!inline?.data) {
    const err = new Error(`Gemini returned no image (finishReason: ${data.candidates?.[0]?.finishReason || 'unknown'})`);
    err.userMessage = 'لم يُنشئ النموذج صورة لهذا الوصف — جرّب صياغة مختلفة';
    throw err;
  }
  return { dataUrl: `data:${inline.mimeType || inline.mime_type || 'image/png'};base64,${inline.data}` };
}

export async function generateImage({ prompt, aspect = 'square', palette, reference, mode, business }) {
  // A configured Nano Banana key is authoritative: failures surface to the user instead of falling back to artwork.
  if (GEMINI_KEY) return { data: await geminiImage({ prompt, aspect, reference, business, mode }), source: 'model' };
  return withFallback(
    async () => {
      if (!IMAGE_MODEL) throw new Error('AI_IMAGE_MODEL not set');
      const [w, h] = SIZES[aspect] || SIZES.square;
      const res = await fetch(`${BASE}/images/generations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
        body: JSON.stringify({
          model: IMAGE_MODEL, n: 1, size: `${w}x${h}`, response_format: 'b64_json',
          prompt: `${prompt}. Professional commercial advertising photo for ${business?.name || 'a brand'}${business?.industry ? ` (${business.industry})` : ''}, high quality, clean composition, no text, no letters.`,
        }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) throw new Error(`Image HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const item = (await res.json()).data?.[0] || {};
      if (item.b64_json) return { dataUrl: `data:image/png;base64,${item.b64_json}`, width: w, height: h };
      if (item.url) {
        // Re-encode remote images so the editor canvas stays exportable (no cross-origin taint).
        const img = await fetch(item.url, { signal: AbortSignal.timeout(60_000) });
        const type = img.headers.get('content-type') || 'image/png';
        return { dataUrl: `data:${type};base64,${Buffer.from(await img.arrayBuffer()).toString('base64')}`, width: w, height: h };
      }
      throw new Error('Image response had no data');
    },
    () => fallbackImage({ prompt, aspect, palette, business }),
  );
}

// ---------- Business analysis ----------

const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US'));

function fallbackAnalysis({ business, kpis }) {
  const k = kpis;
  const strengths = [];
  const weaknesses = [];
  const recs = [];
  if (k.margin >= 20) strengths.push(`هامش ربح صحي يبلغ ${k.margin}% في آخر شهر.`);
  else weaknesses.push(`هامش الربح منخفض (${k.margin}%) — المصاريف تستهلك معظم الإيرادات.`);
  if ((k.quarterGrowth ?? 0) > 0) strengths.push(`نمو الإيرادات ربعياً بنسبة ${k.quarterGrowth}% مقارنة بالربع السابق.`);
  else weaknesses.push('الإيرادات الربعية لم تنمُ مقارنة بالربع السابق.');
  if ((k.roas ?? 0) >= 4) strengths.push(`عائد ممتاز على الإنفاق الإعلاني (ROAS ${k.roas}x).`);
  else weaknesses.push(`العائد على الإنفاق الإعلاني ${k.roas ?? '—'}x أقل من المستهدف (4x).`);
  if ((k.followerGrowth ?? 0) > 3) strengths.push(`جمهور متنامٍ على التواصل الاجتماعي (+${k.followerGrowth}% شهرياً).`);
  if (k.engagement < 3) weaknesses.push(`معدل التفاعل ${k.engagement}% منخفض ويحتاج محتوى أقوى.`);
  if (k.conversion != null && k.conversion < 2) weaknesses.push(`معدل التحويل من الزيارات ${k.conversion}% يمكن رفعه.`);

  if (k.margin < 25) recs.push({ title: 'خفض المصاريف التشغيلية', detail: 'راجع أكبر 3 بنود مصاريف وتفاوض مع الموردين على عقود شهرية أو كميات أكبر.', priority: 'عالية', impact: '+3 إلى 6% على هامش الربح' });
  recs.push({ title: 'رفع متوسط قيمة الطلب', detail: `متوسط الطلب الحالي ${fmt(k.aov)}. أضف باقات وعروض "اشترِ 2 واحصل على خصم" ومنتجات مكمّلة عند الدفع.`, priority: 'عالية', impact: '+10% على الإيرادات' });
  if ((k.roas ?? 0) < 5) recs.push({ title: 'تحسين الحملات الإعلانية', detail: 'أوقف الإعلانات الأضعف أداءً، وأعد توجيه الميزانية لأفضل جمهور، واختبر تصميمين لكل حملة (A/B).', priority: 'متوسطة', impact: 'خفض تكلفة اكتساب العميل' });
  recs.push({ title: 'برنامج ولاء للعملاء', detail: 'بطاقة نقاط أو خصم للزيارة الخامسة يرفع معدل تكرار الشراء ويقلل الاعتماد على الإعلانات.', priority: 'متوسطة', impact: '+15% عملاء عائدون' });
  recs.push({ title: 'جدول محتوى ثابت', detail: 'انشر 4 مرات أسبوعياً: منتج، خلف الكواليس، رأي عميل، عرض. استخدم استوديو التصميم لتجهيز شهر كامل.', priority: 'منخفضة', impact: 'رفع التفاعل والوصول' });

  return {
    summary: `${business?.name || 'النشاط'} حقق إيرادات ${fmt(k.revenue)} في ${k.period} بربح ${fmt(k.profit)} وهامش ${k.margin}%. ` +
      `مؤشر صحة النشاط ${k.healthScore}/100. ${(k.revGrowth ?? 0) >= 0 ? 'الاتجاه العام إيجابي' : 'هناك تراجع يحتاج متابعة'} مع فرص واضحة لتحسين الربحية والتسويق.`,
    strengths: strengths.length ? strengths : ['استمرارية في تسجيل البيانات تتيح قرارات مبنية على أرقام.'],
    weaknesses: weaknesses.length ? weaknesses : ['لا توجد نقاط ضعف حرجة حالياً.'],
    opportunities: [
      'التوسع في التسويق عبر المؤثرين المحليين بميزانيات صغيرة.',
      'إطلاق عروض موسمية مرتبطة بالمناسبات القادمة.',
      'تفعيل الطلب عبر واتساب وخدمة التوصيل لزيادة الطلبات.',
    ],
    threats: [
      'ارتفاع تكاليف المواد والإعلانات قد يضغط على الهامش.',
      'دخول منافسين جدد بأسعار أقل في نفس المنطقة.',
    ],
    recommendations: recs.slice(0, 5),
    plan30: [
      { week: 'الأسبوع 1', focus: 'التحليل والتنظيف', actions: ['مراجعة المصاريف', 'إيقاف الإعلانات الضعيفة', 'تحديث هوية العلامة في المنصة'] },
      { week: 'الأسبوع 2', focus: 'المحتوى', actions: ['تصميم 8 منشورات و4 ستوري', 'كتابة نصوص إعلانية لعرضين'] },
      { week: 'الأسبوع 3', focus: 'الحملات', actions: ['إطلاق حملة A/B بتصميمين', 'تفعيل عرض الباقات'] },
      { week: 'الأسبوع 4', focus: 'القياس', actions: ['إدخال أرقام الشهر', 'مقارنة النتائج وإعادة التحليل'] },
    ],
    content_ideas: ['منشور "من وراء الكواليس" لتحضير المنتج', 'آراء العملاء بتصميم اقتباس', 'عرض نهاية الأسبوع', 'سؤال تفاعلي في الستوري', 'فيديو قصير لأكثر منتج مبيعاً'],
  };
}

function fallbackAnalysisEn({ business, kpis: k }) {
  const strengths = [];
  const weaknesses = [];
  const recs = [];
  if (k.margin >= 20) strengths.push(`Healthy profit margin of ${k.margin}% last month.`);
  else weaknesses.push(`Low profit margin (${k.margin}%) — expenses consume most of the revenue.`);
  if ((k.quarterGrowth ?? 0) > 0) strengths.push(`Quarterly revenue grew ${k.quarterGrowth}% vs. the previous quarter.`);
  else weaknesses.push('Quarterly revenue did not grow vs. the previous quarter.');
  if ((k.roas ?? 0) >= 4) strengths.push(`Excellent return on ad spend (ROAS ${k.roas}x).`);
  else weaknesses.push(`Return on ad spend is ${k.roas ?? '—'}x, below the 4x target.`);
  if ((k.followerGrowth ?? 0) > 3) strengths.push(`Growing social audience (+${k.followerGrowth}% per month).`);
  if (k.engagement < 3) weaknesses.push(`Engagement rate of ${k.engagement}% is low and needs stronger content.`);
  if (k.conversion != null && k.conversion < 2) weaknesses.push(`Visit-to-order conversion of ${k.conversion}% can be improved.`);
  if (k.margin < 25) recs.push({ title: 'Cut operating costs', detail: 'Review your three largest expense lines and negotiate monthly or volume contracts with suppliers.', priority: 'High', impact: '+3–6% profit margin' });
  recs.push({ title: 'Increase average order value', detail: `Your average order is ${fmt(k.aov)}. Add bundles, "buy 2 save more" offers and add-ons at checkout.`, priority: 'High', impact: '+10% revenue' });
  if ((k.roas ?? 0) < 5) recs.push({ title: 'Optimize ad campaigns', detail: 'Pause the weakest ads, shift budget to the best audience and A/B test two designs per campaign.', priority: 'Medium', impact: 'Lower acquisition cost' });
  recs.push({ title: 'Launch a loyalty program', detail: 'A points card or a discount on the 5th visit increases repeat purchases and reduces reliance on ads.', priority: 'Medium', impact: '+15% returning customers' });
  recs.push({ title: 'Keep a steady content calendar', detail: 'Post 4 times a week: product, behind the scenes, customer review, offer. Use the studio to prepare a full month.', priority: 'Low', impact: 'Higher engagement and reach' });
  return {
    summary: `${business?.name || 'The business'} made ${fmt(k.revenue)} in revenue in ${k.period} with ${fmt(k.profit)} profit and a ${k.margin}% margin. ` +
      `Business health score is ${k.healthScore}/100. ${(k.revGrowth ?? 0) >= 0 ? 'The overall trend is positive' : 'There is a decline that needs attention'}, with clear room to improve profitability and marketing.`,
    strengths: strengths.length ? strengths : ['Consistent data tracking enables number-driven decisions.'],
    weaknesses: weaknesses.length ? weaknesses : ['No critical weaknesses right now.'],
    opportunities: ['Work with local micro-influencers on small budgets.', 'Launch seasonal offers tied to upcoming occasions.', 'Enable WhatsApp ordering and delivery to grow orders.'],
    threats: ['Rising material and ad costs could squeeze margins.', 'New competitors with lower prices in the same area.'],
    recommendations: recs.slice(0, 5),
    plan30: [
      { week: 'Week 1', focus: 'Review & clean-up', actions: ['Review expenses', 'Pause weak ads', 'Update the brand kit'] },
      { week: 'Week 2', focus: 'Content', actions: ['Design 8 posts and 4 stories', 'Write ad copy for two offers'] },
      { week: 'Week 3', focus: 'Campaigns', actions: ['Launch an A/B campaign with two designs', 'Activate the bundle offer'] },
      { week: 'Week 4', focus: 'Measure', actions: ["Enter the month's numbers", 'Compare results and re-run the analysis'] },
    ],
    content_ideas: ['Behind-the-scenes post of preparing your product', 'Customer review as a quote design', 'Weekend offer', 'Interactive poll in stories', 'Short video of your best seller'],
  };
}

export async function analyzeBusiness({ business, kpis, metrics, lang = 'ar' }) {
  const en = lang === 'en';
  const system = en
    ? `You are an expert business and marketing consultant for small and medium businesses in the Arab world.
Analyze the data and return ONLY valid JSON in English with this shape:
{"summary": "2-3 sentence executive summary", "strengths": ["..."], "weaknesses": ["..."], "opportunities": ["..."], "threats": ["..."],
 "recommendations": [{"title": "...", "detail": "...", "priority": "High|Medium|Low", "impact": "expected impact"}],
 "plan30": [{"week": "Week 1", "focus": "...", "actions": ["..."]}], "content_ideas": ["..."]}
Be specific and use the numbers. 3-5 items per list and 4 weeks in plan30.`
    : `أنت مستشار أعمال وتسويق خبير للشركات الصغيرة والمتوسطة في العالم العربي.
حلّل البيانات وأعد فقط JSON صالحاً بالعربية بهذا الشكل:
{"summary": "ملخص تنفيذي 2-3 جمل", "strengths": ["..."], "weaknesses": ["..."], "opportunities": ["..."], "threats": ["..."],
 "recommendations": [{"title": "...", "detail": "...", "priority": "عالية|متوسطة|منخفضة", "impact": "الأثر المتوقع"}],
 "plan30": [{"week": "الأسبوع 1", "focus": "...", "actions": ["..."]}], "content_ideas": ["..."]}
كن محدداً واستخدم الأرقام. 3-5 عناصر في كل قائمة و4 أسابيع في plan30.`;
  const recent = metrics.slice(-12).map((m) => `${m.period}: revenue ${m.revenue}, expenses ${m.expenses}, orders ${m.orders}, new customers ${m.new_customers}, ad spend ${m.marketing_spend}, followers ${m.followers}, engagement ${m.engagement_rate}%`).join('\n');
  const user = `${businessContext(business)}\n\nKPIs: ${JSON.stringify(kpis)}\n\nMonthly data:\n${recent}`;
  const fallback = () => (en ? fallbackAnalysisEn({ business, kpis }) : fallbackAnalysis({ business, kpis }));
  return withFallback(
    async () => {
      const r = await chatJSON(system, user, { temperature: 0.4 });
      const fb = fallback();
      return Object.fromEntries(Object.keys(fb).map((k) => [k, r[k] ?? fb[k]]));
    },
    fallback,
  );
}

// ---------- Copywriting ----------

function fallbackCopy({ topic, platform, lang, business }) {
  const name = business?.name || (lang === 'en' ? 'our store' : 'متجرنا');
  const city = business?.city || '';
  const tags = [business?.name, business?.industry, city, lang === 'en' ? 'offer' : 'عروض', lang === 'en' ? 'new' : 'جديد']
    .filter(Boolean).map((t) => '#' + String(t).replace(/\s+/g, '_'));
  if (lang === 'en') {
    return {
      captions: [
        `✨ ${topic} — only at ${name}. Don't miss out!`,
        `Your new favorite is here: ${topic}. Visit ${name} today 🤍`,
        `Limited time! ${topic}. Tag someone who needs to see this 👇`,
      ],
      hashtags: tags,
      ad: { headline: topic.slice(0, 40), primary_text: `${topic}. Experience the difference at ${name}.`, cta: 'Order now' },
    };
  }
  return {
    captions: [
      `✨ ${topic} — فقط في ${name}. لا تفوّتوا الفرصة!`,
      `جديدنا وصل 🤍 ${topic}. زورونا اليوم${city ? ' في ' + city : ''} وخلّيكم أول الناس!`,
      `لفترة محدودة ⏳ ${topic}. منشن صاحبك اللي لازم يشوف هذا 👇`,
    ],
    hashtags: tags,
    ad: { headline: topic.slice(0, 40), primary_text: `${topic}. جرّب الفرق مع ${name} واطلب الآن عبر الرسائل.`, cta: 'اطلب الآن' },
  };
}

export async function writeCopy({ topic, platform, tone, lang = 'ar', business }) {
  const system = `أنت كاتب محتوى إعلاني محترف للسوشال ميديا. أعد فقط JSON صالحاً:
{"captions": ["3 نصوص منشورات مختلفة مع إيموجي مناسب"], "hashtags": ["#..."], "ad": {"headline": "...", "primary_text": "...", "cta": "..."}}
اللغة: ${lang === 'en' ? 'English' : 'العربية بلهجة قريبة من الجمهور'}. المنصة: ${platform}. النبرة: ${tone || business?.tone || 'ودودة'}. 8-12 هاشتاغ.`;
  const user = `${businessContext(business)}\n\nالموضوع: ${topic}`;
  return withFallback(
    async () => {
      const r = await chatJSON(system, user, { temperature: 0.9 });
      const fb = fallbackCopy({ topic, platform, lang, business });
      return { captions: r.captions?.length ? r.captions : fb.captions, hashtags: r.hashtags?.length ? r.hashtags : fb.hashtags, ad: r.ad || fb.ad };
    },
    () => fallbackCopy({ topic, platform, lang, business }),
  );
}
