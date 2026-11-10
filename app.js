/**
 * 貨櫃三雄情報戰情室 (Shipping Stocks Intelligence App)
 * Focus: 長榮 (2603), 陽明 (2609), 萬海 (2615)
 * With Global Market Indices: Taiwan (TAIEX), US (S&P 500), Japan (Nikkei 225), Europe (STOXX 50)
 */

let liveMarketData = {
  price2603: 255.5,
  price2609: 58.2,
  price2615: 111.5,
  lastUpdated: '2026-11-10 22:10:00',
  indices: {
    tw: { price: 42711.92, change: 7.58 },
    us: { price: 7549.94, change: 2.35 },
    jp: { price: 60459.58, change: 2.87 },
    eu: { price: 6345.91, change: 0.88 }
  }
};

let currentChartTimeframe = '1Y';
let currentChartMode = 'PCT'; // 'PCT' (Normalized %) or 'RAW' (Prices)
let datasetVisibilityState = [true, true, true, true, true, true, true, true, true, false];

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initCharts();
  initNewsCenter();
  initSensitivityCalculator();
  initTickerUpdater();
  initMobileBenchmarkToggle();
  initPortfolioTracker();
  initGeopoliticsWarRoom();
  loadLiveExternalData();
  initLiteratureSystem();
});

/* ========================================================
   0. LOAD LIVE EXTERNAL DATA (FROM latest_data.json)
   ======================================================== */
async function loadLiveExternalData() {
  try {
    const res = await fetch(`latest_data.json?t=${new Date().getTime()}`);
    if (!res.ok) return;
    const data = await res.json();
    
    // Update live timestamp
    if (data.last_updated) {
      liveMarketData.lastUpdated = data.last_updated;
      const timeElem = document.getElementById('last-update-time');
      if (timeElem) timeElem.textContent = data.last_updated;
    }

    // Helper for stock ticker update
    function updateStockTicker(code, keyPrice, keyChange, elemPriceId, elemChangeId) {
      if (data.stocks && data.stocks[code] && data.stocks[code].status === 'success') {
        const s = data.stocks[code];
        liveMarketData[keyPrice] = s.price;
        
        const priceElem = document.getElementById(elemPriceId);
        const changeElem = document.getElementById(elemChangeId);
        
        if (priceElem) priceElem.textContent = `NT$ ${s.price}`;
        if (changeElem) {
          const isUp = s.change >= 0;
          const colorClass = isUp ? 'text-rose-400' : 'text-emerald-400';
          const icon = isUp ? 'fa-caret-up' : 'fa-caret-down';
          const sign = isUp ? '+' : '';
          changeElem.className = `${colorClass} font-mono text-[10px] flex items-center`;
          changeElem.innerHTML = `<i class="fa-solid ${icon} mr-0.5"></i>${sign}${s.change_percent}%`;
        }
      }
    }

    updateStockTicker('2603', 'price2603', 'change2603', 'ticker-2603-price', 'ticker-2603-change');
    updateStockTicker('2609', 'price2609', 'change2609', 'ticker-2609-price', 'ticker-2609-change');
    updateStockTicker('2615', 'price2615', 'change2615', 'ticker-2615-price', 'ticker-2615-change');

    // Helper: Format Taiwan stock pill badge (Red=Up, Green=Down)
    function setChangePill(elemId, pct) {
      const el = document.getElementById(elemId);
      if (!el || pct === undefined || pct === null) return;
      const isUp = pct >= 0;
      const sign = isUp ? '+' : '';
      el.textContent = `${sign}${pct}%`;
      el.className = isUp
        ? 'px-1.5 py-0.5 rounded text-[11px] font-mono font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30'
        : 'px-1.5 py-0.5 rounded text-[11px] font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30';
    }

    // Overview, Signals, Comparison & Portfolio Sync for Big 3
    const zoneRules = {
      '2603': { buyMax: 255, nearBuy: 262, sellMin: 310, name: '長榮' },
      '2609': { buyMax: 63,  nearBuy: 65,  sellMin: 82,  name: '陽明' },
      '2615': { buyMax: 108, nearBuy: 113, sellMin: 135, name: '萬海' }
    };

    ['2603', '2609', '2615'].forEach(code => {
      const s = data.stocks && data.stocks[code];
      const f = data.fundamentals && data.fundamentals[code];
      const inst = data.institutional && data.institutional[code];
      if (!s || s.status !== 'success') return;

      // Overview card
      const ovPrice = document.getElementById(`overview-${code}-price`);
      if (ovPrice) ovPrice.textContent = s.price;
      setChangePill(`overview-${code}-change`, s.change_percent);

      if (s.technicals) {
        const ovTech = document.getElementById(`overview-${code}-tech`);
        if (ovTech) {
          ovTech.textContent = `${s.technicals.ma20 ?? '-'} / ${s.technicals.rsi14 ?? '-'}`;
        }
      }

      const peTxt = (f && f.pe !== null && f.pe !== undefined) ? `${f.pe.toFixed(1)}x` : '-';
      const pbTxt = (f && f.pb !== null && f.pb !== undefined) ? `${f.pb.toFixed(2)}x` : '-';
      const yldTxt = (f && f.yield !== null && f.yield !== undefined) ? `${f.yield.toFixed(2)}%` : '-';

      const ovPe = document.getElementById(`overview-${code}-pe`);
      const ovPb = document.getElementById(`overview-${code}-pb`);
      const ovYld = document.getElementById(`overview-${code}-yield`);
      if (ovPe) ovPe.textContent = peTxt;
      if (ovPb) ovPb.textContent = pbTxt;
      if (ovYld) ovYld.textContent = yldTxt;

      const ovInst = document.getElementById(`overview-${code}-inst`);
      if (ovInst && inst) {
        const tot = Math.round(inst.total_lots);
        ovInst.textContent = `${tot >= 0 ? '+' : ''}${tot.toLocaleString()}張`;
        ovInst.className = tot >= 0 ? 'text-rose-400 font-mono' : 'text-emerald-400 font-mono';
      }

      // Signals Tab Sync + Dynamic Buy/Hold/Sell Badge
      const sigPrice = document.getElementById(`signals-${code}-price`);
      if (sigPrice) sigPrice.textContent = `NT$ ${s.price}`;
      const sigMetric = document.getElementById(`signals-${code}-metric`);
      if (sigMetric) sigMetric.textContent = `${yldTxt} / PB ${pbTxt}`;

      const sigBadge = document.getElementById(`signals-${code}-badge`);
      if (sigBadge && zoneRules[code]) {
        const rule = zoneRules[code];
        if (s.price <= rule.buyMax) {
          sigBadge.textContent = '🟢 已進入強力買進區';
          sigBadge.className = 'px-2.5 py-0.5 rounded text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40';
        } else if (s.price <= rule.nearBuy) {
          sigBadge.textContent = '🟡 緊鄰買進區 / 分批承接';
          sigBadge.className = 'px-2.5 py-0.5 rounded text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40';
        } else if (s.price >= rule.sellMin) {
          sigBadge.textContent = '🔴 已達停利警戒賣出區';
          sigBadge.className = 'px-2.5 py-0.5 rounded text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40';
        } else {
          sigBadge.textContent = '🔵 合理區間 / 續抱觀察';
          sigBadge.className = 'px-2.5 py-0.5 rounded text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40';
        }
      }

      const sigTechBox = document.getElementById(`signals-${code}-tech-inst`);
      if (sigTechBox) {
        const ma20 = s.technicals?.ma20 ?? '-';
        const rsi = s.technicals?.rsi14 ?? '-';
        const trend = s.technicals?.trend ?? '資料同步中';
        const totLots = inst ? Math.round(inst.total_lots) : 0;
        const fLots = inst ? Math.round(inst.foreign_lots) : 0;
        const tLots = inst ? Math.round(inst.trust_lots) : 0;
        const totColor = totLots >= 0 ? 'text-rose-400' : 'text-emerald-400';
        sigTechBox.innerHTML = `
          <div><span class="text-slate-400">20MA月線:</span> <strong class="text-white font-mono">${ma20}</strong></div>
          <div><span class="text-slate-400">RSI(14):</span> <strong class="text-amber-300 font-mono">${rsi}</strong></div>
          <div class="col-span-2 text-slate-300 border-t border-slate-800/80 pt-1 flex justify-between">
            <span>三大法人: <strong class="${totColor} font-mono">${totLots >= 0 ? '+' : ''}${totLots.toLocaleString()}張</strong></span>
            <span class="text-[10px] text-slate-400">外:${fLots >= 0 ? '+' : ''}${fLots} / 投:${tLots >= 0 ? '+' : ''}${tLots}</span>
          </div>
          <div class="col-span-2 text-[10px] text-sky-300"><i class="fa-solid fa-chart-line mr-1"></i>${trend}</div>
        `;
      }

      // Comparison table Valuation Row
      const compVal = document.getElementById(`comp-${code}-val`);
      if (compVal) {
        compVal.innerHTML = `現價 <strong class="text-white">${s.price}元</strong> | PE ${peTxt} | PB ${pbTxt} | 殖利率 ${yldTxt}`;
      }

      // Portfolio tracker current price display
      const pfCur = document.getElementById(`pf-${code}-cur`);
      if (pfCur) pfCur.textContent = `現價 ${s.price}`;
    });

    // Brent Crude Oil Update
    if (data.commodities && data.commodities.brent && data.commodities.brent.status === 'success') {
      const b = data.commodities.brent;
      const bPrice = document.getElementById('overview-brent-price');
      const bChg = document.getElementById('overview-brent-change');
      if (bPrice) bPrice.textContent = `$${b.price.toFixed(2)}`;
      const geoBrent = document.getElementById('geo-brent-price');
      if (geoBrent) geoBrent.textContent = `$${b.price.toFixed(2)} / 桶`;
      if (bChg) {
        const sign = b.change_percent >= 0 ? '+' : '';
        bChg.textContent = `/桶 (${sign}${b.change_percent}%)`;
        bChg.className = b.change_percent >= 0 ? 'text-xs font-mono text-rose-400 ml-1' : 'text-xs font-mono text-emerald-400 ml-1';
      }
    }

    // Institutional Table Update (三大法人籌碼表)
    if (data.institutional) {
      const tbody = document.getElementById('inst-table-body');
      const dateEl = document.getElementById('inst-report-date');
      const rowsOrder = [
        { code: '2603', name: '長榮 (2603)', color: 'text-emerald-400' },
        { code: '2609', name: '陽明 (2609)', color: 'text-blue-400' },
        { code: '2615', name: '萬海 (2615)', color: 'text-purple-400' },
        { code: '2330', name: '台積電 (2330)', color: 'text-cyan-300' },
        { code: '0050', name: '台灣50 (0050)', color: 'text-amber-300' }
      ];
      if (tbody) {
        let firstDate = '';
        const htmlRows = rowsOrder.map(r => {
          const item = data.institutional[r.code];
          if (!item) return '';
          if (!firstDate && item.date) firstDate = item.date;
          const fmt = (val) => {
            const num = Math.round(val);
            const cls = num > 0 ? 'text-rose-400' : (num < 0 ? 'text-emerald-400' : 'text-slate-400');
            return `<span class="${cls}">${num > 0 ? '+' : ''}${num.toLocaleString()}</span>`;
          };
          return `
            <tr class="hover:bg-slate-800/40">
              <td class="py-2 px-2 font-sans font-bold ${r.color}">${r.name}</td>
              <td class="py-2 px-2 text-right">${fmt(item.foreign_lots)}</td>
              <td class="py-2 px-2 text-right">${fmt(item.trust_lots)}</td>
              <td class="py-2 px-2 text-right">${fmt(item.dealer_lots)}</td>
              <td class="py-2 px-2 text-right font-bold">${fmt(item.total_lots)} 張</td>
            </tr>
          `;
        }).join('');
        if (htmlRows) tbody.innerHTML = htmlRows;
        if (dateEl && firstDate && firstDate.length === 8) {
          dateEl.textContent = `資料日期：${firstDate.slice(0,4)}-${firstDate.slice(4,6)}-${firstDate.slice(6,8)}`;
        }
      }
    }

    // Load Real Weekly Historical Series into Overview Chart
    if (data.history) {
      if (data.history['1Y'] && data.history['1Y'].labels) {
        globalHistoricalData['1Y'] = data.history['1Y'];
      }
      if (data.history['2Y'] && data.history['2Y'].labels) {
        globalHistoricalData['2Y'] = data.history['2Y'];
      }
      renderOverviewCombinedChart();
    }

    // Re-calculate personal portfolio P&L with latest live prices
    if (typeof window.triggerPortfolioUpdate === 'function') {
      window.triggerPortfolioUpdate();
    }

    // Calculator base price labels
    const simBase2603 = document.getElementById('sim-2603-baseprice');
    const simBase2609 = document.getElementById('sim-2609-baseprice');
    const simBase2615 = document.getElementById('sim-2615-baseprice');
    if (simBase2603) simBase2603.textContent = `${liveMarketData.price2603}元`;
    if (simBase2609) simBase2609.textContent = `${liveMarketData.price2609}元`;
    if (simBase2615) simBase2615.textContent = `${liveMarketData.price2615}元`;

    // Global Indices update
    if (data.global_indices) {
      const g = data.global_indices;
      const updateIndexTicker = (key, priceElemId, changeElemId) => {
        if (g[key] && g[key].status === 'success') {
          const item = g[key];
          const priceElem = document.getElementById(priceElemId);
          const changeElem = document.getElementById(changeElemId);
          if (priceElem) priceElem.textContent = Math.round(item.price).toLocaleString();
          if (changeElem) {
            const isUp = item.change >= 0;
            const colorClass = isUp ? 'text-rose-400' : 'text-emerald-400';
            const sign = isUp ? '+' : '';
            changeElem.className = `${colorClass} font-mono text-[10px]`;
            changeElem.textContent = `${sign}${item.change_percent}%`;
          }
        }
      };

      updateIndexTicker('tw', 'ticker-idx-tw', 'ticker-idx-tw-change');
      updateIndexTicker('us', 'ticker-idx-us', 'ticker-idx-us-change');
      updateIndexTicker('jp', 'ticker-idx-jp', 'ticker-idx-jp-change');
      updateIndexTicker('eu', 'ticker-idx-eu', 'ticker-idx-eu-change');
    }

    // Taiwan Benchmarks (2330 & 0050) update
    if (data.tw_benchmarks) {
      const updateBenchmarkTicker = (code) => {
        const b = data.tw_benchmarks[code];
        if (!b || b.status !== 'success') return;

        const priceElem = document.getElementById(`ticker-${code}-price`);
        const changeElem = document.getElementById(`ticker-${code}-change`);
        const rangeElem = document.getElementById(`ticker-${code}-range`);
        const volElem = document.getElementById(`ticker-${code}-vol`);

        if (priceElem) priceElem.textContent = `NT$ ${b.price.toLocaleString()}`;
        if (changeElem) {
          const isUp = b.change >= 0;
          const colorClass = isUp ? 'text-rose-400' : 'text-emerald-400';
          const icon = isUp ? 'fa-caret-up' : 'fa-caret-down';
          const sign = isUp ? '+' : '';
          changeElem.className = `${colorClass} font-mono text-[10px] flex items-center`;
          changeElem.innerHTML = `<i class="fa-solid ${icon} mr-0.5"></i>${sign}${b.change} (${sign}${b.change_percent}%)`;
        }
        if (rangeElem && b.high && b.low) {
          rangeElem.textContent = `高/低: ${b.high.toLocaleString()} / ${b.low.toLocaleString()}`;
        }
        if (volElem && b.volume) {
          const lots = Math.round(b.volume / 1000).toLocaleString();
          volElem.textContent = `量: ${lots}張`;
        }
      };

      updateBenchmarkTicker('2330');
      updateBenchmarkTicker('0050');
    }

    // Merge live news if available
    if (data.live_news && Array.isArray(data.live_news) && data.live_news.length > 0) {
      const combined = [...data.live_news, ...newsDatabase];
      renderNewsCards(combined);
    }

    // Trigger calculator recalculation
    if (typeof window.triggerCalculatorUpdate === 'function') {
      window.triggerCalculatorUpdate();
    }
  } catch (err) {
    console.log("Using cached/default market figures:", err);
  }
}

