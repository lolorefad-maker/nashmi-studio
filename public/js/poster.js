// Layout engine: turns an AI design spec into editable Fabric.js objects.
// Every generated object carries data.role so text can be read back and layouts swapped.

// Arabic families render Latin too; the Latin group is for English designs.
export const FONT_GROUPS = {
  arabic: ['Cairo', 'Tajawal', 'Almarai', 'Changa', 'El Messiri', 'Reem Kufi', 'Lalezar', 'Amiri', 'IBM Plex Sans Arabic', 'Readex Pro',
    'Aref Ruqaa', 'Rakkas', 'Lemonada', 'Markazi Text', 'Noto Kufi Arabic', 'Mada', 'Kufam', 'Marhey'],
  latin: ['Montserrat', 'Playfair Display', 'Poppins', 'Bebas Neue', 'Oswald', 'Lobster', 'Pacifico', 'Dancing Script'],
};
export const POSTER_FONTS = [...FONT_GROUPS.arabic, ...FONT_GROUPS.latin];
const HEAVY = { Cairo: 800, Tajawal: 800, Almarai: 800, Changa: 800, 'El Messiri': 700, 'Reem Kufi': 700, Lalezar: 400, Amiri: 700, 'IBM Plex Sans Arabic': 700, 'Readex Pro': 700,
  'Aref Ruqaa': 700, Rakkas: 400, Lemonada: 700, 'Markazi Text': 700, 'Noto Kufi Arabic': 800, Mada: 900, Kufam: 800, Marhey: 700,
  Montserrat: 800, 'Playfair Display': 800, Poppins: 800, 'Bebas Neue': 400, Oswald: 700, Lobster: 400, Pacifico: 400, 'Dancing Script': 700 };
export const heavyWeight = (family) => HEAVY[family] || 700;
export const LAYOUTS = { hero: 'مركزي', split: 'منتج', sale: 'عرض وخصم', minimal: 'بسيط', frame: 'مناسبة', diagonal: 'قُطري' };
export const STYLES = {
  luxury: { label: 'فاخر', bg: '#0d0d0f', bg2: '#2a2419', primary: '#c9a46a', text: '#f6efe2', muted: '#b3a993' },
  modern: { label: 'عصري', bg: '#1e1b4b', bg2: '#4338ca', primary: '#22d3ee', text: '#ffffff', muted: '#c7d2fe' },
  minimal: { label: 'بسيط', bg: '#f7f5f0', bg2: '#e9e4d8', primary: '#111111', text: '#111111', muted: '#5f5f5f' },
  bold: { label: 'جريء', bg: '#dc2626', bg2: '#7f1d1d', primary: '#facc15', text: '#ffffff', muted: '#fde68a' },
  nature: { label: 'طبيعي', bg: '#14532d', bg2: '#166534', primary: '#bef264', text: '#f0fdf4', muted: '#bbf7d0' },
  pastel: { label: 'ناعم', bg: '#fce7f3', bg2: '#e0e7ff', primary: '#db2777', text: '#1f2937', muted: '#4b5563' },
};

let fabricReady = null;
export function loadFabric() {
  if (window.fabric) return Promise.resolve();
  fabricReady ??= new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = '/vendor/fabric.js';
    el.onload = resolve;
    el.onerror = reject;
    document.head.append(el);
  });
  return fabricReady;
}

