/**
 * controllers/listingController.js
 * Fetches real estate listings from:
 *   1. RapidAPI / Realty-in-US (primary, requires API key)
 *   2. OpenStreetMap Overpass (free, building + land data)
 *   3. Simulated engine (fallback — realistic, no key needed)
 *
 * The controller normalises all sources to a single schema.
 */

const marketService = require('../services/marketService');

/**
 * GET /api/market/listings
 * Query params: north, south, east, west, priceMin, priceMax,
 *               type, scoreMin, hasElectricity, nearCity,
 *               hasTransport, hasSchools, lowFloodRisk, page, limit
 */
async function getListings(req, res, next) {
  try {
    const bounds = {
      north: parseFloat(req.query.north),
      south: parseFloat(req.query.south),
      east:  parseFloat(req.query.east),
      west:  parseFloat(req.query.west),
    };

    const filters = {
      priceMin:       req.query.priceMin ? parseInt(req.query.priceMin) : 0,
      priceMax:       req.query.priceMax ? parseInt(req.query.priceMax) : Infinity,
      type:           req.query.type || 'all',
      scoreMin:       req.query.scoreMin ? parseInt(req.query.scoreMin) : 0,
      hasElectricity: req.query.hasElectricity === 'true',
      nearCity:       req.query.nearCity === 'true',
      hasTransport:   req.query.hasTransport === 'true',
      hasSchools:     req.query.hasSchools === 'true',
      lowFloodRisk:   req.query.lowFloodRisk === 'true',
    };

    const page  = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 80, 200);

    const result = await marketService.fetchListings(bounds, filters, page, limit);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/market/listings/:id
 */
async function getListingById(req, res, next) {
  try {
    const listing = await marketService.fetchListingById(req.params.id);
    if (!listing) return res.status(404).json({ error: 'Listing not found' });
    res.json(listing);
  } catch (err) {
    next(err);
  }
}

module.exports = { getListings, getListingById };