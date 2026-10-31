// Chart.js wrappers styled for glass surfaces. Series colors follow a fixed categorical order.
import { fmt, t, isEn } from './core.js';

export const SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#9085e9'];

let configured = false;
function setup() {
  if (configured || !window.Chart) return;
  configured = true;
  const C = window.Chart;
  C.defaults.font.family = "'IBM Plex Sans Arabic', sans-serif";
  C.defaults.font.size = 12;
  C.defaults.color = 'rgba(255,255,255,.62)';
  C.defaults.borderColor = 'rgba(255,255,255,.07)';
  C.defaults.maintainAspectRatio = false;
  C.defaults.plugins.legend.display = false;
  Object.assign(C.defaults.plugins.tooltip, {
    rtl: !isEn, textDirection: isEn ? 'ltr' : 'rtl', backgroundColor: 'rgba(14,16,24,.92)', borderColor: 'rgba(255,255,255,.16)', borderWidth: 1,
    padding: 12, cornerRadius: 12, titleFont: { weight: '600', size: 13 }, bodyFont: { size: 12.5 }, boxPadding: 5, usePointStyle: true,
  });
}

const hexA = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};

const baseScales = (yFormat) => ({
  x: { grid: { display: false }, border: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 12 } },
  y: { grid: { color: 'rgba(255,255,255,.07)' }, border: { display: false }, beginAtZero: true,
    ticks: { maxTicksLimit: 5, callback: (v) => (yFormat ? yFormat(v) : fmt.compact(v)) } },
});

const valueLabel = (fmtFn) => (ctx) => ` ${ctx.dataset.label}: ${fmtFn ? fmtFn(ctx.parsed.y) : fmt.num(ctx.parsed.y)}`;

// series: [{ label, data, color? , fill? }]
export function lineChart(canvas, labels, series, { yFormat, tooltipFormat } = {}) {
  setup();
  const ctx = canvas.getContext('2d');
  return new window.Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: series.map((s, i) => {
        const color = s.color || SERIES[i];
        const grad = ctx.createLinearGradient(0, 0, 0, canvas.parentElement.clientHeight || 280);
        grad.addColorStop(0, hexA(color, 0.32));
        grad.addColorStop(1, hexA(color, 0));
        return {
          label: t(s.label), data: s.data, borderColor: color, backgroundColor: s.fill === false ? 'transparent' : grad,
          fill: s.fill !== false, tension: 0.38, borderWidth: 2, pointRadius: 0, pointHoverRadius: 5,
          pointHoverBorderWidth: 2, pointHoverBorderColor: '#fff', pointBackgroundColor: color,
        };
      }),
    },
    options: {
      interaction: { mode: 'index', intersect: false },
      scales: baseScales(yFormat),
      plugins: { tooltip: { callbacks: { label: valueLabel(tooltipFormat) } } },
    },
    plugins: [crosshair],
  });
}

export function barChart(canvas, labels, series, { yFormat, tooltipFormat, stacked = false, colorFn } = {}) {
  setup();
  return new window.Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: series.map((s, i) => ({
        label: t(s.label), data: s.data,
        backgroundColor: colorFn ? s.data.map(colorFn) : s.color || SERIES[i],
        borderRadius: 4, borderSkipped: 'start', maxBarThickness: 26, categoryPercentage: 0.7, barPercentage: 0.9,
        borderColor: 'rgba(0,0,0,0)', borderWidth: stacked ? { top: 2 } : 0,
      })),
    },
    options: {
      interaction: { mode: 'index', intersect: false },
      scales: { ...baseScales(yFormat), x: { ...baseScales().x, stacked }, y: { ...baseScales(yFormat).y, stacked } },
      plugins: { tooltip: { callbacks: { label: valueLabel(tooltipFormat) } } },
    },
  });
}

// Vertical hover guide line for line charts.
const crosshair = {
  id: 'crosshair',
  afterDraw(chart) {
    const active = chart.tooltip?.getActiveElements?.();
    if (!active?.length) return;
    const { ctx, chartArea } = chart;
    const x = active[0].element.x;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.25)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(x, chartArea.top); ctx.lineTo(x, chartArea.bottom); ctx.stroke();
    ctx.restore();
  },
};

export const legendHTML = (items) =>
  `<div class="legend">${items.map((it, i) => `<span><i style="background:${it.color || SERIES[i]}"></i>${it.label}</span>`).join('')}</div>`;