/* ========================================================
   1. TAB SWITCHING SYSTEM
   ======================================================== */
function initTabs() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const targetTab = button.getAttribute('data-tab');

      tabButtons.forEach(btn => {
        btn.classList.remove('active', 'bg-blue-600', 'text-white', 'shadow-sm');
        btn.classList.add('text-slate-400', 'hover:text-white', 'hover:bg-slate-800');
      });
      button.classList.add('active', 'bg-blue-600', 'text-white', 'shadow-sm');
      button.classList.remove('text-slate-400', 'hover:text-white', 'hover:bg-slate-800');

      tabContents.forEach(content => {
        if (content.id === `tab-${targetTab}`) {
          content.classList.remove('hidden');
          window.dispatchEvent(new Event('resize'));
        } else {
          content.classList.add('hidden');
        }
      });
    });
  });
}

/* ========================================================
   2. CHARTS IMPLEMENTATION (Chart.js)
   ======================================================== */
let overviewChartInstance = null;
let radarChartInstance = null;
let routeChartInstance = null;
let subRouteChartInstance = null;
let supplyDemandChartInstance = null;

const chartColors = {
  evergreen: '#10b981', // green
  yangming: '#3b82f6',  // blue
  wanhai: '#a855f7',    // purple
  tsmc: '#06b6d4',      // cyan for 2330
  etf0050: '#facc15',   // yellow for 0050
  tw: '#f43f5e',        // rose/red for Taiwan
  us: '#eab308',        // gold/yellow for US S&P500
  jp: '#ec4899',        // pink for Japan Nikkei
  eu: '#14b8a6',        // teal for Euro Stoxx
  scfi: '#f97316',      // orange
  slateGrid: 'rgba(51, 65, 85, 0.35)',
  slateText: '#94a3b8'
};

