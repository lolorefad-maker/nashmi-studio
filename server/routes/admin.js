import { Router } from 'express';
import { one, all, run, logActivity, PLANS } from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';
import { computeKpis } from '../analytics.js';
import { sendWorkbook } from '../excel.js';
import { aiStatus } from '../ai.js';

const r = Router();
r.use(requireAuth, requireAdmin);

const CLIENTS_SQL = `
  SELECT u.id, u.name, u.email, u.phone, u.plan, u.credits, u.status, u.created_at, u.last_login_at,
         b.id AS business_id, b.name AS business, b.industry, b.country, b.city, b.website, b.instagram,
         (SELECT COUNT(*) FROM businesses x WHERE x.user_id = u.id) AS brands,
         (SELECT COUNT(*) FROM members mm WHERE mm.user_id = u.id AND mm.role != 'owner') AS memberships,
         (SELECT COUNT(*) FROM designs d WHERE d.user_id = u.id) AS designs,
         (SELECT COUNT(*) FROM ai_usage a WHERE a.user_id = u.id AND a.ok = 1) AS ai_calls,
         (SELECT revenue FROM metrics m WHERE m.business_id = b.id ORDER BY period DESC LIMIT 1) AS last_revenue
  FROM users u
  -- primary brand: the first one the person owns, else the first team they joined
  LEFT JOIN businesses b ON b.id = (SELECT m.business_id FROM members m WHERE m.user_id = u.id ORDER BY (m.role = 'owner') DESC, m.id LIMIT 1)
  WHERE u.role = 'client'`;

r.get('/stats', (req, res) => {
  const n = (sql, ...p) => one(sql, ...p).n;
  res.json({
    ai: aiStatus(),
    totals: {
      clients: n("SELECT COUNT(*) n FROM users WHERE role = 'client'"),
      new7: n("SELECT COUNT(*) n FROM users WHERE role = 'client' AND created_at >= datetime('now','-7 days')"),
      active30: n("SELECT COUNT(*) n FROM users WHERE role = 'client' AND last_login_at >= datetime('now','-30 days')"),
      designs: n('SELECT COUNT(*) n FROM designs'),
      aiCalls: n('SELECT COUNT(*) n FROM ai_usage WHERE ok = 1'),
      aiMonth: n("SELECT COUNT(*) n FROM ai_usage WHERE ok = 1 AND created_at >= date('now','start of month')"),
      mrr: all("SELECT plan, COUNT(*) c FROM users WHERE role = 'client' AND status = 'active' GROUP BY plan")
        .reduce((s, row) => s + (PLANS[row.plan]?.price || 0) * row.c, 0),
    },
    plans: all("SELECT plan, COUNT(*) c FROM users WHERE role = 'client' GROUP BY plan"),
    industries: all("SELECT COALESCE(b.industry,'غير محدد') industry, COUNT(*) c FROM users u JOIN businesses b ON b.user_id=u.id WHERE u.role='client' GROUP BY 1 ORDER BY c DESC LIMIT 6"),
    signups: all("SELECT date(created_at) day, COUNT(*) c FROM users WHERE role='client' AND created_at >= date('now','-29 days') GROUP BY 1"),
    usage: all("SELECT date(created_at) day, kind, COUNT(*) c FROM ai_usage WHERE ok=1 AND created_at >= date('now','-29 days') GROUP BY 1, 2"),
    activity: all(`SELECT a.action, a.meta, a.created_at, u.id user_id, u.name, b.name business FROM activity a
                   JOIN users u ON u.id = a.user_id LEFT JOIN businesses b ON b.id = a.business_id
                   WHERE u.role = 'client' ORDER BY a.id DESC LIMIT 12`),
  });
});

r.get('/users', (req, res) => {
  const { q = '', plan = '', status = '' } = req.query;
  let sql = CLIENTS_SQL;
  const p = [];
  if (q) { sql += ' AND (u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ? OR b.name LIKE ?)'; p.push(...Array(4).fill(`%${q}%`)); }
  if (plan) { sql += ' AND u.plan = ?'; p.push(plan); }
  if (status) { sql += ' AND u.status = ?'; p.push(status); }
  res.json(all(sql + ' ORDER BY u.created_at DESC', ...p));
});

