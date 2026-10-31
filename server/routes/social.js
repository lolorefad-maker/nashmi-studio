// Content calendar and publishing to Facebook Pages / Instagram Business through the Meta Graph API.
import { Router } from 'express';
import { writeFileSync, existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import { one, all, run, logActivity, MEDIA_DIR } from '../db.js';
import { requireAuth } from '../auth.js';
import { requireBusiness, requireEditor } from '../context.js';
import { encrypt, decrypt, token } from '../crypto.js';
import { publicUrl } from '../mailer.js';

const GRAPH = 'https://graph.facebook.com/v21.0';
const { META_APP_ID, META_APP_SECRET } = process.env;
const SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';
const SCOPES = 'pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish,business_management';
const PLATFORMS = ['instagram', 'facebook'];

export const metaEnabled = () => Boolean(META_APP_ID && META_APP_SECRET);

const r = Router();
r.use(requireAuth, requireBusiness);

async function graph(pathname, params = {}, method = 'GET') {
  const qs = new URLSearchParams(params);
  const res = await fetch(method === 'GET' ? `${GRAPH}/${pathname}?${qs}` : `${GRAPH}/${pathname}`, {
    method, body: method === 'GET' ? undefined : qs, signal: AbortSignal.timeout(30_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error?.message || `Graph HTTP ${res.status}`);
  return data;
}

// ---------- Account connection ----------
r.get('/status', (req, res) => {
  const a = one('SELECT page_name, ig_username, connected_at, pending FROM social_accounts WHERE business_id = ?', req.biz.id);
  res.json({
    enabled: metaEnabled(),
    publicUrl: publicUrl(),
    account: a?.page_name ? { page: a.page_name, instagram: a.ig_username, connected_at: a.connected_at } : null,
    choices: a?.pending ? decrypt(a.pending).map(({ id, name, ig }) => ({ id, name, instagram: ig?.username || null })) : [],
  });
});

r.get('/connect', requireEditor, (req, res) => {
  if (!metaEnabled()) return res.status(400).send('Meta app is not configured (META_APP_ID / META_APP_SECRET).');
  const state = jwt.sign({ b: req.biz.id, u: req.user.id }, SECRET, { expiresIn: '15m' });
  const qs = new URLSearchParams({ client_id: META_APP_ID, redirect_uri: `${publicUrl()}/api/social/callback`, state, scope: SCOPES, response_type: 'code' });
  res.redirect(`https://www.facebook.com/v21.0/dialog/oauth?${qs}`);
});

function saveAccount(bizId, page) {
  run(`INSERT INTO social_accounts (business_id, page_id, page_name, ig_user_id, ig_username, token, pending, connected_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, datetime('now'))
       ON CONFLICT(business_id) DO UPDATE SET page_id = excluded.page_id, page_name = excluded.page_name, ig_user_id = excluded.ig_user_id,
       ig_username = excluded.ig_username, token = excluded.token, pending = NULL, connected_at = excluded.connected_at`,
    bizId, page.id, page.name, page.ig?.id || null, page.ig?.username || null, encrypt(page.access_token));
}

r.get('/callback', async (req, res) => {
  const back = (s) => res.redirect(`/app#/calendar?meta=${s}`);
  try {
    const state = jwt.verify(String(req.query.state || ''), SECRET);
    if (state.u !== req.user.id || !one('SELECT id FROM members WHERE business_id = ? AND user_id = ?', state.b, req.user.id)) return back('error');
    if (!req.query.code) return back('cancelled');
    const short = await graph('oauth/access_token', { client_id: META_APP_ID, client_secret: META_APP_SECRET, redirect_uri: `${publicUrl()}/api/social/callback`, code: req.query.code });
    const long = await graph('oauth/access_token', { grant_type: 'fb_exchange_token', client_id: META_APP_ID, client_secret: META_APP_SECRET, fb_exchange_token: short.access_token });
    // Page tokens derived from a long-lived user token do not expire.
    const { data = [] } = await graph('me/accounts', { access_token: long.access_token, fields: 'id,name,access_token,instagram_business_account{id,username}' });
    const pages = data.map((p) => ({ id: p.id, name: p.name, access_token: p.access_token, ig: p.instagram_business_account || null }));
    if (!pages.length) return back('nopages');
    if (pages.length === 1) {
      saveAccount(state.b, pages[0]);
      logActivity(req.user.id, 'social_connect', { page: pages[0].name }, state.b);
      return back('connected');
    }
    run(`INSERT INTO social_accounts (business_id, pending) VALUES (?, ?) ON CONFLICT(business_id) DO UPDATE SET pending = excluded.pending`, state.b, encrypt(pages));
    back('choose');
  } catch (err) {
    console.error('[meta callback]', err.message);
    back('error');
  }
});

r.post('/select', requireEditor, (req, res) => {
  const a = one('SELECT pending FROM social_accounts WHERE business_id = ?', req.biz.id);
  const page = a?.pending ? decrypt(a.pending).find((p) => p.id === req.body?.page_id) : null;
  if (!page) return res.status(404).json({ error: 'الصفحة غير موجودة' });
  saveAccount(req.biz.id, page);
  logActivity(req.user.id, 'social_connect', { page: page.name }, req.biz.id);
  res.json({ ok: true });
});

r.delete('/account', requireEditor, (req, res) => {
  run('DELETE FROM social_accounts WHERE business_id = ?', req.biz.id);
  res.json({ ok: true });
});

// ---------- Posts ----------
const mediaPath = (t) => path.join(MEDIA_DIR, `${t}.jpg`);

function saveMedia(dataUrl) {
  const m = /^data:image\/(jpeg|png);base64,(.+)$/.exec(dataUrl || '');
  if (!m) return null;
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 8_000_000) throw new Error('الصورة أكبر من 8MB');
  const t = token(18);
  writeFileSync(mediaPath(t), buf);
  return t;
}

function readPost(body) {
  const platforms = (Array.isArray(body.platforms) ? body.platforms : []).filter((p) => PLATFORMS.includes(p));
  const when = new Date(body.scheduled_at);
  if (Number.isNaN(+when)) throw new Error('حدد تاريخ ووقت النشر');
  if (!platforms.length) throw new Error('اختر منصة واحدة على الأقل');
  return { platforms, when: when.toISOString(), caption: String(body.caption || '').slice(0, 2200), status: body.status === 'draft' ? 'draft' : 'scheduled' };
}

const POST_FIELDS = `p.id, p.design_id, p.caption, p.platforms, p.media_token, p.scheduled_at, p.status, p.error, p.result, p.published_at, d.title AS design_title`;

r.get('/posts', (req, res) => {
  const from = req.query.from || '0000';
  const to = req.query.to || '9999';
  res.json(all(`SELECT ${POST_FIELDS} FROM posts p LEFT JOIN designs d ON d.id = p.design_id
                WHERE p.business_id = ? AND p.scheduled_at >= ? AND p.scheduled_at < ? ORDER BY p.scheduled_at`, req.biz.id, from, to)
    .map((p) => ({ ...p, platforms: JSON.parse(p.platforms), image: p.media_token ? `/media/${p.media_token}.jpg` : null })));
});

r.post('/posts', requireEditor, (req, res) => {
  try {
    const p = readPost(req.body || {});
    const design = req.body.design_id ? one('SELECT id FROM designs WHERE id = ? AND business_id = ?', req.body.design_id, req.biz.id) : null;
    const media = saveMedia(req.body.image);
    const { lastInsertRowid } = run(`INSERT INTO posts (business_id, user_id, design_id, caption, platforms, media_token, scheduled_at, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, req.biz.id, req.user.id, design?.id || null, p.caption, JSON.stringify(p.platforms), media, p.when, p.status);
    logActivity(req.user.id, 'post_schedule', { when: p.when }, req.biz.id);
    res.status(201).json({ id: Number(lastInsertRowid) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

r.put('/posts/:id', requireEditor, (req, res) => {
  const existing = one('SELECT * FROM posts WHERE id = ? AND business_id = ?', req.params.id, req.biz.id);
  if (!existing) return res.status(404).json({ error: 'المنشور غير موجود' });
  if (existing.status === 'published') return res.status(400).json({ error: 'لا يمكن تعديل منشور تم نشره' });
  try {
    const p = readPost(req.body || {});
    const media = req.body.image ? saveMedia(req.body.image) : existing.media_token;
    run(`UPDATE posts SET caption = ?, platforms = ?, scheduled_at = ?, status = ?, media_token = ?, design_id = COALESCE(?, design_id), error = NULL WHERE id = ?`,
      p.caption, JSON.stringify(p.platforms), p.when, p.status, media, req.body.design_id || null, existing.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

r.delete('/posts/:id', requireEditor, (req, res) => {
  const p = one('SELECT media_token FROM posts WHERE id = ? AND business_id = ?', req.params.id, req.biz.id);
  run('DELETE FROM posts WHERE id = ? AND business_id = ?', req.params.id, req.biz.id);
  if (p?.media_token && existsSync(mediaPath(p.media_token))) unlinkSync(mediaPath(p.media_token));
  res.json({ ok: true });
});

r.post('/posts/:id/publish', requireEditor, async (req, res) => {
  const p = one('SELECT * FROM posts WHERE id = ? AND business_id = ?', req.params.id, req.biz.id);
  if (!p) return res.status(404).json({ error: 'المنشور غير موجود' });
  const result = await publishPost(p);
  res.status(result.status === 'published' ? 200 : 400).json(result);
});

r.post('/posts/:id/mark-published', requireEditor, (req, res) => {
  run("UPDATE posts SET status = 'published', published_at = datetime('now'), error = NULL WHERE id = ? AND business_id = ?", req.params.id, req.biz.id);
  res.json({ ok: true });
});

// ---------- Publishing (also called by the scheduler) ----------
const sleep = (ms) => new Promise((r2) => setTimeout(r2, ms));

export async function publishPost(post) {
  const acct = one('SELECT * FROM social_accounts WHERE business_id = ?', post.business_id);
  const platforms = JSON.parse(post.platforms);
  if (!acct?.token || !acct.page_id) {
    run("UPDATE posts SET status = 'due', error = ? WHERE id = ?", 'لا يوجد حساب مربوط — انشر يدوياً', post.id);
    return { status: 'due', error: 'لا يوجد حساب مربوط — حمّل الصورة وانشرها يدوياً' };
  }
  const accessToken = decrypt(acct.token);
  const imageUrl = post.media_token ? `${publicUrl()}/media/${post.media_token}.jpg` : null;
  const result = {};
  const errors = [];
  for (const platform of platforms) {
    try {
      if (platform === 'facebook') {
        result.facebook = imageUrl
          ? await graph(`${acct.page_id}/photos`, { url: imageUrl, caption: post.caption, access_token: accessToken }, 'POST')
          : await graph(`${acct.page_id}/feed`, { message: post.caption, access_token: accessToken }, 'POST');
      }
      if (platform === 'instagram') {
        if (!acct.ig_user_id) throw new Error('لا يوجد حساب انستغرام أعمال مرتبط بالصفحة');
        if (!imageUrl) throw new Error('انستغرام يتطلب صورة');
        const container = await graph(`${acct.ig_user_id}/media`, { image_url: imageUrl, caption: post.caption, access_token: accessToken }, 'POST');
        for (let i = 0; i < 10; i++) {
          const { status_code: s } = await graph(container.id, { fields: 'status_code', access_token: accessToken });
          if (s === 'FINISHED') break;
          if (s === 'ERROR') throw new Error('رفض انستغرام الصورة');
          await sleep(2000);
        }
        result.instagram = await graph(`${acct.ig_user_id}/media_publish`, { creation_id: container.id, access_token: accessToken }, 'POST');
      }
    } catch (err) {
      errors.push(`${platform}: ${err.message}`);
    }
  }
  const ok = errors.length < platforms.length;
  run(`UPDATE posts SET status = ?, error = ?, result = ?, published_at = CASE WHEN ? THEN datetime('now') ELSE published_at END WHERE id = ?`,
    ok ? 'published' : 'failed', errors.join(' | ') || null, JSON.stringify(result), ok ? 1 : 0, post.id);
  return { status: ok ? 'published' : 'failed', error: errors.join(' | ') || null };
}

export async function publishDuePosts() {
  for (const p of all("SELECT * FROM posts WHERE status = 'scheduled' AND scheduled_at <= ?", new Date().toISOString())) {
    await publishPost(p).catch((err) => console.error('[publish]', err.message));
  }
}

export default r;