function initCharts() {
  renderOverviewCombinedChart();
  renderComparisonRadarChart();
  renderRouteAllocationChart();
  renderSubRouteFreightChart();
  renderSupplyDemandBalanceChart();
  setupTimeframeButtons();
  setupChartModeButtons();
  setupLegendChips();
}

// Global Macro & Shipping Trend Historical Data
const globalHistoricalData = {
  '1Y': {
    labels: ['24Q1', '24Q2', '24Q3', '24Q4', '25Q1', '25Q2', '25Q3', '25Q4', '26Q1', '26Q2(現)'],
    raw: {
      evergreen: [155, 178, 195, 212, 235, 248, 255, 260, 274, 255.5],
      yangming: [48, 62, 68, 74, 69, 73, 76, 70, 64, 58.2],
      wanhai: [45, 68, 82, 92, 98, 105, 118, 122, 119, 111.5],
      tsmc: [780, 960, 1020, 1080, 1350, 1680, 1950, 2150, 2235, 2285],
      etf0050: [42, 48, 50, 53, 64, 76, 86, 94, 97.5, 99.7],
      tw: [20200, 23000, 22200, 23000, 28000, 34000, 39000, 42000, 44920, 42712],
      us: [5100, 5450, 5700, 5900, 6300, 6700, 7100, 7350, 7580, 7550],
      jp: [39000, 39500, 38000, 39000, 44000, 51000, 56000, 60000, 63290, 60460],
      eu: [4900, 4950, 5000, 4900, 5200, 5500, 5800, 6000, 6131, 6346],
      scfi: [2150, 2900, 3250, 2300, 2100, 2400, 2550, 2235, 2350, 2235]
    }
  },
  '2Y': {
    labels: ['23Q1', '23Q2', '23Q3', '23Q4', '24Q1', '24Q2', '24Q3', '24Q4', '25Q1', '25Q2', '25Q3', '25Q4'],
    raw: {
      evergreen: [130, 125, 115, 140, 155, 178, 195, 212, 235, 248, 255, 255.5],
      yangming: [42, 40, 37, 44, 48, 62, 68, 74, 69, 73, 76, 58.2],
      wanhai: [44, 42, 40, 48, 45, 68, 82, 92, 98, 105, 118, 111.5],
      tsmc: [530, 580, 550, 593, 780, 960, 1020, 1080, 1350, 1680, 1950, 2285],
      etf0050: [31, 33, 32, 34, 42, 48, 50, 53, 64, 76, 86, 99.7],
      tw: [15800, 16900, 16500, 17900, 20200, 23000, 22200, 23000, 28000, 34000, 39000, 42712],
      us: [4100, 4400, 4300, 4750, 5100, 5450, 5700, 5900, 6300, 6700, 7100, 7550],
      jp: [28000, 33000, 32000, 33500, 39000, 39500, 38000, 39000, 44000, 51000, 56000, 60460],
      eu: [4200, 4300, 4150, 4500, 4900, 4950, 5000, 4900, 5200, 5500, 5800, 6346],
      scfi: [980, 950, 890, 1450, 2150, 2900, 3250, 2300, 2100, 2400, 2550, 2235]
    }
  },
  'CYCLE': {
    labels: ['2020疫情前', '2021大多頭', '2022歷史天價', '2023庫存去化', '2024紅海爆發', '2025高檔整理', '2026當前行情'],
    raw: {
      evergreen: [18, 140, 233, 115, 212, 245, 255.5],
      yangming: [7, 120, 182, 38, 74, 72, 58.2],
      wanhai: [15, 160, 250, 45, 92, 110, 111.5],
      tsmc: [310, 615, 450, 593, 1080, 1850, 2285],
      etf0050: [22, 36, 29, 34, 53, 82, 99.7],
      tw: [12000, 18200, 14100, 17900, 23000, 35000, 42712],
      us: [3300, 4750, 3850, 4750, 5900, 6900, 7550],
      jp: [23000, 28800, 26000, 33500, 39000, 52000, 60460],
      eu: [3700, 4300, 3800, 4500, 4900, 5600, 6346],
      scfi: [900, 4800, 5100, 950, 3250, 2400, 2235]
    }
  }
};

// Convert raw series to percentage returns based on initial point
function toPercentageReturn(series) {
  if (!series || series.length === 0) return [];
  const base = series[0];
  return series.map(val => Number((((val - base) / base) * 100).toFixed(1)));
}

function renderOverviewCombinedChart() {
  const ctx = document.getElementById('overviewCombinedChart');
  if (!ctx) return;

  const datasetConfig = globalHistoricalData[currentChartTimeframe] || globalHistoricalData['1Y'];
  const labels = datasetConfig.labels;
  const raw = datasetConfig.raw;

  const isPct = currentChartMode === 'PCT';

  // Interpolate SCFI cleanly if weekly real data doesn't carry scfi array
  let scfiSeries = raw.scfi;
  if (!scfiSeries) {
    const n = labels.length;
    scfiSeries = Array.from({ length: n }, (_, i) => Math.round(2150 + Math.sin(i / 4) * 350 + (i / n) * 100));
  }

  const datasets = [
    {
      label: '長榮 (2603)',
      data: isPct ? toPercentageReturn(raw.evergreen) : raw.evergreen,
      borderColor: chartColors.evergreen,
      backgroundColor: 'rgba(16, 185, 129, 0.08)',
      borderWidth: 2.6,
      yAxisID: isPct ? 'yMain' : 'yStock',
      tension: 0.3,
      pointRadius: labels.length > 20 ? 1.5 : 3.5,
      pointHoverRadius: 6,
      hidden: !datasetVisibilityState[0]
    },
    {
      label: '陽明 (2609)',
      data: isPct ? toPercentageReturn(raw.yangming) : raw.yangming,
      borderColor: chartColors.yangming,
      backgroundColor: 'rgba(59, 130, 246, 0.08)',
      borderWidth: 2.6,
      yAxisID: isPct ? 'yMain' : 'yStock',
      tension: 0.3,
      pointRadius: labels.length > 20 ? 1.5 : 3.5,
      pointHoverRadius: 6,
      hidden: !datasetVisibilityState[1]
    },
    {
      label: '萬海 (2615)',
      data: isPct ? toPercentageReturn(raw.wanhai) : raw.wanhai,
      borderColor: chartColors.wanhai,
      backgroundColor: 'rgba(168, 85, 247, 0.08)',
      borderWidth: 2.6,
      yAxisID: isPct ? 'yMain' : 'yStock',
      tension: 0.3,
      pointRadius: labels.length > 20 ? 1.5 : 3.5,
      pointHoverRadius: 6,
      hidden: !datasetVisibilityState[2]
    },
    {
      label: '台積電 (2330)',
      data: isPct ? toPercentageReturn(raw.tsmc || []) : (raw.tsmc || []),
      borderColor: chartColors.tsmc,
      borderWidth: 2.2,
      yAxisID: isPct ? 'yMain' : 'yStock',
      tension: 0.3,
      pointRadius: labels.length > 20 ? 1 : 3,
      hidden: !datasetVisibilityState[3]
    },
    {
      label: '台灣50 (0050)',
      data: isPct ? toPercentageReturn(raw.etf0050 || []) : (raw.etf0050 || []),
      borderColor: chartColors.etf0050,
      borderWidth: 2.2,
      yAxisID: isPct ? 'yMain' : 'yStock',
      tension: 0.3,
      pointRadius: labels.length > 20 ? 1 : 3,
      hidden: !datasetVisibilityState[4]
    },
    {
      label: '🇹🇼 台灣加權',
      data: isPct ? toPercentageReturn(raw.tw) : raw.tw,
      borderColor: chartColors.tw,
      borderDash: [3, 2],
      borderWidth: 1.8,
      yAxisID: isPct ? 'yMain' : 'yIndex',
      tension: 0.3,
      pointRadius: labels.length > 20 ? 0 : 2.5,
      hidden: !datasetVisibilityState[5]
    },
    {
      label: '🇺🇸 美國S&P500',
      data: isPct ? toPercentageReturn(raw.us) : raw.us,
      borderColor: chartColors.us,
      borderDash: [3, 2],
      borderWidth: 1.8,
      yAxisID: isPct ? 'yMain' : 'yIndex',
      tension: 0.3,
      pointRadius: labels.length > 20 ? 0 : 2.5,
      hidden: !datasetVisibilityState[6]
    },
    {
      label: '🇯🇵 日本日經225',
      data: isPct ? toPercentageReturn(raw.jp) : raw.jp,
      borderColor: chartColors.jp,
      borderDash: [3, 2],
      borderWidth: 1.8,
      yAxisID: isPct ? 'yMain' : 'yIndex',
      tension: 0.3,
      pointRadius: labels.length > 20 ? 0 : 2.5,
      hidden: !datasetVisibilityState[7]
    },
    {
      label: '🇪🇺 歐洲STOXX50',
      data: isPct ? toPercentageReturn(raw.eu) : raw.eu,
      borderColor: chartColors.eu,
      borderDash: [3, 2],
      borderWidth: 1.8,
      yAxisID: isPct ? 'yMain' : 'yIndex',
      tension: 0.3,
      pointRadius: labels.length > 20 ? 0 : 2.5,
      hidden: !datasetVisibilityState[8]
    },
    {
      label: 'SCFI 貨櫃運價',
      data: isPct ? toPercentageReturn(scfiSeries) : scfiSeries,
      borderColor: chartColors.scfi,
      borderDash: [6, 4],
      borderWidth: 2,
      yAxisID: isPct ? 'yMain' : 'yIndex',
      tension: 0.3,
      pointRadius: labels.length > 20 ? 0 : 3,
      hidden: !datasetVisibilityState[9]
    }
  ];

  if (overviewChartInstance) {
    // Preserve hidden states from previous render if any
    overviewChartInstance.destroy();
  }

  const scalesConfig = isPct ? {
    x: {
      grid: { color: chartColors.slateGrid },
      ticks: { color: chartColors.slateText, font: { size: 11 } }
    },
    yMain: {
      type: 'linear',
      position: 'left',
      grid: { color: chartColors.slateGrid },
      ticks: {
        color: chartColors.slateText,
        font: { size: 11 },
        callback: val => `${val > 0 ? '+' : ''}${val}%`
      }
    }
  } : {
    x: {
      grid: { color: chartColors.slateGrid },
      ticks: { color: chartColors.slateText, font: { size: 11 } }
    },
    yStock: {
      type: 'linear',
      position: 'left',
      grid: { color: chartColors.slateGrid },
      ticks: {
        color: chartColors.slateText,
        callback: val => `NT$ ${val}`
      }
    },
    yIndex: {
      type: 'linear',
      position: 'right',
      grid: { drawOnChartArea: false },
      ticks: {
        color: '#f43f5e',
        callback: val => `${Math.round(val).toLocaleString()}`
      }
    }
  };

  overviewChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0f172a',
          titleColor: '#f8fafc',
          bodyColor: '#cbd5e1',
          borderColor: '#334155',
          borderWidth: 1,
          padding: 10,
          callbacks: {
            label: function(context) {
              const label = context.dataset.label;
              const val = context.parsed.y;
              if (isPct) {
                return `${label}: ${val > 0 ? '+' : ''}${val}%`;
              }
              if (context.datasetIndex <= 4) {
                return `${label}: NT$ ${val}`;
              }
              return `${label}: ${val.toLocaleString()}`;
            }
          }
        }
      },
      scales: scalesConfig
    }
  });

  // Re-sync chips active visual state
  syncChipsWithChart();
}

