// Outgoing email (team invites, monthly reports) and WhatsApp Cloud API messages.
import nodemailer from 'nodemailer';

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM, WA_TOKEN, WA_PHONE_ID, WA_TEMPLATE, WA_TEMPLATE_LANG } = process.env;

export const mailEnabled = () => Boolean(SMTP_HOST && MAIL_FROM);
export const whatsappEnabled = () => Boolean(WA_TOKEN && WA_PHONE_ID && WA_TEMPLATE);
export const publicUrl = () => (process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/+$/, '');

let transport = null;
function getTransport() {
  transport ??= nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: Number(SMTP_PORT) === 465,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });
  return transport;
}

export async function sendMail({ to, subject, html }) {
  if (!mailEnabled()) throw new Error('البريد غير مُعدّ — أضف إعدادات SMTP في ملف .env');
  await getTransport().sendMail({ from: MAIL_FROM, to, subject, html });
}

// Business-initiated WhatsApp messages need an approved template; {{1}} receives the text.
export async function sendWhatsApp(to, text) {
  if (!whatsappEnabled()) throw new Error('واتساب غير مُعدّ — أضف إعدادات WA_* في ملف .env');
  const res = await fetch(`https://graph.facebook.com/v21.0/${WA_PHONE_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: String(to).replace(/[^\d]/g, ''),
      type: 'template',
      template: {
        name: WA_TEMPLATE,
        language: { code: WA_TEMPLATE_LANG || 'ar' },
        components: [{ type: 'body', parameters: [{ type: 'text', text: text.slice(0, 1000) }] }],
      },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`WhatsApp ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

// Minimal RTL email shell shared by all messages.
export function emailLayout({ title, body, cta, ctaUrl }) {
  return `<!doctype html><html dir="rtl" lang="ar"><body style="margin:0;background:#f4efe7;font-family:Tahoma,Arial,sans-serif;color:#1d1408">
  <div style="max-width:560px;margin:0 auto;padding:28px 16px">
    <div style="background:#1a1412;color:#f6efe2;border-radius:18px 18px 0 0;padding:22px 26px;font-size:20px;font-weight:bold">
      ${process.env.APP_NAME || 'Nashmi Studio'}</div>
    <div style="background:#fff;border-radius:0 0 18px 18px;padding:26px;line-height:1.9;font-size:15px">
      <h2 style="margin:0 0 12px;font-size:19px">${title}</h2>${body}
      ${cta ? `<p style="margin:24px 0 0"><a href="${ctaUrl}" style="background:#d9a85f;color:#1d1408;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:bold">${cta}</a></p>` : ''}
    </div></div></body></html>`;
}
