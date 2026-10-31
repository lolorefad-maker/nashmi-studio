// Business assistant: a conversation that knows the business, reads attachments, and proposes
// systems, automations and records as structured blocks the user can create with one click.
import { Router } from 'express';
import ExcelJS from 'exceljs';
import { Readable } from 'node:stream';
import { one, all, run } from '../db.js';
import { requireAuth } from '../auth.js';
import { requireBusiness, requireEditor } from '../context.js';
import { computeKpis } from '../analytics.js';
import { businessContext } from '../ai.js';
import { stream, provider } from '../llm.js';
import { systemsContext } from '../systems.js';

const r = Router();
r.use(requireAuth, requireBusiness);

const COST = 1;
const MAX_FILE = 8_000_000;

r.get('/threads', (req, res) => {
  res.json(all('SELECT id, title, updated_at FROM assistant_threads WHERE business_id = ? AND user_id = ? ORDER BY updated_at DESC LIMIT 50', req.biz.id, req.user.id));
});

r.get('/threads/:id', (req, res) => {
  const t = one('SELECT * FROM assistant_threads WHERE id = ? AND business_id = ? AND user_id = ?', req.params.id, req.biz.id, req.user.id);
  if (!t) return res.status(404).json({ error: 'المحادثة غير موجودة' });
  res.json({ ...t, messages: all('SELECT id, role, content, files, created_at FROM assistant_messages WHERE thread_id = ? ORDER BY id', t.id)
    .map((m) => ({ ...m, files: m.files ? JSON.parse(m.files) : [] })) });
});

r.delete('/threads/:id', (req, res) => {
  run('DELETE FROM assistant_threads WHERE id = ? AND business_id = ? AND user_id = ?', req.params.id, req.biz.id, req.user.id);
  res.json({ ok: true });
});

