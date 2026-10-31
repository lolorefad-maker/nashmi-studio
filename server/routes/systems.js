// AI-built systems (apps with tables/records), automations and in-app notifications.
import { Router } from 'express';
import { one, all, run } from '../db.js';
import { requireAuth } from '../auth.js';
import { requireBusiness, requireEditor } from '../context.js';
import { sendWorkbook } from '../excel.js';
import { getApp, findApp, createApp, insertRecord, validateSpec, coerce, createWorkflow, runWorkflow, nextRun } from '../systems.js';

const r = Router();
r.use(requireAuth, requireBusiness);
const fail = (res, err, code = 400) => res.status(code).json({ error: err.message });

// ---------- Systems ----------
r.get('/apps', (req, res) => {
  res.json(all('SELECT id, name, description, icon, schema, updated_at FROM apps WHERE business_id = ? ORDER BY updated_at DESC', req.biz.id).map((a) => {
    const { tables } = JSON.parse(a.schema);
    const counts = Object.fromEntries(all('SELECT table_key, COUNT(*) n FROM app_records WHERE app_id = ? GROUP BY table_key', a.id).map((c) => [c.table_key, c.n]));
    return { ...a, schema: undefined, tables: tables.map((t) => ({ key: t.key, name: t.name, fields: t.fields.length, records: counts[t.key] || 0 })) };
  }));
});

r.post('/apps', requireEditor, (req, res) => {
  try { res.status(201).json({ id: createApp(req.biz.id, req.user.id, req.body?.spec || req.body) }); } catch (err) { fail(res, err); }
});

r.get('/apps/:id', (req, res) => {
  const app = getApp(req.biz.id, req.params.id);
  if (!app) return res.status(404).json({ error: 'النظام غير موجود' });
  res.json(app);
});

r.put('/apps/:id', requireEditor, (req, res) => {
  const app = getApp(req.biz.id, req.params.id);
  if (!app) return res.status(404).json({ error: 'النظام غير موجود' });
  try {
    const s = validateSpec({ ...req.body, name: req.body?.name || app.name, tables: req.body?.tables || app.schema.tables });
    run("UPDATE apps SET name = ?, description = ?, icon = ?, schema = ?, updated_at = datetime('now') WHERE id = ?", s.name, s.description, s.icon, JSON.stringify({ tables: s.tables }), app.id);
    res.json({ ok: true });
  } catch (err) { fail(res, err); }
});

r.delete('/apps/:id', requireEditor, (req, res) => {
  run('DELETE FROM apps WHERE id = ? AND business_id = ?', req.params.id, req.biz.id);
  res.json({ ok: true });
});

r.get('/apps/:id/records', (req, res) => {
  const app = getApp(req.biz.id, req.params.id);
  if (!app) return res.status(404).json({ error: 'النظام غير موجود' });
  const q = String(req.query.q || '').trim();
  const rows = all(`SELECT id, data, created_at, updated_at FROM app_records WHERE app_id = ? AND table_key = ? ${q ? 'AND data LIKE ?' : ''} ORDER BY id DESC LIMIT 1000`,
    app.id, req.query.table, ...(q ? [`%${q}%`] : []));
  res.json(rows.map((x) => ({ id: x.id, created_at: x.created_at, ...JSON.parse(x.data) })));
});

r.post('/apps/:id/records', requireEditor, (req, res) => {
  const app = getApp(req.biz.id, req.params.id);
  if (!app) return res.status(404).json({ error: 'النظام غير موجود' });
  try { res.status(201).json({ id: insertRecord(app, req.body?.table, req.body?.data, req.user.id) }); } catch (err) { fail(res, err); }
});

// Records proposed by the assistant: the system is referenced by name or id.
r.post('/records/bulk', requireEditor, (req, res) => {
  const app = findApp(req.biz.id, req.body?.app_id ?? req.body?.app);
  if (!app) return res.status(404).json({ error: `النظام "${req.body?.app}" غير موجود` });
  const table = app.schema.tables.find((t) => t.key === req.body?.table || t.name === req.body?.table);
  if (!table) return res.status(400).json({ error: 'الجدول غير موجود في هذا النظام' });
  const records = (Array.isArray(req.body?.records) ? req.body.records : []).slice(0, 200);
  let added = 0;
  const errors = [];
  for (const rec of records) {
    try { insertRecord(app, table.key, rec, req.user.id); added++; } catch (err) { errors.push(err.message); }
  }
  res.json({ added, errors: errors.slice(0, 5), app_id: app.id });
});

