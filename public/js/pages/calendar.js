import { $, $$, esc, api, state, toast, modal, confirmDialog, withBtn, fileToDataURL, icons, LOCALE } from '../core.js';
import { setCredits } from '../app.js';
import { loadFabric, loadFonts } from '../poster.js';

const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const PLATFORM = { instagram: ['camera', 'انستغرام'], facebook: ['thumbs-up', 'فيسبوك'] };
const STATUS = {
  scheduled: ['', 'مجدول'], draft: ['', 'مسودة'], published: ['good', 'تم النشر'],
  due: ['warn', 'جاهز للنشر يدوياً'], failed: ['bad', 'فشل النشر'],
};

const pad = (n) => String(n).padStart(2, '0');
const toLocalInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const timeLabel = (iso) => new Date(iso).toLocaleTimeString(LOCALE, { hour: 'numeric', minute: '2-digit' });

// Renders a saved design at full size so it can be published.
async function renderDesignImage(id) {
  const d = await api(`/designs/${id}`);
  const json = JSON.parse(d.canvas_json);
  await loadFabric();
  const fonts = new Set();
  const walk = (objs = []) => objs.forEach((o) => { if (o.fontFamily) fonts.add(o.fontFamily); walk(o.objects); });
  walk(json.objects);
  await loadFonts([...fonts]);
  const sc = new window.fabric.StaticCanvas(document.createElement('canvas'), { width: d.width, height: d.height, enableRetinaScaling: false });
  await new Promise((r) => sc.loadFromJSON(json, r));
  sc.renderAll();
  const url = sc.toDataURL({ format: 'jpeg', quality: 0.92 });
  sc.dispose();
  return url;
}