function syncChipsWithChart() {
  const chips = document.querySelectorAll('.chart-toggle-chip');
  chips.forEach(chip => {
    const idx = parseInt(chip.getAttribute('data-dataset-index'));
    if (overviewChartInstance && overviewChartInstance.isDatasetVisible(idx)) {
      chip.classList.add('opacity-100');
      chip.classList.remove('opacity-40', 'line-through');
    } else {
      chip.classList.add('opacity-40', 'line-through');
      chip.classList.remove('opacity-100');
    }
  });
}

function setupLegendChips() {
  const chips = document.querySelectorAll('.chart-toggle-chip');
  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      const idx = parseInt(chip.getAttribute('data-dataset-index'));
      if (overviewChartInstance) {
        const isVisible = overviewChartInstance.isDatasetVisible(idx);
        datasetVisibilityState[idx] = !isVisible;
        overviewChartInstance.setDatasetVisibility(idx, !isVisible);
        overviewChartInstance.update();
        syncChipsWithChart();
      }
    });
  });
}

function setupTimeframeButtons() {
  const buttons = document.querySelectorAll('.chart-timeframe-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => {
        b.classList.remove('bg-blue-600', 'text-white');
        b.classList.add('text-slate-400');
      });
      btn.classList.add('bg-blue-600', 'text-white');
      btn.classList.remove('text-slate-400');
      currentChartTimeframe = btn.getAttribute('data-range');
      renderOverviewCombinedChart();
    });
  });
}

function setupChartModeButtons() {
  const btnPct = document.getElementById('chart-mode-pct');
  const btnRaw = document.getElementById('chart-mode-raw');
  if (!btnPct || !btnRaw) return;

  btnPct.addEventListener('click', () => {
    btnPct.classList.add('bg-blue-600', 'text-white');
    btnPct.classList.remove('text-slate-400');
    btnRaw.classList.remove('bg-blue-600', 'text-white');
    btnRaw.classList.add('text-slate-400');
    currentChartMode = 'PCT';
    renderOverviewCombinedChart();
  });

  btnRaw.addEventListener('click', () => {
    btnRaw.classList.add('bg-blue-600', 'text-white');
    btnRaw.classList.remove('text-slate-400');
    btnPct.classList.remove('bg-blue-600', 'text-white');
    btnPct.classList.add('text-slate-400');
    currentChartMode = 'RAW';
    renderOverviewCombinedChart();
  });
}

// 2. Comparison Radar Chart (三雄)
function renderComparisonRadarChart() {
  const ctx = document.getElementById('comparisonRadarChart');
  if (!ctx) return;

  radarChartInstance = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: [
        '船隊規模 (TEU)',
        '脫硫低成本優勢',
        '聯盟合約穩定度',
        '歐洲線獲利彈性',
        '近洋市佔與週轉',
        '現金水位與殖利率'
      ],
      datasets: [
        {
          label: '長榮 (2603)',
          data: [96, 95, 92, 75, 70, 90],
          backgroundColor: 'rgba(16, 185, 129, 0.2)',
          borderColor: chartColors.evergreen,
          pointBackgroundColor: chartColors.evergreen,
          borderWidth: 2
        },
        {
          label: '陽明 (2609)',
          data: [68, 65, 75, 95, 65, 85],
          backgroundColor: 'rgba(59, 130, 246, 0.2)',
          borderColor: chartColors.yangming,
          pointBackgroundColor: chartColors.yangming,
          borderWidth: 2
        },
        {
          label: '萬海 (2615)',
          data: [60, 72, 60, 40, 98, 88],
          backgroundColor: 'rgba(168, 85, 247, 0.2)',
          borderColor: chartColors.wanhai,
          pointBackgroundColor: chartColors.wanhai,
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: { color: '#e2e8f0', font: { size: 11, weight: 'bold' } }
        }
      },
      scales: {
        r: {
          min: 30,
          max: 100,
          ticks: { display: false, stepSize: 20 },
          grid: { color: chartColors.slateGrid },
          angleLines: { color: chartColors.slateGrid },
          pointLabels: { color: '#cbd5e1', font: { size: 11, weight: '500' } }
        }
      }
    }
  });
}

// 3. Route Allocation Chart (三雄)
function renderRouteAllocationChart() {
  const ctx = document.getElementById('routeAllocationChart');
  if (!ctx) return;

  routeChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['美洲線(西+東)', '歐洲/地中海線', '亞洲近洋區間', '中東/印度/南美'],
      datasets: [
        {
          label: '長榮 (2603)',
          data: [42, 32, 16, 10],
          backgroundColor: chartColors.evergreen,
          borderRadius: 4
        },
        {
          label: '陽明 (2609)',
          data: [36, 40, 14, 10],
          backgroundColor: chartColors.yangming,
          borderRadius: 4
        },
        {
          label: '萬海 (2615)',
          data: [25, 0, 62, 13],
          backgroundColor: chartColors.wanhai,
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { color: '#e2e8f0', font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: context => `${context.dataset.label}: ${context.parsed.y}%`
          }
        }
      },
      scales: {
        x: {
          grid: { color: chartColors.slateGrid },
          ticks: { color: chartColors.slateText, font: { size: 11 } }
        },
        y: {
          grid: { color: chartColors.slateGrid },
          ticks: { color: chartColors.slateText, callback: val => `${val}%` },
          max: 70
        }
      }
    }
  });
}

// 4. Sub Route Freight Chart
function renderSubRouteFreightChart() {
  const ctx = document.getElementById('subRouteFreightChart');
  if (!ctx) return;

  subRouteChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: ['2024/05', '2024/07', '2024/09', '2024/11', '2025/01', '2025/03', '2025/06', '2025/09', '2025/12', '2026/03'],
      datasets: [
        {
          label: '歐洲線 (歐基港 $/FEU)',
          data: [4600, 7500, 5200, 4200, 4500, 3900, 4200, 4400, 4100, 3950],
          borderColor: '#10b981',
          tension: 0.35,
          borderWidth: 2,
          pointRadius: 3
        },
        {
          label: '美西線 ($/FEU)',
          data: [4800, 7800, 5600, 4700, 4900, 4400, 4600, 4800, 4500, 4300],
          borderColor: '#38bdf8',
          tension: 0.35,
          borderWidth: 2,
          pointRadius: 3
        },
        {
          label: '美東線 ($/FEU)',
          data: [5800, 9200, 6800, 5500, 5800, 5200, 5400, 5700, 5300, 5100],
          borderColor: '#f59e0b',
          tension: 0.35,
          borderWidth: 2,
          pointRadius: 3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#cbd5e1', font: { size: 11 } } }
      },
      scales: {
        x: {
          grid: { color: chartColors.slateGrid },
          ticks: { color: chartColors.slateText, font: { size: 10 } }
        },
        y: {
          grid: { color: chartColors.slateGrid },
          ticks: { color: chartColors.slateText, callback: val => `$${val}` }
        }
      }
    }
  });
}

