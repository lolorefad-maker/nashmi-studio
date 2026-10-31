import { Router } from 'express';
import { one, all, run, logActivity, seedDemoMetrics, PLANS, imagesUsedThisMonth } from '../db.js';
import { requireAuth } from '../auth.js';
import { requireBusiness, requireEditor } from '../context.js';
import { computeKpis } from '../analytics.js';
import { generateDesign, generateImage, analyzeBusiness, writeCopy, FONTS } from '../ai.js';
import { sendWorkbook } from '../excel.js';

const r = Router();
r.use(requireAuth, requireBusiness);

const COSTS = { design: 1, copy: 1, image: 2, analysis: 3 };
const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const METRIC_FIELDS = ['revenue', 'expenses', 'orders', 'new_customers', 'marketing_spend', 'followers', 'engagement_rate', 'website_visits'];

export const getMetrics = (bizId) => all('SELECT * FROM metrics WHERE business_id = ? ORDER BY period', bizId);
const latestReport = (bizId) => {
  const row = one("SELECT content, created_at FROM reports WHERE business_id = ? AND kind = 'analysis' ORDER BY id DESC LIMIT 1", bizId);
  return row ? { ...JSON.parse(row.content), created_at: row.created_at } : null;
};
const log = (req, action, meta) => logActivity(req.user.id, action, meta, req.biz.id);

// Deducts the brand owner's credits up front and refunds if the generation throws.
async function spend(req, res, kind, fn) {
  const cost = COSTS[kind];
  const ownerId = req.owner.id;
  const { changes } = run('UPDATE users SET credits = credits - ? WHERE id = ? AND credits >= ?', cost, ownerId, cost);
  if (!changes) return res.status(402).json({ error: 'رصيدك من النقاط غير كافٍ — قم بترقية باقتك' });
  try {
    const { data, source } = await fn();
    run('INSERT INTO ai_usage (user_id, business_id, kind, source) VALUES (?, ?, ?, ?)', req.user.id, req.biz.id, kind, source);
    res.json({ data, source, credits: one('SELECT credits FROM users WHERE id = ?', ownerId).credits });
  } catch (err) {
    run('UPDATE users SET credits = credits + ? WHERE id = ?', cost, ownerId);
    run('INSERT INTO ai_usage (user_id, business_id, kind, source, ok) VALUES (?, ?, ?, ?, 0)', req.user.id, req.biz.id, kind, 'error');
    console.error(`[ai:${kind}]`, err.message);
    res.status(err.userMessage ? 502 : 500).json({ error: err.userMessage || 'تعذّر إنشاء النتيجة، حاول مرة أخرى' });
  }
}

// ---------- Overview ----------
r.get('/overview', (req, res) => {
  const id = req.biz.id;
  const metrics = getMetrics(id);
  res.json({
    kpis: computeKpis(metrics),
    metrics: metrics.slice(-12),
    counts: {
      designs: one('SELECT COUNT(*) n FROM designs WHERE business_id = ?', id).n,
      aiCalls: one('SELECT COUNT(*) n FROM ai_usage WHERE business_id = ? AND ok = 1', id).n,
      designsThisMonth: one("SELECT COUNT(*) n FROM designs WHERE business_id = ? AND created_at >= date('now','start of month')", id).n,
      scheduled: one("SELECT COUNT(*) n FROM posts WHERE business_id = ? AND status IN ('scheduled','due')", id).n,
    },
    recentDesigns: all('SELECT id, title, format, thumbnail, updated_at FROM designs WHERE business_id = ? ORDER BY updated_at DESC LIMIT 6', id),
    upcoming: all(`SELECT p.id, p.caption, p.platforms, p.scheduled_at, p.status, d.thumbnail FROM posts p LEFT JOIN designs d ON d.id = p.design_id
                   WHERE p.business_id = ? AND p.status IN ('scheduled','due') ORDER BY p.scheduled_at LIMIT 4`, id),
    latestReport: latestReport(id),
    activity: all(`SELECT a.action, a.meta, a.created_at, u.name FROM activity a LEFT JOIN users u ON u.id = a.user_id
                   WHERE a.business_id = ? ORDER BY a.id DESC LIMIT 8`, id),
  });
});

