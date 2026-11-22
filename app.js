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
  usdTwd: 32.9,
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
  const safeRun = (fn) => { try { fn(); } catch (e) { console.error('Init error:', e); } };
  safeRun(initTabs);
  safeRun(initGeopoliticsWarRoom);
  safeRun(initCharts);
  safeRun(initNewsCenter);
  safeRun(initSensitivityCalculator);
  safeRun(initTickerUpdater);
  safeRun(initMobileBenchmarkToggle);
  safeRun(initPortfolioTracker);
  safeRun(initLiteratureSystem);
  safeRun(initDividendCalculator);
  safeRun(initMacroFxSimulator);
  safeRun(initChecklistAndNotes);
  safeRun(initShipCursor);
  safeRun(init3DDigitalTwinShip);
  safeRun(init3DMaritimeRoutesSandbox);
  safeRun(init3DSurfaceWarRoom);
  loadLiveExternalData();
});

/* ========================================================
   0. REAL-TIME LIVE QUOTES (CNYES CORS) & EXTERNAL DATA
   ======================================================== */
const CNYES_REALTIME_SYMBOLS = [
  'TWS:2603:STOCK',
  'TWS:2609:STOCK',
  'TWS:2615:STOCK',
  'TWS:2330:STOCK',
  'TWS:0050:STOCK',
  'TWS:TSE27:INDEX',
  'TWS:TSE31:INDEX',
  'TWS:TSE01:INDEX',
  'GI:INX:INDEX',
  'GI:NKY:INDEX',
  'GI:STOXX50E:INDEX',
  'FX:USDTWD:FOREX'
].join(',');

let baseMarketPayload = null;
let baseValuationSnapshot = {};
let latestCnyesMap = null;
// Base Book Value Per Share (BPS 每股淨值基準)
const SHIPPING_BASE_BPS = {
  '2603': 280.7, // 長榮最新每股淨值約 280.7 元
  '2609': 98.1,  // 陽明最新每股淨值約 98.1 元
  '2615': 110.5  // 萬海最新每股淨值約 110.5 元
};

// Function to calculate dynamic valuation zone thresholds based on current BPS & PB
function calculateDynamicZones(code, currentPb = null, currentPrice = null) {
  let bps = SHIPPING_BASE_BPS[code] || 100;
  if (currentPrice && currentPb && currentPb > 0) {
    const derivedBps = currentPrice / currentPb;
    if (derivedBps >= 30 && derivedBps <= 500) {
      bps = derivedBps;
    }
  }

  if (code === '2609') {
    // 陽明歷史評價折價較深 (PB 0.55x ~ 0.70x 為強力買進, 0.70x ~ 0.88x 為合理, > 0.95x 為停利)
    return {
      bps: Math.round(bps),
      buyMin: Math.round(bps * 0.55),
      buyMax: Math.round(bps * 0.70),
      holdMin: Math.round(bps * 0.71),
      holdMax: Math.round(bps * 0.88),
      sellMin: Math.round(bps * 0.95),
      sellMax: Math.round(bps * 1.05)
    };
  } else if (code === '2615') {
    // 萬海波動較大 (PB 0.75x ~ 0.90x 為強力買進, 0.91x ~ 1.10x 為合理, > 1.25x 為停利)
    return {
      bps: Math.round(bps),
      buyMin: Math.round(bps * 0.75),
      buyMax: Math.round(bps * 0.90),
      holdMin: Math.round(bps * 0.91),
      holdMax: Math.round(bps * 1.10),
      sellMin: Math.round(bps * 1.25),
      sellMax: Math.round(bps * 1.40)
    };
  } else {
    // 長榮獲利護城河最高 (PB 0.75x ~ 0.90x 為強力買進, 0.91x ~ 1.05x 為合理, > 1.15x 為停利)
    return {
      bps: Math.round(bps),
      buyMin: Math.round(bps * 0.75),
      buyMax: Math.round(bps * 0.90),
      holdMin: Math.round(bps * 0.91),
      holdMax: Math.round(bps * 1.05),
      sellMin: Math.round(bps * 1.15),
      sellMax: Math.round(bps * 1.25)
    };
  }
}
let autoSyncEnabled = true;
let autoSyncTimer = null;
let userAdjustedFxSlider = false;

function formatLocalTimestamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function setUpdateTimestamp(timestampText, highlight = false) {
  liveMarketData.lastUpdated = timestampText;
  const timeElem = document.getElementById('last-update-time');
  if (!timeElem) return;
  timeElem.textContent = timestampText;
  if (highlight) {
    timeElem.classList.add('text-sky-600', 'font-semibold');
    setTimeout(() => {
      timeElem.classList.remove('text-sky-600', 'font-semibold');
    }, 900);
  }
}

function setSyncBadgeState(mode, customText) {
  const btn = document.getElementById('live-sync-toggle');
  const dot = document.getElementById('live-sync-dot');
  const lbl = document.getElementById('live-sync-label');
  if (!btn || !dot || !lbl) return;
  if (mode === 'live') {
    btn.className = 'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 transition';
    dot.className = 'w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse';
    lbl.textContent = customText || '即時連動 15s';
  } else if (mode === 'paused') {
    btn.className = 'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 transition';
    dot.className = 'w-1.5 h-1.5 rounded-full bg-amber-400';
    lbl.textContent = customText || '已暫停連動';
  } else {
    btn.className = 'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-500/15 text-sky-300 border border-sky-500/30 hover:bg-sky-500/25 transition';
    dot.className = 'w-1.5 h-1.5 rounded-full bg-sky-400';
    lbl.textContent = customText || '快取同步中';
  }
}

function flashElementUpdate(el, isUp) {
  if (!el) return;
  const cls = isUp ? 'text-rose-300' : 'text-emerald-300';
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), 650);
}

function captureBaseValuationSnapshot(data) {
  if (!data || !data.stocks || !data.fundamentals) return;
  ['2603', '2609', '2615'].forEach(code => {
    const s = data.stocks[code];
    const f = data.fundamentals[code];
    if (s && s.price > 0 && f) {
      baseValuationSnapshot[code] = {
        basePrice: Number(s.price),
        pe: f.pe ?? null,
        pb: f.pb ?? null,
        yield: f.yield ?? null
      };
    }
  });
}

function cloneSimple(obj) {
  if (!obj) return {};
  return JSON.parse(JSON.stringify(obj));
}

function buildMergedPayload() {
  const merged = baseMarketPayload ? cloneSimple(baseMarketPayload) : {
    stocks: {},
    tw_benchmarks: {},
    global_indices: {},
    fundamentals: {},
    institutional: {},
    commodities: {}
  };
  if (!latestCnyesMap) return merged;

  const mapStock = (sym, container, targetKey) => {
    const q = latestCnyesMap[sym];
    if (!q || q.price === null || q.price === undefined) return;
    if (!container[targetKey]) container[targetKey] = { symbol: sym, status: "success" };
    const target = container[targetKey];
    target.status = "success";
    target.price = q.price;
    if (q.change !== null && q.change !== undefined) target.change = q.change;
    if (q.pct !== null && q.pct !== undefined) target.change_percent = q.pct;
    if (q.high !== null && q.high !== undefined) target.high = q.high;
    if (q.low !== null && q.low !== undefined) target.low = q.low;
    if (q.prev_close !== null && q.prev_close !== undefined) target.prev_close = q.prev_close;
    if (q.volume_lots !== null && q.volume_lots !== undefined) {
      target.volume = Math.round(q.volume_lots * 1000);
      target.volume_lots = q.volume_lots;
    }
    if (q.amount_ntd !== null && q.amount_ntd !== undefined) {
      target.amount_ntd = q.amount_ntd;
    }
  };

  mapStock('TWS:2603:STOCK', merged.stocks, '2603');
  mapStock('TWS:2609:STOCK', merged.stocks, '2609');
  mapStock('TWS:2615:STOCK', merged.stocks, '2615');
  mapStock('TWS:2330:STOCK', merged.tw_benchmarks, '2330');
  mapStock('TWS:0050:STOCK', merged.tw_benchmarks, '0050');
  mapStock('TWS:TSE27:INDEX', merged.global_indices, 'elec');
  mapStock('TWS:TSE31:INDEX', merged.global_indices, 'fin');
  mapStock('TWS:TSE01:INDEX', merged.global_indices, 'tw');
  mapStock('GI:INX:INDEX', merged.global_indices, 'us');
  mapStock('GI:NKY:INDEX', merged.global_indices, 'jp');
  mapStock('GI:STOXX50E:INDEX', merged.global_indices, 'eu');

  ['2603', '2609', '2615'].forEach(code => {
    const s = merged.stocks[code];
    if (!s || !s.price) return;
    const t = s.technicals;
    if (t) {
      if (t.ma20) t.bias_20 = Number((((s.price - t.ma20) / t.ma20) * 100).toFixed(2));
      if (t.ma60) t.bias_60 = Number((((s.price - t.ma60) / t.ma60) * 100).toFixed(2));
      if (t.ma20 && t.ma60) {
        if (s.price > t.ma20 && t.ma20 > t.ma60) t.trend = "多頭排列 (站上月線與季線)";
        else if (s.price > t.ma20) t.trend = "短期轉強 (站上20MA月線)";
        else if (s.price < t.ma20 && s.price > t.ma60) t.trend = "回測季線震盪整理";
        else t.trend = "均線下方弱勢整理";
      }
    }
    const snap = baseValuationSnapshot[code];
    if (snap && snap.basePrice > 0 && merged.fundamentals[code]) {
      const ratio = s.price / snap.basePrice;
      if (snap.pe !== null) merged.fundamentals[code].pe = Number((snap.pe * ratio).toFixed(2));
      if (snap.pb !== null) merged.fundamentals[code].pb = Number((snap.pb * ratio).toFixed(2));
      if (snap.yield !== null && ratio > 0) merged.fundamentals[code].yield = Number((snap.yield / ratio).toFixed(2));
    }
  });

  const fxQ = latestCnyesMap['FX:USDTWD:FOREX'];
  if (fxQ && fxQ.price > 0) {
    liveMarketData.usdTwd = fxQ.price;
    const fxSlider = document.getElementById("fx-rate-slider");
    if (fxSlider && !userAdjustedFxSlider) {
      const clamped = Math.min(35.0, Math.max(29.0, Number(fxQ.price.toFixed(2))));
      fxSlider.value = clamped;
      if (typeof window.triggerMacroFxUpdate === "function") {
        window.triggerMacroFxUpdate();
      }
    }
  }

  return merged;
}

