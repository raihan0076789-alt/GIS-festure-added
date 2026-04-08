/**
 * backend-market/server.js
 * SmartArch Market Intelligence Plugin — Express Server
 * Runs on port 4000 alongside existing backend-main (3000) and backend-ai (5000)
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');

const listingRoutes = require('./routes/listingRoutes');
const statsRoutes = require('./routes/statsRoutes');
const { errorHandler } = require('./middleware/errorHandler');
const { verifyToken } = require('./middleware/auth');

const app = express();
const PORT = process.env.MARKET_PORT || 4000;

/* ── Security & parsing ── */
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

/* ── Rate limiting ── */
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { error: 'Too many requests, please slow down.' },
}));

/* ── Health check (no auth) ── */
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'backend-market', ts: new Date().toISOString() }));

/* ── Routes (optional auth — market data is semi-public) ── */
app.use('/api/market/listings', optionalAuth, listingRoutes);
app.use('/api/market/stats', optionalAuth, statsRoutes);

/* ── 404 ── */
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

/* ── Error handler ── */
app.use(errorHandler);

/* ── Start ── */
app.listen(PORT, () => {
  console.log(`✅  backend-market running on http://localhost:${PORT}`);
  console.log(`    Health: http://localhost:${PORT}/health`);
});

module.exports = app;

/* Optional auth — allows unauthenticated but enriches if token present */
function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return next();
  verifyToken(req, res, next);
}