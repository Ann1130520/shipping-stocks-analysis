/**
 * 航運雙雄情報戰情室 (Shipping Stocks Intelligence App)
 * Focus: 長榮 (2603) & 陽明 (2609)
 * Supports dynamic auto-updates from latest_data.json
 */

let liveMarketData = {
  price2603: 266.5,
  price2609: 62.1,
  lastUpdated: '2026-11-03 14:40:00'
};

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initCharts();
  initNewsCenter();
  initSensitivityCalculator();
  initTickerUpdater();
  loadLiveExternalData();
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

    // Update 2603 Ticker
    if (data.stocks && data.stocks['2603'] && data.stocks['2603'].status === 'success') {
      const s = data.stocks['2603'];
      liveMarketData.price2603 = s.price;
      
      const priceElem = document.getElementById('ticker-2603-price');
      const changeElem = document.getElementById('ticker-2603-change');
      
      if (priceElem) priceElem.textContent = `NT$ ${s.price}`;
      if (changeElem) {
        const isUp = s.change >= 0;
        const colorClass = isUp ? 'text-rose-400' : 'text-emerald-400';
        const icon = isUp ? 'fa-caret-up' : 'fa-caret-down';
        const sign = isUp ? '+' : '';
        changeElem.className = `${colorClass} font-mono text-[11px] flex items-center`;
        changeElem.innerHTML = `<i class="fa-solid ${icon} mr-0.5"></i>${sign}${s.change} (${sign}${s.change_percent}%)`;
      }
    }

    // Update 2609 Ticker
    if (data.stocks && data.stocks['2609'] && data.stocks['2609'].status === 'success') {
      const s = data.stocks['2609'];
      liveMarketData.price2609 = s.price;
      
      const priceElem = document.getElementById('ticker-2609-price');
      const changeElem = document.getElementById('ticker-2609-change');
      
      if (priceElem) priceElem.textContent = `NT$ ${s.price}`;
      if (changeElem) {
        const isUp = s.change >= 0;
        const colorClass = isUp ? 'text-rose-400' : 'text-emerald-400';
        const icon = isUp ? 'fa-caret-up' : 'fa-caret-down';
        const sign = isUp ? '+' : '';
        changeElem.className = `${colorClass} font-mono text-[11px] flex items-center`;
        changeElem.innerHTML = `<i class="fa-solid ${icon} mr-0.5"></i>${sign}${s.change} (${sign}${s.change_percent}%)`;
      }
    }

    // Merge live news if available
    if (data.live_news && Array.isArray(data.live_news) && data.live_news.length > 0) {
      const combined = [...data.live_news, ...newsDatabase];
      renderNewsCards(combined);
    }

    // Re-trigger calculator with new live prices
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

      // Update button state
      tabButtons.forEach(btn => {
        btn.classList.remove('active', 'bg-blue-600', 'text-white', 'shadow-sm');
        btn.classList.add('text-slate-400', 'hover:text-white', 'hover:bg-slate-800');
      });
      button.classList.add('active', 'bg-blue-600', 'text-white', 'shadow-sm');
      button.classList.remove('text-slate-400', 'hover:text-white', 'hover:bg-slate-800');

      // Update content visibility
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
  evergreen: '#10b981',
  yangming: '#3b82f6',
  scfi: '#f59e0b',
  accent: '#ec4899',
  slateGrid: 'rgba(51, 65, 85, 0.4)',
  slateText: '#94a3b8'
};

function initCharts() {
  renderOverviewCombinedChart('1Y');
  renderComparisonRadarChart();
  renderRouteAllocationChart();
  renderSubRouteFreightChart();
  renderSupplyDemandBalanceChart();
  setupTimeframeButtons();
}

