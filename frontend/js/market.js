/**
 * market.js
 * SmartArch Market Intelligence Plugin — Main Orchestrator
 * Wires up MarketMap, MarketFilters, MarketAPI, MarketCharts.
 */

(async function () {
  /* ─── Init ─── */
  showLoading(true);

  // Auth check — reuse existing SmartArch token
  const token = localStorage.getItem('token');
  const userName = localStorage.getItem('userName') || '';
  if (userName) {
    const el = document.getElementById('nav-user-name');
    if (el) el.textContent = userName;
  }

  // Init map
  const map = window.MarketMap.init('market-map', { center: [20, 0], zoom: 3 });

  // Init filters
  window.MarketFilters.init();

  // Track last loaded bounds to avoid redundant fetches
  let lastBoundsKey = '';
  let statsCache = {};

  /* ─── Load listings for current view ─── */
  async function loadVisible() {
    const bounds = window.MarketMap.getBounds();
    const bKey = Object.values(bounds).map(v => v.toFixed(2)).join(',');
    if (bKey === lastBoundsKey) return;
    lastBoundsKey = bKey;

    showLoading(true);
    try {
      const filters = window.MarketFilters.getState();
      const { listings, simulated } = await window.MarketAPI.getListings(bounds, filters);

      window.MarketMap.renderListings(listings);
      updateStatsPanel(listings, bounds);
      updateLastUpdated(simulated);
    } catch (e) {
      console.error(e);
      showToast('Failed to load market data.');
    } finally {
      showLoading(false);
    }
  }

  /* ─── Stats panel ─── */
  function updateStatsPanel(listings, bounds) {
    const stats = window.MarketAPI.simAreaStats(listings);
    const fmt = v => v >= 1000000 ? `$${(v / 1000000).toFixed(2)}M` : `$${v.toLocaleString()}`;

    setText('stat-count', stats.count || '—');
    setText('stat-avg', stats.avg ? fmt(stats.avg) : '—');
    setText('stat-median', stats.median ? fmt(stats.median) : '—');
    const yoy = parseFloat(stats.yoy || 0);
    const yoyEl = document.getElementById('stat-yoy');
    if (yoyEl) {
      yoyEl.textContent = stats.yoy ? `${yoy >= 0 ? '+' : ''}${yoy}%` : '—';
      yoyEl.style.color = yoy >= 0 ? '#4caf76' : '#e05252';
    }

    // Trend chart
    const center = window.MarketMap.getCenter();
    window.MarketAPI.getTrend(center.lat, center.lng).then(trend => {
      window.MarketCharts.renderTrend(trend);
    });
  }

  /* ─── Detail panel ─── */
  function showDetail(listing) {
    const empty = document.getElementById('detail-empty');
    const content = document.getElementById('detail-content');
    empty.style.display = 'none';
    content.style.display = 'flex';

    const fmt = v => v >= 1000000 ? `$${(v / 1000000).toFixed(2)}M` : `$${v.toLocaleString()}`;

    setText('detail-title', listing.name);
    setText('detail-price', fmt(listing.price));
    setText('detail-sqft-price', listing.pricePerSqft ? `$${listing.pricePerSqft}/sqft` : '—');

    const badge = document.getElementById('detail-type-badge');
    badge.textContent = listing.type;
    badge.style.background = typeColor(listing.type, 0.12);
    badge.style.color = typeColor(listing.type, 1);

    // Value score bar
    const vsBar = document.getElementById('vs-bar');
    const vsNum = document.getElementById('vs-num');
    vsBar.style.width = `${listing.valueScore}%`;
    vsBar.style.background = listing.valueScore >= 70 ? '#4caf76' : listing.valueScore >= 45 ? '#e8c97e' : '#e05252';
    vsNum.textContent = `${listing.valueScore}/100`;

    // Factor grid
    const factorGrid = document.getElementById('factor-grid');
    const factors = [
      { name: 'Electricity', yes: listing.hasElectricity, icon: '⚡' },
      { name: 'City dist.', val: `${listing.cityDistKm}km`, yes: listing.cityDistKm < 10, icon: '🏙' },
      { name: 'Transport', yes: listing.hasPublicTransport, icon: '🚌' },
      { name: 'Schools', yes: listing.hasSchools, icon: '🏫' },
      { name: 'Flood risk', yes: listing.lowFloodRisk, icon: '💧' },
      { name: 'YoY', val: `${parseFloat(listing.yoyChange) >= 0 ? '+' : ''}${listing.yoyChange}%`, yes: parseFloat(listing.yoyChange) >= 0, icon: '📈' },
    ];
    factorGrid.innerHTML = factors.map(f => {
      const display = f.val || (f.yes ? 'Yes' : 'No');
      return `
        <div class="factor-item">
          <div class="factor-icon ${f.yes ? 'yes' : 'no'}">${f.icon}</div>
          <div class="factor-info">
            <div class="factor-name">${f.name}</div>
            <div class="factor-val" style="color:${f.yes ? '#4caf76' : '#e05252'}">${display}</div>
          </div>
        </div>`;
    }).join('');

    // Compare chart (vs area median)
    const bounds = window.MarketMap.getBounds();
    window.MarketAPI.getAreaStats(bounds).then(aStats => {
      window.MarketCharts.renderCompare(listing, aStats.median);
    });

    // KV table
    const rows = [
      ['Type', listing.type],
      ['Size', listing.sqft ? `${listing.sqft.toLocaleString()} sqft` : 'N/A'],
      ['Bedrooms', listing.bedrooms || 'N/A'],
      ['Bathrooms', listing.bathrooms || 'N/A'],
      ['Year built', listing.yearBuilt || 'N/A'],
      ['Listed', listing.listed || 'N/A'],
    ];
    document.getElementById('kv-table').innerHTML = rows
      .map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`)
      .join('');

    // CTA buttons
    document.getElementById('design-btn').onclick = () => {
      sessionStorage.setItem('market_selected_plot', JSON.stringify(listing));
      window.location.href = 'architect.html?from=market';
    };
    document.getElementById('save-btn').onclick = async () => {
      await window.MarketAPI.saveToFavourites(listing);
      showToast('Saved to favourites!');
    };
  }

  /* ─── Helpers ─── */
  function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  function typeColor(type, alpha) {
    const map = { residential: `rgba(76,175,118,${alpha})`, apartment: `rgba(91,163,245,${alpha})`, commercial: `rgba(232,201,126,${alpha})`, land: `rgba(185,123,252,${alpha})` };
    return map[type] || `rgba(160,160,184,${alpha})`;
  }

  function updateLastUpdated(simulated) {
    const el = document.getElementById('last-updated');
    if (!el) return;
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    el.textContent = simulated ? `Simulated · ${timeStr}` : `Updated ${timeStr}`;
  }

  function showLoading(show) {
    const el = document.getElementById('map-loading');
    if (!el) return;
    if (show) { el.classList.remove('hidden'); }
    else { setTimeout(() => el.classList.add('hidden'), 300); }
  }

  window.showToast = function (msg, duration = 3000) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), duration);
  };

  /* ─── Wire up events ─── */
  window.MarketMap.onSelect(listing => showDetail(listing));
  window.MarketMap.onMoveEnd(() => loadVisible());

  window.MarketFilters.onChange(async filters => {
    lastBoundsKey = ''; // force reload
    await loadVisible();
  });

  // Auto-refresh every 5 minutes
  setInterval(() => {
    lastBoundsKey = '';
    loadVisible();
  }, 5 * 60 * 1000);

  /* ─── Initial load ─── */
  await loadVisible();

})();