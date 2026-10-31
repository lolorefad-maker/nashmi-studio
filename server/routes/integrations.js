// Getting sales data in without typing it: Excel/CSV import and store sync (WooCommerce, Shopify).
import { Router } from 'express';
import { Readable } from 'node:stream';
import ExcelJS from 'exceljs';
import { one, all, run, logActivity } from '../db.js';
import { requireAuth } from '../auth.js';
import { requireBusiness, requireEditor } from '../context.js';
import { encrypt, decrypt } from '../crypto.js';
import { sendWorkbook } from '../excel.js';
import { upsertMetrics, METRIC_COLUMNS, METRIC_FIELDS } from './client.js';

const r = Router();
r.use(requireAuth, requireBusiness);

// ---------- Excel / CSV ----------
const HEADER_MAP = {
  'الشهر': 'period', 'التاريخ': 'period', month: 'period', period: 'period', date: 'period',
  'الإيرادات': 'revenue', 'المبيعات': 'revenue', revenue: 'revenue', sales: 'revenue',
  'المصاريف': 'expenses', 'التكاليف': 'expenses', expenses: 'expenses', costs: 'expenses',
  'الطلبات': 'orders', 'عدد الطلبات': 'orders', orders: 'orders',
  'عملاء جدد': 'new_customers', 'العملاء الجدد': 'new_customers', 'new customers': 'new_customers', new_customers: 'new_customers',
  'الإنفاق الإعلاني': 'marketing_spend', 'الإعلانات': 'marketing_spend', marketing: 'marketing_spend', 'ad spend': 'marketing_spend', marketing_spend: 'marketing_spend',
  'المتابعون': 'followers', followers: 'followers',
  'التفاعل %': 'engagement_rate', 'التفاعل': 'engagement_rate', 'معدل التفاعل': 'engagement_rate', engagement: 'engagement_rate', engagement_rate: 'engagement_rate',
  'زيارات الموقع': 'website_visits', 'الزيارات': 'website_visits', visits: 'website_visits', website_visits: 'website_visits',
};

const cellValue = (v) => (v && typeof v === 'object' && !(v instanceof Date) ? v.result ?? v.text ?? v.richText?.map((t) => t.text).join('') ?? null : v);

