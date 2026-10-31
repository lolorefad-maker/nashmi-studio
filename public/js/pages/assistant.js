import { $, $$, esc, api, state, toast, icons, fileToDataURL, fmt } from '../core.js';
import { setCredits } from '../app.js';
import { subnav, renderAnswer, bindProposals, knownItems } from '../biz.js';

const SUGGESTIONS = [
  ['trending-down', 'مبيعاتي نزلت هالشهر، شو الأسباب المحتملة وشو أعمل بالزبط؟'],
  ['boxes', 'ابنيلي نظام لإدارة المخزون والمبيعات والموردين لمحلي'],
  ['users', 'بدي نظام CRM أتابع فيه العملاء والطلبات والمتابعات'],
  ['workflow', 'اعمل أتمتة تحلل أرقامي وتبعتلي ملخص كل يوم أحد الصبح'],
  ['message-square-warning', 'عميل زعلان من التأخير بالتوصيل، اكتبلي رد احترافي يرضيه'],
  ['calculator', 'ساعدني أسعّر منتج جديد: التكلفة 4 دنانير وبدي هامش ربح صحي'],
];
const FILE_ICON = (t = '') => (/image/.test(t) ? 'image' : /pdf/.test(t) ? 'file-text' : /sheet|excel|csv/.test(t) ? 'file-spreadsheet' : 'file');

