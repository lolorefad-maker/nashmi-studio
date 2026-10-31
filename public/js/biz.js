// Shared UI for the assistant, systems and automations: sub-navigation, markdown, and proposal cards.
import { esc, api, toast, icons, withBtn } from './core.js';

export const subnav = (active) => `
  <nav class="subnav glass">
    <a href="#/assistant" class="${active === 'assistant' ? 'active' : ''}"><i data-lucide="bot"></i>المحادثة</a>
    <a href="#/apps" class="${active === 'apps' ? 'active' : ''}"><i data-lucide="database"></i>الأنظمة</a>
    <a href="#/automations" class="${active === 'automations' ? 'active' : ''}"><i data-lucide="workflow"></i>الأتمتة</a>
  </nav>`;

export const FIELD_LABEL = { text: 'نص', longtext: 'نص طويل', number: 'رقم', money: 'مبلغ', date: 'تاريخ', select: 'قائمة', phone: 'هاتف', email: 'بريد', boolean: 'نعم/لا' };
export const STEP_INFO = {
  ai: ['sparkles', 'تحليل بالذكاء الاصطناعي'], notify: ['bell', 'تنبيه داخل المنصة'], email: ['mail', 'إرسال بريد'],
  whatsapp: ['message-circle', 'رسالة واتساب'], create_record: ['database', 'إضافة سجل'], webhook: ['webhook', 'إرسال إلى رابط خارجي'],
};
const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export function describeTrigger(t = {}) {
  if (t.type === 'schedule') {
    const at = `الساعة ${t.hour}:00`;
    if (t.every === 'week') return `كل أسبوع يوم ${DAYS[t.weekday ?? 0]} ${at}`;
    if (t.every === 'month') return `كل شهر يوم ${t.day ?? 1} ${at}`;
    return `كل يوم ${at}`;
  }
  if (t.type === 'record_created') return `عند إضافة سجل جديد في "${t.app}"${t.table ? ` (${t.table})` : ''}`;
  return 'تشغيل يدوي';
}

export const stepDetail = (s) => s.prompt || s.message || (s.subject ? `${s.subject} → ${s.to}` : '') || s.text || s.url || (s.app ? `${s.app} / ${s.table}` : '');

export function markdown(text) {
  const html = window.marked ? window.marked.parse(text || '', { breaks: true, gfm: true }) : esc(text).replace(/\n/g, '<br>');
  return window.DOMPurify ? window.DOMPurify.sanitize(html) : esc(text);
}

// ---------- Proposal cards (```nashmi-app / workflow / records blocks) ----------
const BLOCK = /```nashmi-(app|workflow|records)\s*([\s\S]*?)(```|$)/g;
const proposals = new Map();
let seq = 0;

