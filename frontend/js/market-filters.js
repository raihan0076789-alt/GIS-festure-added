/**
 * market-filters.js
 * SmartArch Market Intelligence — Filter State & UI Controller
 */

window.MarketFilters = (() => {
  const state = {
    priceMin: 50000,
    priceMax: 2000000,
    type: 'all',
    scoreMin: 60,
    hasElectricity: true,
    nearCity: true,
    hasTransport: false,
    hasSchools: false,
    lowFloodRisk: false,
  };

  let onChangeCallback = null;

  function formatPrice(v) {
    if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
    if (v >= 1000) return `$${Math.round(v / 1000)}K`;
    return `$${v}`;
  }

  function init() {
    // Price sliders
    const pMin = document.getElementById('price-min');
    const pMax = document.getElementById('price-max');
    const pLabel = document.getElementById('price-label');

    function updatePriceLabel() {
      let lo = parseInt(pMin.value), hi = parseInt(pMax.value);
      if (lo > hi) { [lo, hi] = [hi, lo]; }
      state.priceMin = lo; state.priceMax = hi;
      pLabel.textContent = `${formatPrice(lo)} – ${formatPrice(hi)}`;
    }
    pMin.addEventListener('input', updatePriceLabel);
    pMax.addEventListener('input', updatePriceLabel);
    updatePriceLabel();

    // Score slider
    const scoreSlider = document.getElementById('score-min');
    const scoreLabel = document.getElementById('score-label');
    scoreSlider.addEventListener('input', () => {
      state.scoreMin = parseInt(scoreSlider.value);
      scoreLabel.textContent = `${state.scoreMin} / 100`;
    });
    scoreLabel.textContent = `${state.scoreMin} / 100`;

    // Type chips
    document.querySelectorAll('#type-chips .chip').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#type-chips .chip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.type = btn.dataset.value;
      });
    });

    // Factor toggles
    const toggleMap = {
      'fac-electricity': 'hasElectricity',
      'fac-city': 'nearCity',
      'fac-transport': 'hasTransport',
      'fac-schools': 'hasSchools',
      'fac-flood': 'lowFloodRisk',
    };
    Object.entries(toggleMap).forEach(([id, key]) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('change', () => { state[key] = el.checked; });
        state[key] = el.checked;
      }
    });

    // Apply / Reset
    document.getElementById('apply-filters-btn').addEventListener('click', () => {
      if (onChangeCallback) onChangeCallback(getState());
    });

    document.getElementById('reset-filters-btn').addEventListener('click', () => {
      reset();
      if (onChangeCallback) onChangeCallback(getState());
    });

    // Location search
    const searchInput = document.getElementById('location-search');
    const searchBtn = document.getElementById('search-btn');
    const acList = document.getElementById('autocomplete-list');
    let debounceTimer;

    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      const q = searchInput.value.trim();
      if (q.length < 3) { acList.classList.remove('open'); return; }
      debounceTimer = setTimeout(async () => {
        const results = await window.MarketAPI.geocode(q);
        acList.innerHTML = '';
        if (results.length) {
          results.forEach((r, i) => {
            const li = document.createElement('li');
            li.textContent = r.display;
            li.dataset.lat = r.lat;
            li.dataset.lng = r.lng;
            li.addEventListener('click', () => {
              searchInput.value = r.display;
              acList.classList.remove('open');
              window.MarketMap.flyTo(r.lat, r.lng, 11);
            });
            acList.appendChild(li);
          });
          acList.classList.add('open');
        } else {
          acList.classList.remove('open');
        }
      }, 350);
    });

    searchBtn.addEventListener('click', async () => {
      const q = searchInput.value.trim();
      if (!q) return;
      const results = await window.MarketAPI.geocode(q);
      if (results.length) {
        window.MarketMap.flyTo(results[0].lat, results[0].lng, 11);
        searchInput.value = results[0].display;
        acList.classList.remove('open');
      } else {
        window.showToast('Location not found. Try a different search.');
      }
    });

    searchInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') searchBtn.click();
      if (e.key === 'Escape') acList.classList.remove('open');
    });

    document.addEventListener('click', e => {
      if (!e.target.closest('.search-wrap')) acList.classList.remove('open');
    });

    // Sidebar toggle
    document.getElementById('toggle-sidebar-btn').addEventListener('click', () => {
      const sidebar = document.getElementById('market-sidebar');
      sidebar.classList.toggle('collapsed');
    });

    // View mode buttons
    ['view-map', 'view-heatmap', 'view-clusters'].forEach(id => {
      document.getElementById(id).addEventListener('click', () => {
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        document.getElementById(id).classList.add('active');
        const mode = id.replace('view-', '');
        window.MarketMap.setMode(mode);
      });
    });
  }

  function getState() { return { ...state }; }

  function reset() {
    state.priceMin = 50000; state.priceMax = 2000000;
    state.type = 'all'; state.scoreMin = 60;
    state.hasElectricity = true; state.nearCity = true;
    state.hasTransport = false; state.hasSchools = false;
    state.lowFloodRisk = false;
    // Reset UI
    document.getElementById('price-min').value = 50000;
    document.getElementById('price-max').value = 2000000;
    document.getElementById('price-label').textContent = '$50K – $2M';
    document.getElementById('score-min').value = 60;
    document.getElementById('score-label').textContent = '60 / 100';
    document.querySelectorAll('#type-chips .chip').forEach(b => b.classList.remove('active'));
    document.querySelector('#type-chips .chip[data-value="all"]').classList.add('active');
    document.getElementById('fac-city').checked = true;
    document.getElementById('fac-electricity').checked = true;
    document.getElementById('fac-transport').checked = false;
    document.getElementById('fac-schools').checked = false;
    document.getElementById('fac-flood').checked = false;
  }

  function onChange(cb) { onChangeCallback = cb; }

  return { init, getState, onChange };
})();