import { $, esc, api, fmt, state, toast, modal, confirmDialog, withBtn, formData, INDUSTRIES } from '../core.js';

const ROLE = { owner: 'مالك', editor: 'محرر', viewer: 'مشاهد' };
const ROLE_HINT = { editor: 'يصمم وينشر ويعدّل البيانات', viewer: 'يشاهد التصاميم والتحليلات فقط' };

function addBrandModal() {
  modal({
    title: 'إضافة علامة تجارية', sub: 'مثالي للوكالات ومن يدير أكثر من نشاط — لكل علامة هويتها وبياناتها وفريقها',
    body: `<form id="bf" class="grid" style="gap:12px" onsubmit="return false">
      <label class="field"><span>اسم العلامة *</span><input class="input" name="name" required></label>
      <label class="field"><span>المجال</span><select class="select" name="industry"><option value="">اختر...</option>${INDUSTRIES.map((i) => `<option>${i}</option>`).join('')}</select></label>
      <label class="field"><span>المدينة</span><input class="input" name="city"></label>
    </form>`,
    actions: [
      { label: 'إنشاء والانتقال إليها', kind: 'primary', onClick: async (el) => {
        const d = formData($('#bf', el));
        if (!d.name?.trim()) { toast('اكتب اسم العلامة', 'err'); return false; }
        try { await api('/workspace/brands', { method: 'POST', body: d }); } catch (e) { toast(e.message, 'err'); return false; }
        location.hash = '#/brand';
        location.reload();
      } },
      { label: 'إلغاء' },
    ],
  });
}

