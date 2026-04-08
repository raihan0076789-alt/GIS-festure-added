/**
 * market-charts.js
 * SmartArch Market Intelligence — Chart Rendering (Chart.js 4)
 */

window.MarketCharts = (() => {
  let trendChart = null;
  let compareChart = null;

  const GOLD = '#e8c97e';
  const BLUE = '#5ba3f5';
  const GREEN = '#4caf76';
  const TEXT2 = '#a0a0b8';
  const BORDER = 'rgba(255,255,255,0.06)';

  Chart.defaults.color = TEXT2;
  Chart.defaults.font.family = "'DM Sans', sans-serif";
  Chart.defaults.font.size = 11;

  function sharedScaleOpts(display = true) {
    return {
      display,
      grid: { color: BORDER },
      ticks: { color: TEXT2 },
      border: { display: false }
    };
  }

  /* ── 12-month trend sparkline ── */
  function renderTrend(trendData) {
    const ctx = document.getElementById('trend-chart');
    if (!ctx) return;
    if (trendChart) trendChart.destroy();

    const labels = trendData.map(d => d.month);
    const prices = trendData.map(d => d.avg);
    const maxP = Math.max(...prices);
    const minP = Math.min(...prices);
    const isPositive = prices[prices.length - 1] >= prices[0];

    trendChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data: prices,
          borderColor: isPositive ? GREEN : '#e05252',
          borderWidth: 1.5,
          tension: 0.4,
          fill: true,
          backgroundColor: isPositive ? 'rgba(76,175,118,0.07)' : 'rgba(224,82,82,0.07)',
          pointRadius: 0,
          pointHoverRadius: 3,
          pointHoverBackgroundColor: isPositive ? GREEN : '#e05252',
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: {
          callbacks: {
            label: ctx => {
              const v = ctx.parsed.y;
              return v >= 1000000 ? `$${(v/1000000).toFixed(2)}M` : `$${v.toLocaleString()}`;
            }
          },
          backgroundColor: '#2d2d4a',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          titleColor: '#f0ede8',
          bodyColor: TEXT2,
          padding: 10,
        }},
        scales: {
          x: { ...sharedScaleOpts(true), grid: { display: false } },
          y: { ...sharedScaleOpts(false),
            ticks: {
              callback: v => v >= 1000000 ? `$${(v/1000000).toFixed(1)}M` : `$${Math.round(v/1000)}K`
            }
          }
        }
      }
    });
  }

  /* ── Property vs area compare ── */
  function renderCompare(listing, areaAvg) {
    const ctx = document.getElementById('compare-chart');
    if (!ctx) return;
    if (compareChart) compareChart.destroy();

    const propPrice = listing.price;
    const areaMedian = areaAvg || propPrice * 1.05;
    const diff = ((propPrice - areaMedian) / areaMedian * 100).toFixed(1);

    compareChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['This property', 'Area median'],
        datasets: [{
          data: [propPrice, areaMedian],
          backgroundColor: [
            propPrice <= areaMedian ? 'rgba(76,175,118,0.7)' : 'rgba(232,201,126,0.6)',
            'rgba(255,255,255,0.1)'
          ],
          borderColor: [
            propPrice <= areaMedian ? 'rgba(76,175,118,1)' : GOLD,
            'rgba(255,255,255,0.2)'
          ],
          borderWidth: 1,
          borderRadius: 4,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => {
                const v = ctx.parsed.x;
                return v >= 1000000 ? `$${(v/1000000).toFixed(2)}M` : `$${v.toLocaleString()}`;
              }
            },
            backgroundColor: '#2d2d4a',
            borderColor: 'rgba(255,255,255,0.1)',
            borderWidth: 1,
            titleColor: '#f0ede8',
            bodyColor: TEXT2,
          }
        },
        scales: {
          x: {
            ...sharedScaleOpts(true),
            ticks: { callback: v => v >= 1000000 ? `$${(v/1000000).toFixed(1)}M` : `$${Math.round(v/1000)}K` }
          },
          y: { ...sharedScaleOpts(true), grid: { display: false } }
        }
      }
    });
  }

  return { renderTrend, renderCompare };
})();