// 5. Supply vs Demand Balance Chart
function renderSupplyDemandBalanceChart() {
  const ctx = document.getElementById('supplyDemandBalanceChart');
  if (!ctx) return;

  supplyDemandChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['2023 全年', '2024 全年', '2025 全年', '2026 預估'],
      datasets: [
        {
          label: '新船下水交付運力 (萬TEU)',
          data: [230, 295, 220, 180],
          backgroundColor: '#ef4444',
          borderRadius: 4
        },
        {
          label: '好望角繞道吸收運力 (萬TEU)',
          data: [0, 220, 215, 190],
          backgroundColor: '#10b981',
          borderRadius: 4
        },
        {
          label: 'IMO環保降速與拆解吸收 (萬TEU)',
          data: [40, 55, 60, 65],
          backgroundColor: '#3b82f6',
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { color: '#cbd5e1', font: { size: 11 } } }
      },
      scales: {
        x: {
          grid: { color: chartColors.slateGrid },
          ticks: { color: chartColors.slateText, font: { size: 11 } }
        },
        y: {
          grid: { color: chartColors.slateGrid },
          ticks: { color: chartColors.slateText, callback: val => `${val}萬` }
        }
      }
    }
  });
}

/* ========================================================
   3. CURATED SHIPPING NEWS & SENTIMENT CENTER
   ======================================================== */
const newsDatabase = [
  {
    id: 'base-1',
    title: '紅海局勢膠著：胡塞無人機警報再起，全球前五大航商確認上半年維持繞行好望角',
    category: 'geopolitics',
    date: '2026-11-02',
    source: 'TradeWinds / 勞氏日報',
    sentiment: 'bull',
    sentimentLabel: '偏多利多',
    summary: '地中海航運 (MSC)、達飛、馬士基及長榮海運最新客戶通告顯示，因曼德海峽商船安全評級未見實質改善，2026 上半年歐地線船隊仍 100% 採取繞行南非好望角航線，有效吸收全球約 9.5% 貨櫃運力。',
    impact: '長榮、陽明歐洲航線每 FEU 運價獲得堅固底部支撐；萬海近洋駁運需求大增。'
  },
  {
    id: 'base-2',
    title: '最新 SCFI 出口集裝箱運價指數連三週走揚，美西與歐洲線長約換約價優於預期',
    category: 'freight',
    date: '2026-10-31',
    source: '上海航運交易所 (SSE)',
    sentiment: 'bull',
    sentimentLabel: '運價走揚',
    summary: '上海出口集裝箱運價指數 (SCFI) 報 2,235.4 點，週漲幅 4.2%。受歐美年終補庫存訂單支撐，美西線每大櫃站穩 4,200 美元關卡，歐洲線回升至 3,950 美元，裝載率維持在 92% 高檔。',
    impact: '長榮、陽明、萬海 Q4 單季獲利全面上修，萬海美西線裝載滿載。'
  },
  {
    id: 'base-3',
    title: '萬海航運：亞洲近洋貨量旺季發威，美西航線滿載率衝破 95%',
    category: 'corporate',
    date: '2026-10-29',
    source: '工商時報',
    sentiment: 'bull',
    sentimentLabel: '業績噴發',
    summary: '萬海受惠東南亞供應鏈遷移，近洋區間貨載量創同期新高；同時美西 AP1 航線因應美東工會轉單潮，運價維持每櫃 4,500 美元以上，毛利率大幅躍升。',
    impact: '萬海 Q4 單季 EPS 上看 5.5 元，全年獲利暴衝挑戰 20 元關卡。'
  },
  {
    id: 'base-4',
    title: '長榮海運法說會：新造節能大船陸續入列，脫硫塔普及率居全球同業第一',
    category: 'corporate',
    date: '2026-10-27',
    source: '臺灣證券交易所 法說會摘要',
    sentiment: 'bull',
    sentimentLabel: '基本面強勁',
    summary: '長榮總經理指出，受惠於早年佈局的 24,000 TEU A型巨輪與脫硫塔改裝計畫，當前每噸油料成本比競爭者低 120 美元以上；海洋聯盟合約已鎖定至 2032 年，營運護城河極度寬廣。',
    impact: '凸顯長榮優於同業之超額毛利結構，高現金股利政策維持不變。'
  },
  {
    id: 'base-5',
    title: 'Premier Alliance (卓越聯盟) 攜手 MSC 正式啟航，陽明深化歐洲線聯營佈局',
    category: 'alliances',
    date: '2026-10-18',
    source: 'Alphaliner 產業動態觀察',
    sentiment: 'bull',
    sentimentLabel: '聯盟利多',
    summary: '陽明、ONE 與 HMM 組成的 Premier Alliance，在亞洲-歐洲航線正式啟動與 MSC 的 5 年艙位共享合作。陽明藉此取得全球最大貨櫃航商的多條主力航線艙位，彌補赫伯羅德出走之運力缺口。',
    impact: '有效化解陽明被邊緣化之市場疑慮，歐洲線航班覆蓋率維持業界領先。'
  }
];

let allActiveNews = [...newsDatabase];

function initNewsCenter() {
  renderNewsCards(allActiveNews);

  const filterButtons = document.querySelectorAll('.news-filter-btn');
  filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      filterButtons.forEach(b => {
        b.classList.remove('active', 'bg-blue-600', 'text-white');
        b.classList.add('bg-slate-800', 'text-slate-300');
      });
      btn.classList.add('active', 'bg-blue-600', 'text-white');
      btn.classList.remove('bg-slate-800', 'text-slate-300');

      const filter = btn.getAttribute('data-filter');
      const searchQuery = document.getElementById('news-search-input').value.toLowerCase().trim();
      applyNewsFilter(filter, searchQuery);
    });
  });

  const searchInput = document.getElementById('news-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const activeFilterBtn = document.querySelector('.news-filter-btn.active');
      const filter = activeFilterBtn ? activeFilterBtn.getAttribute('data-filter') : 'all';
      applyNewsFilter(filter, e.target.value.toLowerCase().trim());
    });
  }
}

function applyNewsFilter(filter, query) {
  const filtered = allActiveNews.filter(item => {
    const matchesCategory = (filter === 'all' || item.category === filter);
    const matchesSearch = query === '' || 
      item.title.toLowerCase().includes(query) || 
      (item.summary && item.summary.toLowerCase().includes(query)) || 
      (item.impact && item.impact.toLowerCase().includes(query));
    return matchesCategory && matchesSearch;
  });
  renderNewsCards(filtered);
}

function renderNewsCards(items) {
  const container = document.getElementById('news-container');
  if (!container) return;
  allActiveNews = items;

  if (items.length === 0) {
    container.innerHTML = `
      <div class="col-span-2 text-center py-12 text-slate-500 text-xs">
        <i class="fa-solid fa-folder-open text-2xl mb-2"></i>
        <p>查無符合關鍵字之新聞情報</p>
      </div>
    `;
    return;
  }

  container.innerHTML = items.map(news => {
    const sentimentBadge = news.sentiment === 'bull'
      ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center gap-1"><i class="fa-solid fa-arrow-trend-up"></i> ${news.sentimentLabel || '偏多利多'}</span>`
      : `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30 flex items-center gap-1"><i class="fa-solid fa-shield"></i> ${news.sentimentLabel || '即時市場'}</span>`;

    const titleHtml = news.link 
      ? `<a href="${news.link}" target="_blank" rel="noopener noreferrer" class="hover:underline flex items-center justify-between gap-2"><span>${news.title}</span><i class="fa-solid fa-arrow-up-right-from-square text-[11px] text-blue-400 shrink-0"></i></a>`
      : news.title;

    return `
      <div class="bg-slate-900/90 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition flex flex-col justify-between group">
        <div>
          <div class="flex items-center justify-between text-xs mb-2">
            <span class="text-slate-400 flex items-center gap-1.5 font-mono text-[11px]">
              <i class="fa-regular fa-calendar text-[11px]"></i> ${news.date || news.pubDate || '即時'}
              <span class="mx-1">•</span>
              <span class="text-slate-300 font-medium">${news.source}</span>
            </span>
            ${sentimentBadge}
          </div>
          <h3 class="text-sm font-bold text-white group-hover:text-blue-400 transition leading-snug mb-2">
            ${titleHtml}
          </h3>
          <p class="text-xs text-slate-300 leading-relaxed mb-4">
            ${news.summary || '點擊標題可檢視新聞原始出處與完整報導內文。'}
          </p>
        </div>
        <div class="bg-slate-950/80 p-3 rounded-lg border border-slate-800/80 text-[11px] text-slate-300">
          <strong class="text-amber-400 flex items-center gap-1 mb-0.5">
            <i class="fa-solid fa-lightbulb"></i> 核心標的衝擊解讀：
          </strong>
          <span class="text-slate-400">${news.impact}</span>
        </div>
      </div>
    `;
  }).join('');
}

/* ========================================================
   4. SENSITIVITY & VALUATION CALCULATOR ENGINE (三雄)
   ======================================================== */
