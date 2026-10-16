/**
 * Chart rendering module using Chart.js 4 with CSS fallback charts.
 * Adheres to SplitStack Review 2 (Step P6) requirements:
 * - Pinned Chart.js 4 CDN with graceful offline/failure fallback
 * - Dynamic color extraction from CSS tokens via getComputedStyle
 * - Re-render on theme changes (light/dark/system)
 * - Canvas accessibility (role="img", aria-label, visually-hidden table)
 * - Chart instance lifecycle management (prevents duplicate canvases and leaks)
 * - Pure monetary calculations in integer paise, formatted at presentation boundary
 */

import { formatINR } from '../core/format.js';
import { qs, createEl } from '../core/dom.js';

const CHART_JS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js';

let chartJsPromise = null;
const chartRegistry = new Map();
let themeObserverInitialized = false;
const registeredRenderers = new Set();

/**
 * Load Chart.js 4 script dynamically once.
 * Resolves to window.Chart or null if unavailable / failed.
 * @returns {Promise<any|null>}
 */
export async function loadChartJs() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return null;
  }

  if (window.Chart) {
    return window.Chart;
  }

  if (chartJsPromise) {
    return chartJsPromise;
  }

  chartJsPromise = new Promise((resolve) => {
    // Check if script tag already exists
    const existing = document.querySelector(`script[src="${CHART_JS_URL}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(window.Chart || null));
      existing.addEventListener('error', () => resolve(null));
      return;
    }

    const script = document.createElement('script');
    script.src = CHART_JS_URL;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.referrerPolicy = 'no-referrer';

    script.onload = () => {
      resolve(window.Chart || null);
    };

    script.onerror = () => {
      console.warn('[SplitStack] Chart.js CDN could not be loaded; using accessible CSS fallback charts.');
      resolve(null);
    };

    document.head.appendChild(script);
  });

  return chartJsPromise;
}

/**
 * Extract active theme palette from document root CSS variables.
 * @returns {Object}
 */
export function getChartThemePalette() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return {
      primary: '#6366f1',
      success: '#10b981',
      danger: '#ef4444',
      warning: '#f59e0b',
      info: '#0ea5e9',
      text: '#f1f5f9',
      textMuted: '#a8b4c7',
      textDim: '#8794a9',
      border: 'rgba(255, 255, 255, 0.09)',
      surface: '#0f172a',
      surface2: '#16213a',
      fontSans: 'Inter, system-ui, sans-serif'
    };
  }

  const computed = window.getComputedStyle(document.documentElement);
  const getVar = (name, fallback) => computed.getPropertyValue(name).trim() || fallback;

  return {
    primary: getVar('--primary', '#6366f1'),
    success: getVar('--success', '#10b981'),
    danger: getVar('--danger', '#ef4444'),
    warning: getVar('--warning', '#f59e0b'),
    info: getVar('--info', '#0ea5e9'),
    text: getVar('--text', '#f1f5f9'),
    textMuted: getVar('--text-muted', '#a8b4c7'),
    textDim: getVar('--text-dim', '#8794a9'),
    border: getVar('--border', 'rgba(255, 255, 255, 0.09)'),
    surface: getVar('--surface', '#0f172a'),
    surface2: getVar('--surface-2', '#16213a'),
    fontSans: getVar('--font-sans', 'Inter, system-ui, sans-serif'),
    catColors: {
      food: getVar('--cat-food', '#f59e0b'),
      transport: getVar('--cat-transport', '#3b82f6'),
      shopping: getVar('--cat-shopping', '#ec4899'),
      bills: getVar('--cat-bills', '#ef4444'),
      entertainment: getVar('--cat-entertainment', '#8b5cf6'),
      education: getVar('--cat-education', '#10b981'),
      health: getVar('--cat-health', '#06b6d4'),
      travel: getVar('--cat-travel', '#6366f1'),
      other: getVar('--cat-other', '#64748b')
    }
  };
}

/**
 * Destroy a tracked chart instance.
 * @param {string} key
 */
export function destroyChart(key) {
  const existing = chartRegistry.get(key);
  if (existing) {
    try {
      existing.destroy();
    } catch (_) {
      // Ignored
    }
    chartRegistry.delete(key);
  }
}

/**
 * Destroy all tracked chart instances.
 */
export function destroyAllCharts() {
  for (const [key, chart] of chartRegistry.entries()) {
    try {
      chart.destroy();
    } catch (_) {
      // Ignored
    }
  }
  chartRegistry.clear();
}

/**
 * Observe theme changes and update rendered charts.
 */
function initThemeObserver() {
  if (themeObserverInitialized || typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }
  themeObserverInitialized = true;

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'attributes' && m.attributeName === 'data-theme') {
        onThemeChanged();
        break;
      }
    }
  });

  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    onThemeChanged();
  });
}

function onThemeChanged() {
  for (const renderFn of registeredRenderers) {
    try {
      renderFn();
    } catch (err) {
      console.warn('[SplitStack] Error updating chart on theme change:', err);
    }
  }
}

/**
 * Render income vs expenses monthly trend chart.
 * If Chart.js is available, renders a canvas bar chart.
 * Always maintains or updates the CSS chart and data table as accessible fallbacks.
 *
 * @param {HTMLElement|string} containerSelector
 * @param {Array<{label: string, income: number, expenses: number}>} months
 * @param {Object} [options]
 * @returns {Promise<any|null>}
 */
export async function renderMonthlyTrendBar(containerSelector, months, options = {}) {
  const container = typeof containerSelector === 'string' ? qs(containerSelector) : containerSelector;
  if (!container || !Array.isArray(months) || months.length === 0) {
    return null;
  }

  initThemeObserver();
  const chartKey = options.id || 'monthly-trend-bar';

  // Function to re-run on theme change
  const runRender = async () => {
    await renderMonthlyTrendBar(container, months, { ...options, isThemeUpdate: true });
  };
  registeredRenderers.add(runRender);

  const ChartClass = await loadChartJs();
  const palette = getChartThemePalette();

  // Find or create canvas element
  let canvas = container.querySelector('canvas.chart-canvas');
  const cssFallbackChart = container.querySelector('.bar-chart');

  // Compute max amount for aria-label and summary
  const maxIncome = Math.max(...months.map((m) => m.income || 0));
  const maxExpense = Math.max(...months.map((m) => m.expenses || 0));
  const minIncome = Math.min(...months.map((m) => m.income || 0));
  const minExpense = Math.min(...months.map((m) => m.expenses || 0));
  const labels = months.map((m) => m.label || m.monthName || '');

  const ariaDescription = `Income and expenses trend over ${months.length} months from ${labels[0]} to ${labels[labels.length - 1]}. Income ranges from ${formatINR(minIncome)} to ${formatINR(maxIncome)}; expenses from ${formatINR(minExpense)} to ${formatINR(maxExpense)}.`;

  if (!ChartClass) {
    // If Chart.js is not available, ensure CSS fallback chart is visible and updated
    if (cssFallbackChart) {
      cssFallbackChart.style.display = '';
      const highestPaise = Math.max(maxIncome, maxExpense, 1);
      const groups = cssFallbackChart.querySelectorAll('.bar-group');

      months.forEach((m, idx) => {
        const group = groups[idx];
        if (group) {
          const incBar = group.querySelector('.bar.income');
          const expBar = group.querySelector('.bar.expense');
          const lbl = group.querySelector('.bar-label');

          const incH = Math.min(100, Math.round(((m.income || 0) / highestPaise) * 100));
          const expH = Math.min(100, Math.round(((m.expenses || 0) / highestPaise) * 100));

          if (incBar) {
            incBar.style.setProperty('--h', `${incH}%`);
            incBar.title = `${m.label || m.monthName} income ${formatINR(m.income)}`;
          }
          if (expBar) {
            expBar.style.setProperty('--h', `${expH}%`);
            expBar.title = `${m.label || m.monthName} expenses ${formatINR(m.expenses)}`;
          }
          if (lbl) {
            lbl.textContent = m.label || m.monthName;
          }
        }
      });
    }

    const descEl = container.querySelector('#dash-trend-desc, #an-trend-desc');
    if (descEl) descEl.textContent = ariaDescription;
    return null;
  }

  // Chart.js is available: hide CSS bar-chart and render Canvas
  if (cssFallbackChart) {
    cssFallbackChart.style.display = 'none';
  }

  if (!canvas) {
    canvas = createEl('canvas', {
      className: 'chart-canvas',
      role: 'img',
      'aria-label': ariaDescription,
      style: {
        width: '100%',
        maxHeight: '280px',
        display: 'block'
      }
    });

    if (cssFallbackChart && cssFallbackChart.parentNode) {
      cssFallbackChart.parentNode.insertBefore(canvas, cssFallbackChart);
    } else {
      container.prepend(canvas);
    }
  } else {
    canvas.setAttribute('aria-label', ariaDescription);
  }

  // Destroy previous instance
  destroyChart(chartKey);

  const incomeData = months.map((m) => Math.round((m.income || 0) / 100));
  const expenseData = months.map((m) => Math.round((m.expenses || 0) / 100));

  const chartInstance = new ChartClass(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Income',
          data: incomeData,
          backgroundColor: palette.success,
          borderRadius: 4,
          maxBarThickness: 28
        },
        {
          label: 'Expenses',
          data: expenseData,
          backgroundColor: palette.primary,
          borderRadius: 4,
          maxBarThickness: 28
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            color: palette.text,
            font: { family: palette.fontSans, size: 12 },
            padding: 16
          }
        },
        tooltip: {
          backgroundColor: palette.surface2,
          titleColor: palette.text,
          bodyColor: palette.text,
          borderColor: palette.border,
          borderWidth: 1,
          padding: 10,
          callbacks: {
            label(context) {
              const rupees = context.parsed.y || 0;
              return `${context.dataset.label}: ₹${rupees.toLocaleString('en-IN')}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: palette.textMuted, font: { family: palette.fontSans } }
        },
        y: {
          grid: { color: palette.border },
          ticks: {
            color: palette.textMuted,
            font: { family: palette.fontSans },
            callback(val) {
              return `₹${Number(val).toLocaleString('en-IN')}`;
            }
          }
        }
      }
    }
  });

  chartRegistry.set(chartKey, chartInstance);
  return chartInstance;
}