function applyMarketDataToUI(data, options = {}) {
  const {
    redrawOverviewChart = false,
    redrawTechCharts = false,
    redrawNews = false,
    isLiveTick = false
  } = options;
  if (!data) return;

  function updateStockTicker(code, keyPrice, elemPriceId, elemChangeId) {
    if (data.stocks && data.stocks[code] && data.stocks[code].status === 'success') {
      const s = data.stocks[code];
      const prev = liveMarketData[keyPrice];
      liveMarketData[keyPrice] = s.price;

      const priceElem = document.getElementById(elemPriceId);
      const changeElem = document.getElementById(elemChangeId);
      const newPriceText = `NT$ ${s.price}`;
      if (priceElem) {
        const changed = isLiveTick && prev !== undefined && prev !== s.price;
        priceElem.textContent = newPriceText;
        if (changed) flashElementUpdate(priceElem, s.price > prev);
      }
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

  updateStockTicker('2603', 'price2603', 'ticker-2603-price', 'ticker-2603-change');
  updateStockTicker('2609', 'price2609', 'ticker-2609-price', 'ticker-2609-change');
  updateStockTicker('2615', 'price2615', 'ticker-2615-price', 'ticker-2615-change');

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

  
  ['2603', '2609', '2615'].forEach(code => {
    const s = data.stocks && data.stocks[code];
    const f = data.fundamentals && data.fundamentals[code];
    const inst = data.institutional && data.institutional[code];
    if (!s || s.status !== 'success') return;

    const ovPrice = document.getElementById(`overview-${code}-price`);
    if (ovPrice) ovPrice.textContent = s.price;
    setChangePill(`overview-${code}-change`, s.change_percent);

    if (s.technicals) {
      const ovTech = document.getElementById(`overview-${code}-tech`);
      if (ovTech) ovTech.textContent = `${s.technicals.ma20 ?? '-'} / ${s.technicals.rsi14 ?? '-'}`;
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

    const sigPrice = document.getElementById(`signals-${code}-price`);
    if (sigPrice) sigPrice.textContent = `NT$ ${s.price}`;
    const sigMetric = document.getElementById(`signals-${code}-metric`);
    if (sigMetric) sigMetric.textContent = `${yldTxt} / PB ${pbTxt}`;

    // Dynamic Price Zones Calculation linked with real-time PB & Price
    const dynZones = calculateDynamicZones(code, f?.pb, s.price);

    // Update ladder text elements dynamically
    const buyEl = document.getElementById(`zone-${code}-buy`);
    const holdEl = document.getElementById(`zone-${code}-hold`);
    const sellEl = document.getElementById(`zone-${code}-sell`);
    const descEl = document.getElementById(`zone-${code}-desc`);

    if (buyEl) buyEl.textContent = `${dynZones.buyMin} ~ ${dynZones.buyMax} 元`;
    if (holdEl) holdEl.textContent = `${dynZones.holdMin} ~ ${dynZones.holdMax} 元`;
    if (sellEl) sellEl.textContent = `${dynZones.sellMin} ~ ${dynZones.sellMax} 元 以上`;
    if (descEl) descEl.textContent = `每股淨值(BPS)約 ${dynZones.bps} 元，下檔具備堅實安全邊際支撐`;

    const sigBadge = document.getElementById(`signals-${code}-badge`);
    if (sigBadge) {
      if (s.price <= dynZones.buyMax) {
        sigBadge.textContent = '🟢 已進入強力買進區';
        sigBadge.className = 'px-2.5 py-0.5 rounded text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40';
      } else if (s.price <= dynZones.holdMin) {
        sigBadge.textContent = '🟡 緊鄰買進區 / 分批承接';
        sigBadge.className = 'px-2.5 py-0.5 rounded text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40';
      } else if (s.price >= dynZones.sellMin) {
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

    const compVal = document.getElementById(`comp-${code}-val`);
    if (compVal) {
      compVal.innerHTML = `現價 <strong class="text-white">${s.price}元</strong> | PE ${peTxt} | PB ${pbTxt} | 殖利率 ${yldTxt}`;
    }

    const pfCur = document.getElementById(`pf-${code}-cur`);
    if (pfCur) pfCur.textContent = `現價 ${s.price}`;
  });

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

  if (redrawOverviewChart && data.history) {
    if (data.history['1Y'] && data.history['1Y'].labels) globalHistoricalData['1Y'] = data.history['1Y'];
    if (data.history['2Y'] && data.history['2Y'].labels) globalHistoricalData['2Y'] = data.history['2Y'];
    renderOverviewCombinedChart();
  }

  if (typeof window.triggerPortfolioUpdate === 'function') window.triggerPortfolioUpdate();

  window.latestPayloadCache = data;
  renderOverviewMomentumReason(data);
  renderTechnicalsPanel(data, redrawTechCharts);

  const simBase2603 = document.getElementById('sim-2603-baseprice');
  const simBase2609 = document.getElementById('sim-2609-baseprice');
  const simBase2615 = document.getElementById('sim-2615-baseprice');
  if (simBase2603) simBase2603.textContent = `${liveMarketData.price2603}元`;
  if (simBase2609) simBase2609.textContent = `${liveMarketData.price2609}元`;
  if (simBase2615) simBase2615.textContent = `${liveMarketData.price2615}元`;

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
        changeElem.className = `${colorClass} font-mono text-[10px] font-bold flex items-center shrink-0`;
        changeElem.innerHTML = `<i class="fa-solid ${icon} mr-0.5 text-[9px]"></i>${sign}${b.change_percent}%`;
      }
      if (rangeElem && b.high && b.low) {
        rangeElem.textContent = `高/低: ${b.high.toLocaleString()} / ${b.low.toLocaleString()}`;
      }
      if (volElem) {
        const lots = b.volume_lots || (b.volume ? Math.round(b.volume / 1000) : null);
        if (lots !== null && lots !== undefined) {
          if (lots >= 10000) {
            volElem.textContent = `量: ${(lots / 10000).toFixed(1)}萬張`;
          } else {
            volElem.textContent = `量: ${Math.round(lots).toLocaleString()}張`;
          }
        }
      }
    };
    updateBenchmarkTicker('2330');
    updateBenchmarkTicker('0050');
    updateIndexTicker('elec', 'ticker-idx-elec', 'ticker-idx-elec-change', 'ticker-idx-elec-range', 'ticker-idx-elec-vol');
    updateIndexTicker('fin', 'ticker-idx-fin', 'ticker-idx-fin-change', 'ticker-idx-fin-range', 'ticker-idx-fin-vol');
  }

  if (redrawNews && data.live_news && Array.isArray(data.live_news) && data.live_news.length > 0) {
    const existingTitles = new Set(newsDatabase.map(n => n.title));
    const freshNews = data.live_news.filter(n => !existingTitles.has(n.title));
    masterNewsList = [...freshNews, ...newsDatabase];
    const activeBtn = document.querySelector('.news-filter-btn.active');
    const activeFilter = activeBtn ? activeBtn.getAttribute('data-filter') : 'all';
    const searchInput = document.getElementById('news-search-input');
    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
    applyNewsFilter(activeFilter, query);
  }

  if (typeof window.triggerCalculatorUpdate === 'function') window.triggerCalculatorUpdate();
  if (typeof window.calculatePortfolioMetrics === 'function') window.calculatePortfolioMetrics();
}

function renderOverviewMomentumReason(data) {
  const card = document.getElementById('overview-momentum-reason-card');
  if (!card || !data || !data.stocks) return;

  const codes = ['2603', '2609', '2615'];
  const names = { '2603': '長榮', '2609': '陽明', '2615': '萬海' };
  const items = codes.map(c => ({ code: c, name: names[c], s: data.stocks[c], inst: data.institutional?.[c] })).filter(x => x.s && x.s.status === 'success');
  if (items.length === 0) return;

  const pcts = items.map(x => Number(x.s.change_percent || 0));
  const avgPct = pcts.reduce((a, b) => a + b, 0) / pcts.length;
  const upCount = pcts.filter(p => p > 0).length;
  const downCount = pcts.filter(p => p < 0).length;

  const sortedByAbs = [...items].sort((a, b) => Number(b.s.change_percent || 0) - Number(a.s.change_percent || 0));
  const leader = sortedByAbs[0];
  const laggard = sortedByAbs[sortedByAbs.length - 1];

  const titleEl = document.getElementById('momentum-reason-title');
  const badgeEl = document.getElementById('momentum-verdict-badge');
  const pillsEl = document.getElementById('momentum-stock-pills');
  const summaryEl = document.getElementById('momentum-summary-line');
  const marketBox = document.getElementById('reason-market-box');
  const chipBox = document.getElementById('reason-chip-tech-box');
  const macroBox = document.getElementById('reason-macro-box');
  const newsBox = document.getElementById('reason-news-box');

  let directionWord = '震盪整理';
  if (avgPct >= 0.4 || upCount === 3) directionWord = '同步走強上漲';
  else if (avgPct <= -0.4 || downCount === 3) directionWord = '同步承壓回檔';
  else if (upCount > 0 && downCount > 0) directionWord = '三雄走勢分歧';

  if (titleEl) {
    if (avgPct > 0.15) titleEl.textContent = `為何現在漲？貨櫃三雄盤中${directionWord}解析`;
    else if (avgPct < -0.15) titleEl.textContent = `為何現在跌？貨櫃三雄盤中${directionWord}解析`;
    else titleEl.textContent = '為何現在盤整？貨櫃三雄即時漲跌原因解析';
  }

  if (badgeEl) {
    const sign = avgPct >= 0 ? '+' : '';
    if (avgPct > 0.15) {
      badgeEl.textContent = `📈 族群偏多 (${sign}${avgPct.toFixed(2)}%)`;
      badgeEl.className = 'px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30';
    } else if (avgPct < -0.15) {
      badgeEl.textContent = `📉 族群偏弱 (${sign}${avgPct.toFixed(2)}%)`;
      badgeEl.className = 'px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
    } else {
      badgeEl.textContent = `⚖️ 狹幅整理 (${sign}${avgPct.toFixed(2)}%)`;
      badgeEl.className = 'px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30';
    }
  }

  if (pillsEl) {
    pillsEl.innerHTML = items.map(({ code, name, s }) => {
      const pct = Number(s.change_percent || 0);
      const isUp = pct >= 0;
      const sign = isUp ? '+' : '';
      const cls = isUp ? 'bg-rose-500/15 text-rose-300 border-rose-500/30' : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
      return `<span class="px-2 py-0.5 rounded border ${cls}">${name}(${code}) ${sign}${pct}%</span>`;
    }).join('');
  }

  // Gather institutional & technical signals
  const totalInstLots = items.reduce((sum, x) => sum + Math.round(x.inst?.total_lots || 0), 0);
  const totalForeignLots = items.reduce((sum, x) => sum + Math.round(x.inst?.foreign_lots || 0), 0);
  const belowMa20Count = items.filter(x => x.s.technicals?.bias_20 !== undefined && x.s.technicals.bias_20 < 0).length;
  const aboveMa20Count = items.filter(x => x.s.technicals?.bias_20 !== undefined && x.s.technicals.bias_20 >= 0).length;
  const avgRsi = items.reduce((sum, x) => sum + Number(x.s.technicals?.rsi14 || 50), 0) / items.length;

  const twIdx = data.global_indices?.tw;
  const usIdx = data.global_indices?.us;
  const twPct = twIdx && twIdx.status === 'success' ? Number(twIdx.change_percent || 0) : null;
  const usPct = usIdx && usIdx.status === 'success' ? Number(usIdx.change_percent || 0) : null;
  const brent = data.commodities?.brent;
  const brentPrice = brent?.price ? Number(brent.price) : null;
  const brentPct = brent?.change_percent !== undefined ? Number(brent.change_percent) : null;

  // Build concise plain-language root-cause summary
  const reasons = [];
  if (avgPct < -0.15) {
    if (totalInstLots < -500) reasons.push(`三大法人近期合計調節賣超 ${Math.abs(totalInstLots).toLocaleString()} 張（外資 ${totalForeignLots.toLocaleString()} 張）形成上檔賣壓`);
    if (belowMa20Count >= 2) reasons.push(`${belowMa20Count} 檔股價位處 20 日月線下方反壓區`);
    if (twPct !== null && twPct > 0.2) reasons.push(`資金輪動轉往權值電子，使大盤漲 ${twPct}% 時航運呈現逆勢整理`);
    else if (twPct !== null && twPct < -0.2) reasons.push(`台股大盤同步走弱 (${twPct}%) 拖累市場風險偏好`);
    if (brentPct !== null && brentPct < -0.5) reasons.push(`布蘭特油價回檔 (${brentPct}%) 削弱高低硫油價差保護傘題材`);
    if (reasons.length === 0) reasons.push('短線漲多後逢高獲利了結，成交量縮並回測均線支撐');
  } else if (avgPct > 0.15) {
    if (totalInstLots > 500) reasons.push(`三大法人合計買超 +${totalInstLots.toLocaleString()} 張提供低接買盤動能`);
    if (aboveMa20Count >= 2) reasons.push(`${aboveMa20Count} 檔站回 20 日月線之上帶動技術面轉強`);
    if (avgRsi <= 45) reasons.push(`RSI 跌深修正後湧現低估值反彈買盤（平均 RSI ${avgRsi.toFixed(1)}）`);
    if (brentPct !== null && brentPct > 0.5) reasons.push(`國際油價走揚 (+${brentPct}%) 放大脫硫塔航商單箱成本優勢`);
    if (twPct !== null && twPct > 0.3) reasons.push(`台股大盤偏多 (+${twPct}%) 帶動權值與傳產低基期補漲`);
    if (reasons.length === 0) reasons.push('紅海繞道支撐 SCFI 運價結構，市場逢低回補高殖利率與低 PB 航運股');
  } else {
    reasons.push(`${leader.name} (${Number(leader.s.change_percent) >= 0 ? '+' : ''}${leader.s.change_percent}%) 與 ${laggard.name} (${Number(laggard.s.change_percent) >= 0 ? '+' : ''}${laggard.s.change_percent}%) 強弱互見`);
    if (totalInstLots < 0) reasons.push(`法人籌碼略偏調節 (${totalInstLots.toLocaleString()} 張)，市場觀望週五 SCFI 運價報價方向`);
    else reasons.push('多空於月線附近拉鋸，市場靜待最新 SCFI 運價與外資動向表態');
  }

  if (summaryEl) {
    const leadTag = avgPct >= 0 ? '🔥 本波上漲主因：' : '⚠️ 本波下跌主因：';
    summaryEl.innerHTML = `<strong class="text-white">${leadTag}</strong>${reasons.join('；')}。`;
  }

  if (marketBox) {
    const twTxt = twPct !== null ? `台股大盤 ${twPct >= 0 ? '+' : ''}${twPct}%` : '台股大盤同步觀察';
    const usTxt = usPct !== null ? `美股 S&P500 ${usPct >= 0 ? '+' : ''}${usPct}%` : '';
    let relation = '個股區間震盪';
    if (twPct !== null && avgPct < -0.15 && twPct > 0.2) relation = '資金偏向電子權值，航運呈現「大盤漲、航運休」翹翹板效應';
    else if (twPct !== null && avgPct > 0.15 && twPct < -0.2) relation = '具高殖利率與防禦題材，「大盤跌、航運逆勢抗跌」';
    else if (twPct !== null && Math.sign(avgPct) === Math.sign(twPct)) relation = '與台股大盤風險情緒同向連動';
    marketBox.textContent = `${twTxt}${usTxt ? '、' + usTxt : ''}。目前三雄以 ${leader.name}(${Number(leader.s.change_percent) >= 0 ? '+' : ''}${leader.s.change_percent}%) 最強、${laggard.name}(${Number(laggard.s.change_percent) >= 0 ? '+' : ''}${laggard.s.change_percent}%) 最弱，呈現「${relation}」。`;
  }

  if (chipBox) {
    const instDir = totalInstLots >= 0 ? `買超 +${totalInstLots.toLocaleString()} 張` : `賣超 ${totalInstLots.toLocaleString()} 張`;
    const fDir = totalForeignLots >= 0 ? `外資 +${totalForeignLots.toLocaleString()} 張` : `外資 ${totalForeignLots.toLocaleString()} 張`;
    const techState = belowMa20Count >= 2 ? `多數受壓於 20MA 月線下（平均 RSI ${avgRsi.toFixed(1)}），短線須量能放大突破才易轉強` : `站穩月線支撐（平均 RSI ${avgRsi.toFixed(1)}），均線結構偏穩`;
    chipBox.textContent = `最新三大法人合計對三雄${instDir}（其中${fDir}）；技術面上目前${techState}。`;
  }

  if (macroBox) {
    const brentTxt = brentPrice ? `布蘭特原油 $${brentPrice.toFixed(2)} (${brentPct >= 0 ? '+' : ''}${brentPct}%)` : '布蘭特油價維持高檔區間';
    const fxRate = liveMarketData.usdTwd ? `USD/TWD ${Number(liveMarketData.usdTwd).toFixed(2)}` : '台幣匯率維持弱勢區間';
    const oilEffect = (brentPct !== null && brentPct < -0.5) ? '油價回落壓抑燃料附加費與低硫油價差想像' : '紅海繞道好望角持續吸收全球約 10~12% 運力，提供運價與獲利下檔支撐';
    macroBox.textContent = `${brentTxt}、${fxRate}；${oilEffect}，長榮脫硫塔與陽明低 PB 成為資金主要衡量依據。`;
  }

  if (newsBox) {
    const newsList = Array.isArray(data.live_news) ? data.live_news : [];
    const preferredSent = avgPct < -0.15 ? 'bear' : (avgPct > 0.15 ? 'bull' : null);
    const picked = [];
    if (preferredSent) {
      newsList.filter(n => n.sentiment === preferredSent).slice(0, 2).forEach(n => picked.push(n));
    }
    newsList.forEach(n => {
      if (picked.length < 2 && !picked.includes(n)) picked.push(n);
    });
    if (picked.length > 0) {
      newsBox.innerHTML = picked.map(n => {
        const tagCls = n.sentiment === 'bull' ? 'text-rose-400' : (n.sentiment === 'bear' ? 'text-emerald-400' : 'text-sky-400');
        return `<a href="${n.link || '#'}" target="_blank" rel="noopener noreferrer" class="block hover:underline leading-snug"><span class="${tagCls} font-bold mr-1">[${n.sentimentLabel || '新聞'}]</span>${n.title}</a>`;
      }).join('');
    } else {
      newsBox.textContent = '持續追蹤每週五 SCFI 報價、紅海通航動態與美東港口貨量變化。';
    }
  }

  // Live Actionable Guidance: Buy / Sell / Wait / Hold
  renderOverviewActionAdvisor(items, totalInstLots, avgPct, avgRsi);
}

function getStockActionDecision(code, s, inst) {
  const dyn = calculateDynamicZones(code, null, Number(s.price || 0));
  const rule = {
    buyMax: dyn.buyMax,
    nearBuy: dyn.holdMin,
    sellMin: dyn.sellMin,
    name: code === '2603' ? '長榮' : (code === '2609' ? '陽明' : '萬海')
  };
  const price = Number(s.price || 0);
  const pct = Number(s.change_percent || 0);
  const ma20 = s.technicals?.ma20 ? Number(s.technicals.ma20) : null;
  const rsi = s.technicals?.rsi14 ? Number(s.technicals.rsi14) : 50;
  const totLots = inst ? Math.round(inst.total_lots || 0) : 0;
  const aboveMa20 = ma20 ? price >= ma20 : false;

  if (price <= 0) {
    return { action: 'wait', label: '觀察等待', badgeCls: 'bg-blue-500/20 text-blue-300 border-blue-500/30', borderCls: 'border-slate-800', summary: '資料同步中，暫以觀望為主。', rule };
  }

  // 1. Take-profit / Sell zone
  if (price >= rule.sellMin || rsi >= 72) {
    const reasonTxt = price >= rule.sellMin
      ? `已觸及停利賣區 (≥${rule.sellMin}元)，獲利空間收斂`
      : `RSI 達 ${rsi} 進入短線過熱區，乖離過大`;
    return {
      action: 'sell',
      label: '🔴 逢高分批賣 / 停利',
      badgeCls: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
      borderCls: 'border-rose-500/40 bg-rose-950/20',
      summary: `${reasonTxt}。有持股者可先賣 1/3~1/2 鎖定獲利，空手者切忌追高，等回檔再接。`,
      rule
    };
  }

  // 2. Deep in Buy Zone
  if (price <= rule.buyMax) {
    if (pct <= -1.8 && totLots < -1500) {
      return {
        action: 'wait_dip',
        label: '🟡 等止跌・預掛低接',
        badgeCls: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
        borderCls: 'border-amber-500/40 bg-amber-950/20',
        summary: `已進入買區 (≤${rule.buyMax})，但今日急跌 ${pct}% 且法人賣超 ${totLots.toLocaleString()} 張。不急著接飛刀，先等尾盤止穩或分 3 批往下掛買。`,
        rule
      };
    }
    if (totLots >= 0 || aboveMa20 || rsi <= 42) {
      return {
        action: 'buy',
        label: '🟢 可分批買進 / 低接',
        badgeCls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
        borderCls: 'border-emerald-500/40 bg-emerald-950/20',
        summary: `位處高勝率買區 (≤${rule.buyMax})，估值具備下檔保護。空手建議分 2~3 批進場承接；已持股者可安心續抱領息。`,
        rule
      };
    }
    return {
      action: 'buy_batch',
      label: '🟡 買區內分批掛接',
      badgeCls: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      borderCls: 'border-amber-500/40 bg-amber-950/20',
      summary: `已入買區 (≤${rule.buyMax})，但法人尚在調節 (${totLots.toLocaleString()} 張)。先小量試單 2~3 成，留現金等站回月線 (${ma20 || "-"}) 再加碼。`,
      rule
    };
  }

  // 3. Near Buy Zone
  if (price <= rule.nearBuy) {
    if (aboveMa20 && totLots > 0) {
      return {
        action: 'buy_breakout',
        label: '🟢 轉強可小量承接',
        badgeCls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
        borderCls: 'border-emerald-500/40 bg-emerald-950/20',
        summary: `緊鄰買區上緣 (${rule.nearBuy}) 且站上月線、法人偏多 (+${totLots.toLocaleString()} 張)，可逢拉回支撐時分批布局。`,
        rule
      };
    }
    return {
      action: 'wait_buy',
      label: '🔵 先等回測買區再買',
      badgeCls: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
      borderCls: 'border-blue-500/30 bg-blue-950/20',
      summary: `距離理想買區 (${rule.buyMax} 元) 僅差一步，目前建議多看少動、掛好限價單等待回測，不急著追價。`,
      rule
    };
  }

  // 4. Mid / Fair-Value Range
  if (aboveMa20 && totLots > 0) {
    return {
      action: 'hold',
      label: '🔵 持股續抱・等買點',
      badgeCls: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
      borderCls: 'border-blue-500/30 bg-blue-950/20',
      summary: `介於買賣區間中段 (${rule.buyMax}~${rule.sellMin})，趨勢站穩月線 (${ma20 || "-"})。有部位續抱上看停利區，空手等回測月線再買。`,
      rule
    };
  }
  return {
    action: 'wait',
    label: '⏸️ 觀望等待・不追高',
    badgeCls: 'bg-slate-800 text-slate-300 border-slate-700',
    borderCls: 'border-slate-800',
    summary: `目前在區間中段 (${rule.buyMax}~${rule.sellMin}) 且上方有均線反壓。暫時按兵不動，等回落至 ${rule.buyMax} 元附近或帶量站上月線再出手。`,
    rule
  };
}

function renderOverviewActionAdvisor(items, totalInstLots, avgPct, avgRsi) {
  const overallBadge = document.getElementById('action-overall-badge');
  const overallSummary = document.getElementById('action-overall-summary');
  const grid = document.getElementById('action-advice-grid');
  if (!grid) return;

  let savedPortfolio = {};
  try {
    savedPortfolio = JSON.parse(localStorage.getItem('shipping_portfolio_v1') || '{}');
  } catch (e) {}

  const decisions = items.map(x => ({ ...x, dec: getStockActionDecision(x.code, x.s, x.inst) }));
  const buyReadyCount = decisions.filter(d => ['buy', 'buy_batch', 'buy_breakout'].includes(d.dec.action)).length;
  const sellReadyCount = decisions.filter(d => d.dec.action === 'sell').length;
  const waitDipCount = decisions.filter(d => d.dec.action === 'wait_dip').length;

  if (overallBadge && overallSummary) {
    if (sellReadyCount > 0) {
      overallBadge.textContent = '🔴 建議：逢高分批賣出停利';
      overallBadge.className = 'px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40';
      overallSummary.innerHTML = `<strong class="text-white">📌 當下總操盤策略（賣出 / 減碼優先）：</strong>已有 ${sellReadyCount} 檔進入過熱或目標停利區，建議分批獲利了結，切勿在週期高檔追價。`;
    } else if (buyReadyCount >= 2 && totalInstLots >= 0) {
      overallBadge.textContent = '🟢 建議：分批買進承接';
      overallBadge.className = 'px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40';
      overallSummary.innerHTML = `<strong class="text-white">📌 當下總操盤策略（分批進場買進）：</strong>多檔已落在安全買區且法人籌碼翻多 (+${totalInstLots.toLocaleString()} 張)，可啟動分批佈局（先買 3 成、留資金逢低攤平）。`;
    } else if (buyReadyCount + waitDipCount >= 2 && totalInstLots < 0) {
      overallBadge.textContent = '🟡 建議：等止跌・分批掛低買';
      overallBadge.className = 'px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40';
      overallSummary.innerHTML = `<strong class="text-white">📌 當下總操盤策略（勿單筆重壓，等止跌分批接）：</strong>價格已回落到高勝率買區，但三大法人仍賣超 (${totalInstLots.toLocaleString()} 張)。<strong class="text-amber-300">空手者先看 1~2 根止跌紅 K 再分批接，持股者套牢不用殺低</strong>（估值低檔有殖利率與淨值保護）。`;
    } else {
      overallBadge.textContent = '🔵 建議：觀望等待・設價掛單';
      overallBadge.className = 'px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40';
      overallSummary.innerHTML = `<strong class="text-white">📌 當下總操盤策略（等待明確訊號）：</strong>目前整體動能 ${avgPct >= 0 ? "+" : ""}${avgPct.toFixed(2)}%（平均 RSI ${avgRsi.toFixed(1)}），建議依照各股目標買賣區「先設限價單等待」，不隨盤中波動追漲殺跌。`;
    }
  }

  grid.innerHTML = decisions.map(({ code, name, s, dec }) => {
    const lots = parseFloat(savedPortfolio[code]?.lots || 0);
    const cost = parseFloat(savedPortfolio[code]?.cost || 0);
    let personalNote = '';
    if (lots > 0 && cost > 0) {
      const roi = (((s.price - cost) / cost) * 100).toFixed(1);
      const roiSign = Number(roi) >= 0 ? "+" : "";
      const roiCls = Number(roi) >= 0 ? "text-rose-400" : "text-emerald-400";
      personalNote = `<div class="mt-2 pt-1.5 border-t border-slate-800/70 text-[10px] text-slate-400 flex justify-between"><span>您的持股 (${lots}張 / 均價${cost})</span><strong class="${roiCls} font-mono">${roiSign}${roi}%</strong></div>`;
    }
    return `
      <div class="bg-slate-950/70 border ${dec.borderCls} rounded-lg p-3 flex flex-col justify-between">
        <div>
          <div class="flex items-center justify-between gap-2 mb-1.5">
            <div class="flex items-center gap-1.5">
              <strong class="${dec.rule.badgeColor}">${name} (${code})</strong>
              <span class="font-mono font-bold text-white">${s.price}元</span>
            </div>
            <span class="px-2 py-0.5 rounded text-[10px] font-bold border ${dec.badgeCls}">${dec.label}</span>
          </div>
          <div class="text-[10px] text-slate-400 font-mono mb-1.5">買區 ≤ ${dec.rule.buyMax}元 ｜ 賣區 ≥ ${dec.rule.sellMin}元</div>
          <p class="text-[11px] text-slate-300 leading-relaxed">${dec.summary}</p>
        </div>
        ${personalNote}
      </div>
    `;
  }).join('');
}
async function fetchCnyesRealtimeQuotes(options = {}) {
  const { redrawTechCharts = false, highlightTime = false } = options;
  try {
    const url = `https://ws.api.cnyes.com/ws/api/v1/quote/quotes/${CNYES_REALTIME_SYMBOLS}?_t=${Date.now()}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json || !Array.isArray(json.data)) throw new Error("Invalid Cnyes payload");

    const map = {};
    json.data.forEach(item => {
      if (!item || typeof item !== 'object') return;
      const sym = item['0'];
      if (!sym) return;
      map[sym] = {
        price: item['6'],
        change: item['11'],
        pct: item['56'],
        high: item['12'],
        low: item['13'],
        open: item['19'],
        prev_close: item['21'],
        volume_lots: item['200013'],
        amount_ntd: item['200067']
      };
    });

    latestCnyesMap = map;
    const merged = buildMergedPayload();
    applyMarketDataToUI(merged, { redrawTechCharts, isLiveTick: true });
    setUpdateTimestamp(formatLocalTimestamp(new Date()), highlightTime);
    setSyncBadgeState(autoSyncEnabled ? 'live' : 'paused');
    return true;
  } catch (err) {
    console.log("Realtime Cnyes quote fallback:", err);
    if (!autoSyncEnabled) setSyncBadgeState('paused');
    else setSyncBadgeState('cache', '重試連線中');
    return false;
  }
}

async function loadLiveExternalData(options = {}) {
  const { useCurrentTime = false } = options;
  const liveTask = fetchCnyesRealtimeQuotes({ redrawTechCharts: true, highlightTime: useCurrentTime });

  try {
    const res = await fetch(`latest_data.json?t=${Date.now()}`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      baseMarketPayload = data;
      captureBaseValuationSnapshot(data);

      // Explicitly load and merge live news from latest_data.json immediately
      if (data.live_news && Array.isArray(data.live_news) && data.live_news.length > 0) {
        const existingTitles = new Set(newsDatabase.map(n => n.title));
        const freshNews = data.live_news.filter(n => !existingTitles.has(n.title));
        masterNewsList = [...freshNews, ...newsDatabase];
        const activeBtn = document.querySelector('.news-filter-btn.active');
        const activeFilter = activeBtn ? activeBtn.getAttribute('data-filter') : 'all';
        const searchInput = document.getElementById('news-search-input');
        const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
        applyNewsFilter(activeFilter, query);
      }

      const merged = buildMergedPayload();
      applyMarketDataToUI(merged, {
        redrawOverviewChart: true,
        redrawTechCharts: true,
        redrawNews: true
      });
      if (!latestCnyesMap && !useCurrentTime && data.last_updated) {
        setUpdateTimestamp(data.last_updated, false);
      }
    }
  } catch (err) {
    console.log("Using cached/default market figures:", err);
  }

  await liveTask;
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
          requestAnimationFrame(() => {
            window.dispatchEvent(new Event('resize'));
            if (targetTab === 'geopolitics') {
              renderGeoSuezCapeChart();
              renderGeoBunkerSpreadChart();
            } else if (targetTab === 'overview') {
              if (overviewChartInstance) overviewChartInstance.resize();
              if (window.resize3DShip) window.resize3DShip();
            } else if (targetTab === 'comparison') {
              if (radarChartInstance) radarChartInstance.resize();
              if (routeChartInstance) routeChartInstance.resize();
            } else if (targetTab === 'industry') {
              if (subRouteChartInstance) subRouteChartInstance.resize();
              if (supplyDemandChartInstance) supplyDemandChartInstance.resize();
              setTimeout(() => {
                if (typeof render3DSurfacePlot === 'function') {
                  render3DSurfacePlot(current3DSurfaceStockKey);
                }
              }, 60);
            } else if (targetTab === 'technicals') {
              renderTechnicalsCharts();
            }
          });
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
  slateGrid: 'rgba(14, 116, 144, 0.14)',
  slateText: '#1e4e6e'
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
          backgroundColor: 'rgba(255, 255, 255, 0.96)',
          titleColor: '#0c2942',
          bodyColor: '#1e4e6e',
          borderColor: 'rgba(14, 165, 233, 0.4)',
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
          labels: { color: '#0c2942', font: { size: 11, weight: 'bold' } }
        }
      },
      scales: {
        r: {
          min: 30,
          max: 100,
          ticks: { display: false, stepSize: 20 },
          grid: { color: chartColors.slateGrid },
          angleLines: { color: chartColors.slateGrid },
          pointLabels: { color: '#1e4e6e', font: { size: 11, weight: '500' } }
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
        legend: { position: 'top', labels: { color: '#0c2942', font: { size: 11 } } },
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
        legend: { labels: { color: '#1e4e6e', font: { size: 11 } } }
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
        legend: { position: 'top', labels: { color: '#1e4e6e', font: { size: 11 } } }
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
    link: 'https://news.google.com/search?q=%E7%B4%85%E6%B5%B7%20%E8%88%AA%E9%81%8B%20%E5%A5%BD%E6%9C%9B%E8%A7%92%20%E8%88%AA%E5%95%86&hl=zh-TW&gl=TW&ceid=TW%3Azh-Hant',
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
    link: 'https://www.sse.net.cn/index/singleIndex?indexType=scfi',
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
    source: '工商時報 / 鉅亨網',
    link: 'https://news.cnyes.com/news/cat/twstock?q=%E8%90%AC%E6%B5%B7',
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
    source: '臺灣證券交易所 / 公開資訊觀測站',
    link: 'https://mops.twse.com.tw/mops/web/t100sb07_1?co_id=2603',
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
    source: 'Alphaliner / 經濟日報',
    link: 'https://news.cnyes.com/news/cat/twstock?q=%E9%99%BD%E6%98%8E',
    sentiment: 'bull',
    sentimentLabel: '聯盟利多',
    summary: '陽明、ONE 與 HMM 組成的 Premier Alliance，在亞洲-歐洲航線正式啟動與 MSC 的 5 年艙位共享合作。陽明藉此取得全球最大貨櫃航商的多條主力航線艙位，彌補赫伯羅德出走之運力缺口。',
    impact: '有效化解陽明被邊緣化之市場疑慮，歐洲線航班覆蓋率維持業界領先。'
  }
];

let masterNewsList = [...newsDatabase];
let allActiveNews = [...newsDatabase];

function initNewsCenter() {
  renderNewsCards(masterNewsList);

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
  const filtered = masterNewsList.filter(item => {
    const matchesCategory = (filter === 'all' || item.category === filter);
    const matchesSearch = query === '' || 
      item.title.toLowerCase().includes(query) || 
      (item.summary && item.summary.toLowerCase().includes(query)) || 
      (item.impact && item.impact.toLowerCase().includes(query));
    return matchesCategory && matchesSearch;
  });
  renderNewsCards(filtered);
}

// Intelligent AI Sentiment & Impact Classifier
function getAINewsAnalysis(item) {
  const text = ((item.title || '') + ' ' + (item.summary || '') + ' ' + (item.impact || '')).toLowerCase();
  
  // Bullish keywords (利多)
  const bullTerms = ['漲', '走揚', '新高', '暴衝', '滿載', '受惠', '噴發', '強勁', '利多', '大賺', '上修', '吃緊', '長約', '跳升', '回升', '擴建', '高檔', '加碼', '分紅', '超額', '飆', '支撐'];
  // Bearish keywords (利空)
  const bearTerms = ['跌', '走跌', '重挫', '復航', '下修', '暴跌', '砍單', '過剩', '衰退', '利空', '疲軟', '塞港緩解', '承壓', '驟降', '罷工結束', '降價'];
  
  let bullScore = 0;
  let bearScore = 0;
  bullTerms.forEach(t => { if (text.includes(t)) bullScore++; });
  bearTerms.forEach(t => { if (text.includes(t)) bearScore++; });
  
  // Stock mentions
  const mentionsEvergreen = text.includes('長榮') || text.includes('2603');
  const mentionsYangming = text.includes('陽明') || text.includes('2609');
  const mentionsWanhai = text.includes('萬海') || text.includes('2615');
  
  let sentimentType = 'bull'; // default
  let sentimentLabel = '🟢 偏多利多';
  let badgeClass = 'bg-rose-500/20 text-rose-400 border border-rose-500/40';
  let impactSummary = '運價與營收獲利預期獲得堅實正面支撐';
  let affectedStocks = [];

  if (mentionsEvergreen) affectedStocks.push('長榮 (2603)');
  if (mentionsYangming) affectedStocks.push('陽明 (2609)');
  if (mentionsWanhai) affectedStocks.push('萬海 (2615)');
  if (affectedStocks.length === 0) affectedStocks = ['長榮', '陽明', '萬海三雄'];

  if (bearScore > bullScore) {
    sentimentType = 'bear';
    sentimentLabel = '🔴 偏空警戒';
    badgeClass = 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40';
    impactSummary = '短期運價或需求承壓，留意回檔整理與停利警訊';
  } else if (bullScore >= 1) {
    sentimentType = 'bull';
    sentimentLabel = '🟢 偏多利多';
    badgeClass = 'bg-rose-500/20 text-rose-400 border border-rose-500/40';
    impactSummary = '歐美拉貨或繞道效應支撐，有利季報毛利率與股利發放';
  } else {
    sentimentType = 'neutral';
    sentimentLabel = '⚪ 市場觀察';
    badgeClass = 'bg-sky-500/20 text-sky-300 border border-sky-500/40';
    impactSummary = '常態產業動態追蹤，觀察後續現貨報價連動';
  }

  return {
    sentimentType,
    sentimentLabel,
    badgeClass,
    impactSummary,
    affectedStocks: affectedStocks.join('、')
  };
}

function renderNewsCards(items) {
  const container = document.getElementById('news-container');
  if (!container) return;

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
    // Generate fallback direct link if not provided
    const targetUrl = news.link || `https://news.google.com/search?q=${encodeURIComponent(news.title)}&hl=zh-TW&gl=TW&ceid=TW%3Azh-Hant`;
    const aiAnalysis = getAINewsAnalysis(news);

    return `
      <div class="bg-slate-900/90 border border-slate-800 rounded-xl p-5 hover:border-sky-500/60 transition flex flex-col justify-between group shadow-sm hover:shadow-md">
        <div>
          <!-- Header: Date, Source and AI Sentiment Badge -->
          <div class="flex items-center justify-between text-xs mb-2">
            <span class="text-slate-400 flex items-center gap-1.5 font-mono text-[11px]">
              <i class="fa-regular fa-calendar text-[11px]"></i> ${news.date || news.pubDate || '即時'}
              <span class="mx-1">•</span>
              <span class="text-sky-400 font-semibold">${news.source || '財經新聞'}</span>
            </span>
            <span class="px-2.5 py-0.5 rounded text-[11px] font-bold ${aiAnalysis.badgeClass} flex items-center gap-1">
              ${aiAnalysis.sentimentLabel}
            </span>
          </div>

          <!-- Title -->
          <h3 class="text-sm font-bold text-white group-hover:text-sky-400 transition leading-snug mb-2">
            <a href="${targetUrl}" target="_blank" rel="noopener noreferrer" class="hover:underline flex items-start justify-between gap-2" title="點擊前往該新聞網站">
              <span>${news.title}</span>
              <i class="fa-solid fa-arrow-up-right-from-square text-[11px] text-sky-400 shrink-0 mt-1"></i>
            </a>
          </h3>

          <!-- AI Impact & Key Stock Tags Strip -->
          <div class="bg-slate-950/90 p-2.5 rounded-lg border border-slate-800 my-2.5 space-y-1.5">
            <div class="flex items-center justify-between text-[11px]">
              <span class="text-slate-400 flex items-center gap-1">
                <i class="fa-solid fa-microchip text-sky-400"></i> AI 標的影響：
                <strong class="text-sky-300 font-semibold">${aiAnalysis.affectedStocks}</strong>
              </span>
              <span class="text-amber-400 font-bold">${news.impact ? '重點關注' : '大盤連動'}</span>
            </div>
            <p class="text-[11px] text-slate-300 leading-relaxed">
              <strong class="text-indigo-400">研判解讀：</strong>${news.impact || aiAnalysis.impactSummary}
            </p>
          </div>

          <!-- Summary -->
          <p class="text-xs text-slate-400 leading-relaxed mb-3">
            ${news.summary || '點擊下方連結可前往該報導網站閱讀完整新聞全文。'}
          </p>
        </div>

        <div class="space-y-2 mt-1">
          <!-- Direct Article Action Link Button -->
          <div class="flex items-center justify-end pt-1">
            <a href="${targetUrl}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-sky-600/20 text-sky-300 border border-sky-500/40 hover:bg-sky-600 hover:text-white transition">
              <span>前往新聞原始網站</span>
              <i class="fa-solid fa-arrow-up-right-from-square text-[10px]"></i>
            </a>
          </div>
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
  const syncToggleBtn = document.getElementById('live-sync-toggle');

  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      const icon = refreshBtn.querySelector('i');
      if (icon) icon.classList.add('fa-spin');
      setUpdateTimestamp(formatLocalTimestamp(new Date()), true);
      Promise.all([
        fetchCnyesRealtimeQuotes({ redrawTechCharts: true, highlightTime: true }),
        loadLiveExternalData({ useCurrentTime: true })
      ]).finally(() => {
        setTimeout(() => {
          if (icon) icon.classList.remove('fa-spin');
        }, 450);
      });
    });
  }

  if (syncToggleBtn) {
    syncToggleBtn.addEventListener('click', () => {
      autoSyncEnabled = !autoSyncEnabled;
      if (autoSyncEnabled) {
        setSyncBadgeState('live');
        fetchCnyesRealtimeQuotes({ redrawTechCharts: false, highlightTime: true });
      } else {
        setSyncBadgeState('paused');
      }
    });
  }

  if (autoSyncTimer) clearInterval(autoSyncTimer);
  autoSyncTimer = setInterval(() => {
    if (autoSyncEnabled && document.visibilityState === 'visible') {
      fetchCnyesRealtimeQuotes({ redrawTechCharts: false, highlightTime: false });
    }
  }, 15000);

  document.addEventListener('visibilitychange', () => {
    if (autoSyncEnabled && document.visibilityState === 'visible') {
      fetchCnyesRealtimeQuotes({ redrawTechCharts: false, highlightTime: false });
    }
  });
}


/* ========================================================
   6. LITERATURE REVIEW INTERACTION SYSTEM
   ======================================================== */
function initLiteratureSystem() {
  const filterBtns = document.querySelectorAll('.lit-filter-btn');
  const searchInput = document.getElementById('lit-search-input');
  const litCards = document.querySelectorAll('.lit-card');
  const copyBtns = document.querySelectorAll('.copy-citation-btn');
  const scaleBadgeEl = document.getElementById('lit-scale-badge');
  const totalCount = litCards.length;

  function updateScaleBadge(visibleCount) {
    if (!scaleBadgeEl) return;
    if (visibleCount === totalCount) {
      scaleBadgeEl.innerHTML = `已收錄 <span id="lit-total-count">${totalCount}</span> 篇文獻`;
    } else {
      scaleBadgeEl.innerHTML = `顯示 <span id="lit-total-count">${visibleCount}</span> / 共 ${totalCount} 篇`;
    }
  }

  function filterLiterature() {
    const activeBtn = document.querySelector('.lit-filter-btn.active');
    const category = activeBtn ? activeBtn.getAttribute('data-filter') : 'all';
    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
    let visibleCount = 0;

    litCards.forEach(card => {
      const cardCat = card.getAttribute('data-category');
      const text = card.textContent.toLowerCase();

      const matchCat = category === 'all' || cardCat === category;
      const matchQuery = query === '' || text.includes(query);

      if (matchCat && matchQuery) {
        card.classList.remove('hidden');
        visibleCount++;
      } else {
        card.classList.add('hidden');
      }
    });

    updateScaleBadge(visibleCount);
  }

  updateScaleBadge(totalCount);

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
  const FEE_RATE = 0.001425;
  const codes = ['2603', '2609', '2615'];
  const sellTargets = { '2603': 310, '2609': 82, '2615': 135 };
  const buyTargets = { '2603': 255, '2609': 63, '2615': 108 };

  const discountEl = document.getElementById('pf-fee-discount');
  const minFeeEl = document.getElementById('pf-min-fee');
  const taxRateEl = document.getElementById('pf-tax-rate');

  // Load saved values
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch (e) {
    saved = {};
  }

  if (discountEl && saved._settings?.feeDiscount !== undefined) discountEl.value = saved._settings.feeDiscount;
  if (minFeeEl && saved._settings?.minFee !== undefined) minFeeEl.value = saved._settings.minFee;
  if (taxRateEl && saved._settings?.taxRate !== undefined) taxRateEl.value = saved._settings.taxRate;

  codes.forEach(code => {
    const costEl = document.getElementById(`pf-${code}-cost`);
    const lotsEl = document.getElementById(`pf-${code}-lots`);
    if (costEl && saved[code]?.cost !== undefined) costEl.value = saved[code].cost;
    if (lotsEl && saved[code]?.lots !== undefined) lotsEl.value = saved[code].lots;
  });

  function calcFee(amount, discount, minFee) {
    if (amount <= 0) return 0;
    return Math.max(minFee, Math.floor(amount * FEE_RATE * discount));
  }

  function calculatePortfolio() {
    const feeDiscount = discountEl ? (parseFloat(discountEl.value) || 0.6) : 0.6;
    const minFee = minFeeEl ? (parseInt(minFeeEl.value, 10) || 20) : 20;
    const taxRate = taxRateEl ? (parseFloat(taxRateEl.value) || 0.003) : 0.003;

    let totalCost = 0;
    let totalNetValue = 0;
    let totalFeesAndTax = 0;
    const newSaved = {
      _settings: {
        feeDiscount: String(feeDiscount),
        minFee: String(minFee),
        taxRate: String(taxRate)
      }
    };

    const prices = {
      '2603': (baseMarketPayload?.stocks?.['2603']?.price) || liveMarketData.price2603 || 233,
      '2609': (baseMarketPayload?.stocks?.['2609']?.price) || liveMarketData.price2609 || 53,
      '2615': (baseMarketPayload?.stocks?.['2615']?.price) || liveMarketData.price2615 || 95
    };

    // Update real-time price displays in portfolio inputs
    ['2603', '2609', '2615'].forEach(c => {
      const curDisplay = document.getElementById(`pf-${c}-cur`);
      if (curDisplay) curDisplay.textContent = `現價 ${prices[c].toFixed(1)}`;
    });

    const estDividendsPerShare = {
      '2603': 16.0,
      '2609': 2.0,
      '2615': 3.0
    };
    let totalDividends = 0;

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
        const shares = Math.round(lots * 1000);
        const buyAmt = cost * shares;
        const buyFee = calcFee(buyAmt, feeDiscount, minFee);
        const investedWithFee = buyAmt + buyFee;

        const sellAmt = cur * shares;
        const sellFee = calcFee(sellAmt, feeDiscount, minFee);
        const sellTax = Math.floor(sellAmt * taxRate);
        const feesAndTax = buyFee + sellFee + sellTax;
        const netProceeds = sellAmt - sellFee - sellTax;
        const pnl = netProceeds - investedWithFee;
        const roi = investedWithFee > 0 ? (pnl / investedWithFee) * 100 : 0;

        const breakevenNormal = investedWithFee / (shares * (1 - FEE_RATE * feeDiscount - taxRate));
        const breakevenMinFee = (investedWithFee + minFee) / (shares * (1 - taxRate));
        const breakevenPrice = Math.max(breakevenNormal, breakevenMinFee);

        totalCost += investedWithFee;
        totalNetValue += netProceeds;
        totalFeesAndTax += feesAndTax;

        const isProfit = pnl >= 0;
        const pnlClass = isProfit ? 'text-rose-400' : 'text-emerald-400';
        const sign = isProfit ? '+' : '';
        const distSell = (((sellTargets[code] - cur) / cur) * 100).toFixed(1);
        const sellHint = cur >= sellTargets[code]
          ? '<span class="text-rose-400 font-bold">已達停利賣區!</span>'
          : (cur <= buyTargets[code] ? '<span class="text-emerald-400">處於強力買區</span>' : `距停利區 +${distSell}%`);

        const stockDiv = shares * (estDividendsPerShare[code] || 0);
        totalDividends += stockDiv;

        resEl.innerHTML = `
          <div class="flex justify-between">
            <span>淨損益(扣費稅): <strong class="${pnlClass} font-mono">${sign}${Math.round(pnl).toLocaleString()}元</strong></span>
            <span class="${pnlClass} font-mono font-bold">${sign}${roi.toFixed(2)}%</span>
          </div>
          <div class="text-[10px] text-slate-400 mt-1 flex justify-between">
            <span>預估現金股利: <strong class="text-emerald-400 font-mono">${Math.round(stockDiv).toLocaleString()}元 (${estDividendsPerShare[code]}元/股)</strong></span>
            <span>兩平價: <strong class="text-white font-mono">${breakevenPrice.toFixed(2)}元</strong></span>
          </div>
          <div class="text-[10px] text-slate-400 mt-0.5 flex justify-between">
            <span>手續費+稅: <strong class="text-amber-400 font-mono">-${feesAndTax.toLocaleString()}元</strong></span>
            <span>${sellHint}</span>
          </div>
        `;
      } else {
        resEl.innerHTML = '<span class="text-slate-500">輸入均價與張數後自動計算含費稅淨損益</span>';
      }
    });

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newSaved));
    } catch (e) {}

    const totCostEl = document.getElementById('pf-total-cost');
    const totFeesTaxEl = document.getElementById('pf-total-fees-tax');
    const totValEl = document.getElementById('pf-total-value');
    const totPnlEl = document.getElementById('pf-total-pnl');
    if (totCostEl) totCostEl.textContent = `NT$ ${Math.round(totalCost).toLocaleString()}`;
    if (totFeesTaxEl) totFeesTaxEl.textContent = totalFeesAndTax > 0 ? `-NT$ ${Math.round(totalFeesAndTax).toLocaleString()}` : 'NT$ 0';
    if (totValEl) totValEl.textContent = `NT$ ${Math.round(totalNetValue).toLocaleString()}`;
    if (totPnlEl) {
      const totalPnl = totalNetValue - totalCost;
      const totalRoi = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
      const sign = totalPnl >= 0 ? '+' : '';
      totPnlEl.textContent = `NT$ ${sign}${Math.round(totalPnl).toLocaleString()} (${sign}${totalRoi.toFixed(2)}%)`;
      totPnlEl.className = totalCost === 0
        ? 'text-slate-300 font-mono'
        : (totalPnl >= 0 ? 'text-rose-400 font-mono font-bold' : 'text-emerald-400 font-mono font-bold');
    }

    const totDivEl = document.getElementById('pf-total-dividends');
    if (totDivEl) {
      totDivEl.textContent = `NT$ ${Math.round(totalDividends).toLocaleString()}`;
    }
  }

  window.triggerPortfolioUpdate = calculatePortfolio;

  document.querySelectorAll('.pf-input').forEach(el => {
    el.addEventListener('input', calculatePortfolio);
  });
  document.querySelectorAll('.pf-setting').forEach(el => {
    el.addEventListener('change', calculatePortfolio);
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

    // Trigger 3D Camera smooth navigation and status text
    if (typeof navigate3DToChokepoint === 'function') {
      navigate3DToChokepoint(key, d.title);
    }
  }

  window.selectGeoHotspot = selectChokepoint;

  document.querySelectorAll('.geo-hotspot, .geo-hotspot-btn').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
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
        legend: { labels: { color: '#1e4e6e', font: { size: 11 } } }
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
        legend: { labels: { color: '#1e4e6e', font: { size: 11 } } }
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


/* ========================================================
   10. DIVIDEND TAX & DRIP CALCULATOR (除權息與二代健保試算)
   ======================================================== */
function initDividendCalculator() {
  const stockSel = document.getElementById('div-stock-select');
  const lotsIn = document.getElementById('div-lots-input');
  const payoutIn = document.getElementById('div-payout-input');
  if (!stockSel || !lotsIn || !payoutIn) return;

  const defaultPayouts = { '2603': 16.0, '2609': 2.0, '2615': 3.0 };

  function calcDiv() {
    const lots = Math.max(0, parseFloat(lotsIn.value) || 0);
    const payout = Math.max(0, parseFloat(payoutIn.value) || 0);
    const gross = Math.round(lots * 1000 * payout);
    // Taiwan 2nd-gen NHI (二代健保補充保費): single dividend >= 20,000 NTD incurs 2.11%
    const nhi = gross >= 20000 ? Math.round(gross * 0.0211) : 0;
    const net = gross - nhi;
    const credit = Math.round(gross * 0.085);

    const gEl = document.getElementById('div-res-gross');
    const nEl = document.getElementById('div-res-nhi');
    const netEl = document.getElementById('div-res-net');
    const cEl = document.getElementById('div-res-credit');
    const tipEl = document.getElementById('div-res-tip');

    if (gEl) gEl.textContent = `NT$ ${gross.toLocaleString()}`;
    if (nEl) {
      nEl.textContent = nhi > 0 ? `-NT$ ${nhi.toLocaleString()}` : 'NT$ 0 (未達2萬免扣)';
      nEl.className = nhi > 0 ? 'text-rose-400 font-mono' : 'text-emerald-400 font-mono';
    }
    if (netEl) netEl.textContent = `NT$ ${net.toLocaleString()}`;
    if (cEl) cEl.textContent = `+NT$ ${credit.toLocaleString()}`;

    if (tipEl && payout > 0) {
      const maxShares = Math.floor(19999 / payout);
      const maxLots = (maxShares / 1000).toFixed(2);
      tipEl.textContent = `💡 若欲避開 2.11% 二代健保補充保費，以每股配 ${payout} 元計算，單次除息須控制在 ${maxLots} 張 (${maxShares.toLocaleString()}股) 以內。`;
    }
  }

  stockSel.addEventListener('change', () => {
    const code = stockSel.value;
    if (defaultPayouts[code] !== undefined) {
      payoutIn.value = defaultPayouts[code];
    }
    calcDiv();
  });

  [lotsIn, payoutIn].forEach(el => el.addEventListener('input', calcDiv));
  calcDiv();
}

/* ========================================================
   11. TECHNICALS & INSTITUTIONAL TAB (技術與籌碼面)
   ======================================================== */
let techMaChartInstance = null;
let techInstChartInstance = null;

function renderTechnicalsPanel(data, redrawCharts = true) {
  if (!data || !data.stocks) return;
  const metaMap = {
    '2603': { name: '長榮 (2603)', color: 'text-emerald-400' },
    '2609': { name: '陽明 (2609)', color: 'text-blue-400' },
    '2615': { name: '萬海 (2615)', color: 'text-purple-400' }
  };

  ['2603', '2609', '2615'].forEach(code => {
    const card = document.getElementById(`tech-card-${code}`);
    const s = data.stocks[code];
    const inst = data.institutional && data.institutional[code];
    if (!card || !s) return;

    const t = s.technicals || {};
    const rsi = t.rsi14 ?? '-';
    const rsiBadge = rsi >= 70
      ? '<span class="text-rose-400 font-bold">過熱</span>'
      : (rsi <= 30 ? '<span class="text-emerald-400 font-bold">超賣</span>' : '<span class="text-amber-300">中性</span>');
    const b20 = t.bias_20 ?? 0;
    const b60 = t.bias_60 ?? 0;
    const totLots = inst ? Math.round(inst.total_lots) : 0;

    card.innerHTML = `
      <div class="flex justify-between items-center border-b border-slate-800 pb-2">
        <strong class="${metaMap[code].color} text-sm">${metaMap[code].name}</strong>
        <span class="font-mono font-bold text-white">NT$ ${s.price}</span>
      </div>
      <div class="grid grid-cols-2 gap-2 text-[11px]">
        <div class="bg-slate-950/70 p-2 rounded border border-slate-800">5MA週線: <strong class="text-white font-mono">${t.ma5 ?? '-'}</strong></div>
        <div class="bg-slate-950/70 p-2 rounded border border-slate-800">20MA月線: <strong class="text-white font-mono">${t.ma20 ?? '-'}</strong></div>
        <div class="bg-slate-950/70 p-2 rounded border border-slate-800">60MA季線: <strong class="text-white font-mono">${t.ma60 ?? '-'}</strong></div>
        <div class="bg-slate-950/70 p-2 rounded border border-slate-800">240MA年線: <strong class="text-white font-mono">${t.ma240 ?? '-'}</strong></div>
      </div>
      <div class="flex justify-between items-center text-[11px] pt-1">
        <span>月線乖離: <strong class="${b20 >= 0 ? 'text-rose-400' : 'text-emerald-400'} font-mono">${b20 >= 0 ? '+' : ''}${b20}%</strong></span>
        <span>季線乖離: <strong class="${b60 >= 0 ? 'text-rose-400' : 'text-emerald-400'} font-mono">${b60 >= 0 ? '+' : ''}${b60}%</strong></span>
        <span>RSI(14): <strong class="font-mono text-white">${rsi}</strong> (${rsiBadge})</span>
      </div>
      <div class="flex justify-between items-center text-[11px] border-t border-slate-800/80 pt-2">
        <span class="text-sky-300 font-semibold">${t.trend || '趨勢計算中'}</span>
        <span>三大法人: <strong class="${totLots >= 0 ? 'text-rose-400' : 'text-emerald-400'} font-mono">${totLots >= 0 ? '+' : ''}${totLots}張</strong></span>
      </div>
    `;
  });

  if (redrawCharts) renderTechnicalsCharts();
}

function renderTechnicalsCharts() {
  const data = window.latestPayloadCache;
  if (!data) return;

  // Chart 1: MA Bias Comparison
  const ctxMa = document.getElementById('techMaChart');
  if (ctxMa && data.stocks) {
    if (techMaChartInstance) techMaChartInstance.destroy();
    const s2603 = data.stocks['2603']?.technicals || {};
    const s2609 = data.stocks['2609']?.technicals || {};
    const s2615 = data.stocks['2615']?.technicals || {};

    const calcBias = (price, ma) => (price && ma) ? Number((((price - ma) / ma) * 100).toFixed(2)) : 0;
    const p3 = data.stocks['2603']?.price, p9 = data.stocks['2609']?.price, p5 = data.stocks['2615']?.price;

    techMaChartInstance = new Chart(ctxMa, {
      type: 'bar',
      data: {
        labels: ['5MA 週線乖離', '20MA 月線乖離', '60MA 季線乖離', '240MA 年線乖離'],
        datasets: [
          {
            label: '長榮 (2603)',
            data: [calcBias(p3, s2603.ma5), s2603.bias_20 || 0, s2603.bias_60 || 0, calcBias(p3, s2603.ma240)],
            backgroundColor: '#10b981',
            borderRadius: 4
          },
          {
            label: '陽明 (2609)',
            data: [calcBias(p9, s2609.ma5), s2609.bias_20 || 0, s2609.bias_60 || 0, calcBias(p9, s2609.ma240)],
            backgroundColor: '#3b82f6',
            borderRadius: 4
          },
          {
            label: '萬海 (2615)',
            data: [calcBias(p5, s2615.ma5), s2615.bias_20 || 0, s2615.bias_60 || 0, calcBias(p5, s2615.ma240)],
            backgroundColor: '#a855f7',
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#1e4e6e', font: { size: 11 } } } },
        scales: {
          x: { grid: { color: chartColors.slateGrid }, ticks: { color: chartColors.slateText, font: { size: 10 } } },
          y: { grid: { color: chartColors.slateGrid }, ticks: { color: chartColors.slateText, callback: v => `${v}%` } }
        }
      }
    });
  }

  // Chart 2: Institutional Investors Breakdown
  const ctxInst = document.getElementById('techInstChart');
  if (ctxInst && data.institutional) {
    if (techInstChartInstance) techInstChartInstance.destroy();
    const codes = ['2603', '2609', '2615', '2330'];
    const labels = ['長榮 (2603)', '陽明 (2609)', '萬海 (2615)', '台積電 (2330)'];
    const foreign = codes.map(c => Math.round(data.institutional[c]?.foreign_lots || 0));
    const trust = codes.map(c => Math.round(data.institutional[c]?.trust_lots || 0));
    const dealer = codes.map(c => Math.round(data.institutional[c]?.dealer_lots || 0));

    techInstChartInstance = new Chart(ctxInst, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          { label: '外資 (張)', data: foreign, backgroundColor: '#ef4444', borderRadius: 3 },
          { label: '投信 (張)', data: trust, backgroundColor: '#f59e0b', borderRadius: 3 },
          { label: '自營商 (張)', data: dealer, backgroundColor: '#38bdf8', borderRadius: 3 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#1e4e6e', font: { size: 11 } } } },
        scales: {
          x: { grid: { color: chartColors.slateGrid }, ticks: { color: chartColors.slateText, font: { size: 11 } } },
          y: { grid: { color: chartColors.slateGrid }, ticks: { color: chartColors.slateText, callback: v => `${v}張` } }
        }
      }
    });
  }
}

/* ========================================================
   12. MACRO FX SENSITIVITY SIMULATOR (匯率敏感度)
   ======================================================== */
function initMacroFxSimulator() {
  const slider = document.getElementById('fx-rate-slider');
  const valEl = document.getElementById('fx-rate-val');
  if (!slider || !valEl) return;

  function calcFx() {
    const rate = parseFloat(slider.value);
    valEl.textContent = `${rate.toFixed(2)} 元`;
    const deltaPct = (rate - 32.0) / 32.0; // relative to 32.0 baseline

    const eps3 = (deltaPct * 28.0).toFixed(2);
    const eps9 = (deltaPct * 18.0).toFixed(2);
    const eps5 = (deltaPct * 16.0).toFixed(2);

    const fmt = (elId, v) => {
      const el = document.getElementById(elId);
      if (!el) return;
      const num = parseFloat(v);
      el.textContent = `${num >= 0 ? '+' : ''}${num.toFixed(2)} 元 / 季`;
      el.className = num >= 0 ? 'font-mono text-rose-400' : 'font-mono text-emerald-400';
    };

    fmt('fx-2603-impact', eps3);
    fmt('fx-2609-impact', eps9);
    fmt('fx-2615-impact', eps5);
  }

  window.triggerMacroFxUpdate = calcFx;
  slider.addEventListener('input', () => {
    userAdjustedFxSlider = true;
    calcFx();
  });
  calcFx();
}

/* ========================================================
   13. PRE-TRADE CHECKLIST & LOCAL TRADING NOTES
   ======================================================== */
function initChecklistAndNotes() {
  const checks = document.querySelectorAll('.trade-check');
  const badge = document.getElementById('checklist-score-badge');
  const bar = document.getElementById('checklist-progress-bar');
  const verdict = document.getElementById('checklist-verdict-box');

  function updateChecklist() {
    const total = checks.length;
    const checked = Array.from(checks).filter(c => c.checked).length;
    const pct = total > 0 ? Math.round((checked / total) * 100) : 0;

    if (bar) bar.style.width = `${pct}%`;
    if (badge) {
      badge.textContent = `當前把握度：${pct}% (${checked}/${total} 項)`;
      if (pct >= 75) {
        badge.className = 'px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono';
      } else if (pct >= 50) {
        badge.className = 'px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono';
      } else {
        badge.className = 'px-3 py-1 rounded-full text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 font-mono';
      }
    }

    if (verdict) {
      if (pct >= 75) {
        verdict.innerHTML = '<strong class="text-emerald-400">決策建議：</strong>多項條件高度共振！具備高勝率與安全邊際，適合依計劃分批進場布局。';
      } else if (pct >= 50) {
        verdict.innerHTML = '<strong class="text-amber-400">決策建議：</strong>目前符合部分條件，適合小額試單或等待回測強力買進區再行加碼。';
      } else {
        verdict.innerHTML = '<strong class="text-rose-400">決策建議：</strong>條件尚未成熟！建議先保持現金耐心觀望，切勿盲目追高。';
      }
    }
  }

  checks.forEach(c => c.addEventListener('change', updateChecklist));
  updateChecklist();

  // Notes persistence in localStorage
  const NOTE_KEY = 'shipping_trading_notes_v1';
  const notesArea = document.getElementById('trading-notes-area');
  const statusEl = document.getElementById('notes-save-status');
  const clearBtn = document.getElementById('clear-notes-btn');

  if (notesArea) {
    try {
      const savedNote = localStorage.getItem(NOTE_KEY);
      if (savedNote !== null) notesArea.value = savedNote;
    } catch (e) {}

    notesArea.addEventListener('input', () => {
      try {
        localStorage.setItem(NOTE_KEY, notesArea.value);
        if (statusEl) {
          statusEl.textContent = '已自動儲存 ✔';
          setTimeout(() => { statusEl.textContent = '已同步本機'; }, 1500);
        }
      } catch (e) {}
    });
  }

  if (clearBtn && notesArea) {
    clearBtn.addEventListener('click', () => {
      notesArea.value = '';
      try { localStorage.removeItem(NOTE_KEY); } catch (e) {}
      if (statusEl) statusEl.textContent = '已清空筆記';
    });
  }
}


/* ========================================================
   14. RANDOM 3-COMPANY CONTAINER SHIP CURSOR (長榮/陽明/萬海)
   ======================================================== */
function initShipCursor() {
  const fleets = [
    {
      id: 'evergreen',
      name: '長榮號 (2603)',
      hull: '#00965E',
      deck: '#065F46',
      c1: '#10B981',
      c2: '#F8FAFC',
      c3: '#34D399',
      badgeClass: 'px-2 py-0.5 text-[11px] font-bold rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:scale-105 transition flex items-center gap-1'
    },
    {
      id: 'yangming',
      name: '陽明號 (2609)',
      hull: '#1D4ED8',
      deck: '#1E3A8A',
      c1: '#3B82F6',
      c2: '#F97316',
      c3: '#E2E8F0',
      badgeClass: 'px-2 py-0.5 text-[11px] font-bold rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:scale-105 transition flex items-center gap-1'
    },
    {
      id: 'wanhai',
      name: '萬海號 (2615)',
      hull: '#9333EA',
      deck: '#581C87',
      c1: '#C084FC',
      c2: '#EF4444',
      c3: '#FACC15',
      badgeClass: 'px-2 py-0.5 text-[11px] font-bold rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 hover:scale-105 transition flex items-center gap-1'
    }
  ];

  let currentIdx = Math.floor(Math.random() * fleets.length);

  function buildShipCursorUri(ship, isHover = false) {
    const strokeCol = isHover ? '#FACC15' : '#FFFFFF';
    // 32x32 unmistakable side-profile Container Ship with stacked boxes, stern bridge, funnel & waves
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <circle cx="25.5" cy="4.2" r="1.4" fill="rgba(226,232,240,0.75)"/>
      <circle cx="28" cy="2.6" r="1.1" fill="rgba(226,232,240,0.5)"/>
      <rect x="24" y="6" width="3.2" height="4.2" rx="0.5" fill="${ship.hull}" stroke="${strokeCol}" stroke-width="0.9"/>
      <rect x="21" y="9.2" width="7.8" height="8.5" rx="1" fill="#FFFFFF" stroke="#0F172A" stroke-width="0.8"/>
      <rect x="22" y="10.8" width="4.6" height="2" rx="0.4" fill="#0F172A"/>
      <rect x="6.5" y="14.2" width="4.6" height="3.3" rx="0.4" fill="${ship.c1}" stroke="#0F172A" stroke-width="0.6"/>
      <rect x="11.3" y="14.2" width="4.6" height="3.3" rx="0.4" fill="${ship.c2}" stroke="#0F172A" stroke-width="0.6"/>
      <rect x="16.1" y="14.2" width="4.4" height="3.3" rx="0.4" fill="${ship.c3}" stroke="#0F172A" stroke-width="0.6"/>
      <rect x="9" y="10.8" width="4.6" height="3.3" rx="0.4" fill="${ship.c3}" stroke="#0F172A" stroke-width="0.6"/>
      <rect x="13.8" y="10.8" width="4.6" height="3.3" rx="0.4" fill="${ship.c1}" stroke="#0F172A" stroke-width="0.6"/>
      <path d="M1.5 17.5 L30.5 17.5 L28.5 24.5 L5.5 24.5 Z" fill="${ship.hull}" stroke="${strokeCol}" stroke-width="1.3" stroke-linejoin="round"/>
      <line x1="4.4" y1="22.6" x2="29" y2="22.6" stroke="#EF4444" stroke-width="1.3"/>
      <path d="M2 26.8 Q6 24.8 10 26.8 T18 26.8 T26 26.8 T31 26.2" fill="none" stroke="#38BDF8" stroke-width="1.6" stroke-linecap="round"/>
    </svg>`;
    return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}") 2 17, auto`;
  }

  function applyShipCursor(idx) {
    const ship = fleets[idx];
    const normalCursor = buildShipCursorUri(ship, false);
    const pointerCursor = buildShipCursorUri(ship, true);

    let styleTag = document.getElementById('ship-cursor-style');
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = 'ship-cursor-style';
      document.head.appendChild(styleTag);
    }

    styleTag.textContent = `
      html, body { cursor: ${normalCursor} !important; }
      a, button, select, label, input[type="range"], input[type="checkbox"], [role="button"], .geo-hotspot {
        cursor: ${pointerCursor} !important;
      }
      input[type="text"], input[type="number"], textarea {
        cursor: text !important;
      }
    `;

    const badge = document.getElementById('ship-cursor-badge');
    if (badge) {
      badge.className = ship.badgeClass;
      badge.innerHTML = `<i class="fa-solid fa-ship"></i> 鼠標：${ship.name}`;
    }
  }

  applyShipCursor(currentIdx);

  const badge = document.getElementById('ship-cursor-badge');
  if (badge) {
    badge.addEventListener('click', () => {
      currentIdx = (currentIdx + 1) % fleets.length;
      applyShipCursor(currentIdx);
    });
  }
}