function card(kind, raw, known) {
  let spec;
  try { spec = JSON.parse(raw.trim()); } catch { return `<div class="proposal"><b>تعذّر قراءة التصميم المقترح</b></div>`; }
  const id = `p${++seq}`;
  proposals.set(id, { kind, spec });
  if (kind === 'app') {
    const existing = known.apps.get(spec.name);
    return `<div class="proposal" data-pid="${id}">
      <div class="head"><span class="icon-chip"><i data-lucide="${esc(spec.icon || 'boxes')}"></i></span>
        <div class="spacer"><b>${esc(spec.name)}</b><div class="muted small">${esc(spec.description || 'نظام لإدارة عملك')}</div></div><span class="badge gold">نظام</span></div>
      <div class="tables">${(spec.tables || []).map((t) => `<div class="tbl"><b>${esc(t.name)}</b><div class="chips">${(t.fields || []).map((f) =>
        `<span class="chip" style="cursor:default;padding:4px 10px;font-size:12px">${esc(f.label || f.key)} <span class="muted">· ${FIELD_LABEL[f.type] || f.type}</span></span>`).join('')}</div></div>`).join('')}</div>
      ${existing ? `<a class="btn sm" href="#/apps/${existing}"><i data-lucide="external-link"></i>فتح النظام</a>`
        : '<button class="btn gold sm" data-create><i data-lucide="hammer"></i>إنشاء النظام</button>'}
    </div>`;
  }
  if (kind === 'workflow') {
    const existing = known.workflows.has(spec.name);
    return `<div class="proposal" data-pid="${id}">
      <div class="head"><span class="icon-chip"><i data-lucide="workflow"></i></span>
        <div class="spacer"><b>${esc(spec.name)}</b><div class="muted small">${esc(spec.description || '')}</div></div><span class="badge gold">أتمتة</span></div>
      <p class="small" style="margin:0 0 6px"><i data-lucide="zap" style="width:14px;vertical-align:-2px;color:var(--gold)"></i> ${esc(describeTrigger(spec.trigger))}</p>
      <ol class="steps">${(spec.steps || []).map((s) => {
        const [ic, label] = STEP_INFO[s.type] || ['circle', s.type];
        return `<li><i data-lucide="${ic}"></i><div><b>${label}</b><div class="muted small">${esc(stepDetail(s)).slice(0, 220)}</div></div></li>`;
      }).join('')}</ol>
      ${existing ? '<a class="btn sm" href="#/automations"><i data-lucide="external-link"></i>عرض الأتمتة</a>'
        : '<button class="btn gold sm" data-create><i data-lucide="play"></i>تفعيل الأتمتة</button>'}
    </div>`;
  }
  const rows = Array.isArray(spec.records) ? spec.records : [];
  const cols = [...new Set(rows.flatMap((x) => Object.keys(x)))].slice(0, 6);
  return `<div class="proposal" data-pid="${id}">
    <div class="head"><span class="icon-chip"><i data-lucide="table-2"></i></span>
      <div class="spacer"><b>${rows.length} سجل لـ ${esc(spec.app)}</b><div class="muted small">جدول ${esc(spec.table)}</div></div><span class="badge gold">بيانات</span></div>
    <div class="table-wrap"><table class="table"><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>
      <tbody>${rows.slice(0, 5).map((x) => `<tr>${cols.map((c) => `<td>${esc(x[c] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    ${rows.length > 5 ? `<p class="muted small">و${rows.length - 5} سجل آخر…</p>` : ''}
    <button class="btn gold sm" data-create style="margin-top:10px"><i data-lucide="plus"></i>إضافة السجلات</button>
  </div>`;
}

const PENDING = { app: 'جاري تصميم النظام…', workflow: 'جاري تصميم الأتمتة…', records: 'جاري تجهيز البيانات…' };

// Turns an assistant answer into HTML; unfinished blocks show a placeholder while streaming.
export function renderAnswer(text, { final = true, known = { apps: new Map(), workflows: new Set() } } = {}) {
  let html = '';
  let last = 0;
  for (const m of text.matchAll(BLOCK)) {
    html += markdown(text.slice(last, m.index));
    html += final && m[3] ? card(m[1], m[2], known)
      : `<div class="proposal pending"><span class="small"><i data-lucide="loader" style="width:14px;vertical-align:-2px"></i> ${PENDING[m[1]]}</span></div>`;
    last = m.index + m[0].length;
  }
  return html + markdown(text.slice(last));
}

// One delegated handler for every "create" button inside proposals.
export function bindProposals(root, { onCreated } = {}) {
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('.proposal [data-create]');
    if (!btn) return;
    const box = btn.closest('.proposal');
    const p = proposals.get(box.dataset.pid);
    if (!p) return;
    withBtn(btn, async () => {
      if (p.kind === 'app') {
        const { id } = await api('/biz/apps', { method: 'POST', body: { spec: p.spec } });
        btn.outerHTML = `<a class="btn sm primary" href="#/apps/${id}"><i data-lucide="external-link"></i>فتح النظام</a>`;
        toast(`تم إنشاء نظام "${p.spec.name}" ✓`);
      } else if (p.kind === 'workflow') {
        await api('/biz/automations', { method: 'POST', body: { spec: p.spec } });
        btn.outerHTML = '<a class="btn sm primary" href="#/automations"><i data-lucide="external-link"></i>عرض الأتمتة</a>';
        toast('تم تفعيل الأتمتة ✓');
      } else {
        const res = await api('/biz/records/bulk', { method: 'POST', body: p.spec });
        btn.outerHTML = `<a class="btn sm primary" href="#/apps/${res.app_id}"><i data-lucide="check"></i>تمت إضافة ${res.added} سجل</a>`;
        if (res.errors.length) toast(res.errors[0], 'err');
      }
      icons();
      onCreated?.(p);
    });
  });
}

export async function knownItems() {
  const [apps, workflows] = await Promise.all([api('/biz/apps'), api('/biz/automations')]);
  return { apps: new Map(apps.map((a) => [a.name, a.id])), workflows: new Set(workflows.map((w) => w.name)) };
}