// 1. Overview Combined Chart (2603 vs 2609 vs SCFI)
function renderOverviewCombinedChart(timeframe = '1Y') {
  const ctx = document.getElementById('overviewCombinedChart');
  if (!ctx) return;

  const datasetsByRange = {
    '1Y': {
      labels: ['24Q1', '24Q2', '24Q3', '24Q4', '25Q1', '25Q2', '25Q3', '25Q4', '26Q1', '26Q2(現)'],
      evergreen: [155, 178, 195, 212, 235, 248, 255, 260, 274, 266.5],
      yangming: [48, 62, 68, 74, 69, 73, 76, 70, 64, 62.1],
      scfi: [2150, 2900, 3250, 2300, 2100, 2400, 2550, 2235, 2350, 2480]
    },
    '2Y': {
      labels: ['23Q1', '23Q2', '23Q3', '23Q4', '24Q1', '24Q2', '24Q3', '24Q4', '25Q1', '25Q2', '25Q3', '25Q4'],
      evergreen: [130, 125, 115, 140, 155, 178, 195, 212, 235, 248, 255, 266.5],
      yangming: [42, 40, 37, 44, 48, 62, 68, 74, 69, 73, 76, 62.1],
      scfi: [980, 950, 890, 1450, 2150, 2900, 3250, 2300, 2100, 2400, 2550, 2235]
    },
    'CYCLE': {
      labels: ['2020疫情前', '2021大多頭', '2022歷史天價', '2023庫存去化', '2024紅海爆發', '2025高檔整理', '2026當前行情'],
      evergreen: [18, 140, 233, 115, 212, 245, 266.5],
      yangming: [7, 120, 182, 38, 74, 72, 62.1],
      scfi: [900, 4800, 5100, 950, 3250, 2400, 2235]
    }
  };

  const currentData = datasetsByRange[timeframe] || datasetsByRange['1Y'];

  if (overviewChartInstance) {
    overviewChartInstance.destroy();
  }

  overviewChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: currentData.labels,
      datasets: [
        {
          label: '長榮 (2603) 股價 NT$',
          data: currentData.evergreen,
          borderColor: chartColors.evergreen,
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          borderWidth: 2.5,
          yAxisID: 'yStock',
          tension: 0.35,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: chartColors.evergreen
        },
        {
          label: '陽明 (2609) 股價 NT$',
          data: currentData.yangming,
          borderColor: chartColors.yangming,
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          borderWidth: 2.5,
          yAxisID: 'yStock',
          tension: 0.35,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: chartColors.yangming
        },
        {
          label: 'SCFI 綜合運價指數',
          data: currentData.scfi,
          borderColor: chartColors.scfi,
          borderDash: [5, 4],
          borderWidth: 2,
          yAxisID: 'yFreight',
          tension: 0.35,
          pointRadius: 3,
          pointHoverRadius: 5,
          pointBackgroundColor: chartColors.scfi
        }
      ]
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
              if (context.dataset.yAxisID === 'yStock') {
                return `${context.dataset.label}: NT$ ${context.parsed.y}`;
              }
              return `${context.dataset.label}: ${context.parsed.y} 點`;
            }
          }
        }
      },
      scales: {
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
            font: { size: 11 },
            callback: value => `NT$ ${value}`
          }
        },
        yFreight: {
          type: 'linear',
          position: 'right',
          grid: { drawOnChartArea: false },
          ticks: {
            color: chartColors.scfi,
            font: { size: 11 },
            callback: value => `${value} 點`
          }
        }
      }
    }
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
      const range = btn.getAttribute('data-range');
      renderOverviewCombinedChart(range);
    });
  });
}

