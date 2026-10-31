// Monthly business report: data for the printable PDF page, and delivery by email / WhatsApp.
import { Router } from 'express';
import { one, all, run, logActivity } from '../db.js';
import { requireAuth } from '../auth.js';
import { requireBusiness, requireEditor } from '../context.js';
import { computeKpis } from '../analytics.js';
import { mailEnabled, whatsappEnabled, sendMail, sendWhatsApp, emailLayout, publicUrl } from '../mailer.js';

const r = Router();
r.use(requireAuth, requireBusiness);

const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 }));
const latestAnalysis = (bizId) => {
  const row = one("SELECT content, created_at FROM reports WHERE business_id = ? AND kind = 'analysis' ORDER BY id DESC LIMIT 1", bizId);
  return row ? { ...JSON.parse(row.content), created_at: row.created_at } : null;
};

function reportData(biz) {
  const metrics = all('SELECT * FROM metrics WHERE business_id = ? ORDER BY period', biz.id);
  return {
    business: { name: biz.name, logo: biz.logo, colors: JSON.parse(biz.colors), currency: biz.currency, industry: biz.industry, city: biz.city },
    kpis: computeKpis(metrics),
    metrics: metrics.slice(-12),
    analysis: latestAnalysis(biz.id),
    stats: {
      designs: one("SELECT COUNT(*) n FROM designs WHERE business_id = ? AND created_at >= date('now','start of month','-1 month')", biz.id).n,
      published: one("SELECT COUNT(*) n FROM posts WHERE business_id = ? AND status = 'published' AND published_at >= date('now','start of month','-1 month')", biz.id).n,
    },
    generated_at: new Date().toISOString(),
  };
}

export function summaryText(biz, kpis, analysis) {
  if (!kpis) return `تقرير ${biz.name}: لا توجد بيانات لهذا الشهر بعد.`;
  const recs = (analysis?.recommendations || []).slice(0, 3).map((x, i) => `${i + 1}. ${x.title}`).join('\n');
  return [
    `📊 تقرير ${biz.name} — ${kpis.period}`,
    `الإيرادات: ${fmt(kpis.revenue)} ${biz.currency} (${kpis.revGrowth ?? 0}%)`,
    `صافي الربح: ${fmt(kpis.profit)} · الهامش ${kpis.margin}%`,
    `عملاء جدد: ${fmt(kpis.newCustomers)} · العائد على الإعلانات ${kpis.roas ?? '—'}x`,
    `صحة النشاط: ${kpis.healthScore}/100`,
    recs && `\nأهم التوصيات:\n${recs}`,
  ].filter(Boolean).join('\n');
}

function reportEmail(biz, data) {
  const k = data.kpis;
  const row = (label, value) => `<tr><td style="padding:8px 0;color:#6b5d4f">${label}</td><td style="padding:8px 0;font-weight:bold;text-align:left">${value}</td></tr>`;
  const recs = (data.analysis?.recommendations || []).slice(0, 3)
    .map((x) => `<li style="margin-bottom:6px"><b>${x.title}</b> — ${x.detail || ''}</li>`).join('');
  return emailLayout({
    title: `التقرير الشهري — ${biz.name} (${k.period})`,
    body: `<table style="width:100%;border-collapse:collapse">${[
      row('الإيرادات', `${fmt(k.revenue)} ${biz.currency}`), row('صافي الربح', `${fmt(k.profit)} ${biz.currency}`),
      row('هامش الربح', `${k.margin}%`), row('عملاء جدد', fmt(k.newCustomers)),
      row('العائد على الإعلانات', k.roas == null ? '—' : `${k.roas}x`), row('صحة النشاط', `${k.healthScore}/100`),
    ].join('')}</table>${recs ? `<h3 style="font-size:16px;margin:20px 0 8px">أهم التوصيات</h3><ul style="padding-right:18px;margin:0">${recs}</ul>` : ''}`,
    cta: 'التقرير الكامل', ctaUrl: `${publicUrl()}/report`,
  });
}

export async function deliverReport(biz, { email = true, whatsapp = true } = {}) {
  const data = reportData(biz);
  if (!data.kpis) throw new Error('لا توجد بيانات لإرسال التقرير');
  const sent = [];
  if (email && mailEnabled()) {
    const to = biz.report_email || one('SELECT email FROM users WHERE id = ?', biz.user_id).email;
    await sendMail({ to, subject: `التقرير الشهري — ${biz.name}`, html: reportEmail(biz, data) });
    sent.push('email');
  }
  if (whatsapp && whatsappEnabled() && biz.report_whatsapp) {
    await sendWhatsApp(biz.report_whatsapp, summaryText(biz, data.kpis, data.analysis));
    sent.push('whatsapp');
  }
  return sent;
}

r.get('/data', (req, res) => res.json({ ...reportData(req.biz), summary: summaryText(req.biz, computeKpis(all('SELECT * FROM metrics WHERE business_id = ? ORDER BY period', req.biz.id)), latestAnalysis(req.biz.id)) }));

r.get('/settings', (req, res) => {
  const owner = one('SELECT email FROM users WHERE id = ?', req.biz.user_id);
  res.json({
    enabled: Boolean(req.biz.report_enabled), email: req.biz.report_email || '', ownerEmail: owner.email,
    whatsapp: req.biz.report_whatsapp || '', last: req.biz.last_report_period, mail: mailEnabled(), wa: whatsappEnabled(),
  });
});

r.post('/send', requireEditor, async (req, res) => {
  try {
    const sent = await deliverReport(req.biz, { email: req.body?.email !== false, whatsapp: req.body?.whatsapp !== false });
    if (!sent.length) return res.status(400).json({ error: 'لم يتم الإرسال — إعدادات البريد أو واتساب غير مكتملة في ملف .env' });
    logActivity(req.user.id, 'report_send', { sent }, req.biz.id);
    res.json({ sent });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Runs from the scheduler: on the 1st of each month (after 9:00), once per brand.
export async function sendMonthlyReports(now = new Date()) {
  if (now.getDate() !== 1 || now.getHours() < 9 || (!mailEnabled() && !whatsappEnabled())) return;
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const period = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
  for (const biz of all('SELECT * FROM businesses WHERE report_enabled = 1 AND (last_report_period IS NULL OR last_report_period != ?)', period)) {
    try {
      const sent = await deliverReport(biz);
      if (sent.length) logActivity(biz.user_id, 'report_send', { sent, auto: true }, biz.id);
    } catch (err) {
      console.error(`[monthly report] ${biz.name}:`, err.message);
    }
    run('UPDATE businesses SET last_report_period = ? WHERE id = ?', period, biz.id);
  }
}

export default r;