export async function postModal({ post = null, designId = null, image = null, title = '', caption = '', date = null, onSaved } = {}) {
  const designs = await api('/designs');
  let chosenDesign = post?.design_id || designId || null;
  let img = image;
  let platforms = new Set(post?.platforms || ['instagram', 'facebook']);
  const when = post ? new Date(post.scheduled_at) : date || new Date(Date.now() + 3600_000);
  const locked = post?.status === 'published';
  const preview = () => img || post?.image || designs.find((d) => d.id === chosenDesign)?.thumbnail || '';

  const m = modal({
    title: post ? 'تعديل المنشور' : 'جدولة منشور', sub: post ? `الحالة: ${STATUS[post.status]?.[1] || post.status}` : 'اختر التصميم والنص وموعد النشر',
    wide: true,
    body: `
      ${post?.error ? `<div class="card tint-rose" style="box-shadow:none;margin-bottom:14px;padding:12px 14px"><b class="small">${esc(post.error)}</b></div>` : ''}
      <div class="grid" style="grid-template-columns:minmax(0,220px) minmax(0,1fr);gap:18px">
        <div>
          <div id="pm-preview" style="aspect-ratio:1;border-radius:16px;background:rgba(0,0,0,.3);display:grid;place-items:center;overflow:hidden;border:1px solid var(--line-2)"></div>
          ${locked ? '' : `<select class="select" id="pm-design" style="margin-top:10px">
            <option value="">— اختر تصميماً محفوظاً —</option>
            ${designs.map((d) => `<option value="${d.id}" ${d.id === chosenDesign ? 'selected' : ''}>${esc(d.title)}</option>`).join('')}
          </select>
          <label class="btn sm" style="width:100%;margin-top:8px"><i data-lucide="upload"></i>أو ارفع صورة<input type="file" accept="image/jpeg,image/png" id="pm-file" hidden></label>`}
        </div>
        <div class="grid" style="gap:12px;align-content:start">
          <label class="field"><span>نص المنشور</span><textarea class="textarea" id="pm-caption" rows="6" ${locked ? 'readonly' : ''}>${esc(post?.caption ?? caption)}</textarea></label>
          ${locked ? '' : '<button class="btn sm" id="pm-ai" style="justify-self:start"><i data-lucide="sparkles"></i>اكتب النص بالذكاء الاصطناعي <span class="badge" style="border:0">1 نقطة</span></button>'}
          <div><span class="st-label">المنصات</span><div class="chips">${Object.entries(PLATFORM).map(([k, [ic, l]]) =>
            `<span class="chip ${platforms.has(k) ? 'active' : ''}" data-platform="${k}"><i data-lucide="${ic}"></i>${l}</span>`).join('')}</div></div>
          <label class="field"><span>موعد النشر</span><input class="input num" type="datetime-local" id="pm-when" value="${toLocalInput(when)}" ${locked ? 'disabled' : ''}></label>
        </div>
      </div>`,
    actions: locked ? [{ label: 'إغلاق' }] : [
      { label: post ? 'حفظ التعديلات' : 'جدولة', kind: 'primary', onClick: (el) => save(el, 'scheduled') },
      { label: 'حفظ كمسودة', onClick: (el) => save(el, 'draft') },
      ...(post ? [
        { label: 'انشر الآن', kind: 'gold', onClick: async () => {
          const res = await api(`/social/posts/${post.id}/publish`, { method: 'POST' }).catch((e) => ({ status: 'failed', error: e.message }));
          toast(res.status === 'published' ? 'تم النشر بنجاح' : res.error || 'تعذّر النشر', res.status === 'published' ? 'ok' : 'err');
          onSaved?.();
        } },
        { label: 'حذف', kind: 'danger', onClick: async () => {
          if (!(await confirmDialog('حذف المنشور', 'سيتم حذف المنشور من التقويم.', 'حذف'))) return false;
          await api(`/social/posts/${post.id}`, { method: 'DELETE' });
          toast('تم حذف المنشور');
          onSaved?.();
        } },
      ] : []),
    ],
  });

  const drawPreview = () => {
    const src = preview();
    $('#pm-preview', m.el).innerHTML = src ? `<img src="${src}" alt="" style="width:100%;height:100%;object-fit:contain">` : '<span class="muted small">بدون صورة</span>';
  };
  drawPreview();

  if (post && ['due', 'failed', 'published'].includes(post.status) && preview()) {
    const tools = document.createElement('div');
    tools.className = 'row wrap';
    tools.style.marginTop = '12px';
    tools.innerHTML = `<a class="btn sm" href="${preview()}" download="post-${post.id}.jpg"><i data-lucide="download"></i>تنزيل الصورة</a>
      <button class="btn sm" data-copy-caption><i data-lucide="copy"></i>نسخ النص</button>
      ${post.status !== 'published' ? '<button class="btn sm" data-mark><i data-lucide="check"></i>نشرته يدوياً</button>' : ''}`;
    $('.modal-body', m.el).append(tools);
    icons();
    $('[data-copy-caption]', tools).onclick = () => navigator.clipboard.writeText(post.caption).then(() => toast('تم نسخ النص'));
    $('[data-mark]', tools)?.addEventListener('click', async () => {
      await api(`/social/posts/${post.id}/mark-published`, { method: 'POST' });
      toast('تم تحديث الحالة'); m.close(); onSaved?.();
    });
  }

  $('#pm-design', m.el)?.addEventListener('change', (e) => { chosenDesign = Number(e.target.value) || null; img = null; drawPreview(); });
  $('#pm-file', m.el)?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 8_000_000) return toast('الصورة أكبر من 8MB', 'err');
    img = await fileToDataURL(file);
    chosenDesign = null;
    $('#pm-design', m.el).value = '';
    drawPreview();
  });
  m.el.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-platform]');
    if (!chip || locked) return;
    const k = chip.dataset.platform;
    platforms.has(k) ? platforms.delete(k) : platforms.add(k);
    chip.classList.toggle('active', platforms.has(k));
  });
  $('#pm-ai', m.el)?.addEventListener('click', (e) => withBtn(e.currentTarget, async () => {
    const topic = $('#pm-caption', m.el).value.trim() || title || designs.find((d) => d.id === chosenDesign)?.title || state.me.business?.name;
    const res = await api('/ai/copy', { method: 'POST', body: { topic, platform: platforms.has('instagram') ? 'Instagram' : 'Facebook' } });
    setCredits(res.credits);
    $('#pm-caption', m.el).value = `${res.data.captions[0]}\n\n${res.data.hashtags.join(' ')}`;
  }));

  async function save(el, status) {
    const local = $('#pm-when', el).value;
    if (!local) { toast('حدد موعد النشر', 'err'); return false; }
    let image = img;
    if (!image && chosenDesign && chosenDesign !== post?.design_id) image = await renderDesignImage(chosenDesign);
    if (!image && !post?.image && platforms.has('instagram')) { toast('انستغرام يتطلب صورة — اختر تصميماً أو ارفع صورة', 'err'); return false; }
    const body = { caption: $('#pm-caption', el).value, platforms: [...platforms], scheduled_at: new Date(local).toISOString(), status, design_id: chosenDesign, image };
    try {
      if (post) await api(`/social/posts/${post.id}`, { method: 'PUT', body });
      else await api('/social/posts', { method: 'POST', body });
    } catch (err) { toast(err.message, 'err'); return false; }
    toast(status === 'draft' ? 'تم حفظ المسودة' : 'تمت جدولة المنشور ✓');
    onSaved?.();
  }
}