export async function render(view, { params }) {
  const { business, businesses, role, plan, user } = state.me;
  const team = await api('/workspace/team');
  const owner = role === 'owner';
  const ownedCount = businesses.filter((b) => b.role === 'owner').length;
  const reload = () => window.dispatchEvent(new HashChangeEvent('hashchange'));

  view.innerHTML = `
  <div class="page-head">
    <div><h1>الفريق والعلامات</h1><p>أدر علاماتك التجارية وادعُ فريقك للعمل معك</p></div>
    <button class="btn gold" id="add-brand"><i data-lucide="plus"></i>علامة جديدة</button>
  </div>

  <div class="grid g-main">
    <div class="card">
      <div class="card-head">
        <div><h3 class="card-title"><i data-lucide="users" style="width:18px"></i>فريق ${esc(business.name)}</h3>
          <p class="card-sub">${team.members.length} من ${team.seats} مقاعد في باقة ${esc(plan?.label || '')}</p></div>
      </div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>العضو</th><th>الدور</th><th>آخر دخول</th><th></th></tr></thead>
        <tbody>${team.members.map((m) => `<tr>
          <td><b>${esc(m.name)}</b>${m.id === user.id ? ' <span class="badge">أنت</span>' : ''}<div class="muted small" dir="ltr" style="text-align:start">${esc(m.email)}</div></td>
          <td>${owner && m.role !== 'owner'
            ? `<select class="select" data-role="${m.id}" style="height:36px;width:auto">${['editor', 'viewer'].map((r2) => `<option value="${r2}" ${r2 === m.role ? 'selected' : ''}>${ROLE[r2]}</option>`).join('')}</select>`
            : `<span class="badge ${m.role === 'owner' ? 'gold' : ''}">${ROLE[m.role]}</span>`}</td>
          <td class="small">${fmt.ago(m.last_login_at)}</td>
          <td>${owner && m.role !== 'owner' ? `<button class="btn sm ghost danger" data-remove="${m.id}"><i data-lucide="user-minus"></i>إزالة</button>`
            : !owner && m.id === user.id ? '<button class="btn sm ghost danger" data-leave><i data-lucide="log-out"></i>مغادرة</button>' : ''}</td>
        </tr>`).join('')}</tbody>
      </table></div>

      ${owner ? `
      <div class="st-section">
        <span class="st-label">دعوة عضو جديد</span>
        <form id="inv" class="row wrap" onsubmit="return false">
          <input class="input" name="email" type="email" dir="ltr" placeholder="email@example.com" style="flex:1;min-width:200px" required>
          <select class="select" name="role" style="width:auto">${['editor', 'viewer'].map((r2) => `<option value="${r2}">${ROLE[r2]} — ${ROLE_HINT[r2]}</option>`).join('')}</select>
          <button class="btn primary" id="inv-btn"><i data-lucide="send"></i>إرسال الدعوة</button>
        </form>
        <div id="inv-result"></div>
      </div>
      ${team.invites.length ? `<div class="st-section"><span class="st-label">دعوات بانتظار القبول</span>
        <div class="list">${team.invites.map((i) => `<div class="list-item">
          <i data-lucide="mail" style="width:16px;color:var(--ink-3)"></i>
          <div class="grow"><b dir="ltr">${esc(i.email)}</b><p>${ROLE[i.role]} · ${fmt.ago(i.created_at)}</p></div>
          <button class="btn sm" data-copy="${esc(i.link)}"><i data-lucide="link"></i>نسخ الرابط</button>
          <button class="btn sm ghost danger icon" data-cancel="${i.id}" aria-label="إلغاء"><i data-lucide="x"></i></button></div>`).join('')}</div></div>` : ''}`
      : '<p class="muted small" style="margin-top:14px">إدارة الفريق متاحة لمالك العلامة فقط.</p>'}
    </div>

    <div class="card">
      <div class="card-head"><div><h3 class="card-title"><i data-lucide="store" style="width:18px"></i>علاماتك التجارية</h3>
        <p class="card-sub">تملك ${ownedCount} من ${plan?.brands ?? 1} علامات متاحة في باقتك</p></div></div>
      <div class="list">${businesses.map((b) => `<div class="list-item">
        <span class="brand-dot">${b.logo ? `<img src="${b.logo}" alt="">` : esc(b.name.trim()[0] || '؟')}</span>
        <div class="grow"><b>${esc(b.name)}</b><p>${ROLE[b.role]}${b.id === business.id ? ' · العلامة الحالية' : ''}</p></div>
        ${b.id === business.id ? '<span class="badge gold"><i data-lucide="check"></i>نشطة</span>' : `<button class="btn sm" data-switch="${b.id}">انتقال</button>`}
        ${b.role === 'owner' && b.id !== business.id ? `<button class="btn sm ghost danger icon" data-del-brand="${b.id}" data-name="${esc(b.name)}" aria-label="حذف"><i data-lucide="trash-2"></i></button>` : ''}
      </div>`).join('')}</div>
    </div>
  </div>`;

  $('#add-brand', view).onclick = addBrandModal;
  if (params.brand === 'new') addBrandModal();

  $('#inv-btn', view)?.addEventListener('click', (e) => {
    const form = $('#inv', view);
    if (!form.reportValidity()) return;
    withBtn(e.currentTarget, async () => {
      const res = await api('/workspace/team/invite', { method: 'POST', body: formData(form) });
      $('#inv-result', view).innerHTML = `<div class="card tint-green" style="margin-top:12px;box-shadow:none">
        <b>${res.emailed ? 'تم إرسال الدعوة بالبريد ✓' : 'تم إنشاء رابط الدعوة'}</b>
        <p class="small muted" style="margin:4px 0 10px">أرسل هذا الرابط للعضو (صالح 14 يوماً):</p>
        <div class="row"><input class="input num" readonly value="${esc(res.link)}" dir="ltr"><button class="btn sm" data-copy="${esc(res.link)}"><i data-lucide="copy"></i>نسخ</button></div></div>`;
      window.lucide?.createIcons();
      form.reset();
    });
  });

  view.addEventListener('change', async (e) => {
    const id = e.target.dataset.role;
    if (!id) return;
    try { await api(`/workspace/team/${id}`, { method: 'PATCH', body: { role: e.target.value } }); toast('تم تحديث الدور'); } catch (err) { toast(err.message, 'err'); }
  });

  view.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-copy],[data-cancel],[data-remove],[data-leave],[data-switch],[data-del-brand]');
    if (!t) return;
    const d = t.dataset;
    if (d.copy) return navigator.clipboard.writeText(d.copy).then(() => toast('تم نسخ الرابط'));
    if (d.cancel) { await api(`/workspace/team/invites/${d.cancel}`, { method: 'DELETE' }); toast('تم إلغاء الدعوة'); return reload(); }
    if (d.remove && await confirmDialog('إزالة العضو', 'لن يتمكن من الوصول إلى هذه العلامة بعد الآن.', 'إزالة')) {
      await api(`/workspace/team/${d.remove}`, { method: 'DELETE' }); toast('تمت إزالة العضو'); return reload();
    }
    if (d.leave != null && await confirmDialog('مغادرة الفريق', `ستفقد الوصول إلى ${business.name}.`, 'مغادرة')) {
      await api(`/workspace/team/${user.id}`, { method: 'DELETE' }); location.hash = '#/overview'; return location.reload();
    }
    if (d.switch) { await api(`/workspace/brands/${d.switch}/activate`, { method: 'POST' }); location.hash = '#/overview'; return location.reload(); }
    if (d.delBrand && await confirmDialog('حذف العلامة نهائياً', `سيتم حذف "${d.name}" مع كل تصاميمها وبياناتها ومنشوراتها. لا يمكن التراجع.`, 'حذف نهائي')) {
      try { await api(`/workspace/brands/${d.delBrand}`, { method: 'DELETE' }); toast('تم حذف العلامة'); location.reload(); } catch (err) { toast(err.message, 'err'); }
    }
  });
}
