/**
 * controllers/statsController.js
 */

const marketService = require('../services/marketService');

async function getAreaStats(req, res, next) {
  try {
    const bounds = {
      north: parseFloat(req.query.north),
      south: parseFloat(req.query.south),
      east:  parseFloat(req.query.east),
      west:  parseFloat(req.query.west),
    };
    if (Object.values(bounds).some(isNaN))
      return res.status(400).json({ error: 'Invalid bounds parameters' });

    const stats = await marketService.fetchAreaStats(bounds);
    res.json(stats);
  } catch (err) { next(err); }
}

async function getTrend(req, res, next) {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    if (isNaN(lat) || isNaN(lng))
      return res.status(400).json({ error: 'lat and lng required' });

    const trend = await marketService.fetchTrend(lat, lng);
    res.json(trend);
  } catch (err) { next(err); }
}

module.exports = { getAreaStats, getTrend };