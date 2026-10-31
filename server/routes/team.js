// Brands an account owns (agencies run several) and the people who work on each brand.
import { Router } from 'express';
import { one, all, run, createBusiness, deleteBusiness, logActivity, PLANS } from '../db.js';
import { requireAuth } from '../auth.js';
import { requireBusiness, requireOwner } from '../context.js';
import { token } from '../crypto.js';
import { mailEnabled, sendMail, emailLayout, publicUrl } from '../mailer.js';

const r = Router();
r.use(requireAuth, requireBusiness);

const ROLES = ['editor', 'viewer'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------- Brands ----------
r.post('/brands', (req, res) => {
  const { name, industry, country, city } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'اسم العلامة مطلوب' });
  const owner = one('SELECT plan FROM users WHERE id = ?', req.user.id);
  const owned = one('SELECT COUNT(*) n FROM businesses WHERE user_id = ?', req.user.id).n;
  const limit = PLANS[owner.plan]?.brands ?? 1;
  if (owned >= limit) return res.status(402).json({ error: `باقتك تسمح بـ ${limit} علامة تجارية — قم بالترقية لإضافة المزيد` });
  const id = createBusiness(req.user.id, { name: name.trim(), industry, country, city });
  run('UPDATE users SET active_business_id = ? WHERE id = ?', id, req.user.id);
  logActivity(req.user.id, 'brand_create', { name }, id);
  res.status(201).json({ id });
});

r.post('/brands/:id/activate', (req, res) => {
  const m = one('SELECT business_id FROM members WHERE user_id = ? AND business_id = ?', req.user.id, req.params.id);
  if (!m) return res.status(404).json({ error: 'لست عضواً في هذه العلامة' });
  run('UPDATE users SET active_business_id = ? WHERE id = ?', m.business_id, req.user.id);
  res.json({ ok: true });
});

r.delete('/brands/:id', (req, res) => {
  const b = one('SELECT id, name FROM businesses WHERE id = ? AND user_id = ?', req.params.id, req.user.id);
  if (!b) return res.status(404).json({ error: 'العلامة غير موجودة أو لست مالكها' });
  if (one('SELECT COUNT(*) n FROM businesses WHERE user_id = ?', req.user.id).n <= 1) {
    return res.status(400).json({ error: 'لا يمكن حذف علامتك الوحيدة' });
  }
  deleteBusiness(b.id);
  logActivity(req.user.id, 'brand_delete', { name: b.name });
  res.json({ ok: true });
});

// ---------- Team ----------
r.get('/team', (req, res) => {
  const seats = PLANS[req.owner.plan]?.seats ?? 1;
  res.json({
    seats,
    members: all(`SELECT u.id, u.name, u.email, m.role, m.created_at, u.last_login_at FROM members m JOIN users u ON u.id = m.user_id
                  WHERE m.business_id = ? ORDER BY m.id`, req.biz.id),
    invites: req.role === 'owner'
      ? all(`SELECT id, email, role, token, created_at FROM invites WHERE business_id = ? AND accepted_at IS NULL
             AND created_at >= datetime('now', '-14 days') ORDER BY id DESC`, req.biz.id).map((i) => ({ ...i, link: `${publicUrl()}/login?invite=${i.token}` }))
      : [],
  });
});

r.post('/team/invite', requireOwner, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const role = ROLES.includes(req.body?.role) ? req.body.role : 'editor';
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'البريد الإلكتروني غير صالح' });
  const seats = PLANS[req.owner.plan]?.seats ?? 1;
  const used = one('SELECT COUNT(*) n FROM members WHERE business_id = ?', req.biz.id).n +
    one("SELECT COUNT(*) n FROM invites WHERE business_id = ? AND accepted_at IS NULL AND created_at >= datetime('now','-14 days')", req.biz.id).n;
  if (used >= seats) return res.status(402).json({ error: `باقتك تسمح بـ ${seats} أعضاء لكل علامة — قم بالترقية` });

  const existing = one("SELECT id, role FROM users WHERE email = ?", email);
  if (existing?.role === 'admin') return res.status(400).json({ error: 'لا يمكن دعوة هذا الحساب' });
  if (existing && one('SELECT id FROM members WHERE business_id = ? AND user_id = ?', req.biz.id, existing.id)) {
    return res.status(409).json({ error: 'هذا الشخص عضو في الفريق مسبقاً' });
  }
  const t = token();
  run('INSERT INTO invites (business_id, email, role, token, invited_by) VALUES (?, ?, ?, ?, ?)', req.biz.id, email, role, t, req.user.id);
  const link = `${publicUrl()}/login?invite=${t}`;
  let emailed = false;
  if (mailEnabled()) {
    try {
      await sendMail({
        to: email,
        subject: `دعوة للانضمام إلى ${req.biz.name}`,
        html: emailLayout({
          title: `${req.user.name} يدعوك للانضمام إلى فريق ${req.biz.name}`,
          body: `<p>ستتمكن من ${role === 'viewer' ? 'مشاهدة التصاميم والتحليلات' : 'إنشاء التصاميم وإدارة المحتوى والتحليلات'}. الرابط صالح لمدة 14 يوماً.</p>`,
          cta: 'قبول الدعوة', ctaUrl: link,
        }),
      });
      emailed = true;
    } catch (err) {
      console.error('[invite mail]', err.message);
    }
  }
  logActivity(req.user.id, 'team_invite', { email, role }, req.biz.id);
  res.status(201).json({ link, emailed });
});

r.delete('/team/invites/:id', requireOwner, (req, res) => {
  run('DELETE FROM invites WHERE id = ? AND business_id = ?', req.params.id, req.biz.id);
  res.json({ ok: true });
});

r.patch('/team/:userId', requireOwner, (req, res) => {
  const role = req.body?.role;
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'دور غير صحيح' });
  run("UPDATE members SET role = ? WHERE business_id = ? AND user_id = ? AND role != 'owner'", role, req.biz.id, req.params.userId);
  res.json({ ok: true });
});

// Owners remove anyone but themselves; members may leave.
r.delete('/team/:userId', (req, res) => {
  const target = Number(req.params.userId);
  const self = target === req.user.id;
  if (!self && req.role !== 'owner') return res.status(403).json({ error: 'هذا الإجراء لمالك الحساب فقط' });
  if (self && req.role === 'owner') return res.status(400).json({ error: 'المالك لا يمكنه مغادرة علامته' });
  run("DELETE FROM members WHERE business_id = ? AND user_id = ? AND role != 'owner'", req.biz.id, target);
  run('UPDATE users SET active_business_id = NULL WHERE id = ? AND active_business_id = ?', target, req.biz.id);
  logActivity(req.user.id, self ? 'team_leave' : 'team_remove', { user: target }, req.biz.id);
  res.json({ ok: true });
});

export default r;
