/**
 * market-map.js
 * SmartArch Market Intelligence — Leaflet Map Controller
 */

window.MarketMap = (() => {
  let map, tileLayer, markersLayer, clusterLayer, heatLayer;
  let currentMode = 'map'; // 'map' | 'heatmap' | 'clusters'
  let allListings = [];
  let selectedId = null;
  let onSelectCallback = null;
  let onMoveEndCallback = null;

  /* ── Tile layers (dark theme) ── */
  const TILE_URLS = {
    dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    streets: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  };

  function init(containerId, opts = {}) {
    map = L.map(containerId, {
      center: opts.center || [20, 0],
      zoom: opts.zoom || 3,
      zoomControl: true,
      preferCanvas: true,
    });

    tileLayer = L.tileLayer(TILE_URLS.dark, {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/">CARTO</a>',
      maxZoom: 18,
    }).addTo(map);

    markersLayer = L.layerGroup().addTo(map);
    clusterLayer = L.markerClusterGroup({
      maxClusterRadius: 60,
      iconCreateFunction: createClusterIcon,
    });

    map.on('mousemove', e => {
      const el = document.getElementById('map-coords');
      if (el) el.textContent = `${e.latlng.lat.toFixed(4)}°, ${e.latlng.lng.toFixed(4)}°`;
    });

    map.on('zoomend', () => {
      const el = document.getElementById('map-zoom-level');
      if (el) el.textContent = `Zoom: ${map.getZoom()}`;
    });

    map.on('moveend', () => {
      if (onMoveEndCallback) onMoveEndCallback(getBounds());
    });

    return map;
  }

  function getBounds() {
    const b = map.getBounds();
    return { north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() };
  }

  function getCenter() {
    return map.getCenter();
  }

  function flyTo(lat, lng, zoom = 11) {
    map.flyTo([lat, lng], zoom, { duration: 1.2 });
  }

  /* ── Marker creation ── */
  function createMarkerIcon(listing) {
    const cls = listing.type || 'residential';
    const letter = cls[0].toUpperCase();
    const isSelected = listing.id === selectedId;
    const html = `
      <div class="marker-pin ${cls} ${isSelected ? 'selected' : ''}">
        <span class="marker-inner">${letter}</span>
      </div>`;
    return L.divIcon({
      html, className: '', iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -34]
    });
  }

  function createClusterIcon(cluster) {
    const count = cluster.getChildCount();
    const size = count < 10 ? 36 : count < 50 ? 44 : 52;
    return L.divIcon({
      html: `<div style="
        width:${size}px; height:${size}px; border-radius:50%;
        background: rgba(232,201,126,0.18); border: 1.5px solid rgba(232,201,126,0.6);
        display:flex; align-items:center; justify-content:center;
        color:#e8c97e; font-size:12px; font-weight:600; font-family:'DM Sans',sans-serif;
      ">${count}</div>`,
      className: '', iconSize: [size, size]
    });
  }

  function buildPopupHTML(l) {
    const price = l.price >= 1000000
      ? `$${(l.price / 1000000).toFixed(2)}M`
      : `$${l.price.toLocaleString()}`;
    const yoy = parseFloat(l.yoyChange);
    const yoyStr = `${yoy >= 0 ? '+' : ''}${yoy}%`;
    const yoyColor = yoy >= 0 ? '#4caf76' : '#e05252';
    return `
      <div class="map-popup">
        <div class="popup-title">${l.name}</div>
        <div class="popup-price">${price}</div>
        <div class="popup-meta">${l.type} · ${l.sqft ? l.sqft.toLocaleString() + ' sqft' : 'Land'} · <span style="color:${yoyColor}">${yoyStr} YoY</span></div>
        <div class="popup-score-row">
          <span style="font-size:10px;color:#6a6a82;min-width:68px;">Value score</span>
          <div class="popup-score-bar"><div class="popup-score-fill" style="width:${l.valueScore}%"></div></div>
          <span class="popup-score-label">${l.valueScore}</span>
        </div>
        <button class="popup-btn" onclick="window.MarketMap._selectById('${l.id}')">
          View full details →
        </button>
      </div>`;
  }

  /* ── Render listings ── */
  function renderListings(listings) {
    allListings = listings;
    clearLayers();

    if (currentMode === 'clusters') {
      renderClusters(listings);
    } else if (currentMode === 'heatmap') {
      renderHeatmap(listings);
    } else {
      renderMarkers(listings);
    }
  }

  function clearLayers() {
    markersLayer.clearLayers();
    clusterLayer.clearLayers();
    if (map.hasLayer(clusterLayer)) map.removeLayer(clusterLayer);
    removeHeatLayer();
  }

  function renderMarkers(listings) {
    listings.forEach(l => {
      const marker = L.marker([l.lat, l.lng], { icon: createMarkerIcon(l) });
      marker.bindPopup(buildPopupHTML(l), { maxWidth: 220, className: 'sa-popup' });
      marker.on('click', () => {
        selectedId = l.id;
        if (onSelectCallback) onSelectCallback(l);
        // Refresh icon to show selection ring
        renderListings(allListings);
      });
      markersLayer.addLayer(marker);
    });
  }

  function renderClusters(listings) {
    listings.forEach(l => {
      const marker = L.marker([l.lat, l.lng], { icon: createMarkerIcon(l) });
      marker.bindPopup(buildPopupHTML(l), { maxWidth: 220 });
      marker.on('click', () => {
        selectedId = l.id;
        if (onSelectCallback) onSelectCallback(l);
      });
      clusterLayer.addLayer(marker);
    });
    map.addLayer(clusterLayer);
  }

  function renderHeatmap(listings) {
    removeHeatLayer();
    // Lightweight canvas heatmap (no external lib needed)
    const canvas = document.createElement('canvas');
    canvas.className = 'heat-canvas';
    const mapPane = document.getElementById('market-map');
    if (mapPane) mapPane.appendChild(canvas);

    const updateHeat = () => {
      const size = mapPane.getBoundingClientRect();
      canvas.width = size.width;
      canvas.height = size.height;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const maxPrice = Math.max(...listings.map(l => l.price));
      listings.forEach(l => {
        const pt = map.latLngToContainerPoint([l.lat, l.lng]);
        const intensity = l.price / maxPrice;
        const r = 30 + intensity * 30;
        const grad = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, r);
        const alpha = 0.1 + intensity * 0.3;
        grad.addColorStop(0, `rgba(232,201,126,${alpha})`);
        grad.addColorStop(0.5, `rgba(200,100,50,${alpha * 0.5})`);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
        ctx.fill();
      });
    };

    updateHeat();
    map.on('move zoom', updateHeat);
    heatLayer = { canvas, updateHeat };

    // Also render regular markers on top
    renderMarkers(listings);
  }

  function removeHeatLayer() {
    if (heatLayer) {
      if (heatLayer.canvas && heatLayer.canvas.parentNode) {
        heatLayer.canvas.parentNode.removeChild(heatLayer.canvas);
      }
      map.off('move zoom', heatLayer.updateHeat);
      heatLayer = null;
    }
  }

  function setMode(mode) {
    currentMode = mode;
    renderListings(allListings);
  }

  function onSelect(cb) { onSelectCallback = cb; }
  function onMoveEnd(cb) { onMoveEndCallback = cb; }

  // Called from popup button
  function _selectById(id) {
    const listing = allListings.find(l => l.id === id);
    if (listing) {
      selectedId = id;
      if (onSelectCallback) onSelectCallback(listing);
    }
  }

  return { init, renderListings, setMode, flyTo, getBounds, getCenter, onSelect, onMoveEnd, _selectById };
})();