export async function render(view, { params }) {
  let threadId = params.t ? Number(params.t) : null;
  let files = [];
  let busy = false;
  let known = await knownItems();

  view.innerHTML = `
  ${subnav('assistant')}
  <div class="asst">
    <aside class="card asst-threads">
      <button class="btn gold" id="new-chat"><i data-lucide="message-square-plus"></i>محادثة جديدة</button>
      <span class="st-label" style="margin:6px 4px 0">المحادثات السابقة</span>
      <div class="list" id="threads"></div>
    </aside>
    <section class="card asst-main">
      <div class="asst-scroll" id="msgs"></div>
      <div class="asst-composer">
        <div id="chips"></div>
        <div class="box">
          <label class="btn icon" title="إرفاق صورة أو PDF أو Excel" aria-label="إرفاق ملف"><i data-lucide="paperclip"></i>
            <input type="file" id="file-in" multiple accept="image/*,application/pdf,.xlsx,.csv,.txt,.json" hidden></label>
          <textarea class="textarea" id="input" rows="1" placeholder="اكتب مشكلتك أو طلبك… مثلاً: ابنيلي نظام فواتير، أو ليش أرباحي قليلة؟"></textarea>
          <button class="btn gold icon" id="send" aria-label="إرسال"><i data-lucide="send-horizontal"></i></button>
        </div>
        <p class="muted small" style="margin:6px 4px 0">كل رسالة = نقطة واحدة · المساعد يعرف بيانات نشاطك وأنظمتك ويقدر يقرأ الصور وملفات PDF و Excel</p>
      </div>
    </section>
  </div>`;
  icons();

  const msgs = $('#msgs', view);
  const input = $('#input', view);
  bindProposals(msgs, { onCreated: async () => { known = await knownItems(); } });

  const scrollDown = () => { msgs.scrollTop = msgs.scrollHeight; };
  const userBubble = (text, fileMeta = []) => `<div class="msg user"><span class="avatar-sm"><i data-lucide="user-round"></i></span>
    <div class="bubble" dir="auto">${esc(text)}${fileMeta.map((f) => `<br><span class="file-chip"><i data-lucide="${FILE_ICON(f.type)}"></i>${esc(f.name)}</span>`).join('')}</div></div>`;
  const botBubble = (html, extra = '') => `<div class="msg bot"><span class="avatar-sm"><i data-lucide="bot"></i></span><div class="bubble ${extra}" dir="auto">${html}</div></div>`;

  function empty() {
    msgs.innerHTML = `<div class="asst-empty">
      <div class="orb"><i data-lucide="bot"></i></div>
      <h2>كيف أقدر أساعدك بشغلك اليوم؟</h2>
      <p class="muted">احكيلي عن أي مشكلة بتواجهك، أو اطلب نظاماً لإدارة عملك، أو أتمتة توفر وقتك — وأنا بشتغل معك خطوة بخطوة.</p>
      <div class="suggest">${SUGGESTIONS.map(([ic, s]) => `<button data-suggest="${esc(s)}"><i data-lucide="${ic}"></i><span>${esc(s)}</span></button>`).join('')}</div>
    </div>`;
    icons();
  }

  async function drawThreads() {
    const list = await api('/assistant/threads');
    $('#threads', view).innerHTML = list.map((t) => `<div class="thread ${t.id === threadId ? 'active' : ''}" data-thread="${t.id}">
      <i data-lucide="message-square"></i><span>${esc(t.title)}</span>
      <button data-del-thread="${t.id}" aria-label="حذف"><i data-lucide="trash-2"></i></button></div>`).join('')
      || '<p class="muted small" style="padding:0 6px">لا توجد محادثات بعد</p>';
    icons();
  }

  async function openThread(id) {
    threadId = id;
    if (!id) { empty(); drawThreads(); return; }
    const t = await api(`/assistant/threads/${id}`);
    msgs.innerHTML = t.messages.map((m) => (m.role === 'user' ? userBubble(m.content, m.files) : botBubble(renderAnswer(m.content, { known })))).join('');
    icons();
    scrollDown();
    drawThreads();
  }

  function drawChips() {
    $('#chips', view).innerHTML = files.map((f, i) => `<span class="file-chip"><i data-lucide="${FILE_ICON(f.type)}"></i>${esc(f.name)}
      <button data-rm-file="${i}" aria-label="إزالة"><i data-lucide="x"></i></button></span>`).join('');
    icons();
  }

  async function send(text) {
    text = (text ?? input.value).trim();
    if (busy || (!text && !files.length)) return;
    busy = true;
    $('#send', view).classList.add('loading');
    if (msgs.querySelector('.asst-empty')) msgs.innerHTML = '';
    const sending = files;
    files = [];
    drawChips();
    input.value = '';
    input.style.height = '';
    msgs.insertAdjacentHTML('beforeend', userBubble(text || 'حلّل المرفق', sending));
    msgs.insertAdjacentHTML('beforeend', botBubble('<span class="typing"></span>', 'live'));
    icons();
    scrollDown();
    const bubble = msgs.querySelector('.bubble.live');

    let answer = '';
    let frame = 0;
    const paint = (final) => {
      bubble.innerHTML = renderAnswer(answer, { final, known }) + (final ? '' : '<span class="typing"></span>');
      if (final) icons();
      scrollDown();
    };
    try {
      const res = await fetch('/api/assistant/message', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id: threadId, content: text, files: sending.map(({ name, type, data }) => ({ name, type, data })) }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'تعذّر الإرسال');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let cut;
        while ((cut = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, cut);
          buf = buf.slice(cut + 2);
          const event = /event: (\w+)/.exec(chunk)?.[1];
          const data = JSON.parse(/data: (.*)/s.exec(chunk)?.[1] || '{}');
          if (event === 'thread') threadId = data.id;
          if (event === 'token') {
            answer += data.t;
            if (!frame) frame = requestAnimationFrame(() => { frame = 0; paint(false); });
          }
          if (event === 'done' && data.credits != null) setCredits(data.credits);
          if (event === 'error') throw new Error(data.error);
        }
      }
      cancelAnimationFrame(frame);
      paint(true);
    } catch (err) {
      bubble.innerHTML = answer ? renderAnswer(answer, { known }) : `<span style="color:var(--critical-ink)">${esc(err.message)}</span>`;
      toast(err.message, 'err');
    } finally {
      bubble.classList.remove('live');
      busy = false;
      $('#send', view).classList.remove('loading');
      history.replaceState(null, '', `#/assistant?t=${threadId}`);
      drawThreads();
    }
  }

  $('#send', view).onclick = () => send();
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
  input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 180)}px`; });
  $('#new-chat', view).onclick = () => { history.replaceState(null, '', '#/assistant'); openThread(null); input.focus(); };
  $('#file-in', view).onchange = async (e) => {
    for (const f of [...e.target.files].slice(0, 4 - files.length)) {
      if (f.size > 8_000_000) { toast(`${f.name}: الحد 8MB`, 'err'); continue; }
      files.push({ name: f.name, type: f.type || (f.name.endsWith('.csv') ? 'text/csv' : ''), data: await fileToDataURL(f) });
    }
    e.target.value = '';
    drawChips();
  };
  view.addEventListener('click', async (e) => {
    const s = e.target.closest('[data-suggest]')?.dataset.suggest;
    if (s) return send(s);
    const del = e.target.closest('[data-del-thread]')?.dataset.delThread;
    if (del) {
      e.stopPropagation();
      await api(`/assistant/threads/${del}`, { method: 'DELETE' });
      if (Number(del) === threadId) openThread(null); else drawThreads();
      return;
    }
    const t = e.target.closest('[data-thread]')?.dataset.thread;
    if (t) { history.replaceState(null, '', `#/assistant?t=${t}`); openThread(Number(t)); }
    const rm = e.target.closest('[data-rm-file]')?.dataset.rmFile;
    if (rm != null) { files.splice(Number(rm), 1); drawChips(); }
  });

  await openThread(threadId);
  if (params.prompt && !threadId) { input.value = params.prompt; input.focus(); }
}