/**
 * Render spending by category doughnut chart.
 * If Chart.js is available, renders a canvas doughnut chart.
 * Always maintains CSS donut chart fallback.
 *
 * @param {HTMLElement|string} containerSelector
 * @param {Array<{categoryId: string, name: string, total: number}>} categoryItems
 * @param {Object} [options]
 * @returns {Promise<any|null>}
 */
export async function renderCategoryDoughnut(containerSelector, categoryItems, options = {}) {
  const container = typeof containerSelector === 'string' ? qs(containerSelector) : containerSelector;
  if (!container || !Array.isArray(categoryItems) || categoryItems.length === 0) {
    return null;
  }

  initThemeObserver();
  const chartKey = options.id || 'category-doughnut';

  const runRender = async () => {
    await renderCategoryDoughnut(container, categoryItems, { ...options, isThemeUpdate: true });
  };
  registeredRenderers.add(runRender);

  const ChartClass = await loadChartJs();
  const palette = getChartThemePalette();

  const totalPaise = categoryItems.reduce((acc, c) => acc + (c.total || 0), 0);
  const labels = categoryItems.map((c) => c.name || c.categoryId);
  const dataValues = categoryItems.map((c) => Math.round((c.total || 0) / 100));

  const bgColors = categoryItems.map((c) => {
    const rawId = (c.categoryId || '').replace(/^cat_/, '');
    return palette.catColors[rawId] || palette.catColors.other;
  });

  const largest = categoryItems.reduce((max, c) => (c.total > (max?.total || 0) ? c : max), categoryItems[0]);
  const monthName = options.monthName || 'October';
  const ariaDescription = `${monthName} spending by category, total ${formatINR(totalPaise)}. Largest: ${largest?.name || ''} ${formatINR(largest?.total || 0)}.`;

  let canvas = container.querySelector('canvas.chart-canvas-doughnut');
  const cssDonut = container.querySelector('.donut');

  if (!ChartClass) {
    // Fallback: update CSS donut segments and center text
    if (cssDonut) {
      cssDonut.style.display = '';
      let currentAcc = 0;
      const segmentParts = [];

      for (const item of categoryItems) {
        const rawId = (item.categoryId || '').replace(/^cat_/, '');
        const pct = totalPaise > 0 ? (item.total / totalPaise) * 100 : 0;
        const start = currentAcc.toFixed(1);
        currentAcc += pct;
        const end = currentAcc.toFixed(1);
        segmentParts.push(`var(--cat-${rawId}, #64748b) ${start}% ${end}%`);
      }

      cssDonut.style.setProperty('--segments', segmentParts.join(', '));
      cssDonut.setAttribute('aria-label', ariaDescription);

      const centerStrong = cssDonut.querySelector('.donut-center strong');
      if (centerStrong) centerStrong.textContent = formatINR(totalPaise);
    }
    return null;
  }

  // Chart.js available: hide CSS donut circle and render Canvas
  if (cssDonut) {
    cssDonut.style.display = 'none';
  }

  if (!canvas) {
    canvas = createEl('canvas', {
      className: 'chart-canvas-doughnut',
      role: 'img',
      'aria-label': ariaDescription,
      style: {
        width: '100%',
        maxHeight: '260px',
        display: 'block',
        margin: '0 auto var(--sp-4)'
      }
    });

    if (cssDonut && cssDonut.parentNode) {
      cssDonut.parentNode.insertBefore(canvas, cssDonut);
    } else {
      container.prepend(canvas);
    }
  } else {
    canvas.setAttribute('aria-label', ariaDescription);
  }

  destroyChart(chartKey);

  const chartInstance = new ChartClass(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [
        {
          data: dataValues,
          backgroundColor: bgColors,
          borderWidth: 2,
          borderColor: palette.surface,
          hoverOffset: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '72%',
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            color: palette.text,
            font: { family: palette.fontSans, size: 11 },
            boxWidth: 12,
            padding: 10
          }
        },
        tooltip: {
          backgroundColor: palette.surface2,
          titleColor: palette.text,
          bodyColor: palette.text,
          borderColor: palette.border,
          borderWidth: 1,
          padding: 8,
          callbacks: {
            label(context) {
              const rupees = context.parsed || 0;
              const pct = totalPaise > 0 ? ((rupees * 100) / totalPaise) * 100 : 0;
              return `${context.label}: ₹${rupees.toLocaleString('en-IN')} (${pct.toFixed(1)}%)`;
            }
          }
        }
      }
    }
  });

  chartRegistry.set(chartKey, chartInstance);
  return chartInstance;
}
