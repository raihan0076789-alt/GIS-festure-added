/**
 * routes/statsRoutes.js
 * GET /api/market/stats/area  — aggregate stats for a bounding box
 * GET /api/market/stats/trend — 12-month price trend for a lat/lng
 */

const express = require('express');
const router = express.Router();
const { getAreaStats, getTrend } = require('../controllers/statsController');

router.get('/area', getAreaStats);
router.get('/trend', getTrend);

module.exports = router;