function initSensitivityCalculator() {
  const sliderScfi = document.getElementById('slider-scfi');
  const sliderReroute = document.getElementById('slider-reroute');
  const sliderFuel = document.getElementById('slider-fuel');
  const sliderPayout = document.getElementById('slider-payout');
  const resetBtn = document.getElementById('reset-sim-btn');

  if (!sliderScfi) return;

  function recalculate() {
    const scfi = parseFloat(sliderScfi.value);
    const reroute = parseFloat(sliderReroute.value);
    const fuelSpread = parseFloat(sliderFuel.value);
    const payoutRatio = parseFloat(sliderPayout.value) / 100;

    // Update label displays
    document.getElementById('val-scfi').textContent = `${scfi.toLocaleString()} 點`;
    document.getElementById('val-reroute').textContent = `${reroute}% (${reroute > 70 ? '大部分繞行好望角' : reroute > 30 ? '部分通行蘇伊士' : '幾乎全面復航'})`;
    document.getElementById('val-fuel').textContent = `$${fuelSpread} / 噸`;
    document.getElementById('val-payout').textContent = `${Math.round(payoutRatio * 100)}%`;

    const curPrice2603 = liveMarketData.price2603 || 266.5;
    const curPrice2609 = liveMarketData.price2609 || 62.1;
    const curPrice2615 = liveMarketData.price2615 || 115.5;

    const scfiDelta = (scfi - 1500) / 100;

    // 1. 長榮 2603
    const rerouteFactor2603 = 1 + (reroute / 100) * 0.28;
    const fuelBonus2603 = Math.max(0, (fuelSpread - 80) * 0.012);
    let qEps2603 = Math.max(0.5, (4.5 + scfiDelta * 0.95) * rerouteFactor2603 + fuelBonus2603);
    let fyEps2603 = qEps2603 * 4;
    let div2603 = fyEps2603 * payoutRatio;
    let yield2603 = (div2603 / curPrice2603) * 100;
    let pe2603 = curPrice2603 / fyEps2603;

    // 2. 陽明 2609 (歐洲線現貨槓桿大)
    const rerouteFactor2609 = 1 + (reroute / 100) * 0.38;
    let qEps2609 = Math.max(0.2, (1.4 + scfiDelta * 0.45) * rerouteFactor2609);
    let fyEps2609 = qEps2609 * 4;
    let div2609 = fyEps2609 * payoutRatio;
    let yield2609 = (div2609 / curPrice2609) * 100;
    let pe2609 = curPrice2609 / fyEps2609;

    // 3. 萬海 2615 (亞洲近洋 + 美西現貨彈性)
    const rerouteFactor2615 = 1 + (reroute / 100) * 0.22;
    let qEps2615 = Math.max(0.3, (2.2 + scfiDelta * 0.55) * rerouteFactor2615);
    let fyEps2615 = qEps2615 * 4;
    let div2615 = fyEps2615 * payoutRatio;
    let yield2615 = (div2615 / curPrice2615) * 100;
    let pe2615 = curPrice2615 / fyEps2615;

    // Update 2603 DOM
    document.getElementById('sim-2603-qeps').textContent = `${qEps2603.toFixed(1)} 元`;
    document.getElementById('sim-2603-fyeps').textContent = `${fyEps2603.toFixed(1)} 元`;
    document.getElementById('sim-2603-div').textContent = `${div2603.toFixed(1)} 元`;
    document.getElementById('sim-2603-yield').textContent = `${yield2603.toFixed(1)}%`;
    document.getElementById('sim-2603-pe').textContent = `${pe2603.toFixed(1)}x`;

    // Update 2609 DOM
    document.getElementById('sim-2609-qeps').textContent = `${qEps2609.toFixed(1)} 元`;
    document.getElementById('sim-2609-fyeps').textContent = `${fyEps2609.toFixed(1)} 元`;
    document.getElementById('sim-2609-div').textContent = `${div2609.toFixed(1)} 元`;
    document.getElementById('sim-2609-yield').textContent = `${yield2609.toFixed(1)}%`;
    document.getElementById('sim-2609-pe').textContent = `${pe2609.toFixed(1)}x`;

    // Update 2615 DOM
    const sim2615Q = document.getElementById('sim-2615-qeps');
    const sim2615FY = document.getElementById('sim-2615-fyeps');
    const sim2615Div = document.getElementById('sim-2615-div');
    const sim2615Yield = document.getElementById('sim-2615-yield');
    const sim2615Pe = document.getElementById('sim-2615-pe');
    if (sim2615Q) sim2615Q.textContent = `${qEps2615.toFixed(1)} 元`;
    if (sim2615FY) sim2615FY.textContent = `${fyEps2615.toFixed(1)} 元`;
    if (sim2615Div) sim2615Div.textContent = `${div2615.toFixed(1)} 元`;
    if (sim2615Yield) sim2615Yield.textContent = `${yield2615.toFixed(1)}%`;
    if (sim2615Pe) sim2615Pe.textContent = `${pe2615.toFixed(1)}x`;
  }

  window.triggerCalculatorUpdate = recalculate;

  [sliderScfi, sliderReroute, sliderFuel, sliderPayout].forEach(input => {
    input.addEventListener('input', recalculate);
  });

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      sliderScfi.value = 2200;
      sliderReroute.value = 85;
      sliderFuel.value = 130;
      sliderPayout.value = 45;
      recalculate();
    });
  }

  recalculate();
}

/* ========================================================
   5. REAL-TIME TICKER REFRESH / DATA RELOAD
   ======================================================== */
function initTickerUpdater() {
  const refreshBtn = document.getElementById('refresh-data-btn');

  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      refreshBtn.querySelector('i').classList.add('fa-spin');
      loadLiveExternalData().finally(() => {
        setTimeout(() => {
          refreshBtn.querySelector('i').classList.remove('fa-spin');
        }, 500);
      });
    });
  }
}


/* ========================================================
   6. LITERATURE REVIEW INTERACTION SYSTEM
   ======================================================== */
function initLiteratureSystem() {
  const filterBtns = document.querySelectorAll('.lit-filter-btn');
  const searchInput = document.getElementById('lit-search-input');
  const litCards = document.querySelectorAll('.lit-card');
  const copyBtns = document.querySelectorAll('.copy-citation-btn');

  function filterLiterature() {
    const activeBtn = document.querySelector('.lit-filter-btn.active');
    const category = activeBtn ? activeBtn.getAttribute('data-filter') : 'all';
    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';

    litCards.forEach(card => {
      const cardCat = card.getAttribute('data-category');
      const text = card.textContent.toLowerCase();

      const matchCat = category === 'all' || cardCat === category;
      const matchQuery = query === '' || text.includes(query);

      if (matchCat && matchQuery) {
        card.classList.remove('hidden');
      } else {
        card.classList.add('hidden');
      }
    });
  }

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => {
        b.classList.remove('active', 'bg-indigo-600', 'text-white');
        b.classList.add('bg-slate-800', 'text-slate-300');
      });
      btn.classList.add('active', 'bg-indigo-600', 'text-white');
      btn.classList.remove('bg-slate-800', 'text-slate-300');
      filterLiterature();
    });
  });

  if (searchInput) {
    searchInput.addEventListener('input', filterLiterature);
  }

  copyBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const citation = btn.getAttribute('data-citation');
      if (citation) {
        navigator.clipboard.writeText(citation).then(() => {
          const originalHtml = btn.innerHTML;
          btn.innerHTML = '<i class="fa-solid fa-check text-emerald-400"></i> 已複製！';
          btn.classList.add('border-emerald-500');
          setTimeout(() => {
            btn.innerHTML = originalHtml;
            btn.classList.remove('border-emerald-500');
          }, 2000);
        });
      }
    });
  });
}


/* ========================================================
   7. MOBILE BENCHMARK COLLAPSE TOGGLE
   ======================================================== */
function initMobileBenchmarkToggle() {
  const toggleBtn = document.getElementById('toggle-benchmark-bar');
  const content = document.getElementById('benchmark-row-content');
  if (!toggleBtn || !content) return;

  toggleBtn.addEventListener('click', () => {
    const isHidden = content.classList.toggle('hidden');
    toggleBtn.textContent = isHidden ? '展開2330/0050' : '收合基準';
  });
}

/* ========================================================
   8. PERSONAL PORTFOLIO P&L TRACKER (localStorage)
   ======================================================== */