/* ========================================================
   13. THREE.JS 3D DIGITAL TWIN CONTAINER SHIP SHOWCASE
   ======================================================== */
let ship3DScene, ship3DCamera, ship3DRenderer, ship3DControls;
let shipGroup, oceanMesh, shipAnimationId;
let shipAutoRotate = true;

const SHIP_MODELS_DATA = {
  '2603': {
    name: '長榮 長範輪 (EVER ACE)',
    company: '長榮海運 (遠洋跨洋霸主)',
    legendTitle: '長榮全球遠洋幹線貨物結構 (TEU)',
    type: '24,000 TEU A級超大型貨櫃旗艦輪 (ULCV)',
    load: '96.8%',
    loadSub: '(歐美長約鎖定，高裝載率)',
    scrubber: '配備開放式脫硫塔洗滌器 (Scrubber) + 甲醇雙燃料預留 (高低硫油價差擴大受惠最多)',
    colorHull: 0x047857,   // Evergreen Vibrant Emerald
    colorDeck: 0x1f2937,
    colorBridge: 0xf8fafc,
    cargoPalette: [
      { name: '高科技/半導體', color: 0x22d3ee, badgeBg: 'bg-cyan-400', textColor: 'text-cyan-300', ratio: 30, icon: '🔵' },
      { name: '民生消費/電商', color: 0xf43f5e, badgeBg: 'bg-rose-600', textColor: 'text-rose-300', ratio: 25, icon: '🔴' },
      { name: '機械/汽車零組件', color: 0x3b82f6, badgeBg: 'bg-blue-600', textColor: 'text-blue-300', ratio: 20, icon: '🔷' },
      { name: '生鮮冷鏈 (超低溫)', color: 0xfacc15, badgeBg: 'bg-amber-400', textColor: 'text-amber-300', ratio: 15, icon: '🟡' },
      { name: '精細化工/特化品', color: 0x27272a, badgeBg: 'bg-zinc-800 border border-zinc-500', textColor: 'text-slate-200', ratio: 6, icon: '⚫' },
      { name: '全球空櫃調度', color: 0x94a3b8, badgeBg: 'bg-slate-500', textColor: 'text-slate-400', ratio: 4, icon: '⚪' }
    ],
    scale: { x: 1.2, y: 1.1, z: 1.25 },
    stackRows: 6,
    stackCols: 14,
    stackHeight: 4
  },
  '2609': {
    name: '陽明 碩明輪 (YM WELLHEAD)',
    company: '陽明海運 (歐地航線主力)',
    legendTitle: '陽明歐地及地中海航線貨物結構 (TEU)',
    type: '14,000 TEU 歐洲航線旗艦主力輪',
    load: '92.4%',
    loadSub: '(歐洲線繞道好望角滿載航行)',
    scrubber: '配備高效低硫洗滌塔 + 液化天然氣(LNG)雙燃料設計',
    colorHull: 0x1d4ed8,   // Yang Ming Vibrant Marine Blue
    colorDeck: 0x1f2937,
    colorBridge: 0xf8fafc,
    cargoPalette: [
      { name: '機械重工/工業設備', color: 0x3b82f6, badgeBg: 'bg-blue-600', textColor: 'text-blue-300', ratio: 30, icon: '🔷' },
      { name: '歐洲成衣/精品零售', color: 0xf43f5e, badgeBg: 'bg-rose-600', textColor: 'text-rose-300', ratio: 25, icon: '🔴' },
      { name: '綠能組件/車用電子', color: 0x22d3ee, badgeBg: 'bg-cyan-400', textColor: 'text-cyan-300', ratio: 20, icon: '🔵' },
      { name: '特用化學/石化原料', color: 0x27272a, badgeBg: 'bg-zinc-800 border border-zinc-500', textColor: 'text-slate-200', ratio: 12, icon: '⚫' },
      { name: '精緻食品/酒類冷鏈', color: 0xfacc15, badgeBg: 'bg-amber-400', textColor: 'text-amber-300', ratio: 8, icon: '🟡' },
      { name: '歐亞空箱迴流', color: 0x94a3b8, badgeBg: 'bg-slate-500', textColor: 'text-slate-400', ratio: 5, icon: '⚪' }
    ],
    scale: { x: 1.0, y: 1.0, z: 1.0 },
    stackRows: 5,
    stackCols: 11,
    stackHeight: 3
  },
  '2615': {
    name: '萬海 亮春輪 (WAN HAI 305)',
    company: '萬海航運 (近洋亞洲霸主 & 美西快航)',
    legendTitle: '萬海亞洲近洋及美西快線貨物結構 (TEU)',
    type: '3,055 TEU 亞洲近洋與美西快航主力輪',
    load: '88.5%',
    loadSub: '(亞洲區間高頻航線週轉)',
    scrubber: '新世代全節能低碳主機 + AMP岸電系統 (近洋碼頭週轉率冠三雄)',
    colorHull: 0x7e22ce,   // Wan Hai Vibrant Purple
    colorDeck: 0x1f2937,
    colorBridge: 0xf8fafc,
    cargoPalette: [
      { name: '東南亞農產/熱帶冷鏈', color: 0xfacc15, badgeBg: 'bg-amber-400', textColor: 'text-amber-300', ratio: 35, icon: '🟡' },
      { name: '組裝代工/電子零組件', color: 0x22d3ee, badgeBg: 'bg-cyan-400', textColor: 'text-cyan-300', ratio: 25, icon: '🔵' },
      { name: '紡織原料/成衣半成品', color: 0xf43f5e, badgeBg: 'bg-rose-600', textColor: 'text-rose-300', ratio: 18, icon: '🔴' },
      { name: '塑膠/化學原物料', color: 0x27272a, badgeBg: 'bg-zinc-800 border border-zinc-500', textColor: 'text-slate-200', ratio: 12, icon: '⚫' },
      { name: '小型汽機車/五金件', color: 0x3b82f6, badgeBg: 'bg-blue-600', textColor: 'text-blue-300', ratio: 6, icon: '🔷' },
      { name: '高頻空櫃調度週轉', color: 0x94a3b8, badgeBg: 'bg-slate-500', textColor: 'text-slate-400', ratio: 4, icon: '⚪' }
    ],
    scale: { x: 0.85, y: 0.9, z: 0.75 },
    stackRows: 4,
    stackCols: 7,
    stackHeight: 3
  }
};