r.get('/users/:id', (req, res) => {
  const user = one(CLIENTS_SQL + ' AND u.id = ?', req.params.id);
  if (!user) return res.status(404).json({ error: 'غير موجود' });
  const business = one('SELECT description, audience, tone, colors, font, logo FROM businesses WHERE id = ?', user.business_id);
  res.json({
    user,
    business,
    brands: all(`SELECT b.id, b.name, m.role FROM members m JOIN businesses b ON b.id = m.business_id WHERE m.user_id = ? ORDER BY m.id`, user.id),
    kpis: computeKpis(all('SELECT * FROM metrics WHERE business_id = ? ORDER BY period', user.business_id)),
    designs: all('SELECT id, title, thumbnail, updated_at FROM designs WHERE business_id = ? ORDER BY updated_at DESC LIMIT 8', user.business_id),
    activity: all('SELECT action, created_at FROM activity WHERE user_id = ? ORDER BY id DESC LIMIT 15', user.id),
  });
});

r.patch('/users/:id', (req, res) => {
  const { plan, status, addCredits } = req.body || {};
  const user = one("SELECT id FROM users WHERE id = ? AND role = 'client'", req.params.id);
  if (!user) return res.status(404).json({ error: 'غير موجود' });
  if (plan && PLANS[plan]) run('UPDATE users SET plan = ?, credits = MAX(credits, ?) WHERE id = ?', plan, PLANS[plan].credits, user.id);
  if (status === 'active' || status === 'suspended') run('UPDATE users SET status = ? WHERE id = ?', status, user.id);
  if (Number.isInteger(addCredits)) run('UPDATE users SET credits = MAX(0, credits + ?) WHERE id = ?', addCredits, user.id);
  logActivity(user.id, 'admin_update', { plan, status, addCredits, by: req.user.id });
  res.json({ ok: true });
});

r.get('/export', async (req, res) => {
  const clients = all(CLIENTS_SQL + ' ORDER BY u.created_at DESC');
  const metrics = all(`SELECT u.email, b.name business, m.* FROM metrics m JOIN businesses b ON b.id = m.business_id
                       JOIN users u ON u.id = b.user_id WHERE u.role = 'client' ORDER BY b.id, m.period`);
  const usage = all(`SELECT a.created_at, u.name, u.email, a.kind, a.source, a.ok FROM ai_usage a
                     JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 20000`);
  const stamp = new Date().toISOString().slice(0, 10);
  await sendWorkbook(res, `clients-${stamp}.xlsx`, [
    {
      name: 'العملاء',
      columns: [
        ['#', 'id', 6], ['الاسم', 'name', 20], ['البريد', 'email', 28], ['الهاتف', 'phone', 16], ['النشاط', 'business', 22],
        ['المجال', 'industry', 16], ['الدولة', 'country', 12], ['المدينة', 'city', 12], ['انستغرام', 'instagram', 16],
        ['الموقع', 'website', 22], ['العلامات', 'brands', 9], ['الباقة', 'plan_label', 10], ['النقاط', 'credits', 9], ['الحالة', 'status_label', 10],
        ['التصاميم', 'designs', 10], ['طلبات AI', 'ai_calls', 10], ['آخر إيراد', 'last_revenue', 12],
        ['تاريخ التسجيل', 'created_at', 20], ['آخر دخول', 'last_login_at', 20],
      ],
      rows: clients.map((c) => ({ ...c, plan_label: PLANS[c.plan]?.label || c.plan, status_label: c.status === 'active' ? 'نشط' : 'موقوف' })),
    },
    {
      name: 'بيانات الأعمال',
      columns: [
        ['البريد', 'email', 26], ['النشاط', 'business', 22], ['الشهر', 'period', 10], ['الإيرادات', 'revenue', 12],
        ['المصاريف', 'expenses', 12], ['الطلبات', 'orders', 10], ['عملاء جدد', 'new_customers', 11],
        ['الإعلانات', 'marketing_spend', 12], ['المتابعون', 'followers', 12], ['التفاعل %', 'engagement_rate', 10],
      ],
      rows: metrics,
    },
    {
      name: 'استخدام الذكاء الاصطناعي',
      columns: [['التاريخ', 'created_at', 20], ['الاسم', 'name', 20], ['البريد', 'email', 26], ['النوع', 'kind', 12], ['المصدر', 'source', 10], ['نجح', 'ok', 6]],
      rows: usage,
    },
  ]);
});

export default r;