// ---------- Business profile, brand kit & report settings ----------
r.put('/business', requireEditor, (req, res) => {
  const b = req.body || {};
  if (!b.name?.trim()) return res.status(400).json({ error: 'اسم النشاط مطلوب' });
  if (b.logo && (!/^data:image\/(png|jpe?g|webp|svg\+xml);base64,/.test(b.logo) || b.logo.length > 1_500_000)) {
    return res.status(400).json({ error: 'الشعار يجب أن يكون صورة أقل من 1MB' });
  }
  const colors = Array.isArray(b.colors) ? b.colors.filter((c) => /^#[0-9a-f]{6}$/i.test(c)).slice(0, 5) : [];
  run(`UPDATE businesses SET name=?, industry=?, country=?, city=?, website=?, instagram=?, description=?, audience=?, tone=?,
       logo=?, colors=?, font=?, currency=?, updated_at=datetime('now') WHERE id=?`,
    b.name.trim(), b.industry || null, b.country || null, b.city || null, b.website || null, b.instagram || null,
    b.description || null, b.audience || null, b.tone || null, b.logo || null,
    JSON.stringify(colors.length ? colors : ['#c9a46a', '#0f172a', '#ffffff']),
    FONTS.includes(b.font) ? b.font : 'Cairo', /^[A-Z]{3}$/.test(b.currency) ? b.currency : 'JOD', req.biz.id);
  if (b.ownerName?.trim()) run('UPDATE users SET name = ?, phone = ? WHERE id = ?', b.ownerName.trim(), b.phone || null, req.user.id);
  log(req, 'brand_update');
  res.json({ ok: true });
});

r.put('/business/report-settings', requireEditor, (req, res) => {
  const { enabled, email, whatsapp } = req.body || {};
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'البريد الإلكتروني غير صالح' });
  run('UPDATE businesses SET report_enabled = ?, report_email = ?, report_whatsapp = ? WHERE id = ?',
    enabled ? 1 : 0, email || null, whatsapp ? String(whatsapp).replace(/[^\d+]/g, '') : null, req.biz.id);
  res.json({ ok: true });
});

r.post('/upgrade-request', (req, res) => {
  const { plan } = req.body || {};
  if (!['free', 'pro', 'business'].includes(plan)) return res.status(400).json({ error: 'باقة غير صحيحة' });
  log(req, 'upgrade_request', { plan, from: req.owner.plan });
  res.json({ ok: true });
});

// ---------- Metrics ----------
r.get('/metrics', (req, res) => {
  const metrics = getMetrics(req.biz.id);
  res.json({ metrics, kpis: computeKpis(metrics) });
});

export function upsertMetrics(bizId, period, values, source = 'manual', fields = METRIC_FIELDS) {
  const v = fields.map((f) => Math.max(0, Number(values?.[f]) || 0));
  run(`INSERT INTO metrics (business_id, period, source, ${fields.join(', ')}) VALUES (?, ?, ?, ${fields.map(() => '?').join(', ')})
       ON CONFLICT(business_id, period) DO UPDATE SET source = excluded.source, ${fields.map((f) => `${f}=excluded.${f}`).join(', ')}`,
    bizId, period, source, ...v);
}

r.put('/metrics/:period', requireEditor, (req, res) => {
  const { period } = req.params;
  if (!PERIOD_RE.test(period)) return res.status(400).json({ error: 'صيغة الشهر غير صحيحة' });
  upsertMetrics(req.biz.id, period, req.body);
  log(req, 'metrics_update', { period });
  res.json({ ok: true });
});

r.delete('/metrics/:period', requireEditor, (req, res) => {
  run('DELETE FROM metrics WHERE business_id = ? AND period = ?', req.biz.id, req.params.period);
  res.json({ ok: true });
});

r.post('/metrics/sample', requireEditor, (req, res) => {
  seedDemoMetrics(req.biz.id);
  res.json({ ok: true });
});

export const METRIC_COLUMNS = [
  ['الشهر', 'period', 12], ['الإيرادات', 'revenue', 14], ['المصاريف', 'expenses', 14], ['الطلبات', 'orders', 10],
  ['عملاء جدد', 'new_customers', 12], ['الإنفاق الإعلاني', 'marketing_spend', 16], ['المتابعون', 'followers', 12],
  ['التفاعل %', 'engagement_rate', 11], ['زيارات الموقع', 'website_visits', 14],
];

r.get('/metrics/export', async (req, res) => {
  const rows = getMetrics(req.biz.id);
  const cols = [...METRIC_COLUMNS];
  cols.splice(3, 0, ['صافي الربح', 'profit', 14]);
  await sendWorkbook(res, 'business-data.xlsx', [{ name: 'بيانات النشاط', columns: cols, rows: rows.map((m) => ({ ...m, profit: m.revenue - m.expenses })) }]);
});

// ---------- Designs ----------
r.get('/designs', (req, res) => {
  res.json(all(`SELECT d.id, d.title, d.format, d.width, d.height, d.thumbnail, d.created_at, d.updated_at, u.name AS author
                FROM designs d LEFT JOIN users u ON u.id = d.user_id WHERE d.business_id = ? ORDER BY d.updated_at DESC`, req.biz.id));
});

