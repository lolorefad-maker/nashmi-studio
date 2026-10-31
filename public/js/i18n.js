// Interface language. Arabic is the source language; English is applied by translating the rendered DOM
// (text, placeholders, tooltips) through a dictionary, plus patterns for strings that carry numbers or names.
import EN from './i18n-en.js';

const read = () => { try { return localStorage.getItem('ns_lang'); } catch { return null; } };
export const LANG = read() === 'en' ? 'en' : 'ar';
export const isEn = LANG === 'en';
export const LOCALE = isEn ? 'en-US' : 'ar-u-nu-latn';

export function setLang(lang) {
  try { localStorage.setItem('ns_lang', lang); } catch { /* storage unavailable */ }
  location.reload();
}

const norm = (s) => s.replace(/\s+/g, ' ').trim();
const word = (s) => EN[norm(s)] ?? s;

const PATTERNS = [
  [/^قبل (\d+) د$/, '$1m ago'], [/^قبل (\d+) س$/, '$1h ago'], [/^قبل (\d+) يوم$/, '$1d ago'],
  [/^صباح الخير، (.+)$/, 'Good morning, $1'], [/^مساء الخير، (.+)$/, 'Good evening, $1'],
  [/^لشهر (.+)$/, 'for $1'],
  [/^باقة (.+)$/, (m, p) => `${word(p)} plan`],
  [/^أولوية (.+)$/, (m, p) => `${word(p)} priority`],
  [/^صيغة (\d+)$/, 'Version $1'],
  [/^(\d+) تصميم · (\d+) هذا الشهر$/, '$1 designs · $2 this month'],
  [/^آخر (\d+) شهر · (.+)$/, 'Last $1 months · $2'],
  [/^آخر تحديث: (.+) · (\d+) شهر من البيانات$/, 'Last update: $1 · $2 months of data'],
  [/^(\d+) من (\d+) مقاعد في باقة (.+)$/, (m, a, b, p) => `${a} of ${b} seats on the ${word(p)} plan`],
  [/^تملك (\d+) من (\d+) علامات متاحة في باقتك$/, 'You own $1 of $2 brands allowed on your plan'],
  [/^فريق (.+)$/, '$1 team'],
  [/^(\d+) عميل$/, '$1 clients'],
  [/^(\d+) تصميم محفوظ — .+$/, '$1 saved designs — open any design to edit or download'],
  [/^تم استيراد (\d+) شهر$/, 'Imported $1 months'],
  [/^✓ تم استيراد (\d+) شهر(?: · تخطّي (\d+) صف بدون شهر صالح)?$/, (m, a, b) => `✓ Imported ${a} months${b ? ` · skipped ${b} rows without a valid month` : ''}`],
  [/^تمت مزامنة (\d+) شهر$/, 'Synced $1 months'],
  [/^الحالة: (.+)$/, (m, p) => `Status: ${word(p)}`],
  [/^تعديل بيانات (.+)$/, 'Edit data for $1'],
  [/^سيتم حذف بيانات (.+) نهائياً\.$/, 'Data for $1 will be permanently deleted.'],
  [/^متصل بالنموذج: (.+)$/, 'Connected to model: $1'],
  [/^النموذج متصل · (.+)$/, 'Model connected · $1'],
  [/^نموذج الذكاء الاصطناعي: متصل \((.+)\)$/, 'AI model: connected ($1)'],
  [/^نموذج الذكاء الاصطناعي: وضع تجريبي$/, 'AI model: demo mode'],
  [/^باقتك تسمح بـ (\d+) علامة تجارية — قم بالترقية لإضافة المزيد$/, 'Your plan allows $1 brands — upgrade to add more'],
  [/^باقتك تسمح بـ (\d+) أعضاء لكل علامة — قم بالترقية$/, 'Your plan allows $1 members per brand — upgrade'],
  [/^متصل بصفحة (.+)$/, 'Connected to page $1'],
  [/^انستغرام: @(.+?) · المنشورات المجدولة تُنشر تلقائياً في موعدها$/, 'Instagram: @$1 · scheduled posts publish automatically on time'],
  [/^انستغرام: @(.+)$/, 'Instagram: @$1'],
  [/^تمت دعوتك للانضمام إلى فريق (.+) \((مشاهد|محرر)\)$/, (m, b, r) => `You've been invited to join the ${b} team (${word(r)})`],
  [/^تم الإرسال عبر: (.+)$/, (m, p) => `Sent via: ${p.split(' و ').map(word).join(' and ')}`],
  [/^طلب الترقية$/, 'Request upgrade'], [/^طلب التغيير$/, 'Request change'],
  [/^(.*) · عميل منذ (.+)$/, '$1 · Client since $2'],
  [/^بمتوسط (.+)$/, 'avg $1'], [/^ربح (.+)$/, 'profit $1'],
  [/^(.+) هذا الشهر$/, '$1 this month'],
  [/^تقرير PDF بأرقام الشهر والتوصيات، يُرسل تلقائياً أول كل شهر(?: · آخر إرسال: (.+))?$/, (m, d) => `A PDF report with the month's numbers and recommendations, sent automatically on the 1st${d ? ` · last sent: ${d}` : ''}`],
  [/^لديك (\d+) نقطة · تصميم = 1 · نص = 1 · تحليل = 3$/, 'You have $1 credits · design = 1 · copy = 1 · analysis = 3'],
  [/^عملاء جدد$/, 'New customers'],
  [/^متبقي (\d+) من (\d+) صور هذا الشهر$/, '$1 of $2 images left this month'],
  [/^وصلت للحد الشهري لباقتك \((\d+) صور\) — قم بالترقية لصور أكثر$/, "You've reached your plan's monthly limit ($1 images) — upgrade for more"],
  [/^(.+) — (.+)$/, (m, a, b) => (EN[a] && EN[b] ? `${EN[a]} — ${EN[b]}` : null)],
  [/^آخر مزامنة: (.+)$/, (m, p) => `Last sync: ${word(p)}`],
  [/^متصل · (.+)$/, 'Connected · $1'],
  [/^⚠️ خطأ في آخر مزامنة · (.+)$/, '⚠️ Last sync failed · $1'],
  [/^(.+) · العلامة الحالية$/, (m, r) => `${word(r)} · current brand`],
  [/^(\d+) نقطة$/, '$1 credits'],
  [/^ستفقد الوصول إلى (.+)\.$/, 'You will lose access to $1.'],
  [/^سيتم حذف "(.+)" مع كل تصاميمها وبياناتها ومنشوراتها\. لا يمكن التراجع\.$/, '"$1" will be deleted with all its designs, data and posts. This cannot be undone.'],
  [/^التقرير الشهري — (.+)$/, 'Monthly report — $1'],
  [/^التقرير الشهري · (.+)$/, 'Monthly report · $1'],
  [/^تم استيراد (\d+) شهر/, 'Imported $1 months'],
];