function systemPrompt(req) {
  const metrics = all('SELECT * FROM metrics WHERE business_id = ? ORDER BY period', req.biz.id);
  const kpis = computeKpis(metrics);
  const workflows = all('SELECT name, trigger, enabled FROM workflows WHERE business_id = ?', req.biz.id)
    .map((w) => `- ${w.name} (${JSON.parse(w.trigger).type}${w.enabled ? '' : '، متوقفة'})`).join('\n') || 'لا توجد أتمتة بعد.';
  return `أنت "مساعد الأعمال" في منصة ${process.env.APP_NAME || 'Nashmi Studio'}: مستشار أعمال خبير ومهندس أنظمة يعمل جنباً إلى جنب مع صاحب هذا النشاط.
تاريخ اليوم: ${new Date().toISOString().slice(0, 10)}. المستخدم: ${req.user.name} (${req.role}).

مهامك:
1. حلّل أي مشكلة أو طلب يواجهه في عمله (مبيعات، تسويق، موظفين، تسعير، عملاء، تشغيل، مالية...) وقدّم حلولاً عملية مرقّمة ومحددة بالأرقام، مع خطوات تنفيذ واضحة.
2. اكتب ما يحتاجه مباشرة: خطط، ردود على العملاء، رسائل، سياسات، عروض أسعار، وصف وظائف، عقود مبسطة.
3. إذا طلب نظاماً لإدارة عمله (مخزون، عملاء CRM، طلبات، فواتير، موظفين، حجوزات، موردين، ERP...) صمّمه كجداول واكتب كتلة واحدة بهذا الشكل بالضبط:
\`\`\`nashmi-app
{"name": "اسم النظام", "description": "وصف قصير", "icon": "boxes|package|users|receipt|truck|clipboard-list|briefcase|calendar|wallet|shopping-cart|store|wrench|utensils|building-2|folder-kanban|list-checks",
 "tables": [{"key": "products", "name": "المنتجات", "fields": [{"key": "name", "label": "اسم المنتج", "type": "text", "required": true}, {"key": "qty", "label": "الكمية", "type": "number"}, {"key": "status", "label": "الحالة", "type": "select", "options": ["متوفر", "منخفض"]}]}]}
\`\`\`
   أنواع الحقول المسموحة فقط: text, longtext, number, money, date, select (مع options), phone, email, boolean. حتى 6 جداول و12 حقلاً لكل جدول. key بالإنجليزية snake_case.
4. إذا طلب أتمتة أو workflow (تذكير، متابعة، تقرير دوري، تنبيه عند حدث...) اكتب كتلة:
\`\`\`nashmi-workflow
{"name": "...", "description": "...", "trigger": {"type": "schedule", "every": "day|week|month", "hour": 9, "weekday": 0, "day": 1},
 "steps": [{"type": "ai", "prompt": "..."}, {"type": "notify", "message": "{{ai}}"}]}
\`\`\`
   أنواع المشغّل: {"type":"manual"} أو schedule أو {"type":"record_created","app":"اسم النظام","table":"key الجدول"}.
   أنواع الخطوات: ai (prompt، والنتيجة في {{ai}}) · notify (message: تنبيه داخل المنصة) · email (to, subject, body) · whatsapp (to, text) · create_record (app, table, values) · webhook (url بـ https).
   المتغيرات: {{business}} {{date}} {{owner_email}} {{ai}} {{kpi.revenue}} {{kpi.profit}} {{kpi.margin}} {{record.<field_key>}} (لمشغّل record_created).
   إذا كانت الأتمتة تعتمد على نظام غير موجود، صمّم النظام أولاً في نفس الرد ثم الأتمتة.
5. لإضافة بيانات إلى نظام موجود (أو بيانات من ملف أرسله): \`\`\`nashmi-records {"app": "اسم النظام", "table": "key", "records": [{...}]} \`\`\`
اشرح باختصار قبل أي كتلة ماذا سيُنشأ، فالمستخدم سيضغط زراً لإنشائه. لا تضع أكثر من كتلة من كل نوع في الرد الواحد.

قواعد: لا تخترع أرقاماً — استخدم البيانات أدناه وقل بوضوح إن كانت ناقصة. أجب بلغة المستخدم (العربية افتراضياً) بأسلوب مهني ودود ومختصر. استخدم Markdown (عناوين قصيرة، نقاط، جداول عند المقارنة).

=== النشاط ===
${businessContext(req.biz)}
العملة: ${req.biz.currency}

=== المؤشرات الحالية ===
${kpis ? JSON.stringify(kpis) : 'لا توجد بيانات أداء بعد.'}
آخر الأشهر: ${metrics.slice(-6).map((m) => `${m.period}: إيراد ${m.revenue}، مصاريف ${m.expenses}، طلبات ${m.orders}، عملاء جدد ${m.new_customers}`).join(' | ') || '—'}

=== الأنظمة الحالية وبياناتها ===
${systemsContext(req.biz.id)}

=== الأتمتة الحالية ===
${workflows}`;
}

// Images and PDFs are passed to the model as-is; spreadsheets and text become text.
async function readAttachments(files = []) {
  const parts = [];
  const notes = [];
  for (const f of files.slice(0, 4)) {
    const m = /^data:([^;]+);base64,(.+)$/.exec(f.data || '');
    if (!m) continue;
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > MAX_FILE) { notes.push(`(تم تجاهل ${f.name}: أكبر من 8MB)`); continue; }
    const mime = m[1];
    if (/^image\/|application\/pdf/.test(mime)) parts.push({ mime, data: m[2] });
    else if (/sheet|excel|csv/.test(mime) || /\.(xlsx|csv)$/i.test(f.name)) {
      const wb = new ExcelJS.Workbook();
      try {
        if (/\.csv$/i.test(f.name) || /csv/.test(mime)) await wb.csv.read(Readable.from(buf.toString('utf8')));
        else await wb.xlsx.load(buf);
        for (const ws of wb.worksheets.slice(0, 3)) {
          const rows = [];
          ws.eachRow((row, i) => { if (i <= 300) rows.push(row.values.slice(1).map((v) => (v && typeof v === 'object' ? v.result ?? v.text ?? '' : v ?? '')).join(' | ')); });
          notes.push(`[ملف ${f.name} — ورقة ${ws.name}, ${ws.rowCount} صف]\n${rows.join('\n')}`);
        }
      } catch { notes.push(`(تعذّرت قراءة ${f.name})`); }
    } else if (/^text\/|json/.test(mime)) notes.push(`[ملف ${f.name}]\n${buf.toString('utf8').slice(0, 20000)}`);
    else notes.push(`(نوع الملف ${f.name} غير مدعوم)`);
  }
  return { parts, text: notes.join('\n\n') };
}

