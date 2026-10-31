import { $, $$, esc, api, fmt, toast, modal, confirmDialog, formData, icons } from '../core.js';
import { subnav, FIELD_LABEL } from '../biz.js';

const IDEAS = [
  ['boxes', 'نظام مخزون ومبيعات', 'ابنيلي نظام لإدارة المخزون والمبيعات والموردين مع تنبيه للمنتجات القليلة'],
  ['users', 'نظام عملاء CRM', 'بدي نظام CRM للعملاء والمتابعات والصفقات'],
  ['receipt', 'فواتير ومصاريف', 'ابنيلي نظام فواتير ومصاريف ومدفوعات'],
  ['calendar', 'حجوزات ومواعيد', 'بدي نظام حجوزات ومواعيد للعملاء مع الموظفين'],
  ['user-round', 'موظفين ورواتب', 'نظام لإدارة الموظفين والحضور والرواتب'],
  ['clipboard-list', 'طلبات وتوصيل', 'نظام لإدارة الطلبات والتوصيل وحالة كل طلب'],
];

function cell(f, v) {
  if (v == null || v === '') return '<span class="muted">—</span>';
  if (f.type === 'boolean') return v ? '<span class="badge good">نعم</span>' : '<span class="badge">لا</span>';
  if (f.type === 'money') return `<span class="num">${fmt.num(v, 2)} ${fmt.cur()}</span>`;
  if (f.type === 'number') return `<span class="num">${fmt.num(v, 2)}</span>`;
  if (f.type === 'select') return `<span class="badge gold">${esc(v)}</span>`;
  if (f.type === 'longtext') return `<span title="${esc(v)}">${esc(String(v).slice(0, 60))}${String(v).length > 60 ? '…' : ''}</span>`;
  return esc(v);
}