r.get('/designs/:id', (req, res) => {
  const d = one('SELECT * FROM designs WHERE id = ? AND business_id = ?', req.params.id, req.biz.id);
  if (!d) return res.status(404).json({ error: 'التصميم غير موجود' });
  res.json(d);
});

function validDesign(b) {
  return b && typeof b.canvas_json === 'string' && b.canvas_json.length < 12_000_000 &&
    Number.isInteger(b.width) && Number.isInteger(b.height) && b.width <= 4000 && b.height <= 4000;
}

r.post('/designs', requireEditor, (req, res) => {
  const b = req.body;
  if (!validDesign(b)) return res.status(400).json({ error: 'بيانات التصميم غير صالحة' });
  const { lastInsertRowid } = run(
    'INSERT INTO designs (business_id, user_id, title, format, width, height, canvas_json, thumbnail, prompt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    req.biz.id, req.user.id, (b.title || 'تصميم بدون عنوان').slice(0, 80), b.format || 'custom', b.width, b.height, b.canvas_json, b.thumbnail || null, b.prompt || null,
  );
  log(req, 'design_save', { title: b.title });
  res.status(201).json({ id: Number(lastInsertRowid) });
});

r.put('/designs/:id', requireEditor, (req, res) => {
  const b = req.body;
  if (!validDesign(b)) return res.status(400).json({ error: 'بيانات التصميم غير صالحة' });
  const { changes } = run(
    "UPDATE designs SET title=?, format=?, width=?, height=?, canvas_json=?, thumbnail=?, updated_at=datetime('now') WHERE id=? AND business_id=?",
    (b.title || 'تصميم بدون عنوان').slice(0, 80), b.format || 'custom', b.width, b.height, b.canvas_json, b.thumbnail || null, req.params.id, req.biz.id,
  );
  if (!changes) return res.status(404).json({ error: 'التصميم غير موجود' });
  res.json({ ok: true });
});

r.delete('/designs/:id', requireEditor, (req, res) => {
  run('DELETE FROM designs WHERE id = ? AND business_id = ?', req.params.id, req.biz.id);
  res.json({ ok: true });
});

// ---------- AI ----------
r.post('/ai/design', requireEditor, (req, res) => {
  const { prompt, format, style, lang, hasImage } = req.body || {};
  if (!prompt?.trim()) return res.status(400).json({ error: 'اكتب وصفاً للتصميم المطلوب' });
  spend(req, res, 'design', () => generateDesign({ prompt: prompt.trim().slice(0, 600), format, style, lang, hasImage: Boolean(hasImage), business: req.biz }));
});

r.post('/ai/image', requireEditor, (req, res) => {
  const { prompt, aspect, palette, reference, mode } = req.body || {};
  if (!prompt?.trim()) return res.status(400).json({ error: 'اكتب وصفاً للصورة المطلوبة' });
  const limit = PLANS[req.owner.plan]?.images;
  if (limit != null && imagesUsedThisMonth(req.owner.id) >= limit) {
    return res.status(402).json({ error: `وصلت للحد الشهري لباقتك (${limit} صور) — قم بالترقية لصور أكثر` });
  }
  if (reference && (typeof reference !== 'string' || reference.length > 8_000_000)) return res.status(400).json({ error: 'الصورة المرجعية كبيرة جداً' });
  spend(req, res, 'image', () => generateImage({ prompt: prompt.trim().slice(0, 800), aspect, palette, reference, mode: mode === 'edit' ? 'edit' : 'create', business: req.biz }));
});

r.post('/ai/copy', requireEditor, (req, res) => {
  const { topic, platform, tone, lang } = req.body || {};
  if (!topic?.trim()) return res.status(400).json({ error: 'اكتب موضوع المنشور' });
  spend(req, res, 'copy', () => writeCopy({ topic: topic.trim().slice(0, 400), platform: platform || 'Instagram', tone, lang, business: req.biz }));
});

r.post('/ai/analyze', requireEditor, (req, res) => {
  const metrics = getMetrics(req.biz.id);
  const kpis = computeKpis(metrics);
  if (!kpis) return res.status(400).json({ error: 'أضف بيانات شهر واحد على الأقل قبل التحليل' });
  spend(req, res, 'analysis', async () => {
    const result = await analyzeBusiness({ business: req.biz, kpis, metrics, lang: req.body?.lang });
    run("INSERT INTO reports (business_id, user_id, kind, content) VALUES (?, ?, 'analysis', ?)", req.biz.id, req.user.id, JSON.stringify(result.data));
    log(req, 'analysis');
    return result;
  });
});

r.get('/reports/latest', (req, res) => res.json(latestReport(req.biz.id)));

export default r;