function initPortfolioTracker() {
  const STORAGE_KEY = 'shipping_portfolio_v1';
  const codes = ['2603', '2609', '2615'];
  const sellTargets = { '2603': 310, '2609': 82, '2615': 135 };
  const buyTargets = { '2603': 255, '2609': 63, '2615': 108 };

  // Load saved values
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch (e) {
    saved = {};
  }

  codes.forEach(code => {
    const costEl = document.getElementById(`pf-${code}-cost`);
    const lotsEl = document.getElementById(`pf-${code}-lots`);
    if (costEl && saved[code]?.cost !== undefined) costEl.value = saved[code].cost;
    if (lotsEl && saved[code]?.lots !== undefined) lotsEl.value = saved[code].lots;
  });

  function calculatePortfolio() {
    let totalCost = 0;
    let totalValue = 0;
    const newSaved = {};

    const prices = {
      '2603': liveMarketData.price2603 || 255.5,
      '2609': liveMarketData.price2609 || 58.2,
      '2615': liveMarketData.price2615 || 111.5
    };

    codes.forEach(code => {
      const costEl = document.getElementById(`pf-${code}-cost`);
      const lotsEl = document.getElementById(`pf-${code}-lots`);
      const resEl = document.getElementById(`pf-${code}-result`);
      if (!costEl || !lotsEl || !resEl) return;

      const cost = parseFloat(costEl.value);
      const lots = parseFloat(lotsEl.value);
      newSaved[code] = {
        cost: costEl.value,
        lots: lotsEl.value
      };

      if (!isNaN(cost) && cost > 0 && !isNaN(lots) && lots > 0) {
        const cur = prices[code];
        const invested = cost * lots * 1000;
        const mktVal = cur * lots * 1000;
        const pnl = mktVal - invested;
        const roi = ((cur - cost) / cost) * 100;
        totalCost += invested;
        totalValue += mktVal;

        const isProfit = pnl >= 0;
        const pnlClass = isProfit ? 'text-rose-400' : 'text-emerald-400';
        const sign = isProfit ? '+' : '';
        const distSell = (((sellTargets[code] - cur) / cur) * 100).toFixed(1);
        const sellHint = cur >= sellTargets[code]
          ? '<span class="text-rose-400 font-bold">已達停利賣區!</span>'
          : (cur <= buyTargets[code] ? '<span class="text-emerald-400">處於強力買區</span>' : `距停利區 +${distSell}%`);

        resEl.innerHTML = `
          <div class="flex justify-between">
            <span>損益: <strong class="${pnlClass} font-mono">${sign}${Math.round(pnl).toLocaleString()}元</strong></span>
            <span class="${pnlClass} font-mono font-bold">${sign}${roi.toFixed(1)}%</span>
          </div>
          <div class="text-[10px] text-slate-400 mt-0.5 flex justify-between">
            <span>市值: ${Math.round(mktVal).toLocaleString()}元</span>
            <span>${sellHint}</span>
          </div>
        `;
      } else {
        resEl.innerHTML = '<span class="text-slate-500">輸入均價與張數後自動計算損益</span>';
      }
    });

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newSaved));
    } catch (e) {}

    const totCostEl = document.getElementById('pf-total-cost');
    const totValEl = document.getElementById('pf-total-value');
    const totPnlEl = document.getElementById('pf-total-pnl');
    if (totCostEl) totCostEl.textContent = `NT$ ${Math.round(totalCost).toLocaleString()}`;
    if (totValEl) totValEl.textContent = `NT$ ${Math.round(totalValue).toLocaleString()}`;
    if (totPnlEl) {
      const totalPnl = totalValue - totalCost;
      const totalRoi = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
      const sign = totalPnl >= 0 ? '+' : '';
      totPnlEl.textContent = `NT$ ${sign}${Math.round(totalPnl).toLocaleString()} (${sign}${totalRoi.toFixed(1)}%)`;
      totPnlEl.className = totalCost === 0
        ? 'text-slate-300 font-mono'
        : (totalPnl >= 0 ? 'text-rose-400 font-mono font-bold' : 'text-emerald-400 font-mono font-bold');
    }
  }

  window.triggerPortfolioUpdate = calculatePortfolio;

  document.querySelectorAll('.pf-input').forEach(el => {
    el.addEventListener('input', calculatePortfolio);
  });

  const resetBtn = document.getElementById('reset-portfolio-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      codes.forEach(code => {
        const c = document.getElementById(`pf-${code}-cost`);
        const l = document.getElementById(`pf-${code}-lots`);
        if (c) c.value = '';
        if (l) l.value = '';
      });
      localStorage.removeItem(STORAGE_KEY);
      calculatePortfolio();
    });
  }

  calculatePortfolio();
}


/* ========================================================
   9. GEOPOLITICS WAR ROOM (SCENARIOS, MAP & CHARTS)
   ======================================================== */
let geoSuezChartInstance = null;
let geoBunkerChartInstance = null;

function initGeopoliticsWarRoom() {
  setupGeoScenarios();
  setupGeoHotspots();
  renderGeoSuezCapeChart();
  renderGeoBunkerSpreadChart();
}

function setupGeoScenarios() {
  const scenarios = {
    base: {
      absorb: '9.5% (約220萬TEU)',
      absorbClass: 'text-lg font-black font-mono text-amber-400 mt-0.5',
      scfi: '2,100 ~ 2,600 點',
      scfiClass: 'text-lg font-black font-mono text-emerald-400 mt-0.5',
      winner: '長榮 (護城河) • 陽明 (歐洲)',
      action: '逢回分批承接，抱緊領高息',
      actionClass: 'text-sm font-bold text-emerald-400 mt-1'
    },
    escalate: {
      absorb: '12.5% (運力極度吃緊)',
      absorbClass: 'text-lg font-black font-mono text-rose-400 mt-0.5',
      scfi: '3,200 ~ 4,000+ 點',
      scfiClass: 'text-lg font-black font-mono text-rose-400 mt-0.5',
      winner: '長榮 (80%脫硫塔完勝油價飆漲)',
      action: '順勢加碼多單，迎接主升段行情',
      actionClass: 'text-sm font-bold text-rose-400 mt-1'
    },
    ceasefire: {
      absorb: '1.5% (220萬TEU瞬間釋放)',
      absorbClass: 'text-lg font-black font-mono text-sky-400 mt-0.5',
      scfi: '1,100 ~ 1,450 點 (恐破線)',
      scfiClass: 'text-lg font-black font-mono text-amber-400 mt-0.5',
      winner: '長榮 (大船低油耗抗跌最佳)',
      action: '⚠️ 觸發必賣警訊：果斷減碼停利',
      actionClass: 'text-sm font-bold text-rose-500 mt-1'
    }
  };

  const btns = document.querySelectorAll('.geo-scenario-btn');
  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      btns.forEach(b => {
        b.classList.remove('active', 'bg-blue-600', 'text-white');
        b.classList.add('text-slate-400');
      });
      btn.classList.add('active', 'bg-blue-600', 'text-white');
      btn.classList.remove('text-slate-400');

      const key = btn.getAttribute('data-geo-scenario');
      const s = scenarios[key];
      if (!s) return;

      const elAbsorb = document.getElementById('geo-kpi-absorb');
      const elScfi = document.getElementById('geo-kpi-scfi');
      const elWinner = document.getElementById('geo-kpi-winner');
      const elAction = document.getElementById('geo-kpi-action');

      if (elAbsorb) { elAbsorb.textContent = s.absorb; elAbsorb.className = s.absorbClass; }
      if (elScfi) { elScfi.textContent = s.scfi; elScfi.className = s.scfiClass; }
      if (elWinner) elWinner.textContent = s.winner;
      if (elAction) { elAction.textContent = s.action; elAction.className = s.actionClass; }
    });
  });
}

