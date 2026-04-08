/**
 * market-api.js
 * SmartArch Market Intelligence Plugin — API Client
 * Talks to /api/market/* endpoints on backend-market.
 * Falls back to realistic simulated data when offline.
 */

window.MarketAPI = (() => {
  const BASE = window.MARKET_API_BASE || 'http://localhost:4000/api/market';
  const CACHE = {};
  const CACHE_TTL = 5 * 60 * 1000; // 5 min

  /* ── Utility ── */
  function cached(key, fetcher) {
    const now = Date.now();
    if (CACHE[key] && now - CACHE[key].ts < CACHE_TTL) return Promise.resolve(CACHE[key].data);
    return fetcher().then(data => { CACHE[key] = { data, ts: now }; return data; });
  }

  async function get(path, params = {}) {
    const url = new URL(BASE + path);
    Object.entries(params).forEach(([k, v]) => v !== undefined && url.searchParams.set(k, v));
    const token = localStorage.getItem('token');
    const res = await fetch(url.toString(), {
      headers: { 'Authorization': token ? `Bearer ${token}` : '', 'Content-Type': 'application/json' }
    });
    if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
    return res.json();
  }

  /* ─────────────────────────────────────────────
     SIMULATED DATA ENGINE
     Generates realistic, geographically-aware data.
     Used when backend-market is unreachable.
  ───────────────────────────────────────────── */
  const PROPERTY_NAMES = [
    'Sunset Ridge Plot', 'Elm Street Residency', 'Lakefront Villa Site',
    'Greenhill Apartment Block', 'Central Park Terrace', 'Valley View Land',
    'Heritage Commercial Hub', 'Metro Edge Apartment', 'Riverside Cottage',
    'Horizon Development Site', 'Old Town Flat', 'Clearwater Heights',
    'Tech Quarter Office', 'Garden District Residence', 'Westside Family Home'
  ];

  function seededRand(seed) {
    let x = Math.sin(seed + 1) * 10000;
    return x - Math.floor(x);
  }

  function simListing(idx, lat, lng, basePriceUsd) {
    const types = ['residential', 'apartment', 'commercial', 'land'];
    const r = seededRand(idx * 7 + lat * 100 + lng * 100);
    const type = types[Math.floor(r * 4)];
    const cityDist = (seededRand(idx + 11) * 18).toFixed(1);
    const hasElec = seededRand(idx + 3) > 0.15;
    const hasTransport = seededRand(idx + 5) > 0.35;
    const hasSchools = seededRand(idx + 7) > 0.4;
    const floodRisk = seededRand(idx + 9) > 0.7;

    let scoreBase = 50;
    if (parseFloat(cityDist) < 10) scoreBase += 15;
    if (hasElec) scoreBase += 12;
    if (hasTransport) scoreBase += 10;
    if (hasSchools) scoreBase += 8;
    if (!floodRisk) scoreBase += 5;
    scoreBase = Math.min(100, scoreBase + Math.floor(seededRand(idx + 13) * 20));

    const variance = 0.7 + seededRand(idx + 17) * 0.6;
    const price = Math.round(basePriceUsd * variance / 5000) * 5000;
    const sqft = 800 + Math.floor(seededRand(idx + 19) * 3200);

    return {
      id: `sim_${idx}`,
      name: PROPERTY_NAMES[idx % PROPERTY_NAMES.length],
      type,
      lat: lat + (seededRand(idx + 21) - 0.5) * 0.4,
      lng: lng + (seededRand(idx + 23) - 0.5) * 0.6,
      price,
      sqft,
      pricePerSqft: Math.round(price / sqft),
      valueScore: scoreBase,
      cityDistKm: parseFloat(cityDist),
      hasElectricity: hasElec,
      hasPublicTransport: hasTransport,
      hasSchools,
      lowFloodRisk: !floodRisk,
      yoyChange: ((seededRand(idx + 25) - 0.3) * 20).toFixed(1),
      bedrooms: type === 'land' ? 0 : (2 + Math.floor(seededRand(idx + 27) * 4)),
      bathrooms: type === 'land' ? 0 : (1 + Math.floor(seededRand(idx + 29) * 3)),
      yearBuilt: type === 'land' ? null : (1960 + Math.floor(seededRand(idx + 31) * 64)),
      listed: new Date(Date.now() - Math.floor(seededRand(idx + 33) * 90) * 86400000).toISOString().split('T')[0]
    };
  }

  function simListings(bounds, basePriceUsd = 350000, count = 60) {
    const { north, south, east, west } = bounds;
    const centerLat = (north + south) / 2;
    const centerLng = (east + west) / 2;
    const listings = [];
    for (let i = 0; i < count; i++) {
      const lat = south + seededRand(i * 3 + 1) * (north - south);
      const lng = west + seededRand(i * 3 + 2) * (east - west);
      listings.push(simListing(i, lat, lng, basePriceUsd));
    }
    return listings;
  }

  function simTrend(basePriceUsd) {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    let price = basePriceUsd * 0.92;
    return months.map((m, i) => {
      price = price * (1 + (seededRand(i * 7) - 0.45) * 0.03);
      return { month: m, avg: Math.round(price) };
    });
  }

  function simAreaStats(listings) {
    if (!listings.length) return { count: 0, avg: 0, median: 0, yoy: 0 };
    const prices = listings.map(l => l.price).sort((a, b) => a - b);
    const avg = Math.round(prices.reduce((s, p) => s + p, 0) / prices.length);
    const median = prices[Math.floor(prices.length / 2)];
    const yoy = listings.reduce((s, l) => s + parseFloat(l.yoyChange), 0) / listings.length;
    return { count: listings.length, avg, median, yoy: yoy.toFixed(1) };
  }

  /* Base price heuristics by lat/lng quadrant */
  function guessBasePrice(lat, lng) {
    if (lat > 40 && lng < 0) return 650000;      // N America
    if (lat > 48 && lng > -10 && lng < 35) return 480000; // W Europe
    if (lat > 20 && lat < 45 && lng > 100) return 320000; // E Asia
    if (lat < 0 && lng > 110) return 420000;      // Australia
    if (lat < 35 && lat > -35 && lng < 50) return 180000; // Africa/Middle East
    if (lat < 15 && lng > 65 && lng < 100) return 120000; // S Asia
    return 280000;
  }

  /* ─────────────────────────────────────────────
     PUBLIC API
  ───────────────────────────────────────────── */

  async function getListings(bounds, filters = {}) {
    try {
      return await get('/listings', {
        north: bounds.north, south: bounds.south,
        east: bounds.east, west: bounds.west,
        priceMin: filters.priceMin, priceMax: filters.priceMax,
        type: filters.type !== 'all' ? filters.type : undefined,
        scoreMin: filters.scoreMin,
        hasElectricity: filters.hasElectricity || undefined,
        nearCity: filters.nearCity || undefined,
        hasTransport: filters.hasTransport || undefined,
        hasSchools: filters.hasSchools || undefined,
        lowFloodRisk: filters.lowFloodRisk || undefined,
      });
    } catch (e) {
      console.warn('backend-market offline, using simulation:', e.message);
      const basePriceUsd = guessBasePrice(
        (bounds.north + bounds.south) / 2,
        (bounds.east + bounds.west) / 2
      );
      let listings = simListings(bounds, basePriceUsd);
      // Apply filters locally
      listings = listings.filter(l => {
        if (filters.priceMin && l.price < filters.priceMin) return false;
        if (filters.priceMax && l.price > filters.priceMax) return false;
        if (filters.type && filters.type !== 'all' && l.type !== filters.type) return false;
        if (filters.scoreMin && l.valueScore < filters.scoreMin) return false;
        if (filters.hasElectricity && !l.hasElectricity) return false;
        if (filters.nearCity && l.cityDistKm > 10) return false;
        if (filters.hasTransport && !l.hasPublicTransport) return false;
        if (filters.hasSchools && !l.hasSchools) return false;
        if (filters.lowFloodRisk && !l.lowFloodRisk) return false;
        return true;
      });
      return { listings, simulated: true };
    }
  }

  async function getListing(id) {
    try {
      return await get(`/listings/${id}`);
    } catch {
      return null;
    }
  }

  async function getAreaStats(bounds) {
    try {
      return await get('/stats/area', bounds);
    } catch {
      const basePriceUsd = guessBasePrice(
        (bounds.north + bounds.south) / 2,
        (bounds.east + bounds.west) / 2
      );
      const listings = simListings(bounds, basePriceUsd, 80);
      return simAreaStats(listings);
    }
  }

  async function getTrend(lat, lng) {
    try {
      return await get('/stats/trend', { lat, lng });
    } catch {
      const basePriceUsd = guessBasePrice(lat, lng);
      return simTrend(basePriceUsd);
    }
  }

  async function geocode(query) {
    // Use Nominatim (free, no key needed)
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5`;
    try {
      const res = await fetch(url, { headers: { 'Accept-Language': 'en', 'User-Agent': 'SmartArch/1.0' } });
      const data = await res.json();
      return data.map(d => ({
        display: d.display_name.split(',').slice(0, 3).join(', '),
        lat: parseFloat(d.lat),
        lng: parseFloat(d.lon)
      }));
    } catch { return []; }
  }

  async function saveToFavourites(listing) {
    const saved = JSON.parse(localStorage.getItem('market_favourites') || '[]');
    if (!saved.find(s => s.id === listing.id)) {
      saved.push({ ...listing, savedAt: Date.now() });
      localStorage.setItem('market_favourites', JSON.stringify(saved));
    }
    return saved;
  }

  return { getListings, getListing, getAreaStats, getTrend, geocode, saveToFavourites, simAreaStats };
})();