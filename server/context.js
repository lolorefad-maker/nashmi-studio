// Resolves the brand (business) the signed-in user is working on, and their role in it.
import { one, run, createBusiness } from './db.js';

const MEMBERSHIP = `SELECT b.*, m.role AS member_role FROM members m JOIN businesses b ON b.id = m.business_id WHERE m.user_id = ?`;

export function requireBusiness(req, res, next) {
  if (req.user.role === 'admin') return res.status(403).json({ error: 'هذه الصفحة لحسابات العملاء' });
  const uid = req.user.id;
  let m = req.user.active_business_id ? one(`${MEMBERSHIP} AND m.business_id = ?`, uid, req.user.active_business_id) : null;
  m ??= one(`${MEMBERSHIP} ORDER BY m.id LIMIT 1`, uid);
  if (!m) {
    // Removed from every team: give the person a workspace of their own.
    createBusiness(uid, { name: req.user.name });
    m = one(`${MEMBERSHIP} ORDER BY m.id DESC LIMIT 1`, uid);
  }
  if (m.id !== req.user.active_business_id) run('UPDATE users SET active_business_id = ? WHERE id = ?', m.id, uid);
  const { member_role: role, ...biz } = m;
  req.biz = biz;
  req.role = role;
  req.owner = one('SELECT id, name, email, plan, credits FROM users WHERE id = ?', biz.user_id);
  next();
}

export function requireEditor(req, res, next) {
  if (req.role === 'viewer') return res.status(403).json({ error: 'صلاحيتك للمشاهدة فقط' });
  next();
}

export function requireOwner(req, res, next) {
  if (req.role !== 'owner') return res.status(403).json({ error: 'هذا الإجراء لمالك الحساب فقط' });
  next();
}