function pageChoice(choices, reload) {
  modal({
    title: 'اختر الصفحة', sub: 'لديك أكثر من صفحة فيسبوك — اختر التي تريد النشر عليها',
    body: `<div class="list">${choices.map((c) => `<button class="list-item btn ghost" style="height:auto;justify-content:flex-start" data-page="${esc(c.id)}">
      <i data-lucide="flag"></i><div class="grow" style="text-align:start"><b>${esc(c.name)}</b><p>${c.instagram ? `انستغرام: @${esc(c.instagram)}` : 'بدون حساب انستغرام أعمال'}</p></div></button>`).join('')}</div>`,
  }).el.addEventListener('click', async (e) => {
    const id = e.target.closest('[data-page]')?.dataset.page;
    if (!id) return;
    await api('/social/select', { method: 'POST', body: { page_id: id } });
    toast('تم ربط الصفحة');
    reload();
  });
}

export async function render(view, { params }) {
  let cursor = new Date();
  cursor.setDate(1);
  const status = await api('/social/status');
  const reload = () => window.dispatchEvent(new HashChangeEvent('hashchange'));

  const META_MSG = { connected: ['تم ربط حساباتك بنجاح', 'ok'], cancelled: ['تم إلغاء الربط', 'info'], nopages: ['لا توجد صفحات فيسبوك في هذا الحساب', 'err'], error: ['تعذّر ربط الحساب، حاول مرة أخرى', 'err'] };
  if (META_MSG[params.meta]) toast(...META_MSG[params.meta]);
  if (status.choices.length) pageChoice(status.choices, reload);

  view.innerHTML = `
  <div class="page-head">
    <div><h1>تقويم المحتوى</h1><p>خطط منشوراتك وجدولها للنشر على انستغرام وفيسبوك</p></div>
    <div class="row wrap">
      <div class="row glass" style="border-radius:999px;padding:4px">
        <button class="btn ghost sm icon" id="prev" aria-label="الشهر السابق"><i data-lucide="chevron-right"></i></button>
        <b id="month-label" style="min-width:130px;text-align:center"></b>
        <button class="btn ghost sm icon" id="next" aria-label="الشهر التالي"><i data-lucide="chevron-left"></i></button>
      </div>
      <button class="btn gold" id="new"><i data-lucide="plus"></i>منشور جديد</button>
    </div>
  </div>

  <div class="card ${status.account ? 'tint-green' : ''}" style="margin-bottom:18px">
    <div class="row wrap" style="gap:14px">
      <span class="icon-chip"><i data-lucide="share-2"></i></span>
      ${status.account ? `
        <div class="spacer"><b>متصل بصفحة ${esc(status.account.page)}</b>
          <p class="muted small" style="margin:2px 0 0">${status.account.instagram ? `انستغرام: @${esc(status.account.instagram)} · ` : 'لا يوجد انستغرام أعمال مرتبط · '}المنشورات المجدولة تُنشر تلقائياً في موعدها</p></div>
        <button class="btn sm ghost danger" id="disconnect">فصل الحساب</button>`
      : status.enabled ? `
        <div class="spacer"><b>اربط فيسبوك وانستغرام للنشر التلقائي</b>
          <p class="muted small" style="margin:2px 0 0">يتطلب صفحة فيسبوك وحساب انستغرام أعمال مرتبطاً بها</p></div>
        <a class="btn primary" href="/api/social/connect"><i data-lucide="link"></i>ربط الحسابات</a>`
      : `
        <div class="spacer"><b>النشر التلقائي غير مفعّل بعد</b>
          <p class="muted small" style="margin:2px 0 0">يمكنك الجدولة الآن: عند حلول الموعد يظهر المنشور كـ "جاهز للنشر" مع الصورة والنص لتنشره بضغطة. لتفعيل النشر التلقائي يضيف مدير المنصة إعدادات تطبيق Meta.</p></div>`}
    </div>
  </div>

  <div class="card dark" style="padding:14px">
    <div class="cal-grid cal-head">${DAYS.map((d) => `<div>${d}</div>`).join('')}</div>
    <div class="cal-grid" id="cal"></div>
  </div>
  <div class="card section-gap" id="pending-card"></div>`;

  async function draw() {
    const first = new Date(cursor);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    const end = new Date(start);
    end.setDate(start.getDate() + 42);
    $('#month-label', view).textContent = first.toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' });
    const posts = await api(`/social/posts?from=${start.toISOString()}&to=${end.toISOString()}`);
    const today = new Date().toDateString();
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      const items = posts.filter((p) => new Date(p.scheduled_at).toDateString() === day.toDateString());
      cells.push(`<div class="cal-day ${day.getMonth() !== first.getMonth() ? 'other' : ''} ${day.toDateString() === today ? 'today' : ''}" data-day="${day.toISOString()}">
        <span class="cal-num num">${day.getDate()}</span>
        ${items.map((p) => `<button class="cal-post ${p.status}" data-post="${p.id}" title="${esc(p.caption.slice(0, 80))}">
          ${p.image ? `<img src="${p.image}" alt="">` : ''}<span class="num">${timeLabel(p.scheduled_at)}</span>
          ${p.platforms.map((k) => `<i data-lucide="${PLATFORM[k][0]}"></i>`).join('')}</button>`).join('')}
      </div>`);
    }
    $('#cal', view).innerHTML = cells.join('');
    view._posts = posts;

    const pending = posts.filter((p) => ['due', 'failed'].includes(p.status));
    const upcoming = posts.filter((p) => p.status === 'scheduled' && new Date(p.scheduled_at) > new Date()).slice(0, 5);
    $('#pending-card', view).innerHTML = `
      <div class="card-head"><h3 class="card-title"><i data-lucide="list-checks" style="width:18px"></i>${pending.length ? 'منشورات بحاجة لانتباهك' : 'القادمة'}</h3></div>
      <div class="list">${(pending.length ? pending : upcoming).map((p) => `<div class="list-item" data-post="${p.id}" style="cursor:pointer">
        <div style="width:44px;height:44px;border-radius:10px;overflow:hidden;background:rgba(0,0,0,.3);flex:none">${p.image ? `<img src="${p.image}" alt="" style="width:100%;height:100%;object-fit:cover">` : ''}</div>
        <div class="grow"><b class="small" style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.caption || 'بدون نص')}</b>
          <p>${new Date(p.scheduled_at).toLocaleString(LOCALE, { weekday: 'long', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</p></div>
        <span class="badge ${STATUS[p.status][0]}">${STATUS[p.status][1]}</span></div>`).join('') || '<p class="muted small" style="margin:0">لا توجد منشورات قادمة هذا الشهر — اضغط على أي يوم لجدولة منشور.</p>'}</div>`;
    icons();
  }
  await draw();

  const open = (opts) => postModal({ ...opts, onSaved: draw });
  $('#new', view).onclick = () => open({});
  $('#prev', view).onclick = () => { cursor.setMonth(cursor.getMonth() - 1); draw(); };
  $('#next', view).onclick = () => { cursor.setMonth(cursor.getMonth() + 1); draw(); };
  $('#disconnect', view)?.addEventListener('click', async () => {
    if (!(await confirmDialog('فصل الحساب', 'لن تُنشر المنشورات المجدولة تلقائياً بعد الفصل.', 'فصل'))) return;
    await api('/social/account', { method: 'DELETE' });
    reload();
  });
  view.addEventListener('click', (e) => {
    const postEl = e.target.closest('[data-post]');
    if (postEl) return open({ post: view._posts.find((p) => p.id === Number(postEl.dataset.post)) });
    const day = e.target.closest('[data-day]')?.dataset.day;
    if (day) {
      const d = new Date(day);
      d.setHours(10, 0, 0, 0);
      open({ date: d < new Date() ? new Date(Date.now() + 3600_000) : d });
    }
  });
  if (params.new) open({});
}
