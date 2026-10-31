// AI-built business systems (tables + records) and the workflow automation engine that acts on them.
import { one, all, run, notify, logActivity } from './db.js';
import { complete } from './llm.js';
import { computeKpis } from './analytics.js';
import { businessContext } from './ai.js';
import { mailEnabled, sendMail, whatsappEnabled, sendWhatsApp, emailLayout } from './mailer.js';

// ---------- Systems (apps) ----------
export const FIELD_TYPES = ['text', 'longtext', 'number', 'money', 'date', 'select', 'phone', 'email', 'boolean'];
const ICONS = ['boxes', 'package', 'users', 'user-round', 'receipt', 'truck', 'clipboard-list', 'briefcase', 'calendar', 'wallet',
  'shopping-cart', 'store', 'wrench', 'graduation-cap', 'stethoscope', 'building-2', 'utensils', 'scissors', 'car', 'hammer', 'folder-kanban', 'list-checks'];

const slug = (s, i) => (String(s || '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || `f${i}`).slice(0, 40);
const str = (v, max) => (v == null ? '' : String(v)).trim().slice(0, max);

export function validateSpec(spec) {
  if (!spec || typeof spec !== 'object') throw new Error('مواصفات النظام غير صالحة');
  const name = str(spec.name, 60);
  if (!name) throw new Error('اسم النظام مطلوب');
  const tables = (Array.isArray(spec.tables) ? spec.tables : []).slice(0, 8).map((t, ti) => {
    const seen = new Set();
    const fields = (Array.isArray(t.fields) ? t.fields : []).slice(0, 20).map((f, fi) => {
      let key = slug(f.key || f.label, fi);
      while (seen.has(key)) key = `${key}_${fi}`;
      seen.add(key);
      const type = FIELD_TYPES.includes(f.type) ? f.type : 'text';
      return {
        key, type, label: str(f.label || f.key, 60) || key, required: Boolean(f.required),
        ...(type === 'select' ? { options: (Array.isArray(f.options) ? f.options : []).map((o) => str(o, 60)).filter(Boolean).slice(0, 20) } : {}),
      };
    }).filter((f) => f.type !== 'select' || f.options.length);
    return { key: slug(t.key || t.name, ti), name: str(t.name || t.key, 60) || `جدول ${ti + 1}`, fields };
  }).filter((t) => t.fields.length);
  if (!tables.length) throw new Error('النظام يحتاج جدولاً واحداً على الأقل فيه حقول');
  return { name, description: str(spec.description, 300), icon: ICONS.includes(spec.icon) ? spec.icon : 'boxes', tables };
}

export function coerce(fields, data = {}) {
  const out = {};
  for (const f of fields) {
    let v = data[f.key];
    if (v === undefined || v === null || v === '') {
      if (f.required) throw new Error(`الحقل "${f.label}" مطلوب`);
      continue;
    }
    if (f.type === 'number' || f.type === 'money') {
      v = Number(String(v).replace(/[^\d.-]/g, ''));
      if (!Number.isFinite(v)) throw new Error(`"${f.label}" يجب أن يكون رقماً`);
    } else if (f.type === 'boolean') v = v === true || v === 'true' || v === 1 || v === '1' || v === 'نعم';
    else if (f.type === 'date') v = str(v, 10);
    else v = str(v, f.type === 'longtext' ? 5000 : 500);
    out[f.key] = v;
  }
  return out;
}

export const getApp = (bizId, id) => {
  const a = one('SELECT * FROM apps WHERE id = ? AND business_id = ?', id, bizId);
  return a ? { ...a, schema: JSON.parse(a.schema) } : null;
};

export function findApp(bizId, ref) {
  if (ref == null) return null;
  if (Number.isInteger(Number(ref)) && getApp(bizId, Number(ref))) return getApp(bizId, Number(ref));
  const row = one('SELECT id FROM apps WHERE business_id = ? AND name = ? ORDER BY id DESC LIMIT 1', bizId, String(ref).trim());
  return row ? getApp(bizId, row.id) : null;
}

export function createApp(bizId, userId, spec) {
  const s = validateSpec(spec);
  const { lastInsertRowid } = run('INSERT INTO apps (business_id, name, description, icon, schema, created_by) VALUES (?, ?, ?, ?, ?, ?)',
    bizId, s.name, s.description, s.icon, JSON.stringify({ tables: s.tables }), userId);
  logActivity(userId, 'system_create', { name: s.name }, bizId);
  return Number(lastInsertRowid);
}

export function insertRecord(app, tableKey, data, userId, { depth = 0 } = {}) {
  const table = app.schema.tables.find((t) => t.key === tableKey);
  if (!table) throw new Error('الجدول غير موجود في هذا النظام');
  const clean = coerce(table.fields, data);
  const { lastInsertRowid } = run('INSERT INTO app_records (app_id, table_key, data, created_by) VALUES (?, ?, ?, ?)',
    app.id, tableKey, JSON.stringify(clean), userId);
  run("UPDATE apps SET updated_at = datetime('now') WHERE id = ?", app.id);
  // Fire "record created" automations without blocking the caller; depth stops record→workflow→record loops.
  if (depth < 2) {
    const record = { id: Number(lastInsertRowid), ...clean };
    setImmediate(() => triggerRecordCreated(app, tableKey, record, depth + 1).catch((e) => console.error('[workflow]', e.message)));
  }
  return Number(lastInsertRowid);
}

// Compact description of every system for the assistant's context (with recent rows so it can analyze real data).
export function systemsContext(bizId, { rowsPerTable = 25, maxChars = 9000 } = {}) {
  const apps = all('SELECT * FROM apps WHERE business_id = ? ORDER BY id', bizId);
  if (!apps.length) return 'لا توجد أنظمة بعد.';
  let out = '';
  for (const a of apps) {
    const { tables } = JSON.parse(a.schema);
    out += `\n# نظام "${a.name}" (id ${a.id})${a.description ? ` — ${a.description}` : ''}\n`;
    for (const t of tables) {
      const count = one('SELECT COUNT(*) n FROM app_records WHERE app_id = ? AND table_key = ?', a.id, t.key).n;
      const rows = all('SELECT id, data, created_at FROM app_records WHERE app_id = ? AND table_key = ? ORDER BY id DESC LIMIT ?', a.id, t.key, rowsPerTable)
        .map((r) => ({ id: r.id, ...JSON.parse(r.data), _created: r.created_at.slice(0, 10) }));
      out += `- جدول ${t.name} [key: ${t.key}] (${count} سجل) حقول: ${t.fields.map((f) => `${f.key}:${f.type}${f.options ? `(${f.options.join('/')})` : ''}`).join(', ')}\n`;
      if (rows.length) out += `  آخر السجلات: ${JSON.stringify(rows)}\n`;
      if (out.length > maxChars) return `${out.slice(0, maxChars)}\n…(اختُصرت البيانات)`;
    }
  }
  return out;
}

// ---------- Workflows ----------
const STEP_TYPES = ['ai', 'notify', 'email', 'whatsapp', 'create_record', 'webhook'];

export function validateWorkflow(bizId, spec) {
  if (!spec || typeof spec !== 'object') throw new Error('مواصفات الأتمتة غير صالحة');
  const name = str(spec.name, 80);
  if (!name) throw new Error('اسم الأتمتة مطلوب');
  const t = spec.trigger || {};
  let trigger;
  if (t.type === 'schedule') {
    trigger = { type: 'schedule', every: ['day', 'week', 'month'].includes(t.every) ? t.every : 'day',
      hour: Math.min(23, Math.max(0, Number(t.hour) || 9)), weekday: Math.min(6, Math.max(0, Number(t.weekday) || 0)), day: Math.min(28, Math.max(1, Number(t.day) || 1)) };
  } else if (t.type === 'record_created') {
    const app = findApp(bizId, t.app_id ?? t.app);
    if (!app) throw new Error(`النظام "${t.app}" غير موجود — أنشئ النظام أولاً`);
    const table = app.schema.tables.find((x) => x.key === t.table || x.name === t.table) || app.schema.tables[0];
    trigger = { type: 'record_created', app_id: app.id, app: app.name, table: table.key };
  } else trigger = { type: 'manual' };

  const steps = (Array.isArray(spec.steps) ? spec.steps : []).slice(0, 10).filter((s) => STEP_TYPES.includes(s?.type)).map((s) => {
    const base = { type: s.type };
    if (s.type === 'ai') return { ...base, prompt: str(s.prompt, 2000) };
    if (s.type === 'notify') return { ...base, message: str(s.message, 1000) };
    if (s.type === 'email') return { ...base, to: str(s.to || '{{owner_email}}', 200), subject: str(s.subject, 200), body: str(s.body, 4000) };
    if (s.type === 'whatsapp') return { ...base, to: str(s.to, 30), text: str(s.text, 1000) };
    if (s.type === 'webhook') {
      if (!/^https:\/\//.test(s.url || '')) throw new Error('رابط الـ webhook يجب أن يبدأ بـ https://');
      return { ...base, url: str(s.url, 500) };
    }
    const app = findApp(bizId, s.app_id ?? s.app);
    if (!app) throw new Error(`النظام "${s.app}" غير موجود — أنشئ النظام أولاً`);
    const table = app.schema.tables.find((x) => x.key === s.table || x.name === s.table) || app.schema.tables[0];
    return { ...base, app_id: app.id, app: app.name, table: table.key, values: s.values && typeof s.values === 'object' ? s.values : {} };
  });
  if (!steps.length) throw new Error('الأتمتة تحتاج خطوة واحدة على الأقل');
  return { name, description: str(spec.description, 300), trigger, steps };
}

export function nextRun(trigger, from = new Date()) {
  if (trigger.type !== 'schedule') return null;
  const d = new Date(from);
  d.setMinutes(0, 0, 0);
  d.setHours(trigger.hour);
  if (trigger.every === 'day') { if (d <= from) d.setDate(d.getDate() + 1); }
  if (trigger.every === 'week') { d.setDate(d.getDate() + ((trigger.weekday - d.getDay() + 7) % 7)); if (d <= from) d.setDate(d.getDate() + 7); }
  if (trigger.every === 'month') { d.setDate(trigger.day); if (d <= from) d.setMonth(d.getMonth() + 1); }
  return d.toISOString();
}

export function createWorkflow(bizId, userId, spec) {
  const w = validateWorkflow(bizId, spec);
  const { lastInsertRowid } = run('INSERT INTO workflows (business_id, name, description, trigger, steps, next_run_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
    bizId, w.name, w.description, JSON.stringify(w.trigger), JSON.stringify(w.steps), nextRun(w.trigger), userId);
  logActivity(userId, 'workflow_create', { name: w.name }, bizId);
  return Number(lastInsertRowid);
}

const render = (tpl, vars) => String(tpl ?? '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, path) => {
  const v = path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), vars);
  return v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
});

