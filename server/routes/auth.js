import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { one, all, run, createUser, logActivity, PLANS, imagesUsedThisMonth } from '../db.js';
import { setSession, clearSession, requireAuth, rateLimit } from '../auth.js';
import { requireBusiness } from '../context.js';
import { aiStatus } from '../ai.js';
import { mailEnabled, whatsappEnabled } from '../mailer.js';
import { metaEnabled } from './social.js';

const r = Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const pendingInvite = (token) => token
  ? one(`SELECT i.*, b.name AS business FROM invites i JOIN businesses b ON b.id = i.business_id
         WHERE i.token = ? AND i.accepted_at IS NULL AND i.created_at >= datetime('now', '-14 days')`, token)
  : null;

function acceptInvite(invite, userId) {
  run('INSERT OR IGNORE INTO members (business_id, user_id, role) VALUES (?, ?, ?)', invite.business_id, userId, invite.role);
  run("UPDATE invites SET accepted_at = datetime('now') WHERE id = ?", invite.id);
  run('UPDATE users SET active_business_id = ? WHERE id = ?', invite.business_id, userId);
  logActivity(userId, 'team_join', { role: invite.role }, invite.business_id);
}

r.get('/config', (req, res) => {
  res.json({ appName: process.env.APP_NAME || 'Nashmi Studio', demo: process.env.SEED_DEMO === 'true' });
});

r.get('/invite/:token', (req, res) => {
  const inv = pendingInvite(req.params.token);
  if (!inv) return res.status(404).json({ error: 'رابط الدعوة غير صالح أو منتهي' });
  res.json({ business: inv.business, email: inv.email, role: inv.role });
});

r.post('/register', rateLimit({ limit: 10 }), (req, res) => {
  const { name, email, phone, password, businessName, industry, country, city, invite: inviteToken } = req.body || {};
  const invite = pendingInvite(inviteToken);
  if (!name?.trim() || (!invite && !businessName?.trim())) return res.status(400).json({ error: 'الاسم واسم النشاط مطلوبان' });
  if (!EMAIL_RE.test(email || '')) return res.status(400).json({ error: 'البريد الإلكتروني غير صالح' });
  if (!password || password.length < 8) return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' });
  if (invite && invite.email.toLowerCase() !== email.trim().toLowerCase()) return res.status(400).json({ error: 'استخدم البريد الذي وصلته الدعوة' });
  if (one('SELECT id FROM users WHERE email = ?', email.trim().toLowerCase())) {
    return res.status(409).json({ error: 'هذا البريد مسجّل مسبقاً — سجّل الدخول' });
  }
  const { userId, businessId } = createUser({
    name: name.trim(), email, phone: phone?.trim(), password,
    business: invite ? null : { name: businessName.trim(), industry, country, city },
  });
  if (invite) acceptInvite(invite, userId);
  logActivity(userId, 'register', null, businessId ?? invite?.business_id);
  setSession(res, { id: userId, role: 'client' });
  res.status(201).json({ ok: true, role: 'client' });
});

r.post('/login', rateLimit({ limit: 20 }), (req, res) => {
  const { email, password, invite: inviteToken } = req.body || {};
  const user = one('SELECT * FROM users WHERE email = ?', String(email || '').trim().toLowerCase());
  if (!user || !bcrypt.compareSync(String(password || ''), user.password_hash)) {
    return res.status(401).json({ error: 'البريد أو كلمة المرور غير صحيحة' });
  }
  if (user.status !== 'active') return res.status(403).json({ error: 'الحساب موقوف، تواصل مع الإدارة' });
  const invite = pendingInvite(inviteToken);
  if (invite && invite.email.toLowerCase() === user.email.toLowerCase() && user.role === 'client') acceptInvite(invite, user.id);
  run("UPDATE users SET last_login_at = datetime('now') WHERE id = ?", user.id);
  logActivity(user.id, 'login', null, user.active_business_id);
  setSession(res, user);
  res.json({ ok: true, role: user.role });
});

r.post('/logout', (req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

const features = () => ({ ai: aiStatus(), meta: metaEnabled(), mail: mailEnabled(), whatsapp: whatsappEnabled() });

r.get('/me', requireAuth, (req, res, next) => {
  const base = { appName: process.env.APP_NAME || 'Nashmi Studio', plans: PLANS, ...features() };
  if (req.user.role === 'admin') return res.json({ ...base, user: req.user, business: null, businesses: [], role: 'admin', plan: PLANS.business });
  requireBusiness(req, res, () => {
    const business = { ...req.biz, colors: JSON.parse(req.biz.colors) };
    res.json({
      ...base,
      // Credits and plan belong to the brand owner's account; team members spend from it.
      user: { ...req.user, credits: req.owner.credits, plan: req.owner.plan },
      business,
      role: req.role,
      owner: { id: req.owner.id, name: req.owner.name },
      plan: PLANS[req.owner.plan],
      images: { used: imagesUsedThisMonth(req.owner.id), limit: PLANS[req.owner.plan]?.images ?? null },
      businesses: all(`SELECT b.id, b.name, b.logo, m.role FROM members m JOIN businesses b ON b.id = m.business_id
                       WHERE m.user_id = ? ORDER BY m.id`, req.user.id),
    });
  });
});

r.post('/password', requireAuth, (req, res) => {
  const { current, next } = req.body || {};
  const row = one('SELECT password_hash FROM users WHERE id = ?', req.user.id);
  if (!bcrypt.compareSync(String(current || ''), row.password_hash)) return res.status(400).json({ error: 'كلمة المرور الحالية غير صحيحة' });
  if (!next || next.length < 8) return res.status(400).json({ error: 'كلمة المرور الجديدة قصيرة' });
  run('UPDATE users SET password_hash = ? WHERE id = ?', bcrypt.hashSync(next, 10), req.user.id);
  logActivity(req.user.id, 'password_change');
  res.json({ ok: true });
});

export default r;
