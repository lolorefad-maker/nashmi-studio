// "Data sources" dialog: Excel/CSV import and store connections (WooCommerce, Shopify).
import { $, esc, api, fmt, toast, modal, confirmDialog, withBtn, fileToDataURL, formData, icons } from './core.js';

const STORES = {
  woocommerce: {
    name: 'WooCommerce', icon: 'shopping-cart', hint: 'من لوحة ووردبريس: WooCommerce ← الإعدادات ← متقدم ← REST API ← أضف مفتاحاً (قراءة).',
    fields: [['url', 'رابط المتجر', 'https://mystore.com'], ['key', 'Consumer key', 'ck_...'], ['secret', 'Consumer secret', 'cs_...']],
  },
  shopify: {
    name: 'Shopify', icon: 'shopping-bag', hint: 'من Shopify: الإعدادات ← التطبيقات ← تطوير التطبيقات ← أنشئ تطبيقاً بصلاحية read_orders وانسخ Admin API token.',
    fields: [['shop', 'نطاق المتجر', 'mystore.myshopify.com'], ['token', 'Admin API access token', 'shpat_...']],
  },
};

export async function sourcesModal(onChange) {
  const list = await api('/integrations');
  const conn = Object.fromEntries(list.map((i) => [i.provider, i]));

  const storeCard = (key) => {
    const s = STORES[key];
    const c = conn[key];
    return `<div class="card" style="box-shadow:none;background:rgba(255,255,255,.05)">
      <div class="row" style="margin-bottom:10px"><span class="icon-chip"><i data-lucide="${s.icon}"></i></span>
        <div class="spacer"><b>${s.name}</b><p class="muted small" style="margin:0">${c ? `${c.status === 'error' ? '⚠️ خطأ في آخر مزامنة' : 'متصل'} · ${esc(c.url || c.shop || '')}` : 'مزامنة الإيرادات والطلبات والعملاء الجدد تلقائياً كل ليلة'}</p></div>
        ${c ? '<span class="badge good">متصل</span>' : ''}</div>
      ${c ? `
        ${c.last_error ? `<p class="small" style="color:var(--critical-ink);margin:0 0 8px">${esc(c.last_error)}</p>` : ''}
        <p class="small muted" style="margin:0 0 10px">آخر مزامنة: ${c.last_sync_at ? fmt.ago(c.last_sync_at) : 'لم تتم بعد'}</p>
        <div class="row"><button class="btn sm primary" data-sync="${key}"><i data-lucide="refresh-cw"></i>مزامنة الآن</button>
          <button class="btn sm ghost danger" data-disconnect="${key}">فصل</button></div>`
      : `<form class="grid" style="gap:8px" data-store="${key}" onsubmit="return false">
          ${s.fields.map(([n, l, ph]) => `<label class="field"><span>${l}</span><input class="input" name="${n}" dir="ltr" placeholder="${ph}" required ${n === 'secret' || n === 'token' ? 'type="password"' : ''}></label>`).join('')}
          <p class="muted small" style="margin:0">${s.hint}</p>
          <button class="btn sm primary" data-connect="${key}" style="justify-self:start"><i data-lucide="plug"></i>ربط المتجر</button>
        </form>`}
    </div>`;
  };

  const m = modal({
    title: 'مصادر البيانات', sub: 'أدخل أرقامك بدون كتابة يدوية: من ملف Excel أو مباشرة من متجرك الإلكتروني', wide: true,
    body: `
      <div class="card tint-gold" style="box-shadow:none">
        <div class="row wrap" style="gap:12px"><span class="icon-chip"><i data-lucide="file-spreadsheet"></i></span>
          <div class="spacer"><b>استيراد من Excel أو CSV</b><p class="muted small" style="margin:2px 0 0">عمود "الشهر" + أي أعمدة أرقام (الإيرادات، المصاريف، الطلبات...). الأشهر الموجودة تُحدَّث.</p></div>
          <a class="btn sm" href="/api/integrations/template" download><i data-lucide="download"></i>تنزيل القالب</a>
          <label class="btn sm primary"><i data-lucide="upload"></i>رفع ملف<input type="file" id="imp-file" accept=".xlsx,.csv" hidden></label>
        </div>
        <div id="imp-result"></div>
      </div>
      <div class="grid g-2 section-gap">${Object.keys(STORES).map(storeCard).join('')}</div>`,
  });

  const refresh = () => { m.close(); onChange?.(); sourcesModal(onChange); };

  $('#imp-file', m.el).onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const label = e.target.closest('label');
    await withBtn(label, async () => {
      const res = await api('/integrations/import', { method: 'POST', body: { filename: file.name, data: await fileToDataURL(file) } });
      $('#imp-result', m.el).innerHTML = `<p class="small" style="margin:12px 0 0;color:var(--good-ink)">✓ تم استيراد ${res.imported} شهر${res.skipped.length ? ` · تخطّي ${res.skipped.length} صف بدون شهر صالح` : ''}</p>`;
      toast(`تم استيراد ${res.imported} شهر`);
      onChange?.();
    });
    e.target.value = '';
  };

  m.el.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-connect],[data-sync],[data-disconnect]');
    if (!t) return;
    const { connect, sync, disconnect } = t.dataset;
    if (connect) {
      const form = $(`[data-store="${connect}"]`, m.el);
      if (!form.reportValidity()) return;
      await withBtn(t, async () => {
        await api(`/integrations/${connect}`, { method: 'PUT', body: formData(form) });
        toast('تم ربط المتجر — جارٍ المزامنة الأولى');
        await api(`/integrations/${connect}/sync`, { method: 'POST' }).catch((err) => toast(err.message, 'err'));
        refresh();
      });
    }
    if (sync) await withBtn(t, async () => { const r = await api(`/integrations/${sync}/sync`, { method: 'POST' }); toast(`تمت مزامنة ${r.months} شهر`); refresh(); });
    if (disconnect && await confirmDialog('فصل المتجر', 'ستبقى البيانات المستوردة، لكن المزامنة التلقائية ستتوقف.', 'فصل')) {
      await api(`/integrations/${disconnect}`, { method: 'DELETE' });
      refresh();
    }
  });
  icons();
}