const FALLBACK = 'المساعد غير متصل بنموذج ذكاء اصطناعي حالياً. أضف `AI_BASE_URL` (نموذج نشمي) أو `GEMINI_API_KEY` في ملف ‎.env‎ ثم أعد تشغيل الخادم.';

r.post('/message', requireEditor, async (req, res) => {
  const content = String(req.body?.content || '').trim().slice(0, 8000);
  const files = Array.isArray(req.body?.files) ? req.body.files : [];
  if (!content && !files.length) return res.status(400).json({ error: 'اكتب رسالتك' });

  let thread = req.body?.thread_id ? one('SELECT * FROM assistant_threads WHERE id = ? AND business_id = ? AND user_id = ?', req.body.thread_id, req.biz.id, req.user.id) : null;
  if (!thread) {
    const { lastInsertRowid } = run('INSERT INTO assistant_threads (business_id, user_id, title) VALUES (?, ?, ?)',
      req.biz.id, req.user.id, (content || files[0]?.name || 'محادثة جديدة').replace(/\s+/g, ' ').slice(0, 60));
    thread = one('SELECT * FROM assistant_threads WHERE id = ?', lastInsertRowid);
  }

  const attachments = await readAttachments(files);
  const fileMeta = files.slice(0, 4).map((f) => ({ name: String(f.name || 'file').slice(0, 120), type: String(f.type || '').slice(0, 80) }));
  run('INSERT INTO assistant_messages (thread_id, role, content, files) VALUES (?, ?, ?, ?)', thread.id, 'user', content || '(مرفق)', fileMeta.length ? JSON.stringify(fileMeta) : null);

  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  send('thread', { id: thread.id, title: thread.title });

  const multimodal = attachments.parts.length > 0;
  if (!provider({ multimodal })) {
    run('INSERT INTO assistant_messages (thread_id, role, content) VALUES (?, ?, ?)', thread.id, 'assistant', FALLBACK);
    send('token', { t: FALLBACK });
    send('done', { thread_id: thread.id });
    return res.end();
  }
  const { changes } = run('UPDATE users SET credits = credits - ? WHERE id = ? AND credits >= ?', COST, req.owner.id, COST);
  if (!changes) {
    send('error', { error: 'رصيدك من النقاط غير كافٍ — قم بترقية باقتك' });
    return res.end();
  }

  // Recent history as plain text; only the current message carries its attachments.
  const history = all('SELECT role, content FROM assistant_messages WHERE thread_id = ? ORDER BY id DESC LIMIT 21', thread.id).reverse();
  history.pop();
  const messages = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: [content, attachments.text].filter(Boolean).join('\n\n') || 'حلّل المرفق', files: attachments.parts },
  ];

  try {
    const { text, provider: p } = await stream({ system: systemPrompt(req), messages, onToken: (t) => send('token', { t }) });
    const answer = text.trim() || 'لم يصل رد من النموذج، حاول مرة أخرى.';
    const { lastInsertRowid } = run('INSERT INTO assistant_messages (thread_id, role, content) VALUES (?, ?, ?)', thread.id, 'assistant', answer);
    run("UPDATE assistant_threads SET updated_at = datetime('now') WHERE id = ?", thread.id);
    run("INSERT INTO ai_usage (user_id, business_id, kind, source) VALUES (?, ?, 'assistant', ?)", req.user.id, req.biz.id, p.name);
    send('done', { thread_id: thread.id, message_id: Number(lastInsertRowid), credits: one('SELECT credits FROM users WHERE id = ?', req.owner.id).credits, provider: p.name });
  } catch (err) {
    console.error('[assistant]', err.message);
    run('UPDATE users SET credits = credits + ? WHERE id = ?', COST, req.owner.id);
    run("INSERT INTO ai_usage (user_id, business_id, kind, source, ok) VALUES (?, ?, 'assistant', 'error', 0)", req.user.id, req.biz.id);
    send('error', { error: err.status === 429 ? 'المساعد مشغول حالياً (تم تجاوز حد الطلبات)، حاول بعد دقيقة' : 'تعذّر الحصول على رد، حاول مرة أخرى' });
  }
  res.end();
});

export default r;