export function t(s) {
  if (!isEn || s == null) return s;
  const key = norm(String(s));
  if (!key || !/[؀-ۿ]/.test(key)) return s;
  if (EN[key] != null) return EN[key];
  for (const [re, rep] of PATTERNS) {
    if (!re.test(key)) continue;
    const out = typeof rep === 'function' ? key.replace(re, rep) : key.replace(re, rep);
    if (out && out !== 'null') return out;
  }
  return s;
}

const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'CODE', 'CANVAS']);
const ATTRS = ['placeholder', 'title', 'aria-label', 'data-tip', 'alt'];

function translateText(node) {
  const raw = node.nodeValue;
  if (!raw || !/[؀-ۿ]/.test(raw)) return;
  const parent = node.parentElement;
  if (!parent || SKIP.has(parent.tagName) || parent.closest('[data-no-i18n]')) return;
  const out = t(raw);
  if (out === raw) return;
  // Options without a value submit their text: keep the original Arabic as the value.
  if (parent.tagName === 'OPTION' && !parent.hasAttribute('value')) parent.setAttribute('value', norm(raw));
  const lead = raw.match(/^\s*/)[0];
  const trail = raw.match(/\s*$/)[0];
  node.nodeValue = lead + out + trail;
}

function translateEl(el) {
  for (const a of ATTRS) {
    const v = el.getAttribute?.(a);
    if (!v || !/[؀-ۿ]/.test(v)) continue;
    const out = t(v);
    // setAttribute queues a mutation even for an identical value, which would re-trigger the observer forever.
    if (out !== v) el.setAttribute(a, out);
  }
}

export function translateDom(root = document.body) {
  if (!isEn || !root) return;
  if (root.nodeType === Node.TEXT_NODE) return translateText(root);
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  translateEl(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) translateText(n);
    else translateEl(n);
  }
}

export function startI18n() {
  document.documentElement.lang = LANG;
  document.documentElement.dir = isEn ? 'ltr' : 'rtl';
  if (!isEn) return;
  document.title = t(document.title);
  translateDom(document.body);
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'characterData') translateText(r.target);
      else if (r.type === 'attributes') translateEl(r.target);
      else r.addedNodes.forEach((n) => translateDom(n));
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}

// Small toggle button markup used by every page.
export const langToggleLabel = isEn ? 'العربية' : 'English';
