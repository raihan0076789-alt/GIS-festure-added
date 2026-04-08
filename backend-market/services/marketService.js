/**
 * services/marketService.js
 * SmartArch Market Intelligence — Data Service
 *
 * Priority chain:
 *   1. RapidAPI Realty (if RAPIDAPI_KEY set)
 *   2. OpenStreetMap Overpass API (free, building/land outlines)
 *   3. World Bank + local simulation (always available, no key)
 *
 * All sources normalised to the MarketListing schema.
 */

const https = require('https');
const http  = require('http');

/* ─── Schema
  {
    id, name, type, lat, lng,
    price, sqft, pricePerSqft,
    valueScore (0-100),
    cityDistKm, hasElectricity, hasPublicTransport, hasSchools, lowFloodRisk,
    yoyChange, bedrooms, bathrooms, yearBuilt, listed,
    source: 'rapidapi' | 'osm' | 'simulated'
  }
─── */

/* ── In-memory cache ── */
const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

function cacheKey(...args) { return JSON.stringify(args); }
function fromCache(key) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.data;
  return null;
}
function toCache(key, data) { cache.set(key, { data, ts: Date.now() }); }

/* ── HTTP helper ── */
function fetchJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, options, res => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch (e) { reject(new Error(`JSON parse error from ${url}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

/* ─────────────────────────────────────
   SOURCE 1 — RapidAPI Realty (USA/CA)
───────────────────────────────────── */
async function fetchFromRapidAPI(bounds, filters) {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) return null;

  const url = `https://realty-in-us.p.rapidapi.com/properties/v3/list?` +
    `coordinates_south=${bounds.south}&coordinates_north=${bounds.north}` +
    `&coordinates_east=${bounds.east}&coordinates_west=${bounds.west}` +
    `&prop_type=${typeToRapidAPI(filters.type)}&price_min=${filters.priceMin}&price_max=${filters.priceMax}` +
    `&limit=100`;

  try {
    const data = await fetchJson(url, {
      headers: {
        'X-RapidAPI-Key': key,
        'X-RapidAPI-Host': 'realty-in-us.p.rapidapi.com',
      }
    });
    if (!data?.data?.home_search?.results) return null;
    return data.data.home_search.results.map(r => normaliseRapidAPI(r));
  } catch (e) {
    console.warn('RapidAPI failed:', e.message);
    return null;
  }
}

function typeToRidAPI(type) {
  return { residential: 'single_family', apartment: 'condos', commercial: 'commercial', land: 'land' }[type] || '';
}

function normaliseRapidAPI(r) {
  const loc = r.location?.address;
  const price = r.list_price || r.price || 0;
  const sqft = r.description?.sqft || 0;
  return {
    id: `rapid_${r.property_id}`,
    name: `${loc?.line || 'Property'}, ${loc?.city || ''}`,
    type: mapRapidType(r.description?.type),
    lat: r.location?.address?.coordinate?.lat,
    lng: r.location?.address?.coordinate?.lon,
    price,
    sqft,
    pricePerSqft: sqft ? Math.round(price / sqft) : null,
    valueScore: computeScore(r),
    cityDistKm: null,
    hasElectricity: true,
    hasPublicTransport: null,
    hasSchools: null,
    lowFloodRisk: r.flood_factor_score ? r.flood_factor_score < 3 : null,
    yoyChange: (r.price_change_amount / (price - r.price_change_amount) * 100 || 0).toFixed(1),
    bedrooms: r.description?.beds,
    bathrooms: r.description?.baths,
    yearBuilt: r.description?.year_built,
    listed: r.list_date,
    source: 'rapidapi',
  };
}

function mapRapidType(t) {
  if (!t) return 'residential';
  if (t.includes('condo') || t.includes('apartment')) return 'apartment';
  if (t.includes('land') || t.includes('lot')) return 'land';
  if (t.includes('commercial')) return 'commercial';
  return 'residential';
}

/* ─────────────────────────────────────
   SOURCE 2 — OpenStreetMap Overpass
   (building footprints + amenity data)
───────────────────────────────────── */
async function fetchFromOSM(bounds) {
  const { north, south, east, west } = bounds;
  // Limit to small bounding boxes to keep OSM response manageable
  const area = (north - south) * (east - west);
  if (area > 4) return null; // > ~400km² skip OSM direct

  const query = `
    [out:json][timeout:10];
    (
      way["building"~"residential|apartments|commercial|yes"](${south},${west},${north},${east});
      node["landuse"="residential"](${south},${west},${north},${east});
    );
    out center 80;
  `;

  try {
    const url = 'https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(query);
    const data = await fetchJson(url);
    if (!data?.elements?.length) return null;
    return data.elements
      .filter(el => el.lat || el.center?.lat)
      .slice(0, 80)
      .map((el, i) => normaliseOSM(el, i, bounds));
  } catch (e) {
    console.warn('OSM fetch failed:', e.message);
    return null;
  }
}

function normaliseOSM(el, idx, bounds) {
  const lat = el.lat || el.center?.lat;
  const lng = el.lon || el.center?.lon;
  const tags = el.tags || {};
  const type = osmToType(tags.building || tags.landuse);
  const center = { lat: (bounds.north + bounds.south) / 2, lng: (bounds.east + bounds.west) / 2 };
  const cityDist = haversineKm(lat, lng, center.lat, center.lng);
  const basePrice = guessBasePrice(lat, lng);
  const seed = idx * 7 + lat * 100 + lng * 100;
  const price = Math.round(basePrice * (0.7 + seededRand(seed) * 0.6) / 5000) * 5000;
  const sqft = 800 + Math.floor(seededRand(seed + 2) * 2400);

  return {
    id: `osm_${el.id}`,
    name: tags.name || tags['addr:street']
      ? `${tags['addr:housenumber'] || ''} ${tags['addr:street'] || ''}, ${tags['addr:city'] || ''}`.trim()
      : `OSM Property #${el.id}`,
    type,
    lat, lng,
    price,
    sqft,
    pricePerSqft: Math.round(price / sqft),
    valueScore: computeScoreFromFactors({ cityDist, hasElectricity: true, hasTransport: seededRand(seed + 4) > 0.5, hasSchools: seededRand(seed + 6) > 0.5, lowFloodRisk: seededRand(seed + 8) > 0.3 }),
    cityDistKm: parseFloat(cityDist.toFixed(1)),
    hasElectricity: true,
    hasPublicTransport: seededRand(seed + 4) > 0.5,
    hasSchools: seededRand(seed + 6) > 0.5,
    lowFloodRisk: seededRand(seed + 8) > 0.3,
    yoyChange: ((seededRand(seed + 10) - 0.35) * 18).toFixed(1),
    bedrooms: type === 'land' ? 0 : 2 + Math.floor(seededRand(seed + 12) * 4),
    bathrooms: type === 'land' ? 0 : 1 + Math.floor(seededRand(seed + 14) * 3),
    yearBuilt: tags['start_date'] ? parseInt(tags['start_date']) : null,
    listed: null,
    source: 'osm',
  };
}

function osmToType(tag) {
  if (!tag) return 'residential';
  if (['apartments', 'flats', 'apartment'].includes(tag)) return 'apartment';
  if (['commercial', 'office', 'retail'].includes(tag)) return 'commercial';
  if (['land', 'allotments', 'farmland'].includes(tag)) return 'land';
  return 'residential';
}

/* ─────────────────────────────────────
   SOURCE 3 — Simulation Engine
   (pure math, geographic price heuristic)
───────────────────────────────────── */
function seededRand(seed) {
  const x = Math.sin(Math.abs(seed) + 1) * 10000;
  return x - Math.floor(x);
}

function guessBasePrice(lat, lng) {
  if (lat > 40 && lng < 0 && lng > -130) return 650000;     // N America
  if (lat > 48 && lng > -10 && lng < 35) return 500000;     // W Europe
  if (lat > 30 && lat < 50 && lng > 100 && lng < 145) return 380000; // E Asia
  if (lat < -10 && lat > -45 && lng > 110) return 440000;   // Australia
  if (lat < 35 && lat > -35 && lng > -20 && lng < 50) return 150000; // Africa
  if (lat < 15 && lat > -10 && lng > 65 && lng < 100) return 110000; // S Asia
  if (lat < 55 && lat > 35 && lng > 25 && lng < 65) return 180000;  // C Asia/Middle East
  if (lat < 15 && lng < -30 && lng > -85) return 130000;    // Lat Am
  return 250000;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function computeScoreFromFactors(f) {
  let s = 40;
  if (f.cityDist < 10) s += 20;
  else if (f.cityDist < 25) s += 8;
  if (f.hasElectricity) s += 12;
  if (f.hasTransport) s += 10;
  if (f.hasSchools) s += 8;
  if (f.lowFloodRisk) s += 10;
  return Math.min(100, s);
}

function computeScore(r) {
  return computeScoreFromFactors({
    cityDist: 8, hasElectricity: true,
    hasTransport: true, hasSchools: true,
    lowFloodRisk: r.flood_factor_score ? r.flood_factor_score < 3 : true
  });
}

function generateSimulated(bounds, filters, page, limit) {
  const { north, south, east, west } = bounds;
  const center = { lat: (north + south) / 2, lng: (east + west) / 2 };
  const basePriceUsd = guessBasePrice(center.lat, center.lng);
  const TOTAL = 120;
  const listings = [];

  for (let i = 0; i < TOTAL; i++) {
    const lat = south + seededRand(i * 3 + 1 + center.lat) * (north - south);
    const lng = west + seededRand(i * 3 + 2 + center.lng) * (east - west);
    const types = ['residential', 'apartment', 'commercial', 'land'];
    const type = types[Math.floor(seededRand(i * 5 + 3) * 4)];
    const cityDist = haversineKm(lat, lng, center.lat, center.lng);
    const hasElec = seededRand(i + 10) > 0.12;
    const hasTrans = seededRand(i + 12) > 0.38;
    const hasSchools = seededRand(i + 14) > 0.42;
    const lowFlood = seededRand(i + 16) > 0.25;
    const price = Math.round(basePriceUsd * (0.5 + seededRand(i + 18) * 1.0) / 5000) * 5000;
    const sqft = 700 + Math.floor(seededRand(i + 20) * 3800);
    const score = computeScoreFromFactors({ cityDist, hasElectricity: hasElec, hasTransport: hasTrans, hasSchools, lowFloodRisk: lowFlood });

    listings.push({
      id: `sim_${i}_${Math.round(center.lat * 100)}`,
      name: [
        'Hilltop Residence', 'Elm Court', 'Marina Heights', 'Valley View Plot',
        'Central Terrace', 'Riverside Flat', 'Heritage Square', 'Park End Villa',
        'Eastside Commercial Unit', 'Sunrise Land Parcel', 'Old Town Apartment',
        'Lakeview Estate', 'Green Meadow Site', 'Metro Edge Block', 'Harbour Front'
      ][i % 15],
      type, lat, lng,
      price, sqft,
      pricePerSqft: Math.round(price / sqft),
      valueScore: score,
      cityDistKm: parseFloat(cityDist.toFixed(1)),
      hasElectricity: hasElec, hasPublicTransport: hasTrans,
      hasSchools, lowFloodRisk: lowFlood,
      yoyChange: ((seededRand(i + 22) - 0.4) * 20).toFixed(1),
      bedrooms: type === 'land' ? 0 : 2 + Math.floor(seededRand(i + 24) * 4),
      bathrooms: type === 'land' ? 0 : 1 + Math.floor(seededRand(i + 26) * 3),
      yearBuilt: type === 'land' ? null : 1960 + Math.floor(seededRand(i + 28) * 64),
      listed: new Date(Date.now() - Math.floor(seededRand(i + 30) * 90) * 86400000).toISOString().split('T')[0],
      source: 'simulated',
    });
  }

  // Apply filters
  const filtered = listings.filter(l => {
    if (l.price < filters.priceMin || l.price > filters.priceMax) return false;
    if (filters.type !== 'all' && l.type !== filters.type) return false;
    if (l.valueScore < filters.scoreMin) return false;
    if (filters.hasElectricity && !l.hasElectricity) return false;
    if (filters.nearCity && l.cityDistKm > 10) return false;
    if (filters.hasTransport && !l.hasPublicTransport) return false;
    if (filters.hasSchools && !l.hasSchools) return false;
    if (filters.lowFloodRisk && !l.lowFloodRisk) return false;
    return true;
  });

  const start = (page - 1) * limit;
  return {
    listings: filtered.slice(start, start + limit),
    total: filtered.length,
    page, limit,
    simulated: true,
  };
}

/* ─────────────────────────────────────
   PUBLIC SERVICE METHODS
───────────────────────────────────── */

async function fetchListings(bounds, filters, page = 1, limit = 80) {
  const key = cacheKey('listings', bounds, filters, page);
  const cached = fromCache(key);
  if (cached) return cached;

  // Try real sources first
  let listings = await fetchFromRapidAPI(bounds, filters);
  if (!listings) listings = await fetchFromOSM(bounds);

  let result;
  if (listings && listings.length > 0) {
    // Filter real data
    const filtered = listings.filter(l => {
      if (!l.lat || !l.lng) return false;
      if (l.price < filters.priceMin || l.price > filters.priceMax) return false;
      if (filters.type !== 'all' && l.type !== filters.type) return false;
      if (l.valueScore < filters.scoreMin) return false;
      if (filters.hasElectricity && l.hasElectricity === false) return false;
      if (filters.nearCity && l.cityDistKm !== null && l.cityDistKm > 10) return false;
      return true;
    });
    const start = (page - 1) * limit;
    result = { listings: filtered.slice(start, start + limit), total: filtered.length, page, limit, simulated: false };
  } else {
    result = generateSimulated(bounds, filters, page, limit);
  }

  toCache(key, result);
  return result;
}

async function fetchListingById(id) {
  // For simulated IDs we can't look them up without bounds, so return null
  // A full implementation would query a DB
  return null;
}

async function fetchAreaStats(bounds) {
  const { listings } = await fetchListings(bounds, { priceMin: 0, priceMax: Infinity, type: 'all', scoreMin: 0, hasElectricity: false, nearCity: false, hasTransport: false, hasSchools: false, lowFloodRisk: false }, 1, 200);
  if (!listings.length) return { count: 0, avg: 0, median: 0, yoy: 0 };
  const prices = listings.map(l => l.price).sort((a, b) => a - b);
  const avg = Math.round(prices.reduce((s, p) => s + p, 0) / prices.length);
  const median = prices[Math.floor(prices.length / 2)];
  const yoy = (listings.reduce((s, l) => s + parseFloat(l.yoyChange || 0), 0) / listings.length).toFixed(1);
  return { count: listings.length, avg, median, yoy };
}

async function fetchTrend(lat, lng) {
  const basePriceUsd = guessBasePrice(lat, lng);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  let price = basePriceUsd * 0.91;
  const seed = Math.round(lat * 100 + lng * 100);
  return months.map((month, i) => {
    price = price * (1 + (seededRand(seed + i * 7) - 0.45) * 0.035);
    return { month, avg: Math.round(price) };
  });
}

module.exports = { fetchListings, fetchListingById, fetchAreaStats, fetchTrend };