r.put('/apps/:id/records/:rid', requireEditor, (req, res) => {
  const app = getApp(req.biz.id, req.params.id);
  const row = app && one('SELECT table_key FROM app_records WHERE id = ? AND app_id = ?', req.params.rid, app.id);
  if (!row) return res.status(404).json({ error: 'السجل غير موجود' });
  try {
    const clean = coerce(app.schema.tables.find((t) => t.key === row.table_key).fields, req.body?.data);
    run("UPDATE app_records SET data = ?, updated_at = datetime('now') WHERE id = ?", JSON.stringify(clean), req.params.rid);
    res.json({ ok: true });
  } catch (err) { fail(res, err); }
});

r.delete('/apps/:id/records/:rid', requireEditor, (req, res) => {
  const app = getApp(req.biz.id, req.params.id);
  if (app) run('DELETE FROM app_records WHERE id = ? AND app_id = ?', req.params.rid, app.id);
  res.json({ ok: true });
});

r.get('/apps/:id/export', async (req, res) => {
  const app = getApp(req.biz.id, req.params.id);
  if (!app) return res.status(404).json({ error: 'النظام غير موجود' });
  await sendWorkbook(res, `system-${app.id}.xlsx`, app.schema.tables.map((t) => ({
    name: t.name.slice(0, 30),
    columns: [['#', 'id', 7], ...t.fields.map((f) => [f.label, f.key, f.type === 'longtext' ? 40 : 18]), ['تاريخ الإضافة', 'created_at', 20]],
    rows: all('SELECT id, data, created_at FROM app_records WHERE app_id = ? AND table_key = ? ORDER BY id', app.id, t.key)
      .map((x) => ({ id: x.id, created_at: x.created_at, ...Object.fromEntries(Object.entries(JSON.parse(x.data)).map(([k, v]) => [k, typeof v === 'boolean' ? (v ? 'نعم' : 'لا') : v])) })),
  })));
});

// ---------- Automations ----------
const describe = (wf) => ({ ...wf, trigger: JSON.parse(wf.trigger), steps: JSON.parse(wf.steps) });

r.get('/automations', (req, res) => {
  res.json(all(`SELECT w.*, (SELECT status FROM workflow_runs WHERE workflow_id = w.id ORDER BY id DESC LIMIT 1) AS last_status
                FROM workflows w WHERE w.business_id = ? ORDER BY w.id DESC`, req.biz.id).map(describe));
});

r.post('/automations', requireEditor, (req, res) => {
  try { res.status(201).json({ id: createWorkflow(req.biz.id, req.user.id, req.body?.spec || req.body) }); } catch (err) { fail(res, err); }
});

r.patch('/automations/:id', requireEditor, (req, res) => {
  const wf = one('SELECT * FROM workflows WHERE id = ? AND business_id = ?', req.params.id, req.biz.id);
  if (!wf) return res.status(404).json({ error: 'الأتمتة غير موجودة' });
  const enabled = req.body?.enabled ? 1 : 0;
  run('UPDATE workflows SET enabled = ?, next_run_at = ? WHERE id = ?', enabled, enabled ? nextRun(JSON.parse(wf.trigger)) : null, wf.id);
  res.json({ ok: true });
});

r.delete('/automations/:id', requireEditor, (req, res) => {
  run('DELETE FROM workflows WHERE id = ? AND business_id = ?', req.params.id, req.biz.id);
  res.json({ ok: true });
});

r.post('/automations/:id/run', requireEditor, async (req, res) => {
  const wf = one('SELECT * FROM workflows WHERE id = ? AND business_id = ?', req.params.id, req.biz.id);
  if (!wf) return res.status(404).json({ error: 'الأتمتة غير موجودة' });
  const sample = req.body?.record || null;
  res.json(await runWorkflow(wf, { record: sample }));
});

r.get('/automations/:id/runs', (req, res) => {
  const wf = one('SELECT id FROM workflows WHERE id = ? AND business_id = ?', req.params.id, req.biz.id);
  if (!wf) return res.status(404).json({ error: 'الأتمتة غير موجودة' });
  res.json(all('SELECT id, status, log, created_at FROM workflow_runs WHERE workflow_id = ? ORDER BY id DESC LIMIT 20', wf.id).map((x) => ({ ...x, log: JSON.parse(x.log) })));
});

// ---------- Notifications ----------
r.get('/notifications', (req, res) => {
  res.json({
    unread: one('SELECT COUNT(*) n FROM notifications WHERE business_id = ? AND read = 0', req.biz.id).n,
    items: all('SELECT id, title, body, link, read, created_at FROM notifications WHERE business_id = ? ORDER BY id DESC LIMIT 20', req.biz.id),
  });
});

r.post('/notifications/read', (req, res) => {
  run('UPDATE notifications SET read = 1 WHERE business_id = ? AND read = 0', req.biz.id);
  res.json({ ok: true });
});

export default r;