let current3DShipKey = '2603';

function init3DDigitalTwinShip() {
  const container = document.getElementById('ship3dContainer');
  if (!container || typeof THREE === 'undefined') return;

  const width = container.clientWidth || 800;
  const height = container.clientHeight || 360;

  // Scene
  ship3DScene = new THREE.Scene();
  // Bright oceanic daylight sky
  ship3DScene.background = new THREE.Color(0x0f2b48);
  ship3DScene.fog = new THREE.FogExp2(0x0f2b48, 0.007);

  // Camera
  ship3DCamera = new THREE.PerspectiveCamera(42, width / height, 0.1, 1000);
  ship3DCamera.position.set(45, 26, 52);

  // Renderer
  ship3DRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  ship3DRenderer.setSize(width, height);
  ship3DRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  ship3DRenderer.shadowMap.enabled = true;
  ship3DRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.innerHTML = '';
  container.appendChild(ship3DRenderer.domElement);

  // OrbitControls
  if (typeof THREE.OrbitControls !== 'undefined') {
    ship3DControls = new THREE.OrbitControls(ship3DCamera, ship3DRenderer.domElement);
    ship3DControls.enableDamping = true;
    ship3DControls.dampingFactor = 0.05;
    ship3DControls.maxDistance = 140;
    ship3DControls.minDistance = 15;
    ship3DControls.maxPolarAngle = Math.PI / 2 - 0.02; // Don't go below water
    ship3DControls.target.set(0, 4, 0);
  }

  // Lights - Crisp High-Key Daylight & Multi-Angle Studio Illuminations
  const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
  ship3DScene.add(ambientLight);

  const sunLight = new THREE.DirectionalLight(0xffffff, 2.0);
  sunLight.position.set(60, 90, 50);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 2048;
  sunLight.shadow.mapSize.height = 2048;
  ship3DScene.add(sunLight);

  const fillLight = new THREE.DirectionalLight(0x7dd3fc, 1.0);
  fillLight.position.set(-50, 40, -40);
  ship3DScene.add(fillLight);

  const topRimLight = new THREE.DirectionalLight(0xffffff, 0.8);
  topRimLight.position.set(0, 80, -20);
  ship3DScene.add(topRimLight);

  // Stylized Ocean Plane
  const oceanGeo = new THREE.PlaneGeometry(350, 350, 48, 48);
  const oceanMat = new THREE.MeshStandardMaterial({
    color: 0x0284c7,
    roughness: 0.12,
    metalness: 0.35,
    wireframe: false
  });
  oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
  oceanMesh.rotation.x = -Math.PI / 2;
  oceanMesh.position.y = -0.5;
  oceanMesh.receiveShadow = true;
  ship3DScene.add(oceanMesh);

  // Sea Grid Line visual
  const gridHelper = new THREE.GridHelper(260, 26, 0x38bdf8, 0x0284c7);
  gridHelper.position.y = -0.4;
  ship3DScene.add(gridHelper);

  // Build Ship
  build3DShip(current3DShipKey);

  // Resize handler
  window.resize3DShip = function() {
    if (!container || !ship3DRenderer || !ship3DCamera) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w > 0 && h > 0) {
      ship3DCamera.aspect = w / h;
      ship3DCamera.updateProjectionMatrix();
      ship3DRenderer.setSize(w, h);
    }
  };
  window.addEventListener('resize', window.resize3DShip);

  // Animation Loop
  let clock = new THREE.Clock();
  function animate() {
    shipAnimationId = requestAnimationFrame(animate);
    const time = clock.getElapsedTime();

    // Gentle wave movement on ship
    if (shipGroup) {
      shipGroup.position.y = Math.sin(time * 1.5) * 0.45;
      shipGroup.rotation.z = Math.sin(time * 1.2) * 0.018; // Roll
      shipGroup.rotation.x = Math.cos(time * 0.9) * 0.012; // Pitch

      if (shipAutoRotate && ship3DControls) {
        ship3DControls.autoRotate = true;
        ship3DControls.autoRotateSpeed = 0.8;
      } else if (ship3DControls) {
        ship3DControls.autoRotate = false;
      }
    }

    if (ship3DControls) ship3DControls.update();
    ship3DRenderer.render(ship3DScene, ship3DCamera);
  }
  animate();
}

