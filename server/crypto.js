// AES-256-GCM for third-party credentials stored in the database (store keys, social tokens).
import crypto from 'node:crypto';

const KEY = crypto.createHash('sha256')
  .update(process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || 'dev-only-secret-change-me')
  .digest();

export function encrypt(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}

export function decrypt(payload) {
  if (!payload) return null;
  const [iv, tag, data] = payload.split('.').map((s) => Buffer.from(s, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8'));
}

export const token = (bytes = 24) => crypto.randomBytes(bytes).toString('base64url');
