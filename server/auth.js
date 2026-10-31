import jwt from 'jsonwebtoken';
import { one } from './db.js';

const COOKIE = 'ns_session';
const SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';
if (!process.env.JWT_SECRET) console.warn('⚠️  JWT_SECRET is not set — using an insecure development secret.');

export function setSession(res, user) {
  const token = jwt.sign({ uid: user.id, role: user.role }, SECRET, { expiresIn: '14d' });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 14 * 24 * 3600 * 1000,
  });
}

export function clearSession(res) {
  res.clearCookie(COOKIE);
}

export function requireAuth(req, res, next) {
  try {
    const { uid } = jwt.verify(req.cookies?.[COOKIE] || '', SECRET);
    const user = one('SELECT id, name, email, phone, role, plan, credits, status, active_business_id, created_at FROM users WHERE id = ?', uid);
    if (!user) return res.status(401).json({ error: 'الجلسة غير صالحة' });
    if (user.status !== 'active') return res.status(403).json({ error: 'الحساب موقوف، تواصل مع الإدارة' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'يرجى تسجيل الدخول' });
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'صلاحيات غير كافية' });
  next();
}

// Small in-memory limiter for auth endpoints: max `limit` hits per IP per window.
export function rateLimit({ limit = 20, windowMs = 15 * 60 * 1000 } = {}) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip;
    const entry = hits.get(key);
    if (!entry || now > entry.reset) {
      hits.set(key, { count: 1, reset: now + windowMs });
      return next();
    }
    if (++entry.count > limit) return res.status(429).json({ error: 'محاولات كثيرة، حاول لاحقاً' });
    next();
  };
}