function build3DShip(shipKey) {
  if (shipGroup) ship3DScene.remove(shipGroup);

  const cfg = SHIP_MODELS_DATA[shipKey] || SHIP_MODELS_DATA['2603'];
  shipGroup = new THREE.Group();

  const hullMat = new THREE.MeshStandardMaterial({
    color: cfg.colorHull,
    roughness: 0.2,
    metalness: 0.15
  });
  const redBottomMat = new THREE.MeshStandardMaterial({
    color: 0xef4444, // Bright Anti-fouling red bottom
    roughness: 0.5
  });
  const deckMat = new THREE.MeshStandardMaterial({
    color: cfg.colorDeck,
    roughness: 0.7
  });
  const bridgeMat = new THREE.MeshStandardMaterial({
    color: cfg.colorBridge,
    roughness: 0.2
  });

  // 1. Lower Hull (Red anti-fouling keel)
  const keelGeo = new THREE.BoxGeometry(10 * cfg.scale.x, 2, 42 * cfg.scale.z);
  const keel = new THREE.Mesh(keelGeo, redBottomMat);
  keel.position.y = 0.5;
  keel.castShadow = true;
  keel.receiveShadow = true;
  shipGroup.add(keel);

  // 2. Main Hull (Container Ship Body)
  const hullGeo = new THREE.BoxGeometry(10.5 * cfg.scale.x, 4.2 * cfg.scale.y, 44 * cfg.scale.z);
  const hull = new THREE.Mesh(hullGeo, hullMat);
  hull.position.y = 3.2;
  hull.castShadow = true;
  hull.receiveShadow = true;
  shipGroup.add(hull);

  // 3. Bulbous Bow & Bow Flare (Ship Nose)
  const bowGeo = new THREE.ConeGeometry(5.2 * cfg.scale.x, 8 * cfg.scale.z, 4);
  const bow = new THREE.Mesh(bowGeo, hullMat);
  bow.rotation.x = Math.PI / 2;
  bow.rotation.y = Math.PI / 4;
  bow.position.set(0, 3.2, 24 * cfg.scale.z);
  bow.castShadow = true;
  shipGroup.add(bow);

  // 4. Stern (Ship Rear)
  const sternGeo = new THREE.BoxGeometry(9 * cfg.scale.x, 4.2 * cfg.scale.y, 4 * cfg.scale.z);
  const stern = new THREE.Mesh(sternGeo, hullMat);
  stern.position.set(0, 3.2, -23 * cfg.scale.z);
  shipGroup.add(stern);

  // 5. Deck Cover
  const deckGeo = new THREE.BoxGeometry(9.8 * cfg.scale.x, 0.4, 42 * cfg.scale.z);
  const deck = new THREE.Mesh(deckGeo, deckMat);
  deck.position.y = 5.4;
  shipGroup.add(deck);

  // 6. Navigation Bridge Tower (Castle)
  const bridgeGeo = new THREE.BoxGeometry(8 * cfg.scale.x, 6, 4.5);
  const bridge = new THREE.Mesh(bridgeGeo, bridgeMat);
  bridge.position.set(0, 8.4, -9 * cfg.scale.z);
  bridge.castShadow = true;
  shipGroup.add(bridge);

  // Navigation Wing Bridges
  const wingGeo = new THREE.BoxGeometry(12 * cfg.scale.x, 0.8, 2);
  const wing = new THREE.Mesh(wingGeo, bridgeMat);
  wing.position.set(0, 10.6, -9 * cfg.scale.z);
  shipGroup.add(wing);

  // Radar Mast
  const mastGeo = new THREE.CylinderGeometry(0.15, 0.25, 4, 8);
  const mastMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
  const mast = new THREE.Mesh(mastGeo, mastMat);
  mast.position.set(0, 13.4, -9 * cfg.scale.z);
  shipGroup.add(mast);

  // 7. Chimney Funnel & Scrubber Tower
  const funnelGeo = new THREE.BoxGeometry(3 * cfg.scale.x, 5.5, 3.5);
  const funnelMat = new THREE.MeshStandardMaterial({ color: cfg.colorHull });
  const funnel = new THREE.Mesh(funnelGeo, funnelMat);
  funnel.position.set(0, 8.8, -17 * cfg.scale.z);
  shipGroup.add(funnel);

  // Scrubber wash pipe on funnel
  const scrubberPipeGeo = new THREE.CylinderGeometry(0.5, 0.5, 6, 12);
  const scrubberPipeMat = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.6 });
  const scrubberPipe = new THREE.Mesh(scrubberPipeGeo, scrubberPipeMat);
  scrubberPipe.position.set(1.2 * cfg.scale.x, 9.2, -17 * cfg.scale.z);
  shipGroup.add(scrubberPipe);

  // 8. Loaded TEU Container Stacks with Company-Specific Cargo Category Proportions
  const palette = cfg.cargoPalette || [
    { name: '科技/晶片', color: 0x22d3ee, ratio: 25 },
    { name: '食物/冷鏈', color: 0xfacc15, ratio: 20 },
    { name: '汽車/機械', color: 0x3b82f6, ratio: 20 },
    { name: '民生/成衣', color: 0xf43f5e, ratio: 15 },
    { name: '石油/化工', color: 0x27272a, ratio: 15 },
    { name: '空櫃調度', color: 0x94a3b8, ratio: 5 }
  ];

  // Update Top-Left Cargo Legend in HUD
  const legendTitleEl = document.getElementById('cargo-legend-title');
  const legendGridEl = document.getElementById('cargo-legend-grid');
  if (legendTitleEl && cfg.legendTitle) {
    legendTitleEl.textContent = cfg.legendTitle;
  }
  if (legendGridEl) {
    legendGridEl.innerHTML = palette.map(item => `
      <div class="flex items-center gap-1.5 py-0.5 text-slate-800 font-semibold">
        <span class="w-3 h-3 rounded-sm shrink-0 ${item.badgeBg || 'bg-cyan-500'} shadow border border-slate-300/80"></span>
        <span class="text-[11px] text-slate-800 font-bold whitespace-nowrap">${item.icon || '📦'} ${item.name}</span>
        <span class="text-[11px] font-black text-blue-700 ml-auto pl-1 font-mono">${item.ratio}%</span>
      </div>
    `).join('');
  }

  // Build weighted pool for sampling individual 3D container mesh colors
  const cargoColorPool = [];
  palette.forEach(item => {
    for (let i = 0; i < item.ratio; i++) cargoColorPool.push(item.color);
  });

  const getProportionalCargoColor = () => {
    return cargoColorPool[Math.floor(Math.random() * cargoColorPool.length)];
  };

  const boxLength = 2.4;
  const boxWidth = 1.1;
  const boxHeight = 1.1;
  const boxGeo = new THREE.BoxGeometry(boxWidth, boxHeight, boxLength);

  const startZ = -4 * cfg.scale.z;
  const endZ = 19 * cfg.scale.z;
  const zStep = 2.8;

  for (let z = startZ; z < endZ; z += zStep) {
    for (let row = -cfg.stackRows / 2; row < cfg.stackRows / 2; row++) {
      const currentStackH = Math.floor(Math.random() * 2) + (cfg.stackHeight - 1);
      for (let h = 0; h < currentStackH; h++) {
        const cHex = getProportionalCargoColor();
        const boxMat = new THREE.MeshStandardMaterial({
          color: cHex,
          roughness: 0.35,
          metalness: 0.25
        });
        const containerBox = new THREE.Mesh(boxGeo, boxMat);
        const xPos = row * (boxWidth + 0.15) + (boxWidth / 2);
        const yPos = 5.8 + h * (boxHeight + 0.05);
        containerBox.position.set(xPos, yPos, z);
        containerBox.castShadow = true;
        containerBox.receiveShadow = true;
        shipGroup.add(containerBox);
      }
    }
  }

  // Aft Container Stacks (behind bridge)
  for (let z = -20 * cfg.scale.z; z < -12 * cfg.scale.z; z += zStep) {
    for (let row = -3; row < 3; row++) {
      const cHex = getProportionalCargoColor();
      const boxMat = new THREE.MeshStandardMaterial({ color: cHex, roughness: 0.35, metalness: 0.25 });
      const containerBox = new THREE.Mesh(boxGeo, boxMat);
      containerBox.position.set(row * 1.25 + 0.6, 5.8, z);
      containerBox.castShadow = true;
      shipGroup.add(containerBox);
    }
  }

  ship3DScene.add(shipGroup);
}

