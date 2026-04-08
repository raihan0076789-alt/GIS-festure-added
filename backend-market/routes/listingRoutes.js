/**
 * routes/listingRoutes.js
 * GET /api/market/listings        — paginated geo-filtered listings
 * GET /api/market/listings/:id    — single listing detail
 */

const express = require('express');
const router = express.Router();
const { getListings, getListingById } = require('../controllers/listingController');
const { validateBounds } = require('../middleware/validators');

router.get('/', validateBounds, getListings);
router.get('/:id', getListingById);

module.exports = router;