function input(f, v) {
  const val = v ?? '';
  const req = f.required ? 'required' : '';
  if (f.type === 'longtext') return `<textarea class="textarea" name="${f.key}" rows="3" ${req}>${esc(val)}</textarea>`;
  if (f.type === 'select') return `<select class="select" name="${f.key}" ${req}><option value="">—</option>${f.options.map((o) => `<option ${o === val ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  if (f.type === 'boolean') return `<label class="row" style="height:44px"><input type="checkbox" name="${f.key}" value="true" ${val ? 'checked' : ''}> نعم</label>`;
  const type = { number: 'number', money: 'number', date: 'date', phone: 'tel', email: 'email' }[f.type] || 'text';
  return `<input class="input" type="${type}" name="${f.key}" value="${esc(val)}" ${type === 'number' ? 'step="any"' : ''} ${req} ${['phone', 'email'].includes(f.type) ? 'dir="ltr"' : ''}>`;
}

function recordModal(app, table, row, onSaved) {
  modal({
    title: row ? `تعديل — ${table.name}` : `إضافة إلى ${table.name}`, wide: true,
    body: `<form id="rf" class="form-grid" onsubmit="return false">${table.fields.map((f) => `
      <label class="field ${f.type === 'longtext' ? 'full' : ''}"><span>${esc(f.label)}${f.required ? ' *' : ''}</span>${input(f, row?.[f.key])}</label>`).join('')}</form>`,
    actions: [
      { label: 'حفظ', kind: 'primary', onClick: async (el) => {
        const form = $('#rf', el);
        if (!form.reportValidity()) return false;
        const data = formData(form);
        table.fields.filter((f) => f.type === 'boolean').forEach((f) => { data[f.key] = form[f.key].checked; });
        try {
          if (row) await api(`/biz/apps/${app.id}/records/${row.id}`, { method: 'PUT', body: { data } });
          else await api(`/biz/apps/${app.id}/records`, { method: 'POST', body: { table: table.key, data } });
        } catch (err) { toast(err.message, 'err'); return false; }
        toast('تم الحفظ');
        onSaved();
      } },
      { label: 'إلغاء' },
    ],
  });
}

async function renderList(view) {
  const apps = await api('/biz/apps');
  view.innerHTML = `
  ${subnav('apps')}
  <div class="page-head" style="margin-top:0">
    <div><h1>الأنظمة</h1><p>أنظمة لإدارة عملك يبنيها المساعد لك حسب طلبك — مخزون، عملاء، فواتير، موظفين وأكثر</p></div>
    <a class="btn gold" href="#/assistant?prompt=${encodeURIComponent('ابنيلي نظام لإدارة ')}"><i data-lucide="sparkles"></i>اطلب نظاماً جديداً</a>
  </div>
  ${apps.length ? `<div class="grid sys-grid">${apps.map((a) => `
    <a class="card hover sys-card" href="#/apps/${a.id}">
      <div class="row" style="margin-bottom:10px"><span class="icon-chip"><i data-lucide="${esc(a.icon)}"></i></span>
        <div class="spacer"><b style="font-size:16px">${esc(a.name)}</b><div class="muted small">${fmt.ago(a.updated_at)}</div></div></div>
      <p class="muted small" style="margin:0 0 12px;min-height:38px">${esc(a.description || '')}</p>
      <div class="chips">${a.tables.map((t) => `<span class="chip" style="cursor:inherit">${esc(t.name)} <b class="num">${t.records}</b></span>`).join('')}</div>
    </a>`).join('')}</div>` : ''}
  <div class="card section-gap">
    <div class="card-head"><h3 class="card-title"><i data-lucide="wand-sparkles" style="width:18px;color:var(--gold)"></i>${apps.length ? 'أنظمة أخرى قد تحتاجها' : 'ابدأ بنظامك الأول'}</h3></div>
    <div class="grid g-3">${IDEAS.map(([ic, name, prompt]) => `<a class="qc" style="text-align:start;display:flex;gap:10px;align-items:center" href="#/assistant?prompt=${encodeURIComponent(prompt)}">
      <span class="icon-chip"><i data-lucide="${ic}"></i></span><div><b>${name}</b><span>اطلبه من المساعد</span></div></a>`).join('')}</div>
  </div>`;
}

async function renderApp(view, id, params) {
  const app = await api(`/biz/apps/${id}`);
  let tableKey = params.table && app.schema.tables.some((t) => t.key === params.table) ? params.table : app.schema.tables[0].key;
  let q = '';

  view.innerHTML = `
  ${subnav('apps')}
  <div class="page-head" style="margin-top:0">
    <div class="row"><span class="icon-chip" style="width:48px;height:48px;border-radius:16px"><i data-lucide="${esc(app.icon)}"></i></span>
      <div><h1>${esc(app.name)}</h1><p>${esc(app.description || '')}</p></div></div>
    <div class="row wrap">
      <a class="btn" href="#/assistant?prompt=${encodeURIComponent(`حلّل بيانات نظام "${app.name}" وأعطني أهم الملاحظات والتوصيات`)}"><i data-lucide="bot"></i>حلّل بالمساعد</a>
      <a class="btn" href="/api/biz/apps/${app.id}/export" download><i data-lucide="file-spreadsheet"></i>تصدير Excel</a>
      <button class="btn ghost danger" id="del-app"><i data-lucide="trash-2"></i></button>
    </div>
  </div>
  <div class="chips" id="tabs" style="margin-bottom:14px">${app.schema.tables.map((t) => `<span class="chip" data-tab="${t.key}">${esc(t.name)}</span>`).join('')}</div>
  <div class="card">
    <div class="data-toolbar">
      <div style="position:relative;flex:1;min-width:200px"><i data-lucide="search" style="position:absolute;inset-inline-start:14px;top:13px;width:18px;color:var(--ink-3)"></i>
        <input class="input" id="q" placeholder="بحث في السجلات" style="padding-inline-start:42px"></div>
      <button class="btn primary" id="add"><i data-lucide="plus"></i>إضافة سجل</button>
    </div>
    <div class="grid mini-kpis" id="stats" style="margin-bottom:14px"></div>
    <div class="table-wrap"><table class="table"><thead id="thead"></thead><tbody id="rows"></tbody></table></div>
  </div>`;

  const table = () => app.schema.tables.find((t) => t.key === tableKey);
  let rows = [];

  async function load() {
    const t = table();
    $$('[data-tab]', view).forEach((c) => c.classList.toggle('active', c.dataset.tab === tableKey));
    rows = await api(`/biz/apps/${app.id}/records?table=${encodeURIComponent(tableKey)}&q=${encodeURIComponent(q)}`);
    const cols = t.fields.slice(0, 8);
    $('#thead', view).innerHTML = `<tr>${cols.map((f) => `<th>${esc(f.label)}</th>`).join('')}<th>أضيف</th><th></th></tr>`;
    $('#rows', view).innerHTML = rows.map((r) => `<tr>${cols.map((f) => `<td>${cell(f, r[f.key])}</td>`).join('')}
      <td class="small muted">${fmt.ago(r.created_at)}</td>
      <td><div class="row" style="gap:4px"><button class="btn sm icon ghost" data-edit="${r.id}" aria-label="تعديل"><i data-lucide="pencil"></i></button>
        <button class="btn sm icon ghost danger" data-del="${r.id}" aria-label="حذف"><i data-lucide="trash-2"></i></button></div></td></tr>`).join('')
      || `<tr><td colspan="${cols.length + 2}" class="muted" style="text-align:center;padding:30px">لا توجد سجلات بعد — أضف سجلاً أو اطلب من المساعد إضافة بيانات</td></tr>`;
    const sums = t.fields.filter((f) => f.type === 'money' || f.type === 'number').slice(0, 3)
      .map((f) => [f.label, rows.reduce((s, r) => s + (Number(r[f.key]) || 0), 0), f.type]);
    $('#stats', view).innerHTML = [['عدد السجلات', rows.length, 'number'], ...sums].map(([l, v, type]) =>
      `<div class="card mini" style="box-shadow:none"><div class="label">${esc(l)}${type === 'number' && l !== 'عدد السجلات' ? ' (المجموع)' : ''}</div>
        <div class="value num">${fmt.num(v, 2)}${type === 'money' ? ` <small class="muted" style="font-size:13px">${fmt.cur()}</small>` : ''}</div></div>`).join('');
    icons();
  }
  await load();

  let timer;
  $('#q', view).oninput = (e) => { q = e.target.value.trim(); clearTimeout(timer); timer = setTimeout(load, 250); };
  $('#add', view).onclick = () => recordModal(app, table(), null, load);
  $('#del-app', view).onclick = async () => {
    if (!(await confirmDialog('حذف النظام', `سيتم حذف "${app.name}" مع كل بياناته نهائياً.`, 'حذف'))) return;
    await api(`/biz/apps/${app.id}`, { method: 'DELETE' });
    toast('تم حذف النظام');
    location.hash = '#/apps';
  };
  view.addEventListener('click', async (e) => {
    const tab = e.target.closest('[data-tab]')?.dataset.tab;
    if (tab) { tableKey = tab; return load(); }
    const edit = e.target.closest('[data-edit]')?.dataset.edit;
    if (edit) return recordModal(app, table(), rows.find((r) => r.id === Number(edit)), load);
    const del = e.target.closest('[data-del]')?.dataset.del;
    if (del && await confirmDialog('حذف السجل', 'سيتم حذف هذا السجل نهائياً.', 'حذف')) {
      await api(`/biz/apps/${app.id}/records/${del}`, { method: 'DELETE' });
      load();
    }
  });
}

export async function render(view, { sub, params }) {
  if (sub[0]) return renderApp(view, sub[0], params);
  return renderList(view);
}

export { FIELD_LABEL };
