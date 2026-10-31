import { $, $$, esc, api, fmt, toast, confirmDialog } from '../core.js';
import { FORMATS } from './overview.js';

export async function render(view) {
  const designs = await api('/designs');
  let filter = 'all';

  view.innerHTML = `
  <div class="page-head">
    <div><h1>تصاميمي</h1><p>${designs.length} تصميم محفوظ — افتح أي تصميم لتعديله أو تنزيله</p></div>
    <a class="btn gold" href="#/studio?new=1"><i data-lucide="plus"></i>تصميم جديد</a>
  </div>
  ${designs.length ? `<div class="chips" style="margin-bottom:18px">
    <span class="chip active" data-f="all">الكل</span>
    ${Object.entries(FORMATS).filter(([k]) => designs.some((d) => d.format === k)).map(([k, f]) => `<span class="chip" data-f="${k}">${f.label}</span>`).join('')}
  </div>` : ''}
  <div class="grid design-grid" id="grid"></div>`;

  const draw = () => {
    const list = designs.filter((d) => filter === 'all' || d.format === filter);
    $('#grid', view).innerHTML = list.length ? list.map((d) => `
      <div class="card design-tile hover" data-open="${d.id}">
        <div class="thumb">${d.thumbnail ? `<img src="${d.thumbnail}" alt="${esc(d.title)}" loading="lazy">` : ''}</div>
        <div class="meta"><div style="min-width:0"><b style="display:block">${esc(d.title)}</b>
          <span class="muted small"><span>${FORMATS[d.format]?.label || d.format}</span> · ${fmt.date(d.updated_at)}</span></div></div>
        <div class="actions">
          <a class="btn sm icon" href="${d.thumbnail || '#'}" download="${esc(d.title)}.jpg" title="تنزيل المعاينة" data-stop><i data-lucide="download"></i></a>
          <button class="btn sm icon danger" data-del="${d.id}" title="حذف"><i data-lucide="trash-2"></i></button>
        </div>
      </div>`).join('') : `
      <div class="card empty" style="grid-column:1/-1"><span class="icon-chip"><i data-lucide="images"></i></span>
        <h3>لا توجد تصاميم بعد</h3><p class="small">صمّم أول إعلان لك خلال ثوانٍ بالذكاء الاصطناعي</p>
        <a class="btn gold" href="#/studio?new=1"><i data-lucide="sparkles"></i>ابدأ التصميم</a></div>`;
    window.lucide?.createIcons();
  };
  draw();

  view.addEventListener('click', async (e) => {
    const chip = e.target.closest('[data-f]');
    if (chip) {
      filter = chip.dataset.f;
      $$('[data-f]', view).forEach((c) => c.classList.toggle('active', c === chip));
      return draw();
    }
    if (e.target.closest('[data-stop]')) return;
    const del = e.target.closest('[data-del]')?.dataset.del;
    if (del) {
      e.stopPropagation();
      if (!(await confirmDialog('حذف التصميم', 'سيتم حذف هذا التصميم نهائياً ولا يمكن استرجاعه.', 'حذف'))) return;
      await api(`/designs/${del}`, { method: 'DELETE' });
      designs.splice(designs.findIndex((d) => d.id === Number(del)), 1);
      toast('تم حذف التصميم');
      return draw();
    }
    const open = e.target.closest('[data-open]')?.dataset.open;
    if (open) location.hash = `#/studio?id=${open}`;
  });
}