function toPeriod(v) {
  v = cellValue(v);
  if (v instanceof Date) return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}`;
  const s = String(v ?? '').trim().replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  let m = s.match(/^(\d{4})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[-/.](\d{4})$/);
  if (m) return `${m[2]}-${m[1].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/); // dd/mm/yyyy
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}`;
  return null;
}

const toNumber = (v) => {
  v = cellValue(v);
  if (typeof v === 'number') return v;
  const n = Number(String(v ?? '').replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

r.get('/template', async (req, res) => {
  const now = new Date();
  const p = (i) => { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  await sendWorkbook(res, 'data-template.xlsx', [{
    name: 'البيانات', columns: METRIC_COLUMNS,
    rows: [
      { period: p(1), revenue: 12000, expenses: 8000, orders: 320, new_customers: 120, marketing_spend: 900, followers: 10500, engagement_rate: 3.8, website_visits: 5200 },
      { period: p(0), revenue: 13500, expenses: 8400, orders: 350, new_customers: 140, marketing_spend: 1000, followers: 11200, engagement_rate: 4.1, website_visits: 5800 },
    ],
  }]);
});

r.post('/import', requireEditor, async (req, res) => {
  const { filename = '', data = '' } = req.body || {};
  const buffer = Buffer.from(String(data).replace(/^data:[^,]*,/, ''), 'base64');
  if (!buffer.length || buffer.length > 5_000_000) return res.status(400).json({ error: 'الملف فارغ أو أكبر من 5MB' });
  const wb = new ExcelJS.Workbook();
  try {
    if (/\.csv$/i.test(filename)) await wb.csv.read(Readable.from(buffer.toString('utf8').replace(/^﻿/, '')));
    else await wb.xlsx.load(buffer);
  } catch {
    return res.status(400).json({ error: 'تعذّرت قراءة الملف — استخدم Excel (.xlsx) أو CSV' });
  }
  const ws = wb.worksheets[0];
  if (!ws) return res.status(400).json({ error: 'الملف لا يحتوي على بيانات' });

  const columns = {};
  ws.getRow(1).eachCell((cell, col) => {
    const key = HEADER_MAP[String(cellValue(cell.value) ?? '').trim().toLowerCase().replace(/\s+/g, ' ')];
    if (key) columns[col] = key;
  });
  const fields = [...new Set(Object.values(columns))].filter((f) => METRIC_FIELDS.includes(f));
  if (!Object.values(columns).includes('period') || !fields.length) {
    return res.status(400).json({ error: 'لم نجد عمود "الشهر" وأعمدة الأرقام — نزّل القالب واستخدم نفس العناوين' });
  }

  let imported = 0;
  const skipped = [];
  ws.eachRow((row, i) => {
    if (i === 1) return;
    const values = {};
    let period = null;
    for (const [col, key] of Object.entries(columns)) {
      const v = row.getCell(Number(col)).value;
      if (key === 'period') period = toPeriod(v);
      else values[key] = toNumber(v);
    }
    if (!period) { if (row.actualCellCount) skipped.push(i); return; }
    upsertMetrics(req.biz.id, period, values, 'import', fields);
    imported++;
  });
  logActivity(req.user.id, 'data_import', { imported }, req.biz.id);
  res.json({ imported, skipped: skipped.slice(0, 20), fields });
});

// ---------- Store integrations ----------
const SKIP_WOO = new Set(['cancelled', 'refunded', 'failed', 'pending', 'trash', 'checkout-draft']);

const providers = {
  woocommerce: {
    validate: (c) => /^https?:\/\/.+/.test(c.url || '') && c.key && c.secret,
    safe: (c) => ({ url: c.url }),
    async fetch(c, since, max = 50) {
      const base = c.url.replace(/\/+$/, '');
      const auth = `Basic ${Buffer.from(`${c.key}:${c.secret}`).toString('base64')}`;
      const out = [];
      for (let page = 1; page <= max; page++) {
        const res = await fetch(`${base}/wp-json/wc/v3/orders?per_page=100&page=${page}&after=${since}&orderby=date&order=asc`,
          { headers: { Authorization: auth }, signal: AbortSignal.timeout(30_000) });
        if (!res.ok) throw new Error(`WooCommerce ${res.status}: ${(await res.text()).slice(0, 160)}`);
        const batch = await res.json();
        for (const o of batch) {
          if (SKIP_WOO.has(o.status)) continue;
          out.push({ date: o.date_created_gmt ? `${o.date_created_gmt}Z` : o.date_created, total: Number(o.total) || 0, customer: o.customer_id || o.billing?.email || `guest-${o.id}` });
        }
        if (batch.length < 100) break;
      }
      return out;
    },
  },
  shopify: {
    validate: (c) => /\.myshopify\.com/i.test(c.shop || '') && c.token,
    safe: (c) => ({ shop: c.shop }),
    async fetch(c, since, max = 50) {
      const domain = c.shop.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      let url = `https://${domain}/admin/api/2024-10/orders.json?status=any&limit=250&created_at_min=${since}&fields=id,created_at,total_price,customer,financial_status,cancelled_at`;
      const out = [];
      for (let i = 0; i < max && url; i++) {
        const res = await fetch(url, { headers: { 'X-Shopify-Access-Token': c.token }, signal: AbortSignal.timeout(30_000) });
        if (!res.ok) throw new Error(`Shopify ${res.status}: ${(await res.text()).slice(0, 160)}`);
        for (const o of (await res.json()).orders || []) {
          if (o.cancelled_at || ['refunded', 'voided'].includes(o.financial_status)) continue;
          out.push({ date: o.created_at, total: Number(o.total_price) || 0, customer: o.customer?.id || `guest-${o.id}` });
        }
        url = res.headers.get('link')?.match(/<([^>]+)>;\s*rel="next"/)?.[1] || null;
      }
      return out;
    },
  },
};