export async function runWorkflow(wf, { record = null, depth = 0 } = {}) {
  const biz = one('SELECT * FROM businesses WHERE id = ?', wf.business_id);
  const owner = one('SELECT id, email, credits FROM users WHERE id = ?', biz.user_id);
  const kpis = computeKpis(all('SELECT * FROM metrics WHERE business_id = ? ORDER BY period', biz.id)) || {};
  const vars = { business: biz.name, date: new Date().toLocaleDateString('ar-u-nu-latn'), owner_email: owner.email, kpi: kpis, record: record || {}, ai: '' };
  const steps = JSON.parse(wf.steps);
  const log = [];
  let status = 'ok';
  for (const [i, s] of steps.entries()) {
    try {
      if (s.type === 'ai') {
        const { changes } = run('UPDATE users SET credits = credits - 1 WHERE id = ? AND credits >= 1', owner.id);
        if (!changes) throw new Error('رصيد النقاط غير كافٍ');
        try {
          const { text } = await complete({
            system: `أنت مساعد أعمال ينفّذ مهمة ضمن أتمتة اسمها "${wf.name}". أجب بإيجاز ووضوح بالعربية ما لم يُطلب غير ذلك.\n${businessContext(biz)}\nالمؤشرات: ${JSON.stringify(kpis)}`,
            messages: [{ role: 'user', content: render(s.prompt, vars) }], temperature: 0.5,
          });
          vars.ai = text.trim().slice(0, 6000);
          run("INSERT INTO ai_usage (user_id, business_id, kind, source) VALUES (?, ?, 'workflow', 'model')", owner.id, biz.id);
        } catch (err) {
          run('UPDATE users SET credits = credits + 1 WHERE id = ?', owner.id);
          throw err;
        }
        log.push({ step: i + 1, type: s.type, ok: true, output: vars.ai.slice(0, 500) });
      } else if (s.type === 'notify') {
        const msg = render(s.message, vars);
        notify(biz.id, wf.name, msg, '#/automations');
        log.push({ step: i + 1, type: s.type, ok: true, output: msg.slice(0, 300) });
      } else if (s.type === 'email') {
        if (!mailEnabled()) throw new Error('البريد غير مُعدّ على الخادم');
        const to = render(s.to, vars);
        await sendMail({ to, subject: render(s.subject, vars), html: emailLayout({ title: render(s.subject, vars), body: render(s.body, vars).replace(/\n/g, '<br>') }) });
        log.push({ step: i + 1, type: s.type, ok: true, output: `→ ${to}` });
      } else if (s.type === 'whatsapp') {
        if (!whatsappEnabled()) throw new Error('واتساب غير مُعدّ على الخادم');
        await sendWhatsApp(render(s.to, vars), render(s.text, vars));
        log.push({ step: i + 1, type: s.type, ok: true, output: `→ ${render(s.to, vars)}` });
      } else if (s.type === 'create_record') {
        const app = getApp(biz.id, s.app_id);
        if (!app) throw new Error('النظام المرتبط محذوف');
        const values = Object.fromEntries(Object.entries(s.values || {}).map(([k, v]) => [k, render(v, vars)]));
        const id = insertRecord(app, s.table, values, owner.id, { depth: depth + 1 });
        log.push({ step: i + 1, type: s.type, ok: true, output: `${app.name} #${id}` });
      } else if (s.type === 'webhook') {
        const res = await fetch(s.url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workflow: wf.name, business: biz.name, record, ai: vars.ai, kpi: kpis }), signal: AbortSignal.timeout(10_000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        log.push({ step: i + 1, type: s.type, ok: true, output: `HTTP ${res.status}` });
      }
    } catch (err) {
      status = 'error';
      log.push({ step: i + 1, type: s.type, ok: false, output: err.message.slice(0, 300) });
      break;
    }
  }
  run('INSERT INTO workflow_runs (workflow_id, status, log) VALUES (?, ?, ?)', wf.id, status, JSON.stringify(log));
  run("UPDATE workflows SET runs = runs + 1, last_run_at = datetime('now'), next_run_at = ? WHERE id = ?", nextRun(JSON.parse(wf.trigger)), wf.id);
  if (status === 'error') notify(biz.id, `تعذّر تنفيذ الأتمتة: ${wf.name}`, log.at(-1)?.output, '#/automations');
  return { status, log };
}

async function triggerRecordCreated(app, tableKey, record, depth) {
  for (const wf of all("SELECT * FROM workflows WHERE business_id = ? AND enabled = 1 AND json_extract(trigger, '$.type') = 'record_created'", app.business_id)) {
    const t = JSON.parse(wf.trigger);
    if (t.app_id === app.id && t.table === tableKey) await runWorkflow(wf, { record, depth });
  }
}

export async function runDueWorkflows() {
  for (const wf of all('SELECT * FROM workflows WHERE enabled = 1 AND next_run_at IS NOT NULL AND next_run_at <= ?', new Date().toISOString())) {
    await runWorkflow(wf).catch((err) => console.error('[workflow]', wf.name, err.message));
  }
}