function select3DShip(shipKey) {
  current3DShipKey = shipKey;
  const cfg = SHIP_MODELS_DATA[shipKey];
  if (!cfg) return;

  // Update Buttons
  ['2603', '2609', '2615'].forEach(key => {
    const btn = document.getElementById(`btn-ship-${key}`);
    if (btn) {
      if (key === shipKey) {
        btn.classList.add('active', 'bg-emerald-600', 'text-white');
        btn.classList.remove('text-slate-400');
        if (key === '2609') btn.classList.replace('bg-emerald-600', 'bg-blue-600');
        if (key === '2615') btn.classList.replace('bg-emerald-600', 'bg-purple-600');
      } else {
        btn.classList.remove('active', 'bg-emerald-600', 'bg-blue-600', 'bg-purple-600', 'text-white');
        btn.classList.add('text-slate-400');
      }
    }
  });

  // Update HUD
  const nameEl = document.getElementById('ship3d-name');
  const loadEl = document.getElementById('ship3d-load');
  const scrubberEl = document.getElementById('ship3d-scrubber');

  if (nameEl) {
    nameEl.textContent = cfg.name;
    nameEl.className = 'font-bold text-sm ' + (shipKey === '2603' ? 'text-emerald-400' : shipKey === '2609' ? 'text-blue-400' : 'text-purple-400');
  }
  if (loadEl) {
    loadEl.innerHTML = `${cfg.load} <span class="text-xs text-slate-300 font-sans">${cfg.loadSub}</span>`;
  }
  if (scrubberEl) {
    scrubberEl.textContent = cfg.scrubber;
  }

  // Rebuild
  build3DShip(shipKey);
}

function toggleShipAutoRotate() {
  shipAutoRotate = !shipAutoRotate;
  const btn = document.getElementById('btn-ship-rot');
  if (btn) {
    if (shipAutoRotate) {
      btn.classList.add('text-sky-300');
      btn.classList.remove('text-slate-400');
    } else {
      btn.classList.remove('text-sky-300');
      btn.classList.add('text-slate-400');
    }
  }
}

function resetShip3DView() {
  if (ship3DCamera && ship3DControls) {
    ship3DCamera.position.set(45, 26, 52);
    ship3DControls.target.set(0, 4, 0);
    ship3DControls.update();
  }
}


/* ========================================================
   14. THREE.JS 3D MARITIME SEA-LANES & REALISTIC WORLD SANDBOX
   ======================================================== */
let routes3DScene, routes3DCamera, routes3DRenderer, routes3DControls;
let routePlanesGroup, routeParticles = [];
let routeAutoRotate = false;
let routeCameraLerp = null; // Smooth camera fly-to animation

// 3D Global Strategic Chokepoint & Hub Nodes
const ROUTE_PORTS = {
  taiwan: { name: '台灣高雄 (長榮/陽明/萬海)', x: 75, z: -15, hub: true, color: 0x10b981 },
  shanghai: { name: '上海/寧波門戶港', x: 72, z: -28, hub: false, color: 0x38bdf8 },
  singapore: { name: '新加坡 / 馬六甲海峽', x: 48, z: 8, hub: true, color: 0x06b6d4, choke: true, status: 'warning' },
  hormuz: { name: '荷姆茲海峽 (波斯灣油輪)', x: 14, z: -10, hub: true, color: 0xf59e0b, choke: true, status: 'warning' },
  bab_mandeb: { name: '曼德海峽 / 葉門紅海口', x: -3, z: -4, hub: true, color: 0xf43f5e, choke: true, status: 'divert' },
  suez: { name: '蘇伊士運河 (Suez)', x: -14, z: -11, hub: true, color: 0xf43f5e, choke: true, status: 'divert' },
  cape: { name: '非洲好望角 (Cape of Good Hope)', x: -18, z: 68, hub: true, color: 0x10b981, choke: true, status: 'normal' },
  rotterdam: { name: '荷蘭鹿特丹港 (歐洲門戶)', x: -62, z: -48, hub: true, color: 0x38bdf8 },
  losangeles: { name: '美國洛杉磯/長灘港 (美西)', x: 142, z: -26, hub: true, color: 0xa855f7 },
  panama: { name: '巴拿馬運河 (中美洲咽喉)', x: 108, z: 22, hub: true, color: 0xf59e0b, choke: true, status: 'warning' },
  newyork: { name: '美東紐約/新澤西港 (ILA工會)', x: 125, z: -35, hub: true, color: 0xef4444 }
};