// 2. Comparison Radar Chart
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
        '淨值折價安全邊際',
        '現金水位與殖利率'
      ],
      datasets: [
        {
          label: '長榮 (2603)',
          data: [96, 95, 92, 75, 78, 90],
          backgroundColor: 'rgba(16, 185, 129, 0.25)',
          borderColor: chartColors.evergreen,
          pointBackgroundColor: chartColors.evergreen,
          borderWidth: 2
        },
        {
          label: '陽明 (2609)',
          data: [68, 65, 75, 95, 92, 85],
          backgroundColor: 'rgba(59, 130, 246, 0.25)',
          borderColor: chartColors.yangming,
          pointBackgroundColor: chartColors.yangming,
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
          min: 40,
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

// 3. Route Allocation Chart
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
          max: 50
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
    impact: '長榮、陽明歐洲航線每 FEU 運價獲得堅固底部支撐，陽明獲利敏感度尤高。'
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
    impact: '法人預估長榮 Q4 單季 EPS 可望守穩 9 元以上，陽明 Q4 單季上看 3.5 元。'
  },
  {
    id: 'base-3',
    title: '長榮海運法說會：新造節能大船陸續入列，脫硫塔普及率居全球同業第一',
    category: 'corporate',
    date: '2026-10-27',
    source: '臺灣證券交易所 法說會摘要',
    sentiment: 'bull',
    sentimentLabel: '基本面強勁',
    summary: '長榮總經理指出，受惠於早年佈局的 24,000 TEU A型巨輪與脫硫塔改裝計畫，當前每噸油料成本比競爭者低 120 美元以上；海洋聯盟合約已鎖定至 2032 年，營運護城河極度寬廣。',
    impact: '凸顯長榮優於陽明之超額毛利結構，高現金股利政策維持不變。'
  },
  {
    id: 'base-4',
    title: '美東碼頭工會 (ILA) 新一輪自動化談判展開，航商預防性調度部分運力至美西港口',
    category: 'geopolitics',
    date: '2026-10-24',
    source: 'JOC 航運週刊',
    sentiment: 'neutral',
    sentimentLabel: '中立監控',
    summary: '儘管美東港口工資調升已達成初步共識，但工會對於無人碼頭與全自動化裝卸設施態度強硬。部分美國大型零售商為防範潜在二次斷鏈，將約 15% 貨載提前轉向美西洛杉磯/長灘港。',
    impact: '長榮美西長灘專用碼頭 (Everport) 受惠轉單，裝卸週轉維持高效率。'
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
   4. SENSITIVITY & VALUATION CALCULATOR ENGINE
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

    // 2603 Calculations
    const scfiDelta = (scfi - 1500) / 100;
    const rerouteFactor2603 = 1 + (reroute / 100) * 0.28;
    const fuelBonus2603 = Math.max(0, (fuelSpread - 80) * 0.012);

    let qEps2603 = Math.max(0.5, (4.5 + scfiDelta * 0.95) * rerouteFactor2603 + fuelBonus2603);
    let fyEps2603 = qEps2603 * 4;
    let div2603 = fyEps2603 * payoutRatio;
    let yield2603 = (div2603 / curPrice2603) * 100;
    let pe2603 = curPrice2603 / fyEps2603;

    // 2609 Calculations
    const rerouteFactor2609 = 1 + (reroute / 100) * 0.38;
    let qEps2609 = Math.max(0.2, (1.4 + scfiDelta * 0.45) * rerouteFactor2609);
    let fyEps2609 = qEps2609 * 4;
    let div2609 = fyEps2609 * payoutRatio;
    let yield2609 = (div2609 / curPrice2609) * 100;
    let pe2609 = curPrice2609 / fyEps2609;

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

    // Dynamic verdict update
    const verdict2603 = document.getElementById('sim-2603-verdict');
    if (yield2603 >= 9) {
      verdict2603.textContent = '超高殖利率保護，下檔極具投資安全邊際';
      verdict2603.className = 'text-emerald-400 font-semibold';
    } else if (yield2603 >= 6) {
      verdict2603.textContent = '獲利韌性優異，配息維持高水準常態';
      verdict2603.className = 'text-blue-400 font-semibold';
    } else {
      verdict2603.textContent = '景氣進入低檔震盪，長約防守發揮核心價值';
      verdict2603.className = 'text-amber-400 font-semibold';
    }

    const verdict2609 = document.getElementById('sim-2609-verdict');
    if (yield2609 >= 9) {
      verdict2609.textContent = '現貨運價獲利爆發，波段攻擊動能最強烈';
      verdict2609.className = 'text-rose-400 font-semibold';
    } else if (yield2609 >= 6) {
      verdict2609.textContent = '歐洲線利差穩健，每股淨值折價提供下檔後盾';
      verdict2609.className = 'text-blue-400 font-semibold';
    } else {
      verdict2609.textContent = '若蘇伊士全面復航，運價回落敏感度較長榮大';
      verdict2609.className = 'text-amber-400 font-semibold';
    }
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