// Separate stylesheet requests so one unavailable family can't block the others. Font files download only when used.
const FONT_CSS = [
  'family=Cairo:wght@400;600;700;800&family=Tajawal:wght@400;500;700;800&family=Almarai:wght@400;700;800' +
    '&family=Changa:wght@400;600;700;800&family=El+Messiri:wght@400;600;700&family=Reem+Kufi:wght@400;600;700&family=Lalezar' +
    '&family=Amiri:wght@400;700&family=IBM+Plex+Sans+Arabic:wght@400;600;700&family=Readex+Pro:wght@400;600;700',
  'family=Aref+Ruqaa:wght@400;700&family=Rakkas&family=Lemonada:wght@400;700&family=Markazi+Text:wght@400;700' +
    '&family=Noto+Kufi+Arabic:wght@400;700;800&family=Mada:wght@400;700;900&family=Kufam:wght@400;700;800&family=Marhey:wght@400;700',
  'family=Montserrat:ital,wght@0,400;0,700;0,800;1,400;1,700&family=Playfair+Display:ital,wght@0,400;0,700;0,800;1,400;1,700' +
    '&family=Poppins:ital,wght@0,400;0,700;0,800;1,400&family=Bebas+Neue&family=Oswald:wght@400;700&family=Lobster&family=Pacifico&family=Dancing+Script:wght@400;700',
];
let fontsLink = null;
export async function loadFonts(families = POSTER_FONTS) {
  if (!fontsLink) {
    fontsLink = Promise.all(FONT_CSS.map((q) => new Promise((resolve) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?${q}&display=swap`;
      link.onload = resolve;
      link.onerror = resolve;
      document.head.append(link);
    })));
  }
  await fontsLink;
  await Promise.all([...new Set(families)].flatMap((f) => [400, HEAVY[f] || 700].map((w) =>
    document.fonts.load(`${w} 40px "${f}"`, 'عربي Abc').catch(() => {}))));
}

const AR = /[؀-ۿ]/;
const hexToRgb = (hex) => { const n = parseInt(hex.replace('#', ''), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const rgba = (hex, a) => `rgba(${hexToRgb(hex).join(',')},${a})`;
const isLight = (hex) => { const [r, g, b] = hexToRgb(hex); return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6; };

export function buildPoster(canvas, spec, { W, H, logo = null, brandName = '' }) {
  const f = window.fabric;
  const p = spec.palette;
  const font = spec.font || 'Cairo';
  const heavy = HEAVY[font] || 700;
  const ar = AR.test(`${spec.headline}${spec.subheadline}`) || !/[a-z]/i.test(spec.headline || '');
  const dir = ar ? 'rtl' : 'ltr';
  // Latin-only strings (handles, URLs) keep LTR order even inside an Arabic design.
  const dirFor = (text) => (AR.test(text) ? 'rtl' : /[A-Za-z0-9]/.test(text) ? 'ltr' : dir);
  const wide = W / H > 1.4;
  const tall = H / W > 1.6;
  const u = (Math.min(W, H) / 100) * (tall ? 1.18 : 1); // story-size canvases get larger type
  const pad = (wide ? 8 : 7) * u;
  const objs = [];
  const add = (o, role) => { o.data = { ...(o.data || {}), role }; objs.push(o); return o; };

  // ---------- primitives ----------
  const textbox = (text, size, { width, weight = 400, color = p.text, align = 'center', lineHeight = 1.25, family = font } = {}) =>
    new f.Textbox(text, {
      width, fontSize: size, fontFamily: family, fontWeight: weight, fill: color, lineHeight,
      textAlign: align === 'start' ? (ar ? 'right' : 'left') : align === 'end' ? (ar ? 'left' : 'right') : 'center',
      direction: dirFor(text), originX: 'left', originY: 'top', splitByGrapheme: false,
    });

  // Shrinks the font until the text fits in maxLines without overflowing the column.
  const fitText = (text, size, minSize, maxLines, opts) => {
    let tb = textbox(text, size, opts);
    while ((tb._textLines.length > maxLines || tb.width > opts.width + 1) && size > minSize) {
      size *= 0.92;
      tb = textbox(text, size, opts);
    }
    return tb;
  };

  const pill = (text, { fill = p.primary, color = isLight(fill) ? '#111111' : '#ffffff', size = 3.6 * u, outline = false, role }) => {
    const t = new f.Text(text, { fontFamily: font, fontWeight: 700, fontSize: size, fill: outline ? fill : color, direction: dir, originX: 'center', originY: 'center' });
    t.data = { role: `${role}-text` };
    const r = new f.Rect({
      width: t.width + size * 2.2, height: size * 2.4, rx: size * 1.2, ry: size * 1.2, originX: 'center', originY: 'center',
      fill: outline ? 'transparent' : fill, stroke: outline ? fill : null, strokeWidth: outline ? u * 0.35 : 0,
    });
    return new f.Group([r, t], { originX: 'left', originY: 'top' });
  };

  const place = (o, align, x0 = pad, x1 = W - pad) => {
    const w = o.getScaledWidth ? o.getScaledWidth() : o.width;
    o.set('left', align === 'center' ? (x0 + x1) / 2 - w / 2 : (align === 'start') === ar ? x1 - w : x0);
    return o;
  };

  // Stacks items vertically starting at y (or centered between y0..y1 when y is null).
  const stack = (items, { y = null, y0 = pad, y1 = H - pad, align = 'center', x0, x1 }) => {
    const list = items.filter(Boolean);
    const total = list.reduce((s, [o, gap = 0]) => s + o.getScaledHeight() + gap, 0);
    let cy = y ?? y0 + Math.max(0, (y1 - y0 - total) / 2);
    for (const [o, gap = 0] of list) {
      place(o, align, x0, x1);
      o.set('top', cy);
      cy += o.getScaledHeight() + gap;
    }
    return cy;
  };

  // ---------- background & decor ----------
  const bg = new f.Rect({ left: 0, top: 0, width: W, height: H, selectable: true, hasControls: false, lockMovementX: true, lockMovementY: true, hoverCursor: 'default' });
  bg.set('fill', new f.Gradient({
    type: 'linear', gradientUnits: 'pixels', coords: { x1: 0, y1: 0, x2: W, y2: H },
    colorStops: [{ offset: 0, color: p.bg }, { offset: 1, color: spec.layout === 'minimal' ? p.bg : p.bg2 }],
  }));
  add(bg, 'bg');

  const decor = () => {
    const kind = spec.decor;
    if (kind === 'orbs') {
      [[W * 0.92, H * 0.08, 34], [W * 0.06, H * 0.92, 26]].forEach(([x, y, r]) => {
        const R = r * u;
        const c = new f.Circle({ left: x, top: y, radius: R, originX: 'center', originY: 'center', opacity: 0.85 });
        c.set('fill', new f.Gradient({ type: 'radial', gradientUnits: 'pixels', coords: { x1: R, y1: R, r1: 0, x2: R, y2: R, r2: R },
          colorStops: [{ offset: 0, color: rgba(p.primary, 0.55) }, { offset: 1, color: rgba(p.primary, 0) }] }));
        add(c, 'decor');
      });
    } else if (kind === 'dots') {
      const dots = [];
      for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
        dots.push(new f.Circle({ left: i * 3.2 * u, top: j * 3.2 * u, radius: 0.45 * u, fill: p.muted, opacity: 0.5 }));
      }
      add(new f.Group(dots, { left: ar ? pad * 0.6 : W - pad * 0.6 - 17 * u, top: pad * 0.6 }), 'decor');
    } else if (kind === 'lines') {
      const lines = Array.from({ length: 6 }, (_, i) => new f.Rect({ left: i * 3.4 * u, top: 0, width: 0.35 * u, height: 40 * u, fill: p.primary, opacity: 0.35 }));
      add(new f.Group(lines, { left: ar ? -2 * u : W - 18 * u, top: H - 30 * u, angle: 35 }), 'decor');
    } else if (kind === 'waves') {
      const wave = (y, amp, alpha) => {
        let d = `M 0 ${y}`;
        for (let x = 0; x <= W; x += W / 4) d += ` Q ${x + W / 8} ${y - amp} ${x + W / 4} ${y} T ${x + W / 2} ${y}`;
        d += ` L ${W} ${H} L 0 ${H} Z`;
        return add(new f.Path(d, { fill: rgba(p.primary, alpha), selectable: true }), 'decor');
      };
      wave(H * 0.9, 3 * u, 0.18);
      wave(H * 0.94, 2.4 * u, 0.3);
    }
  };

  // ---------- shared content ----------
  const head = (text, size, opts) => add(fitText(text, size, size * 0.45, opts.maxLines || 3, { weight: heavy, lineHeight: 1.15, ...opts }), 'headline');
  const sub = (text, size, opts) => text ? add(textbox(text, size, { lineHeight: 1.45, ...opts }), 'subheadline') : null;
  const body = (text, size, opts) => text ? add(textbox(text, size, { lineHeight: 1.6, ...opts }), 'body') : null;
  const cta = (opts = {}) => spec.cta ? add(pill(spec.cta, { role: 'cta', ...opts }), 'cta') : null;
  const footer = (align = 'center', x0 = pad, x1 = W - pad) => {
    if (!spec.footer) return;
    const t = add(textbox(spec.footer, 2.8 * u, { width: x1 - x0, color: p.muted, align }), 'footer');
    t.set({ left: x0, top: H - pad - t.height + u });
  };
  const headSize = (len) => u * (len <= 10 ? 13 : len <= 18 ? 10.5 : len <= 28 ? 8.5 : 7);

  // ---------- layouts ----------
  const layouts = {
    hero() {
      decor();
      const colW = wide ? W * 0.62 : W - pad * 2;
      const x0 = (W - colW) / 2;
      stack([
        spec.badge && [add(pill(spec.badge, { role: 'badge', size: 3 * u, outline: true }), 'badge'), 3.5 * u],
        [head(spec.headline, headSize(spec.headline.length), { width: colW }), 3 * u],
        [add(new f.Rect({ width: 12 * u, height: 0.6 * u, rx: 0.3 * u, fill: p.primary }), 'accent'), 3 * u],
        spec.subheadline && [sub(spec.subheadline, 4.4 * u, { width: colW * 0.9, color: p.muted }), 2.5 * u],
        spec.body && [body(spec.body, 3.2 * u, { width: colW * 0.85, color: p.muted }), 2 * u],
        spec.cta && [cta(), 0],
      ], { y0: pad + 10 * u, y1: H - pad - 6 * u, x0, x1: x0 + colW });
      footer();
    },

    split() {
      const panel = wide
        ? { left: pad, top: pad, width: W * 0.42, height: H - pad * 2 }
        : { left: pad, top: pad, width: W - pad * 2, height: H * (tall ? 0.56 : 0.42) };
      const ph = new f.Rect({ ...panel, rx: 3 * u, ry: 3 * u });
      ph.set('fill', new f.Gradient({ type: 'linear', gradientUnits: 'pixels', coords: { x1: 0, y1: 0, x2: panel.width, y2: panel.height },
        colorStops: [{ offset: 0, color: p.primary }, { offset: 1, color: p.bg2 }] }));
      add(ph, 'photo');
      const R = Math.min(panel.width, panel.height) * 0.32;
      add(new f.Circle({ left: panel.left + panel.width * 0.62, top: panel.top + panel.height * 0.55, radius: R, originX: 'center', originY: 'center',
        fill: 'transparent', stroke: rgba(isLight(p.primary) ? '#000000' : '#ffffff', 0.35), strokeWidth: 0.4 * u }), 'photo-decor');
      add(new f.Circle({ left: panel.left + panel.width * 0.62, top: panel.top + panel.height * 0.55, radius: R * 0.55, originX: 'center', originY: 'center',
        fill: rgba(isLight(p.primary) ? '#000000' : '#ffffff', 0.12) }), 'photo-decor');
      if (spec.badge) {
        const b = add(pill(spec.badge, { role: 'badge', size: 3 * u, fill: p.bg, color: p.text }), 'badge');
        b.set({ left: ar ? panel.left + panel.width - b.width - 3 * u : panel.left + 3 * u, top: panel.top + 3 * u });
      }
      const x0 = wide ? panel.left + panel.width + 6 * u : pad;
      stack([
        [head(spec.headline, headSize(spec.headline.length) * (wide ? 1 : 0.85), { width: W - pad - x0, align: 'start', maxLines: 2 }), 2 * u],
        spec.subheadline && [add(fitText(spec.subheadline, 3.7 * u, 2.8 * u, 2, { width: W - pad - x0, color: p.muted, align: 'start', lineHeight: 1.45 }), 'subheadline'), 3 * u],
        spec.cta && [cta({ size: 3.3 * u }), 0],
      ], wide ? { y0: pad, y1: H - pad - 6 * u, align: 'start', x0, x1: W - pad }
        : { y0: panel.top + panel.height + 4 * u, y1: H - pad - 6 * u, align: 'start', x0, x1: W - pad });
      footer('start', x0);
    },

    sale() {
      decor();
      for (let i = 0; i < 5; i++) {
        add(new f.Rect({ left: -10 * u + i * 9 * u, top: H - 7 * u, width: 4 * u, height: 30 * u, fill: p.primary, opacity: 0.18, angle: -35 }), 'decor');
      }
      const R = (wide ? 30 : 19) * u;
      const t = new f.Textbox(spec.badge || (ar ? 'عرض' : 'SALE'), {
        width: R * 1.6, fontSize: R * 0.42, fontFamily: font, fontWeight: heavy, fill: isLight(p.primary) ? '#111111' : '#ffffff',
        textAlign: 'center', direction: dir, originX: 'center', originY: 'center', lineHeight: 1,
      });
      t.data = { role: 'badge-text' };
      const badge = add(new f.Group([
        new f.Circle({ radius: R, fill: p.primary, originX: 'center', originY: 'center' }),
        new f.Circle({ radius: R * 0.86, fill: 'transparent', stroke: isLight(p.primary) ? '#111111' : '#ffffff', strokeWidth: 0.3 * u, strokeDashArray: [u, u], originX: 'center', originY: 'center' }),
        t,
      ], { originX: 'center', originY: 'center', angle: -10 }), 'badge');
      if (wide) {
        badge.set({ left: ar ? pad + R : W - pad - R, top: H / 2 });
        const x0 = ar ? pad + R * 2 + 6 * u : pad;
        const x1 = ar ? W - pad : W - pad - R * 2 - 6 * u;
        stack([
          [head(spec.headline, headSize(spec.headline.length) * 1.15, { width: x1 - x0, align: 'start', maxLines: 2 }), 2.5 * u],
          spec.subheadline && [sub(spec.subheadline, 4.2 * u, { width: x1 - x0, color: p.muted, align: 'start' }), 4 * u],
          spec.cta && [cta(), 0],
        ], { align: 'start', x0, x1 });
        footer('start', x0, x1);
      } else {
        badge.set({ left: ar ? pad + R * 0.85 : W - pad - R * 0.85, top: pad + R * 0.85 });
        stack([
          [head(spec.headline, headSize(spec.headline.length) * 1.25, { width: W - pad * 2, maxLines: 2 }), 3 * u],
          spec.subheadline && [sub(spec.subheadline, 4.6 * u, { width: W - pad * 2.5, color: p.muted }), 4.5 * u],
          spec.body && [body(spec.body, 3.2 * u, { width: W - pad * 3, color: p.muted }), 3 * u],
          spec.cta && [cta({ size: 4.2 * u }), 0],
        ], { y0: pad + R * 1.7, y1: H - pad - 8 * u });
        footer();
      }
    },

    minimal() {
      add(new f.Rect({ left: 4 * u, top: 4 * u, width: W - 8 * u, height: H - 8 * u, fill: 'transparent', stroke: rgba(p.muted, 0.45), strokeWidth: 0.25 * u, selectable: true }), 'decor');
      const colW = wide ? W * 0.6 : W - pad * 2;
      const label = brandName ? add(textbox(brandName, 3 * u, { width: colW, color: p.primary, weight: 700, align: 'start' }), 'brand') : null;
      stack([
        label && [label, 5 * u],
        [head(spec.headline, headSize(spec.headline.length) * 0.95, { width: colW, align: 'start' }), 3.5 * u],
        [add(new f.Rect({ width: 14 * u, height: 0.7 * u, fill: p.primary }), 'accent'), 3.5 * u],
        spec.subheadline && [sub(spec.subheadline, 4.2 * u, { width: colW, color: p.muted, align: 'start' }), 2.5 * u],
        spec.body && [body(spec.body, 3.2 * u, { width: colW, color: p.muted, align: 'start' }), 0],
      ], { y: wide ? pad + 4 * u : H * 0.2, align: 'start', x0: ar ? W - pad - colW : pad, x1: ar ? W - pad : pad + colW });
      if (spec.cta) {
        const c = add(textbox(`${spec.cta} ${ar ? '←' : '→'}`, 3.8 * u, { width: W * 0.45, weight: 700, color: p.primary, align: 'start' }), 'cta');
        c.set({ left: ar ? W - pad - c.width : pad, top: H - pad - c.height });
      }
      if (spec.footer) {
        const t = add(textbox(spec.footer, 2.8 * u, { width: W * 0.4, color: p.muted, align: 'end' }), 'footer');
        t.set({ left: ar ? pad : W - pad - t.width, top: H - pad - t.height });
      }
    },

    frame() {
      decor();
      const i1 = 4.5 * u;
      const i2 = 6.5 * u;
      add(new f.Rect({ left: i1, top: i1, width: W - i1 * 2, height: H - i1 * 2, rx: 2 * u, fill: 'transparent', stroke: p.primary, strokeWidth: 0.5 * u }), 'frame');
      add(new f.Rect({ left: i2, top: i2, width: W - i2 * 2, height: H - i2 * 2, rx: 1.2 * u, fill: 'transparent', stroke: rgba(p.primary, 0.55), strokeWidth: 0.2 * u }), 'frame');
      [[i1, i1], [W - i1, i1], [i1, H - i1], [W - i1, H - i1]].forEach(([x, y]) =>
        add(new f.Rect({ left: x, top: y, width: 2.6 * u, height: 2.6 * u, fill: p.primary, angle: 45, originX: 'center', originY: 'center' }), 'frame'));
      const orn = add(new f.Group([
        new f.Rect({ left: -14 * u, top: -0.15 * u, width: 10 * u, height: 0.3 * u, fill: p.primary }),
        new f.Rect({ left: 0, top: 0, width: 3.2 * u, height: 3.2 * u, fill: p.primary, angle: 45, originX: 'center', originY: 'center' }),
        new f.Rect({ left: 4 * u, top: -0.15 * u, width: 10 * u, height: 0.3 * u, fill: p.primary }),
      ]), 'ornament');
      const colW = wide ? W * 0.6 : W - pad * 2.6;
      const x0 = (W - colW) / 2;
      stack([
        [orn, 5 * u],
        spec.badge && [add(textbox(spec.badge, 3.2 * u, { width: colW, color: p.primary, weight: 700 }), 'badge'), 2.5 * u],
        [head(spec.headline, headSize(spec.headline.length) * 0.95, { width: colW }), 3.5 * u],
        spec.subheadline && [sub(spec.subheadline, 4.2 * u, { width: colW * 0.92, color: p.muted }), 3 * u],
        spec.body && [body(spec.body, 3.2 * u, { width: colW * 0.88, color: p.muted }), 3 * u],
        spec.cta && [cta({ outline: true }), 0],
      ], { y0: i2 + 4 * u, y1: H - i2 - 9 * u, x0, x1: x0 + colW });
      footer('center', x0, x0 + colW);
      const ft = objs.find((o) => o.data.role === 'footer');
      if (ft) ft.set('top', H - i2 - 4 * u - ft.height);
    },

    diagonal() {
      const band = (pts, color) => add(new f.Polygon(pts.map(([x, y]) => ({ x, y })), { fill: color, objectCaching: false }), 'band');
      if (wide) {
        const bx = ar ? W * 0.3 : W * 0.6;
        band([[bx, 0], [bx + W * 0.16, 0], [bx + W * 0.06, H], [bx - W * 0.1, H]], p.primary);
        band([[bx + W * 0.19, 0], [bx + W * 0.22, 0], [bx + W * 0.12, H], [bx + W * 0.09, H]], rgba(p.primary, 0.4));
        const x0 = ar ? bx + W * 0.25 : pad;
        const x1 = ar ? W - pad : bx - W * 0.14;
        stack([
          [head(spec.headline, headSize(spec.headline.length), { width: x1 - x0, align: 'start', maxLines: 2 }), 2.5 * u],
          spec.subheadline && [sub(spec.subheadline, 4 * u, { width: x1 - x0, color: p.muted, align: 'start' }), 4 * u],
          spec.cta && [cta(), 0],
        ], { align: 'start', x0, x1 });
        footer('start', x0, x1);
      } else {
        band([[0, H * 0.66], [W, H * 0.5], [W, H * 0.68], [0, H * 0.84]], p.primary);
        band([[0, H * 0.87], [W, H * 0.71], [W, H * 0.74], [0, H * 0.9]], rgba(p.primary, 0.4));
        decor();
        stack([
          spec.badge && [add(pill(spec.badge, { role: 'badge', size: 3 * u, outline: true }), 'badge'), 3 * u],
          [head(spec.headline, headSize(spec.headline.length), { width: W - pad * 2, align: 'start' }), 3 * u],
          spec.subheadline && [sub(spec.subheadline, 4.2 * u, { width: W - pad * 2.4, color: p.muted, align: 'start' }), 0],
        ], { y: pad + 10 * u, align: 'start' });
        if (spec.cta) {
          // Sit the button on the band's center line at the button's x position.
          const c = cta({ fill: p.bg, color: p.text, size: 3.8 * u });
          const left = ar ? W - pad - c.width : pad;
          const cx = left + c.width / 2;
          c.set({ left, top: H * (0.75 - 0.16 * (cx / W)) - c.height / 2 });
        }
        footer('start');
      }
    },
  };

  (layouts[spec.layout] || layouts.hero)();

  // Brand mark: logo image (async) or business name at the top.
  const extras = [];
  if (logo && spec.layout !== 'minimal') {
    extras.push(new Promise((resolve) => f.Image.fromURL(logo, (img) => {
      if (!img) return resolve();
      const size = (wide ? 16 : 13) * u;
      img.scale(size / Math.max(img.width, img.height));
      img.data = { role: 'logo' };
      const w = img.getScaledWidth();
      const centered = ['hero', 'frame', 'sale'].includes(spec.layout) && !wide;
      img.set({
        left: spec.layout === 'sale' ? (ar ? W - pad - w : pad) : centered ? (W - w) / 2 : ar ? W - pad - w : pad,
        top: spec.layout === 'frame' ? 9 * u : spec.layout === 'split' && !wide ? H - pad - img.getScaledHeight() : pad,
      });
      if (spec.layout === 'split' && !wide) img.set('left', ar ? pad : W - pad - w);
      objs.push(img);
      resolve();
    })));
  }

  return Promise.all(extras).then(() => {
    canvas.backgroundColor = p.bg;
    objs.forEach((o) => canvas.add(o));
    canvas.requestRenderAll();
    return objs;
  });
}

// Reads the current text of generated elements back into the spec (keeps user edits on re-layout).
export function syncSpecFromCanvas(canvas, spec) {
  const textOf = (o) => (o.type === 'group' ? o.getObjects().find((c) => c.text != null)?.text : o.text);
  for (const o of canvas.getObjects()) {
    const role = o.data?.role;
    if (['headline', 'subheadline', 'body', 'footer', 'badge'].includes(role)) spec[role] = textOf(o) ?? spec[role];
    if (role === 'cta') spec.cta = (textOf(o) || '').replace(/\s*[←→]$/, '');
  }
  return spec;
}

// Drops a user image into the photo placeholder (cover + clip), or centers it on the canvas.
export function placeImage(canvas, url, { W, H, slot: target = null }) {
  const f = window.fabric;
  return new Promise((resolve) => f.Image.fromURL(url, (img) => {
    const slot = target || canvas.getObjects().find((o) => o.data?.role === 'photo');
    if (slot) {
      canvas.getObjects().filter((o) => o.data?.role === 'photo-decor').forEach((o) => canvas.remove(o));
      const b = slot.getBoundingRect(true, true);
      img.scale(Math.max(b.width / img.width, b.height / img.height));
      img.set({ left: b.left + b.width / 2, top: b.top + b.height / 2, originX: 'center', originY: 'center' });
      img.clipPath = new f.Rect({ left: b.left, top: b.top, width: b.width, height: b.height, rx: slot.rx, ry: slot.ry, absolutePositioned: true });
      const idx = canvas.getObjects().indexOf(slot);
      canvas.remove(slot);
      canvas.insertAt(img, idx);
    } else {
      img.scale(Math.min((W * 0.6) / img.width, (H * 0.6) / img.height, 1));
      img.set({ left: W / 2, top: H / 2, originX: 'center', originY: 'center' });
      canvas.add(img);
    }
    img.data = { role: 'user' };
    canvas.setActiveObject(img);
    canvas.requestRenderAll();
    resolve(img);
  }));
}