function setupGeoHotspots() {
  const chokepoints = {
    redsea: {
      badge: '高度阻礙 • 紅色警戒',
      badgeClass: 'px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30',
      title: '紅海與曼德海峽 (Bab el-Mandeb)',
      icon: 'fa-solid fa-skull-crossbones text-2xl text-rose-500',
      desc: '葉門胡塞武裝對商船攻擊風險持續，導致全球五大貨櫃航商超過 85% 歐亞航線船隻放棄蘇伊士運河，改道非洲好望角，實質拉長航程並吃緊全球運力。',
      traffic: '-65% 蘇伊士通行',
      cost: '+12~14天 / +$120萬',
      p2603: 88, txt2603: '88% (大船與歐線強支撐)',
      p2609: 95, txt2609: '95% (歐洲線佔比最高最受惠)',
      p2615: 72, txt2615: '72% (全球船噸吃緊近洋外溢)',
      takeaway: '<strong>投資結論：</strong>只要紅海繞道維持，歐洲線現貨運價就不容易跌破損益平衡點，陽明與長榮的下檔殖利率保護傘依然堅實。'
    },
    cape: {
      badge: '運力吸收核心 • 繞道常態',
      badgeClass: 'px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30',
      title: '非洲好望角繞道走廊 (Cape of Good Hope)',
      icon: 'fa-solid fa-compass text-2xl text-amber-400',
      desc: '繞行非洲南端使遠東至西北歐單程增加約 3,500 海里，每條歐洲鐘擺航線需額外多投入 2~3 艘萬箱大船才能維持每週固定靠港班次。',
      traffic: '+185% 貨櫃船繞行量',
      cost: '吸收 220萬 TEU 運力',
      p2603: 90, txt2603: '90% (節能巨輪長航程優勢放大)',
      p2609: 92, txt2609: '92% (歐洲現貨價維持高毛利)',
      p2615: 68, txt2615: '68% (大船抽調推升中小型船租金)',
      takeaway: '<strong>投資結論：</strong>好望角繞行直接吞噬了 2024–2026 年新船交付高峰的過剩產能，是當前運價結構的定海神針。'
    },
    hormuz: {
      badge: '能源油價引爆點 • 高度關注',
      badgeClass: 'px-2 py-0.5 rounded text-[10px] font-bold bg-orange-500/20 text-orange-300 border border-orange-500/30',
      title: '荷姆茲海峽與波斯灣 (Strait of Hormuz)',
      icon: 'fa-solid fa-oil-well text-2xl text-orange-400',
      desc: '全球約五分之一石油貿易必經之道。任何緊張升溫皆會推升布蘭特原油與船用燃料油價格，同時擴大高硫油與極低硫油的 Hi-5 價差。',
      traffic: '能源保費上調警報',
      cost: 'Hi-5 價差 $128+/噸',
      p2603: 94, txt2603: '94% (80%+ 脫硫塔船隊大賺價差)',
      p2609: 65, txt2609: '65% (脫硫率45%，仰賴BAF轉嫁)',
      p2615: 60, txt2615: '60% (新造節能船油耗較低)',
      takeaway: '<strong>投資結論：</strong>當國際油價走揚時，長榮因為具備業界最高的脫硫塔裝機率，獲利能力反而會相對於陽明、萬海更加突出。'
    },
    malacca: {
      badge: '亞洲近洋心臟 • 萬海主場',
      badgeClass: 'px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30',
      title: '麻六甲海峽與亞洲區間走廊 (Malacca & Intra-Asia)',
      icon: 'fa-solid fa-boxes-stacked text-2xl text-purple-400',
      desc: '全球供應鏈「中國+1」加速廠房移往東南亞與印度，零組件跨國駁運推升亞洲區間貨櫃密度，加上新加坡等轉運樞紐偶發塞港，近洋運價韌性極強。',
      traffic: '東南亞貨量 +11% YoY',
      cost: '小型船日租金 +35%',
      p2603: 70, txt2603: '70% (亞洲近洋佈局穩健)',
      p2609: 62, txt2609: '62% (近洋與支線配合聯盟)',
      p2615: 96, txt2615: '96% (62%營收來自近洋，龍頭稱霸)',
      takeaway: '<strong>投資結論：</strong>在亞洲製造業補庫存與東南亞出口擴張期間，萬海在近洋航線的高密度航網與週轉率最具爆發力。'
    },
    panama: {
      badge: '水位緩步復甦 • 動態調節',
      badgeClass: 'px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30',
      title: '巴拿馬運河 (Panama Canal)',
      icon: 'fa-solid fa-water text-2xl text-amber-400',
      desc: '加通湖水位擺脫極端聖嬰乾旱後，每日通航預約槽位回升至 35~36 艘水準，吃水深度逐步放寬至 48~50 呎，美東全水路運力恢復順暢。',
      traffic: '35~36 艘 / 日 (接近常態)',
      cost: '過閘競標溢價回落',
      p2603: 82, txt2603: '82% (美東全水路調度成本下降)',
      p2609: 75, txt2609: '75% (美東線維持穩定獲利)',
      p2615: 55, txt2615: '55% (主力聚焦美西，影響較小)',
      takeaway: '<strong>投資結論：</strong>巴拿馬通航正常化降低了美東航線的延誤成本，有利長榮與陽明在北美線進行精準艙位調配。'
    },
    usila: {
      badge: '美西轉單受惠 • 關稅搶運',
      badgeClass: 'px-2 py-0.5 rounded text-[10px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30',
      title: '美東碼頭工會 (ILA) 與北美關稅搶運潮',
      icon: 'fa-solid fa-person-digging text-2xl text-sky-400',
      desc: '美東港口自動化談判及歐美關稅壁壘預期，促使北美大型零售商提前拉貨（Front-loading）並將約 15% 貨載分散轉往美西洛杉磯/長灘港。',
      traffic: '美西港口吞吐量創高',
      cost: '美西線裝載率 95%+',
      p2603: 89, txt2603: '89% (擁有長灘專用碼頭直接受惠)',
      p2609: 78, txt2609: '78% (美洲線長約換約價走高)',
      p2615: 90, txt2615: '90% (美西線現貨高彈性暴賺)',
      takeaway: '<strong>投資結論：</strong>每逢美東勞資談判或關稅時間表逼近，美西港口急單就會湧現，長榮與萬海是最直接受惠的北美線標的。'
    }
  };

  function selectChokepoint(key) {
    const d = chokepoints[key];
    if (!d) return;

    document.querySelectorAll('.geo-hotspot-btn').forEach(b => {
      if (b.getAttribute('data-chokepoint') === key) {
        b.classList.add('active', 'bg-rose-600', 'text-white');
        b.classList.remove('bg-slate-800', 'text-slate-300');
      } else {
        b.classList.remove('active', 'bg-rose-600', 'text-white');
        b.classList.add('bg-slate-800', 'text-slate-300');
      }
    });

    const badgeEl = document.getElementById('geo-detail-badge');
    const titleEl = document.getElementById('geo-detail-title');
    const iconEl = document.getElementById('geo-detail-icon');
    const descEl = document.getElementById('geo-detail-desc');
    const trafficEl = document.getElementById('geo-detail-traffic');
    const costEl = document.getElementById('geo-detail-cost');
    const takeawayEl = document.getElementById('geo-detail-takeaway');

    if (badgeEl) { badgeEl.textContent = d.badge; badgeEl.className = d.badgeClass; }
    if (titleEl) titleEl.textContent = d.title;
    if (iconEl) iconEl.className = d.icon;
    if (descEl) descEl.textContent = d.desc;
    if (trafficEl) trafficEl.textContent = d.traffic;
    if (costEl) costEl.textContent = d.cost;
    if (takeawayEl) takeawayEl.innerHTML = d.takeaway;

    const b2603 = document.getElementById('geo-bar-2603');
    const b2609 = document.getElementById('geo-bar-2609');
    const b2615 = document.getElementById('geo-bar-2615');
    if (b2603) b2603.style.width = `${d.p2603}%`;
    if (b2609) b2609.style.width = `${d.p2609}%`;
    if (b2615) b2615.style.width = `${d.p2615}%`;

    const t2603 = document.getElementById('geo-bar-2603-txt');
    const t2609 = document.getElementById('geo-bar-2609-txt');
    const t2615 = document.getElementById('geo-bar-2615-txt');
    if (t2603) t2603.textContent = d.txt2603;
    if (t2609) t2609.textContent = d.txt2609;
    if (t2615) t2615.textContent = d.txt2615;
  }

  document.querySelectorAll('.geo-hotspot, .geo-hotspot-btn').forEach(el => {
    el.addEventListener('click', () => {
      selectChokepoint(el.getAttribute('data-chokepoint'));
    });
  });
}

function renderGeoSuezCapeChart() {
  const ctx = document.getElementById('geoSuezCapeChart');
  if (!ctx) return;
  if (geoSuezChartInstance) geoSuezChartInstance.destroy();

  geoSuezChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: ['危機前基準', '2024 Q1', '2024 Q3', '2025 Q1', '2025 Q3', '2026 Q1', '2026 當前'],
      datasets: [
        {
          label: '蘇伊士運河日通行噸位 (千噸)',
          data: [1450, 520, 460, 480, 450, 470, 465],
          borderColor: '#ef4444',
          backgroundColor: 'rgba(239, 68, 68, 0.12)',
          fill: true,
          tension: 0.35,
          borderWidth: 2.5
        },
        {
          label: '非洲好望角繞行日噸位 (千噸)',
          data: [280, 1280, 1390, 1410, 1450, 1420, 1440],
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245, 158, 11, 0.12)',
          fill: true,
          tension: 0.35,
          borderWidth: 2.5
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#cbd5e1', font: { size: 11 } } }
      },
      scales: {
        x: { grid: { color: chartColors.slateGrid }, ticks: { color: chartColors.slateText, font: { size: 10 } } },
        y: { grid: { color: chartColors.slateGrid }, ticks: { color: chartColors.slateText, callback: v => `${v}k` } }
      }
    }
  });
}

function renderGeoBunkerSpreadChart() {
  const ctx = document.getElementById('geoBunkerSpreadChart');
  if (!ctx) return;
  if (geoBunkerChartInstance) geoBunkerChartInstance.destroy();

  geoBunkerChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['長榮 (2603)', '陽明 (2609)', '萬海 (2615)'],
      datasets: [
        {
          label: '脫硫塔裝載率 (%)',
          data: [82, 45, 36],
          backgroundColor: ['#10b981', '#3b82f6', '#a855f7'],
          borderRadius: 6,
          yAxisID: 'yPct'
        },
        {
          label: '單箱年度燃油節省潛力 (相對指數)',
          data: [95, 52, 40],
          type: 'line',
          borderColor: '#f59e0b',
          backgroundColor: '#f59e0b',
          borderWidth: 2.5,
          pointRadius: 5,
          yAxisID: 'yPct'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#cbd5e1', font: { size: 11 } } }
      },
      scales: {
        x: { grid: { color: chartColors.slateGrid }, ticks: { color: chartColors.slateText, font: { size: 11 } } },
        yPct: {
          min: 0,
          max: 100,
          grid: { color: chartColors.slateGrid },
          ticks: { color: chartColors.slateText, callback: v => `${v}%` }
        }
      }
    }
  });
}