// Monthly revenue, orders and first-time customers from raw orders.
function aggregate(orders) {
  const months = {};
  const seen = new Set();
  for (const o of orders.sort((a, b) => new Date(a.date) - new Date(b.date))) {
    const d = new Date(o.date);
    if (Number.isNaN(+d)) continue;
    const p = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const m = (months[p] ??= { revenue: 0, orders: 0, new_customers: 0 });
    m.revenue += o.total;
    m.orders += 1;
    if (!seen.has(o.customer)) { seen.add(o.customer); m.new_customers += 1; }
  }
  return months;
}

async function sync(bizId, provider, config) {
  const since = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 11, 1)).toISOString();
  const months = aggregate(await providers[provider].fetch(config, since));
  for (const [period, v] of Object.entries(months)) {
    upsertMetrics(bizId, period, { ...v, revenue: Math.round(v.revenue * 100) / 100 }, provider, ['revenue', 'orders', 'new_customers']);
  }
  run("UPDATE integrations SET status = 'connected', last_sync_at = datetime('now'), last_error = NULL WHERE business_id = ? AND provider = ?", bizId, provider);
  return Object.keys(months).length;
}

r.get('/', (req, res) => {
  res.json(all('SELECT provider, config, status, last_sync_at, last_error FROM integrations WHERE business_id = ?', req.biz.id)
    .map(({ config, ...i }) => ({ ...i, ...providers[i.provider]?.safe(decrypt(config) || {}) })));
});

r.put('/:provider', requireEditor, async (req, res) => {
  const p = providers[req.params.provider];
  if (!p) return res.status(404).json({ error: 'تكامل غير معروف' });
  const config = Object.fromEntries(Object.entries(req.body || {}).map(([k, v]) => [k, String(v).trim()]));
  if (!p.validate(config)) return res.status(400).json({ error: 'بيانات الربط غير مكتملة' });
  try {
    await p.fetch(config, new Date(Date.now() - 86400000 * 30).toISOString(), 1); // connection test
  } catch (err) {
    return res.status(400).json({ error: `تعذّر الاتصال بالمتجر: ${err.message}` });
  }
  run(`INSERT INTO integrations (business_id, provider, config) VALUES (?, ?, ?)
       ON CONFLICT(business_id, provider) DO UPDATE SET config = excluded.config, status = 'connected', last_error = NULL`,
    req.biz.id, req.params.provider, encrypt(config));
  logActivity(req.user.id, 'integration_connect', { provider: req.params.provider }, req.biz.id);
  res.json({ ok: true });
});

r.post('/:provider/sync', requireEditor, async (req, res) => {
  const row = one('SELECT config FROM integrations WHERE business_id = ? AND provider = ?', req.biz.id, req.params.provider);
  if (!row || !providers[req.params.provider]) return res.status(404).json({ error: 'المتجر غير مربوط' });
  try {
    const months = await sync(req.biz.id, req.params.provider, decrypt(row.config));
    logActivity(req.user.id, 'integration_sync', { provider: req.params.provider, months }, req.biz.id);
    res.json({ months });
  } catch (err) {
    run("UPDATE integrations SET status = 'error', last_error = ? WHERE business_id = ? AND provider = ?", err.message.slice(0, 300), req.biz.id, req.params.provider);
    res.status(502).json({ error: `فشلت المزامنة: ${err.message}` });
  }
});

r.delete('/:provider', requireEditor, (req, res) => {
  run('DELETE FROM integrations WHERE business_id = ? AND provider = ?', req.biz.id, req.params.provider);
  res.json({ ok: true });
});

// Used by the scheduler for a nightly refresh of every connected store.
export async function syncAllStores() {
  for (const row of all("SELECT business_id, provider, config FROM integrations WHERE status != 'disabled'")) {
    try { await sync(row.business_id, row.provider, decrypt(row.config)); } catch (err) {
      run("UPDATE integrations SET status = 'error', last_error = ? WHERE business_id = ? AND provider = ?", err.message.slice(0, 300), row.business_id, row.provider);
    }
  }
}

export default r;
