import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';

const DATA_DIR = path.resolve('data');
mkdirSync(DATA_DIR, { recursive: true });
export const MEDIA_DIR = path.join(DATA_DIR, 'media');
mkdirSync(MEDIA_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'app.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

export const one = (sql, ...p) => db.prepare(sql).get(...p);
export const all = (sql, ...p) => db.prepare(sql).all(...p);
export const run = (sql, ...p) => db.prepare(sql).run(...p);

const SCHEMA_VERSION = 1;

// Tables a business owns. Each brand (business) has members; data is keyed by business_id.
const CURRENT_TABLES = `
CREATE TABLE IF NOT EXISTS users (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  name               TEXT NOT NULL,
  email              TEXT NOT NULL UNIQUE COLLATE NOCASE,
  phone              TEXT,
  password_hash      TEXT NOT NULL,
  role               TEXT NOT NULL DEFAULT 'client',
  plan               TEXT NOT NULL DEFAULT 'free',
  credits            INTEGER NOT NULL DEFAULT 30,
  status             TEXT NOT NULL DEFAULT 'active',
  active_business_id INTEGER,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at      TEXT
);

CREATE TABLE IF NOT EXISTS businesses (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  industry           TEXT,
  country            TEXT,
  city               TEXT,
  website            TEXT,
  instagram          TEXT,
  description        TEXT,
  audience           TEXT,
  tone               TEXT,
  logo               TEXT,
  colors             TEXT NOT NULL DEFAULT '["#c9a46a","#0f172a","#ffffff"]',
  font               TEXT NOT NULL DEFAULT 'Cairo',
  currency           TEXT NOT NULL DEFAULT 'JOD',
  report_enabled     INTEGER NOT NULL DEFAULT 1,
  report_email       TEXT,
  report_whatsapp    TEXT,
  last_report_period TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS members (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'editor',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (business_id, user_id)
);

CREATE TABLE IF NOT EXISTS invites (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  email       TEXT NOT NULL COLLATE NOCASE,
  role        TEXT NOT NULL DEFAULT 'editor',
  token       TEXT NOT NULL UNIQUE,
  invited_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  accepted_at TEXT
);

CREATE TABLE IF NOT EXISTS metrics (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id      INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  period           TEXT NOT NULL,
  revenue          REAL NOT NULL DEFAULT 0,
  expenses         REAL NOT NULL DEFAULT 0,
  orders           INTEGER NOT NULL DEFAULT 0,
  new_customers    INTEGER NOT NULL DEFAULT 0,
  marketing_spend  REAL NOT NULL DEFAULT 0,
  followers        INTEGER NOT NULL DEFAULT 0,
  engagement_rate  REAL NOT NULL DEFAULT 0,
  website_visits   INTEGER NOT NULL DEFAULT 0,
  source           TEXT NOT NULL DEFAULT 'manual',
  UNIQUE (business_id, period)
);

CREATE TABLE IF NOT EXISTS designs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER REFERENCES businesses(id) ON DELETE CASCADE,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  format      TEXT NOT NULL,
  width       INTEGER NOT NULL,
  height      INTEGER NOT NULL,
  canvas_json TEXT NOT NULL,
  thumbnail   TEXT,
  prompt      TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reports (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER REFERENCES businesses(id) ON DELETE CASCADE,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  kind        TEXT NOT NULL,
  content     TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_usage (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  business_id INTEGER REFERENCES businesses(id) ON DELETE SET NULL,
  kind        TEXT NOT NULL,
  source      TEXT NOT NULL,
  ok          INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS activity (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
  business_id INTEGER REFERENCES businesses(id) ON DELETE CASCADE,
  action      TEXT NOT NULL,
  meta        TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS integrations (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id  INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  provider     TEXT NOT NULL,
  config       TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'connected',
  last_sync_at TEXT,
  last_error   TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (business_id, provider)
);

CREATE TABLE IF NOT EXISTS social_accounts (
  business_id  INTEGER PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  provider     TEXT NOT NULL DEFAULT 'meta',
  page_id      TEXT,
  page_name    TEXT,
  ig_user_id   TEXT,
  ig_username  TEXT,
  token        TEXT,
  pending      TEXT,
  connected_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS posts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id  INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  design_id    INTEGER REFERENCES designs(id) ON DELETE SET NULL,
  caption      TEXT NOT NULL DEFAULT '',
  platforms    TEXT NOT NULL DEFAULT '["instagram"]',
  media_token  TEXT,
  scheduled_at TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'scheduled',
  error        TEXT,
  result       TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  published_at TEXT
);
`;

const INDEXES = `
CREATE INDEX IF NOT EXISTS idx_businesses_owner ON businesses(user_id);
CREATE INDEX IF NOT EXISTS idx_members_user ON members(user_id);
CREATE INDEX IF NOT EXISTS idx_designs_biz ON designs(business_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_biz ON activity(business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_date ON ai_usage(created_at);
CREATE INDEX IF NOT EXISTS idx_posts_due ON posts(status, scheduled_at);
`;

const hasColumn = (table, col) => all(`PRAGMA table_info(${table})`).some((c) => c.name === col);

// v0 → v1: one business per user became many businesses with members; data moved from user_id to business_id.
function migrateToV1() {
  db.exec('PRAGMA foreign_keys = OFF; BEGIN;');
  try {
    if (!hasColumn('users', 'active_business_id')) db.exec('ALTER TABLE users ADD COLUMN active_business_id INTEGER');

    // Rebuild businesses without UNIQUE(user_id), with report settings.
    db.exec(CURRENT_TABLES.match(/CREATE TABLE IF NOT EXISTS businesses \([\s\S]*?\);/)[0].replace('IF NOT EXISTS businesses', 'businesses_v1'));
    db.exec(`INSERT INTO businesses_v1 (id, user_id, name, industry, country, city, website, instagram, description, audience, tone, logo, colors, font, currency, created_at, updated_at)
             SELECT id, user_id, name, industry, country, city, website, instagram, description, audience, tone, logo, colors, font,
                    ${hasColumn('businesses', 'currency') ? 'currency' : "'JOD'"}, created_at, updated_at FROM businesses;
             DROP TABLE businesses; ALTER TABLE businesses_v1 RENAME TO businesses;`);

    // Rebuild metrics keyed by business.
    db.exec(CURRENT_TABLES.match(/CREATE TABLE IF NOT EXISTS metrics \([\s\S]*?\);/)[0].replace('IF NOT EXISTS metrics', 'metrics_v1'));
    db.exec(`INSERT INTO metrics_v1 (business_id, period, revenue, expenses, orders, new_customers, marketing_spend, followers, engagement_rate, website_visits)
             SELECT b.id, m.period, m.revenue, m.expenses, m.orders, m.new_customers, m.marketing_spend, m.followers, m.engagement_rate, m.website_visits
             FROM metrics m JOIN businesses b ON b.user_id = m.user_id;
             DROP TABLE metrics; ALTER TABLE metrics_v1 RENAME TO metrics;`);

    for (const t of ['designs', 'reports', 'ai_usage', 'activity']) {
      const onDelete = t === 'ai_usage' ? 'SET NULL' : 'CASCADE';
      if (!hasColumn(t, 'business_id')) db.exec(`ALTER TABLE ${t} ADD COLUMN business_id INTEGER REFERENCES businesses(id) ON DELETE ${onDelete}`);
      db.exec(`UPDATE ${t} SET business_id = (SELECT id FROM businesses b WHERE b.user_id = ${t}.user_id ORDER BY id LIMIT 1) WHERE business_id IS NULL`);
    }

    db.exec(CURRENT_TABLES); // creates members, invites, integrations, social_accounts, posts
    db.exec(`INSERT OR IGNORE INTO members (business_id, user_id, role) SELECT id, user_id, 'owner' FROM businesses;
             UPDATE users SET active_business_id = (SELECT id FROM businesses b WHERE b.user_id = users.id ORDER BY id LIMIT 1)
             WHERE active_business_id IS NULL;`);
    db.exec(`PRAGMA user_version = 1; COMMIT;`);
    console.log('✓ Database upgraded to multi-brand schema (v1)');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    db.exec('PRAGMA foreign_keys = ON;');
  }
}

const fresh = !one("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'");
if (fresh) {
  db.exec(CURRENT_TABLES);
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
} else if (one('PRAGMA user_version').user_version < 1) {
  migrateToV1();
}
db.exec(INDEXES);

// Business assistant, AI-built systems (mini ERP) and automations. Idempotent, so existing databases gain them on start.
db.exec(`
CREATE TABLE IF NOT EXISTS assistant_threads (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS assistant_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id  INTEGER NOT NULL REFERENCES assistant_threads(id) ON DELETE CASCADE,
  role       TEXT NOT NULL,
  content    TEXT NOT NULL,
  files      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS apps (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  icon        TEXT NOT NULL DEFAULT 'boxes',
  schema      TEXT NOT NULL,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS app_records (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  app_id     INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  table_key  TEXT NOT NULL,
  data       TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS workflows (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  trigger     TEXT NOT NULL,
  steps       TEXT NOT NULL,
  enabled     INTEGER NOT NULL DEFAULT 1,
  runs        INTEGER NOT NULL DEFAULT 0,
  last_run_at TEXT,
  next_run_at TEXT,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS workflow_runs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_id INTEGER NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  status      TEXT NOT NULL,
  log         TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS notifications (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  body        TEXT,
  link        TEXT,
  read        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_threads_user ON assistant_threads(business_id, user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON assistant_messages(thread_id, id);
CREATE INDEX IF NOT EXISTS idx_records_app ON app_records(app_id, table_key, id DESC);
CREATE INDEX IF NOT EXISTS idx_workflows_due ON workflows(enabled, next_run_at);
CREATE INDEX IF NOT EXISTS idx_notifications_biz ON notifications(business_id, read, id DESC);
`);

export function notify(businessId, title, body = null, link = null) {
  run('INSERT INTO notifications (business_id, title, body, link) VALUES (?, ?, ?, ?)', businessId, String(title).slice(0, 200), body ? String(body).slice(0, 2000) : null, link);
}

// credits per month · brands an account can own · people per brand · AI images per month (null = limited by credits only)
export const PLANS = {
  free:     { label: 'مجاني',  credits: 30,   price: 0,  brands: 1,  seats: 1,  images: 4 },
  pro:      { label: 'احترافي', credits: 300,  price: 19, brands: 3,  seats: 3,  images: null },
  business: { label: 'أعمال',   credits: 1500, price: 49, brands: 15, seats: 10, images: null },
};

// AI images generated this calendar month across every brand the account owns.
export function imagesUsedThisMonth(ownerId) {
  return one(`SELECT COUNT(*) n FROM ai_usage a JOIN businesses b ON b.id = a.business_id
              WHERE b.user_id = ? AND a.kind = 'image' AND a.ok = 1 AND a.created_at >= date('now', 'start of month')`, ownerId).n;
}

export function logActivity(userId, action, meta = null, businessId = null) {
  run('INSERT INTO activity (user_id, business_id, action, meta) VALUES (?, ?, ?, ?)', userId, businessId, action, meta ? JSON.stringify(meta) : null);
}

export function createBusiness(ownerId, { name, industry, country, city }) {
  const { lastInsertRowid } = run('INSERT INTO businesses (user_id, name, industry, country, city) VALUES (?, ?, ?, ?, ?)',
    ownerId, name, industry || null, country || null, city || null);
  const id = Number(lastInsertRowid);
  run("INSERT INTO members (business_id, user_id, role) VALUES (?, ?, 'owner')", id, ownerId);
  return id;
}

// Explicit cleanup so deletion also works on databases upgraded before ON DELETE rules existed.
export function deleteBusiness(id) {
  db.exec('BEGIN');
  try {
    run('UPDATE ai_usage SET business_id = NULL WHERE business_id = ?', id);
    for (const t of ['activity', 'posts', 'reports', 'designs', 'metrics', 'members', 'invites', 'integrations', 'social_accounts',
      'assistant_threads', 'apps', 'workflows', 'notifications']) {
      run(`DELETE FROM ${t} WHERE business_id = ?`, id);
    }
    run('UPDATE users SET active_business_id = NULL WHERE active_business_id = ?', id);
    run('DELETE FROM businesses WHERE id = ?', id);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function createUser({ name, email, phone, password, role = 'client', plan = 'free', business }) {
  const hash = bcrypt.hashSync(password, 10);
  const { lastInsertRowid } = run(
    'INSERT INTO users (name, email, phone, password_hash, role, plan, credits) VALUES (?, ?, ?, ?, ?, ?, ?)',
    name, email.trim().toLowerCase(), phone || null, hash, role, plan, PLANS[plan]?.credits ?? 30,
  );
  const userId = Number(lastInsertRowid);
  let businessId = null;
  if (business) {
    businessId = createBusiness(userId, business);
    run('UPDATE users SET active_business_id = ? WHERE id = ?', businessId, userId);
  }
  return { userId, businessId };
}

export function seedDemoMetrics(businessId) {
  const now = new Date();
  const insert = db.prepare(`INSERT OR IGNORE INTO metrics
    (business_id, period, revenue, expenses, orders, new_customers, marketing_spend, followers, engagement_rate, website_visits)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  let followers = 4200;
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const t = 11 - i;
    const season = 1 + 0.12 * Math.sin((d.getMonth() / 12) * Math.PI * 2);
    const revenue = Math.round((8200 + t * 640) * season + (t % 3) * 310);
    const expenses = Math.round(revenue * (0.68 - t * 0.012) + 900);
    const orders = Math.round(revenue / (31 + t * 0.6));
    const newCustomers = Math.round(orders * 0.42);
    const marketing = Math.round(900 + t * 85);
    followers += 260 + t * 70;
    insert.run(businessId, period, revenue, expenses, orders, newCustomers, marketing, followers,
      +(3.1 + (t % 4) * 0.35).toFixed(2), 2600 + t * 310);
  }
}

export function seed() {
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@example.com').toLowerCase();
  if (!one('SELECT id FROM users WHERE role = ?', 'admin')) {
    const pass = process.env.ADMIN_PASSWORD;
    if (!pass) {
      console.warn('⚠️  ADMIN_PASSWORD is not set in .env — admin account was not created.');
    } else {
      createUser({ name: 'مدير المنصة', email: adminEmail, password: pass, role: 'admin', plan: 'business' });
      console.log(`✓ Admin account created: ${adminEmail}`);
    }
  }
  if (process.env.SEED_DEMO === 'true' && !one('SELECT id FROM users WHERE email = ?', 'demo@nashmi.studio')) {
    const { businessId } = createUser({
      name: 'سارة الخطيب', email: 'demo@nashmi.studio', phone: '+962790000000', password: 'demo12345', plan: 'pro',
      business: { name: 'مقهى الريحان', industry: 'مطاعم ومقاهي', country: 'الأردن', city: 'عمّان' },
    });
    run(`UPDATE businesses SET description = ?, audience = ?, tone = ?, instagram = ?, colors = ? WHERE id = ?`,
      'مقهى مختص بالقهوة المختصة والحلويات المنزلية في قلب عمّان',
      'شباب وموظفون بين 20 و40 سنة', 'ودود وعصري', '@rayhan.cafe',
      JSON.stringify(['#c9a46a', '#1f2a24', '#f5efe6']), businessId);
    seedDemoMetrics(businessId);
    console.log('✓ Demo client created: demo@nashmi.studio / demo12345');
  }
}