// Canvas Sprite Generator for Geographic Names & Ship Labels
function createTextSprite(text, bgColor = 'rgba(15, 23, 42, 0.85)', textColor = '#ffffff', borderColor = '#38bdf8', fontSize = 26) {
  const canvas = document.createElement('canvas');
  canvas.width = 380;
  canvas.height = 90;
  const ctx = canvas.getContext('2d');

  // Background pill box
  ctx.fillStyle = bgColor;
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(10, 10, 360, 70, 20);
  ctx.fill();
  ctx.stroke();

  // Text label
  ctx.fillStyle = textColor;
  ctx.font = `bold ${fontSize}px "Noto Sans TC", "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 190, 45);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.scale.set(16, 3.8, 1);
  return sprite;
}

// Tube Route Curve Generator
function create3DRouteTube(pointsArray, colorHex, radius = 0.8) {
  const vectors = pointsArray.map(p => new THREE.Vector3(p.x, p.y || 1.2, p.z));
  const curve = new THREE.CatmullRomCurve3(vectors);
  const tubeGeo = new THREE.TubeGeometry(curve, 72, radius, 8, false);
  const tubeMat = new THREE.MeshStandardMaterial({
    color: colorHex,
    roughness: 0.3,
    metalness: 0.2,
    emissive: colorHex,
    emissiveIntensity: 0.45,
    transparent: true,
    opacity: 0.88
  });
  const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
  return { mesh: tubeMesh, curve: curve };
}

// Camera Navigation & Smooth Fly-To
function navigate3DToChokepoint(key, chokepointName) {
  if (!routes3DCamera || !routes3DControls) return;

  const statusText = document.getElementById('map3d-status-text');
  if (statusText && chokepointName) {
    statusText.textContent = `3D 航線即時運航模式：${chokepointName}`;
  }

  let targetPos = new THREE.Vector3(0, 0, 5);
  let camPos = new THREE.Vector3(0, 150, 180);

  if (key === 'redsea') {
    // Zoomed-in Red Sea & Bab el-Mandeb (between Yemen & Djibouti/Eritrea)
    targetPos.set(-4, 2, -5);
    camPos.set(-4, 38, 30);
  } else if (key === 'cape') {
    // Zoomed-in Cape of Good Hope loop
    targetPos.set(-18, 2, 68);
    camPos.set(-18, 55, 125);
  } else if (key === 'hormuz') {
    // Zoomed-in Strait of Hormuz & Persian Gulf
    targetPos.set(14, 2, -10);
    camPos.set(14, 38, 20);
  } else if (key === 'malacca') {
    // Zoomed-in Malacca Strait & Singapore
    targetPos.set(48, 2, 8);
    camPos.set(48, 42, 45);
  } else if (key === 'panama') {
    // Zoomed-in Panama Canal & Central America
    targetPos.set(108, 2, 22);
    camPos.set(108, 45, 55);
  } else if (key === 'usila') {
    // Zoomed-in US East Coast & Transpacific US Arrival
    targetPos.set(132, 2, -26);
    camPos.set(132, 60, 20);
  }

  // Smooth lerp setup
  routeCameraLerp = {
    startCam: routes3DCamera.position.clone(),
    endCam: camPos,
    startTarget: routes3DControls.target.clone(),
    endTarget: targetPos,
    startTime: performance.now(),
    duration: 1200 // 1.2s smooth glide
  };
}

// Realistic 3D World Stage Builder (Shallow Coastal Water + Mountains & Geographic Labels)
function buildRealisticMaritimeStage(scene) {
  // 1. Realistic Multi-layer Ocean with Coastal Gradient Canvas Texture
  const oceanCanvas = document.createElement('canvas');
  oceanCanvas.width = 1024;
  oceanCanvas.height = 1024;
  const octx = oceanCanvas.getContext('2d');

  // Deep Navy Ocean base
  octx.fillStyle = '#06172e';
  octx.fillRect(0, 0, 1024, 1024);

  // Subtle ocean wave and current grid lines
  octx.strokeStyle = 'rgba(14, 165, 233, 0.08)';
  octx.lineWidth = 1;
  for (let i = 0; i < 1024; i += 32) {
    octx.beginPath();
    octx.moveTo(0, i);
    octx.lineTo(1024, i);
    octx.stroke();
    octx.beginPath();
    octx.moveTo(i, 0);
    octx.lineTo(i, 1024);
    octx.stroke();
  }

  // Coastal turquoise shelf glow around continents
  const shelfGradients = [
    { x: 380, y: 350, r: 160 }, // Red Sea & Arabian Peninsula coastal shelf
    { x: 260, y: 550, r: 180 }, // Africa coasts
    { x: 680, y: 400, r: 200 }, // East Asia & South China Sea
    { x: 880, y: 480, r: 210 }  // Americas coasts
  ];
  shelfGradients.forEach(g => {
    const rad = octx.createRadialGradient(g.x, g.y, 20, g.x, g.y, g.r);
    rad.addColorStop(0, 'rgba(14, 116, 144, 0.28)');
    rad.addColorStop(0.5, 'rgba(6, 182, 212, 0.12)');
    rad.addColorStop(1, 'rgba(6, 23, 46, 0)');
    octx.fillStyle = rad;
    octx.beginPath();
    octx.arc(g.x, g.y, g.r, 0, Math.PI * 2);
    octx.fill();
  });

  const oceanTexture = new THREE.CanvasTexture(oceanCanvas);
  const oceanGeo = new THREE.PlaneGeometry(380, 260, 64, 64);
  const oceanMat = new THREE.MeshStandardMaterial({
    map: oceanTexture,
    roughness: 0.25,
    metalness: 0.45
  });
  const oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
  oceanMesh.rotation.x = -Math.PI / 2;
  oceanMesh.position.y = -0.6;
  scene.add(oceanMesh);

  // 2. Realistic Mountainous Landmasses (Terrain with elevation, ridges & desert/vegetation textures)
  function createContinentMesh(width, depth, height, posX, posZ, colorBase, colorPeak, ridgeCount = 6) {
    const group = new THREE.Group();
    // Base land slab
    const baseGeo = new THREE.BoxGeometry(width, 1.6, depth);
    const baseMat = new THREE.MeshStandardMaterial({
      color: colorBase,
      roughness: 0.9,
      metalness: 0.1
    });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.set(0, 0.8, 0);
    group.add(baseMesh);

    // Mountain ranges & plateau ridges (providing real 3D mountain shadows and rugged terrain)
    const ridgeMat = new THREE.MeshStandardMaterial({
      color: colorPeak,
      roughness: 0.85,
      metalness: 0.1
    });
    for (let i = 0; i < ridgeCount; i++) {
      const rw = width * (0.2 + Math.random() * 0.25);
      const rd = depth * (0.15 + Math.random() * 0.25);
      const rh = height * (0.5 + Math.random() * 0.7);
      const coneGeo = new THREE.ConeGeometry(rw / 2, rh, 5);
      const cone = new THREE.Mesh(coneGeo, ridgeMat);
      cone.position.set(
        (Math.random() - 0.5) * (width * 0.65),
        1.6 + rh / 2,
        (Math.random() - 0.5) * (depth * 0.65)
      );
      cone.rotation.y = Math.random() * Math.PI;
      group.add(cone);
    }

    group.position.set(posX, 0, posZ);
    return group;
  }

  // Realistic Continents:
  // (A) Middle East & Arabian Peninsula (Desert tan + rocky mountain crags)
  const arabia = createContinentMesh(32, 28, 4.5, 8, -6, 0xc2a679, 0x8c6d46, 5);
  scene.add(arabia);

  // (B) Africa (Sahara golden sands, East African Rift mountains, South Africa greenery)
  const africa = createContinentMesh(48, 75, 5.5, -22, 25, 0x96734c, 0x6e5234, 9);
  scene.add(africa);

  // (C) Europe (Temperate green & Alps mountain ridges)
  const europe = createContinentMesh(44, 38, 4.2, -58, -60, 0x3d5a45, 0x5a7360, 6);
  scene.add(europe);

  // (D) Asia (Tibetan mountain heights, East Asia green plains)
  const asia = createContinentMesh(72, 65, 6.5, 66, -46, 0x47634f, 0x6f825e, 10);
  scene.add(asia);

  // (E) Southeast Asia & Indonesia archipelago blocks
  const seAsia1 = createContinentMesh(22, 16, 2.8, 52, 16, 0x2d5a3f, 0x1f442d, 4);
  scene.add(seAsia1);

  // (F) Americas (North America Rockies & South America Andes spine)
  const americas = createContinentMesh(46, 105, 5.8, 134, -8, 0x4a5d4e, 0x6e5842, 11);
  scene.add(americas);

  // 3. 3D Floating Geographic & Strategic Labels (山水與地名整合)
  const geoLabels = [
    { text: '🔴 曼德海峽 (Bab el-Mandeb)', x: -3, y: 7.5, z: -4, bg: 'rgba(225, 29, 72, 0.9)', border: '#f43f5e' },
    { text: '紅海 (RED SEA)', x: -7, y: 5.5, z: -16, bg: 'rgba(15, 23, 42, 0.85)', border: '#38bdf8' },
    { text: '葉門 (YEMEN)', x: 4, y: 6.5, z: -2, bg: 'rgba(180, 83, 9, 0.9)', border: '#f59e0b' },
    { text: '沙烏地 (SAUDI ARABIA)', x: 12, y: 7.5, z: -15, bg: 'rgba(120, 53, 15, 0.85)', border: '#fbbf24' },
    { text: '荷姆茲海峽 (Hormuz)', x: 18, y: 7.5, z: -8, bg: 'rgba(217, 119, 6, 0.9)', border: '#f59e0b' },
    { text: '蘇伊士運河 (Suez Canal)', x: -16, y: 6.5, z: -14, bg: 'rgba(15, 23, 42, 0.85)', border: '#38bdf8' },
    { text: '非洲好望角 (Cape of Good Hope)', x: -18, y: 8.0, z: 68, bg: 'rgba(16, 185, 129, 0.9)', border: '#10b981' },
    { text: '麻六甲海峽 (Strait of Malacca)', x: 48, y: 7.5, z: 8, bg: 'rgba(6, 182, 212, 0.9)', border: '#06b6d4' },
    { text: '台灣高雄 (貨櫃三雄樞紐)', x: 75, y: 8.0, z: -15, bg: 'rgba(5, 150, 105, 0.95)', border: '#10b981' },
    { text: '荷蘭鹿特丹 (歐洲線門戶)', x: -62, y: 7.5, z: -48, bg: 'rgba(2, 132, 199, 0.9)', border: '#38bdf8' },
    { text: '美西洛杉磯/長灘 (LA/LB)', x: 142, y: 8.0, z: -26, bg: 'rgba(147, 51, 234, 0.9)', border: '#c084fc' },
    { text: '巴拿馬運河 (Panama Canal)', x: 108, y: 7.5, z: 22, bg: 'rgba(217, 119, 6, 0.9)', border: '#f59e0b' }
  ];

  geoLabels.forEach(lbl => {
    const sprite = createTextSprite(lbl.text, lbl.bg, '#ffffff', lbl.border, 24);
    sprite.position.set(lbl.x, lbl.y, lbl.z);
    scene.add(sprite);
  });
}

// 3D Realistic Container Ship Model Generator (Hull + Containers + Deck Bridge + Directional Bow)
function buildRealisticShip3D(companyKey, name, colorHex) {
  const shipGroup = new THREE.Group();

  // 1. Sleek Hull (Pointed Bow at +Z, Stern at -Z)
  const hullGeo = new THREE.BoxGeometry(2.4, 1.4, 7.5);
  const hullMat = new THREE.MeshStandardMaterial({
    color: colorHex,
    roughness: 0.35,
    metalness: 0.3
  });
  const hullMesh = new THREE.Mesh(hullGeo, hullMat);
  hullMesh.position.y = 0.7;
  shipGroup.add(hullMesh);

  // Sharp Bow Wedge (Forward Heading Indicator)
  const bowGeo = new THREE.ConeGeometry(1.2, 2.2, 4);
  const bowMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.4 });
  const bow = new THREE.Mesh(bowGeo, bowMat);
  bow.rotation.x = Math.PI / 2;
  bow.position.set(0, 0.7, 4.3);
  shipGroup.add(bow);

  // 2. White Navigation Bridge Tower & Smokestack (Radar mast)
  const bridgeGeo = new THREE.BoxGeometry(2.1, 1.6, 1.2);
  const bridgeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });
  const bridge = new THREE.Mesh(bridgeGeo, bridgeMat);
  bridge.position.set(0, 2.0, -1.8);
  shipGroup.add(bridge);

  // Smokestack with company color accent
  const funnelGeo = new THREE.CylinderGeometry(0.3, 0.35, 1.0, 8);
  const funnelMat = new THREE.MeshStandardMaterial({ color: colorHex, emissive: colorHex, emissiveIntensity: 0.4 });
  const funnel = new THREE.Mesh(funnelGeo, funnelMat);
  funnel.position.set(0, 3.1, -1.8);
  shipGroup.add(funnel);

  // 3. Multi-colored Container Stacks on Deck
  const stackColors = [0x0284c7, 0xef4444, 0xf59e0b, 0x10b981, 0x8b5cf6];
  for (let zOffset = -0.5; zOffset <= 2.5; zOffset += 1.0) {
    const cColor = stackColors[Math.floor(Math.random() * stackColors.length)];
    const cGeo = new THREE.BoxGeometry(1.9, 1.2, 0.85);
    const cMat = new THREE.MeshStandardMaterial({ color: cColor, roughness: 0.5 });
    const cMesh = new THREE.Mesh(cGeo, cMat);
    cMesh.position.set(0, 1.9, zOffset);
    shipGroup.add(cMesh);
  }

  // 4. Directional Forward Wake / Heading Beam
  const beamGeo = new THREE.ConeGeometry(0.6, 2.5, 4);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.6 });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.rotation.x = -Math.PI / 2;
  beam.position.set(0, 0.5, 5.8);
  shipGroup.add(beam);

  // 5. Floating Identification Billboard Sprite (Ship Name & Company)
  const badgeColor = companyKey === '2603' ? 'rgba(5, 150, 105, 0.95)' :
                     companyKey === '2609' ? 'rgba(2, 132, 199, 0.95)' : 'rgba(147, 51, 234, 0.95)';
  const borderCol = companyKey === '2603' ? '#34d399' :
                    companyKey === '2609' ? '#38bdf8' : '#c084fc';
  const labelSprite = createTextSprite(name, badgeColor, '#ffffff', borderCol, 26);
  labelSprite.position.set(0, 5.8, 0);
  shipGroup.add(labelSprite);

  return shipGroup;
}

function init3DMaritimeRoutesSandbox() {
  const container = document.getElementById('routes3dContainer');
  if (!container || typeof THREE === 'undefined') return;

  const width = container.clientWidth || 800;
  const height = container.clientHeight || 450;

  // Scene
  routes3DScene = new THREE.Scene();
  routes3DScene.background = new THREE.Color(0x061426);
  routes3DScene.fog = new THREE.FogExp2(0x061426, 0.0018);

  // Camera: Elevated Bird's-Eye View
  routes3DCamera = new THREE.PerspectiveCamera(38, width / height, 1, 2500);
  routes3DCamera.position.set(0, 160, 190);

  // Renderer
  routes3DRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  routes3DRenderer.setSize(width, height);
  routes3DRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.innerHTML = '';
  container.appendChild(routes3DRenderer.domElement);

  // Controls
  if (typeof THREE.OrbitControls !== 'undefined') {
    routes3DControls = new THREE.OrbitControls(routes3DCamera, routes3DRenderer.domElement);
    routes3DControls.enableDamping = true;
    routes3DControls.dampingFactor = 0.06;
    routes3DControls.maxDistance = 550;
    routes3DControls.minDistance = 35;
    routes3DControls.maxPolarAngle = Math.PI / 2 - 0.03;
    routes3DControls.target.set(0, 0, 5);
  }

  // Realistic Studio & Sun Lighting
  const ambient = new THREE.AmbientLight(0xffffff, 1.4);
  routes3DScene.add(ambient);

  const sunLight = new THREE.DirectionalLight(0xfff7ed, 2.2);
  sunLight.position.set(90, 180, 100);
  routes3DScene.add(sunLight);

  const seaRimLight = new THREE.DirectionalLight(0x38bdf8, 1.2);
  seaRimLight.position.set(-110, 90, -90);
  routes3DScene.add(seaRimLight);

  // 1. Build Realistic Mountainous Continents, Gradient Ocean & Geographic Labels
  buildRealisticMaritimeStage(routes3DScene);

  // 2. Group for Strategic Routes and Port Pins
  routePlanesGroup = new THREE.Group();
  routes3DScene.add(routePlanesGroup);

  // Strategic Chokepoint & Hub Cylinders + Pulsing Warning Rings
  Object.keys(ROUTE_PORTS).forEach(key => {
    const pt = ROUTE_PORTS[key];
    const pinGeo = new THREE.CylinderGeometry(1.6, 1.6, 2.4, 16);
    const pinMat = new THREE.MeshStandardMaterial({
      color: pt.color,
      emissive: pt.color,
      emissiveIntensity: 0.6
    });
    const pin = new THREE.Mesh(pinGeo, pinMat);
    pin.position.set(pt.x, 2.2, pt.z);
    routePlanesGroup.add(pin);

    // Pulse Hazard/Warning Rings
    if (pt.choke) {
      const ringGeo = new THREE.RingGeometry(2.4, 4.6, 24);
      const ringColor = pt.status === 'divert' ? 0xf43f5e : pt.status === 'warning' ? 0xf59e0b : 0x10b981;
      const ringMat = new THREE.MeshBasicMaterial({
        color: ringColor,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(pt.x, 1.0, pt.z);
      routePlanesGroup.add(ring);
    }
  });

  // 3. Construct 3D Curved Shipping Sea-Lanes (Main Global Arteries)

  // ROUTE A: 🔴 非洲好望角大繞道主幹線 (Taiwan -> Singapore -> Indian Ocean -> Cape of Good Hope -> Europe)
  const capePoints = [
    { x: 75, y: 1.5, z: -15 },  // 台灣高雄
    { x: 62, y: 2.0, z: -4 },
    { x: 48, y: 2.0, z: 8 },    // 麻六甲/新加坡
    { x: 25, y: 3.0, z: 24 },   // 南印度洋
    { x: 5, y: 3.5, z: 48 },    // 深南印度洋
    { x: -18, y: 3.0, z: 68 },  // 非洲好望角大繞道
    { x: -45, y: 2.5, z: 40 },  // 南大西洋
    { x: -55, y: 2.0, z: 5 },   // 赤道大西洋
    { x: -62, y: 1.5, z: -48 }  // 荷蘭鹿特丹
  ];
  const routeCape = create3DRouteTube(capePoints, 0x10b981, 1.15); // Evergreen/Yang Ming green lane
  routePlanesGroup.add(routeCape.mesh);

  // ROUTE B: 🔵 蘇伊士/紅海傳統歐地線 (Suez Canal / Bab el-Mandeb)
  const suezPoints = [
    { x: 48, y: 2.0, z: 8 },    // 新加坡
    { x: 22, y: 2.0, z: 2 },    // 北印度洋
    { x: -3, y: 2.2, z: -4 },   // 曼德海峽 / 葉門紅海口
    { x: -14, y: 2.0, z: -11 }, // 蘇伊士運河
    { x: -36, y: 2.0, z: -25 }, // 地中海
    { x: -54, y: 1.8, z: -38 }, // 直布羅陀/英吉利海峽
    { x: -62, y: 1.5, z: -48 }  // 鹿特丹
  ];
  const routeSuez = create3DRouteTube(suezPoints, 0x0284c7, 0.85); // Yang Ming blue lane
  routePlanesGroup.add(routeSuez.mesh);

  // ROUTE C: 🟣 跨太平洋美西直達快線 (Transpacific Express: Taiwan -> LA / Long Beach)
  const pacificPoints = [
    { x: 75, y: 1.5, z: -15 },  // 台灣高雄
    { x: 96, y: 2.5, z: -18 },
    { x: 120, y: 2.5, z: -22 },
    { x: 142, y: 1.5, z: -26 }  // 美國洛杉磯/長灘
  ];
  const routePacific = create3DRouteTube(pacificPoints, 0x9333ea, 1.05); // Wan Hai / Evergreen Transpacific
  routePlanesGroup.add(routePacific.mesh);

  // ROUTE D: 🟡 麻六甲東南亞高頻區間線 (Intra-Asia Feeder loop: Taiwan <-> Singapore)
  const intraAsiaPoints = [
    { x: 75, y: 1.5, z: -15 },  // 台灣
    { x: 62, y: 2.0, z: -3 },   // 南海航道
    { x: 48, y: 1.8, z: 8 },    // 新加坡
    { x: 55, y: 2.0, z: -2 },   // 回程航線
    { x: 75, y: 1.5, z: -15 }   // 台灣
  ];
  const routeIntraAsia = create3DRouteTube(intraAsiaPoints, 0xf59e0b, 0.7);
  routePlanesGroup.add(routeIntraAsia.mesh);

  // 4. Deploy Identifiable Ships for Evergreen, Yang Ming, and Wan Hai with Headings
  routeParticles = [];
  let activeFollowShip = null;

  function addActiveFleetShip(curve, companyKey, name, colorHex, speed, initialProgress = 0, meta = {}) {
    const shipModel = buildRealisticShip3D(companyKey, name, colorHex);
    routes3DScene.add(shipModel);

    const shipObj = {
      model: shipModel,
      curve: curve,
      speed: speed,
      progress: initialProgress,
      name: name,
      companyKey: companyKey,
      meta: meta
    };

    // Store shipObj reference on mesh children for raycasting
    shipModel.traverse(child => {
      if (child.isMesh) child.userData.shipObj = shipObj;
    });

    routeParticles.push(shipObj);
  }

  // 🚢 長榮海運 (2603) 旗艦綠：在好望角遠洋線與美西線上高速航行
  addActiveFleetShip(routeCape.curve, '2603', '🟢 長榮 24,000 TEU (好望角繞道)', 0x059669, 0.0015, 0.12, {
    fullName: '長榮 24,000 TEU (長範輪 Ever Ace)',
    route: '好望角大繞道 • 歐地遠洋線',
    speedStr: '18.6 節 / 94% 超高裝載率',
    etaStr: '荷蘭鹿特丹港 (預計8天後抵達)',
    equip: '甲醇雙燃料主機 + 混合型脫硫塔',
    dotColor: 'bg-emerald-500'
  });
  addActiveFleetShip(routeCape.curve, '2603', '🟢 長榮 歐洲返程輪 (好望角)', 0x059669, 0.0015, 0.65, {
    fullName: '長榮 20,000 TEU (長益輪 Ever Glory)',
    route: '好望角繞道 • 回程空櫃與高價冷鏈',
    speedStr: '17.8 節 / 88% 裝載率',
    etaStr: '台灣高雄港 (預計14天後靠泊)',
    equip: '高效壓載水管理 + 脫硫塔節約',
    dotColor: 'bg-emerald-500'
  });
  addActiveFleetShip(routePacific.curve, '2603', '🟢 長榮 美西快航 (LA線)', 0x059669, 0.0025, 0.25, {
    fullName: '長榮 12,000 TEU (長富輪 Ever Forever)',
    route: '跨太平洋極速快航 (Transpacific)',
    speedStr: '20.5 節 / 98% 搶運滿載',
    etaStr: '美國洛杉磯港 (預計4天後進港)',
    equip: '專用碼頭快速裝卸 + 岸電受電',
    dotColor: 'bg-emerald-500'
  });

  // 🚢 陽明海運 (2609) 主力藍：在地中海與好望角歐洲線上航行
  addActiveFleetShip(routeCape.curve, '2609', '🔵 陽明 14,000 TEU (歐線好望角)', 0x0284c7, 0.0016, 0.38, {
    fullName: '陽明 14,000 TEU (鮮明輪 YM Wellness)',
    route: '歐洲好望角鐘擺線 (THE/Premier聯盟)',
    speedStr: '17.2 節 / 91% 裝載率',
    etaStr: '德國漢堡港 (預計10天後抵達)',
    equip: '電子噴射極低油耗柴油機',
    dotColor: 'bg-blue-500'
  });
  addActiveFleetShip(routeSuez.curve, '2609', '🔵 陽明 特約船 (蘇伊士觀察線)', 0x0284c7, 0.0020, 0.45, {
    fullName: '陽明 11,000 TEU (世明輪 YM World)',
    route: '地中海支線 / 蘇伊士動態觀察航次',
    speedStr: '16.5 節 / 85% 裝載率',
    etaStr: '埃及賽得港 (預計3天後抵港)',
    equip: '高規格護航雷達與避險通訊系統',
    dotColor: 'bg-blue-500'
  });

  // 🚢 萬海航運 (2615) 快航紫：在亞洲近洋麻六甲與美西直航線上航行
  addActiveFleetShip(routePacific.curve, '2615', '🟣 萬海 3,055 TEU (美西快線 AP1)', 0x9333ea, 0.0030, 0.72, {
    fullName: '萬海 3,055 TEU (寬春輪 Wan Hai 315)',
    route: '美西直達快航 AP1 (亞洲直通長灘)',
    speedStr: '19.8 節 / 96% 滿載直達',
    etaStr: '美國長灘港 (預計5天後抵達)',
    equip: '新型流體力學節能螺槳+降阻塗裝',
    dotColor: 'bg-purple-500'
  });
  addActiveFleetShip(routeIntraAsia.curve, '2615', '🟣 萬海 亞洲區間穿梭輪 (麻六甲)', 0x9333ea, 0.0035, 0.15, {
    fullName: '萬海 2,038 TEU (春春輪 Wan Hai 285)',
    route: '麻六甲走廊 • 亞洲近洋高頻穿梭',
    speedStr: '18.0 節 / 95% 密集迴轉',
    etaStr: '新加坡港 (預計明日下午靠泊)',
    equip: '高密度冷藏插座 (生鮮冷鏈專用)',
    dotColor: 'bg-purple-500'
  });

  // 5. Interactive Raycaster for Ship Clicking & HUD Inspection
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  function onShipCanvasClick(event) {
    const rect = routes3DRenderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, routes3DCamera);

    const meshes = [];
    routeParticles.forEach(p => {
      p.model.traverse(ch => { if (ch.isMesh) meshes.push(ch); });
    });

    const intersects = raycaster.intersectObjects(meshes, false);
    if (intersects.length > 0) {
      const hit = intersects[0].object;
      if (hit.userData && hit.userData.shipObj) {
        showShipInspector(hit.userData.shipObj);
      }
    }
  }
  routes3DRenderer.domElement.addEventListener('click', onShipCanvasClick);

  function showShipInspector(shipObj) {
    const card = document.getElementById('ship3d-inspector-card');
    if (!card) return;

    activeFollowShip = shipObj;

    const m = shipObj.meta || {};
    const nameEl = document.getElementById('inspect-ship-name');
    const routeEl = document.getElementById('inspect-ship-route');
    const speedEl = document.getElementById('inspect-ship-speed');
    const etaEl = document.getElementById('inspect-ship-eta');
    const equipEl = document.getElementById('inspect-ship-equip');
    const dotEl = document.getElementById('inspect-ship-dot');

    if (nameEl) nameEl.textContent = m.fullName || shipObj.name;
    if (routeEl) routeEl.textContent = m.route || '常態幹線航道';
    if (speedEl) speedEl.textContent = m.speedStr || '18.0 節';
    if (etaEl) etaEl.textContent = m.etaStr || '航行中';
    if (equipEl) equipEl.textContent = m.equip || '節能柴油引擎';
    if (dotEl && m.dotColor) dotEl.className = `w-2.5 h-2.5 rounded-full ${m.dotColor} animate-pulse`;

    card.classList.remove('hidden');

    // Smoothly fly camera to close up view of ship
    const shipPos = shipObj.model.position.clone();
    routeCameraLerp = {
      startCam: routes3DCamera.position.clone(),
      endCam: shipPos.clone().add(new THREE.Vector3(0, 18, 22)),
      startTarget: routes3DControls.target.clone(),
      endTarget: shipPos,
      startTime: performance.now(),
      duration: 1000
    };
  }

  // Close & Unlock buttons
  const closeBtn = document.getElementById('inspect-close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('ship3d-inspector-card')?.classList.add('hidden');
      activeFollowShip = null;
    });
  }

  const resetCamBtn = document.getElementById('inspect-reset-cam-btn');
  if (resetCamBtn) {
    resetCamBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      activeFollowShip = null;
      document.getElementById('ship3d-inspector-card')?.classList.add('hidden');
      routes3DCamera.position.set(0, 160, 190);
      routes3DControls.target.set(0, 0, 5);
      routes3DControls.update();
    });
  }

  // Resize handler
  window.resize3DRoutes = function() {
    if (!container || !routes3DRenderer || !routes3DCamera) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w > 0 && h > 0) {
      routes3DCamera.aspect = w / h;
      routes3DCamera.updateProjectionMatrix();
      routes3DRenderer.setSize(w, h);
    }
  };
  window.addEventListener('resize', window.resize3DRoutes);

  // Animation Loop with Real Heading Rotation & Smooth Camera Gliding
  function animateRoutes() {
    requestAnimationFrame(animateRoutes);

    // 1. Move Ships along Real Routes and Align Bow with Heading
    routeParticles.forEach(p => {
      p.progress += p.speed;
      if (p.progress > 1) p.progress = 0;

      const pos = p.curve.getPointAt(p.progress);
      p.model.position.copy(pos);

      // Tangent vector indicates ship forward movement
      const tangent = p.curve.getTangentAt(p.progress).normalize();
      // Align ship bow (+Z forward) with tangent
      p.model.lookAt(pos.clone().add(tangent));
    });

    // 2. Camera tracking active clicked ship
    if (activeFollowShip && !routeCameraLerp && routes3DControls) {
      const shipPos = activeFollowShip.model.position.clone();
      routes3DControls.target.copy(shipPos);
    }

    // 3. Smooth Camera Fly-to Lerp
    if (routeCameraLerp && routes3DControls) {
      const elapsed = performance.now() - routeCameraLerp.startTime;
      const t = Math.min(elapsed / routeCameraLerp.duration, 1.0);
      // Ease out cubic
      const ease = 1 - Math.pow(1 - t, 3);

      routes3DCamera.position.lerpVectors(routeCameraLerp.startCam, routeCameraLerp.endCam, ease);
      routes3DControls.target.lerpVectors(routeCameraLerp.startTarget, routeCameraLerp.endTarget, ease);

      if (t >= 1.0) {
        routeCameraLerp = null; // Finished
      }
    }

    if (routeAutoRotate && routes3DControls && !routeCameraLerp && !activeFollowShip) {
      routes3DControls.autoRotate = true;
      routes3DControls.autoRotateSpeed = 0.5;
    } else if (routes3DControls) {
      routes3DControls.autoRotate = false;
    }

    if (routes3DControls) routes3DControls.update();
    routes3DRenderer.render(routes3DScene, routes3DCamera);
  }
  animateRoutes();
}

function focus3DRouteView(routeKey) {
  if (!routes3DCamera || !routes3DControls) return;

  ['all', 'cape', 'suez', 'pacific'].forEach(k => {
    const btn = document.getElementById(`btn-route-${k}`);
    if (btn) {
      if (k === routeKey) {
        btn.classList.add('active', 'bg-indigo-600', 'text-white');
        btn.classList.remove('text-slate-300');
      } else {
        btn.classList.remove('active', 'bg-indigo-600', 'text-white');
        btn.classList.add('text-slate-300');
      }
    }
  });

  if (routeKey === 'all') {
    routes3DCamera.position.set(0, 160, 190);
    routes3DControls.target.set(0, 0, 5);
  } else if (routeKey === 'cape') {
    // Focus on Cape of Good Hope loop
    routes3DCamera.position.set(-18, 55, 125);
    routes3DControls.target.set(-18, 2, 68);
  } else if (routeKey === 'suez') {
    // Focus on Suez & Red Sea bottleneck
    routes3DCamera.position.set(-4, 38, 30);
    routes3DControls.target.set(-4, 2, -5);
  } else if (routeKey === 'pacific') {
    // Focus on Transpacific route
    routes3DCamera.position.set(110, 70, 35);
    routes3DControls.target.set(110, 2, -20);
  }
  routes3DControls.update();
}


/* ========================================================
   15. PLOTLY 3D SURFACE & SCATTER WAR ROOM (運價 x 運力 x EPS)
   ======================================================== */
let current3DSurfaceStockKey = '2603';

const SURFACE_STOCK_CONFIGS = {
  '2603': {
    name: '長榮 (2603)',
    title: '長榮 (2603) 敏感度三維獲利曲面',
    baseEpsText: 'NT$ 62.5 元 (運價2,400點/繞道基準)',
    fixedCost: 28.0,
    leverageFactor: 0.038,
    capacityImpact: 2.2,
    basePrice: 255.5
  },
  '2609': {
    name: '陽明 (2609)',
    title: '陽明 (2609) 敏感度三維獲利曲面',
    baseEpsText: 'NT$ 15.8 元 (歐洲線高曝險/高彈性)',
    fixedCost: 12.0,
    leverageFactor: 0.0125,
    capacityImpact: 1.1,
    basePrice: 58.2
  },
  '2615': {
    name: '萬海 (2615)',
    title: '萬海 (2615) 敏感度三維獲利曲面',
    baseEpsText: 'NT$ 22.0 元 (亞洲區間高週轉彈升)',
    fixedCost: 14.0,
    leverageFactor: 0.016,
    capacityImpact: 1.3,
    basePrice: 111.5
  }
};

function init3DSurfaceWarRoom() {
  const container = document.getElementById('plotly3dSurfaceContainer');
  if (!container || typeof Plotly === 'undefined') return;

  render3DSurfacePlot(current3DSurfaceStockKey);

  window.resize3DSurface = function() {
    if (document.getElementById('plotly3dSurfaceContainer') && typeof Plotly !== 'undefined') {
      Plotly.Plots.resize('plotly3dSurfaceContainer');
    }
  };
  window.addEventListener('resize', window.resize3DSurface);
}

function render3DSurfacePlot(stockKey) {
  const container = document.getElementById('plotly3dSurfaceContainer');
  if (!container || typeof Plotly === 'undefined') return;

  const cfg = SURFACE_STOCK_CONFIGS[stockKey] || SURFACE_STOCK_CONFIGS['2603'];

  // Grid steps:
  // X: SCFI 運價指數 (800 ~ 4500)
  // Y: 全球供給淨增加率 % (-2% ~ +12%)
  // Z: 預估年化 EPS (NT$)
  const scfiValues = [];
  for (let s = 800; s <= 4500; s += 200) scfiValues.push(s);

  const supplyValues = [];
  for (let sup = -2.0; sup <= 12.0; sup += 1.0) supplyValues.push(sup);

  const zMatrix = [];
  for (let i = 0; i < supplyValues.length; i++) {
    const row = [];
    const sup = supplyValues[i];
    for (let j = 0; j < scfiValues.length; j++) {
      const scfi = scfiValues[j];
      // Profit formula: EPS = (SCFI - BreakEven) * leverage - (Supply% * impact)
      let eps = (scfi - 950) * cfg.leverageFactor - (sup * cfg.capacityImpact);
      eps = Math.round(eps * 10) / 10;
      row.push(eps);
    }
    zMatrix.push(row);
  }

  // Current Benchmark Spot Dot (SCFI = 2250, Supply = 3.5%)
  const currentScfi = 2250;
  const currentSupply = 3.5;
  const currentEps = Math.round(((currentScfi - 950) * cfg.leverageFactor - (currentSupply * cfg.capacityImpact)) * 10) / 10;

  const surfaceTrace = {
    z: zMatrix,
    x: scfiValues,
    y: supplyValues,
    type: 'surface',
    colorscale: [
      [0, '#1e293b'],
      [0.2, '#0284c7'],
      [0.4, '#10b981'],
      [0.7, '#f59e0b'],
      [1.0, '#ef4444']
    ],
    contours: {
      z: {
        show: true,
        usecolormap: true,
        highlightcolor: '#ffffff',
        project: { z: true }
      }
    },
    colorbar: {
      title: '預估 EPS (元)',
      titleside: 'top',
      tickfont: { color: '#94a3b8', size: 10 },
      titlefont: { color: '#ffffff', size: 11 },
      len: 0.75,
      thickness: 14
    },
    hoverinfo: 'x+y+z',
    hovertemplate: 'SCFI 運價: %{x} 點<br>運力供給增長: %{y}%<br>預估 EPS: NT$ %{z} 元<extra></extra>'
  };

  const markerTrace = {
    x: [currentScfi],
    y: [currentSupply],
    z: [currentEps],
    mode: 'markers+text',
    type: 'scatter3d',
    marker: {
      size: 9,
      color: '#ffffff',
      symbol: 'circle',
      line: { color: '#ef4444', width: 3 }
    },
    text: [`目前點位: SCFI ${currentScfi} / 供給 +${currentSupply}% / EPS $${currentEps}`],
    textposition: 'top center',
    textfont: { color: '#ffffff', size: 11 }
  };

  const contWidth = container.clientWidth || 800;
  const contHeight = container.clientHeight || 450;

  const layout = {
    autosize: true,
    width: contWidth,
    height: contHeight,
    paper_bgcolor: '#030b17',
    plot_bgcolor: '#030b17',
    margin: { l: 15, r: 15, b: 15, t: 15 },
    scene: {
      xaxis: {
        title: { text: 'SCFI 運價指數 (點)', font: { color: '#38bdf8', size: 11 } },
        tickfont: { color: '#94a3b8', size: 9 },
        gridcolor: 'rgba(56, 189, 248, 0.15)',
        zerolinecolor: 'rgba(56, 189, 248, 0.3)'
      },
      yaxis: {
        title: { text: '全球運力淨增長率 (%)', font: { color: '#f59e0b', size: 11 } },
        tickfont: { color: '#94a3b8', size: 9 },
        gridcolor: 'rgba(245, 158, 11, 0.15)',
        zerolinecolor: 'rgba(245, 158, 11, 0.3)'
      },
      zaxis: {
        title: { text: '預估年化 EPS (NT$)', font: { color: '#10b981', size: 11 } },
        tickfont: { color: '#94a3b8', size: 9 },
        gridcolor: 'rgba(16, 185, 129, 0.15)',
        zerolinecolor: 'rgba(16, 185, 129, 0.3)'
      },
      camera: {
        eye: { x: 1.5, y: -1.7, z: 1.15 }
      }
    }
  };

  const config = {
    responsive: true,
    displayModeBar: false
  };

  Plotly.newPlot('plotly3dSurfaceContainer', [surfaceTrace, markerTrace], layout, config);
}

function switch3DSurfaceStock(stockKey) {
  current3DSurfaceStockKey = stockKey;
  const cfg = SURFACE_STOCK_CONFIGS[stockKey];
  if (!cfg) return;

  ['2603', '2609', '2615'].forEach(key => {
    const btn = document.getElementById(`btn-surface-${key}`);
    if (btn) {
      if (key === stockKey) {
        btn.classList.add('active', 'bg-emerald-600', 'text-white');
        btn.classList.remove('text-slate-400');
        if (key === '2609') btn.classList.replace('bg-emerald-600', 'bg-blue-600');
        if (key === '2615') btn.classList.replace('bg-emerald-600', 'bg-purple-600');
      } else {
        btn.classList.remove('active', 'bg-emerald-600', 'bg-blue-600', 'bg-purple-600', 'text-white');
        btn.classList.add('text-slate-400');
      }
    }
  });

  const titleEl = document.getElementById('surface-stock-title');
  const epsEl = document.getElementById('surface-stock-eps');
  if (titleEl) {
    titleEl.textContent = cfg.title;
    titleEl.className = 'font-bold ' + (stockKey === '2603' ? 'text-emerald-400' : stockKey === '2609' ? 'text-blue-400' : 'text-purple-400');
  }
  if (epsEl) epsEl.textContent = cfg.baseEpsText;

  render3DSurfacePlot(stockKey);
}

function reset3DSurfaceView() {
  if (typeof Plotly !== 'undefined' && document.getElementById('plotly3dSurfaceContainer')) {
    Plotly.relayout('plotly3dSurfaceContainer', {
      'scene.camera': { eye: { x: 1.5, y: -1.7, z: 1.15 } }
    });
  }
}
