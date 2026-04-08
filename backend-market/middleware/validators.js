/**
 * middleware/validators.js
 */
function validateBounds(req, res, next) {
  const { north, south, east, west } = req.query;
  const vals = [north, south, east, west].map(parseFloat);
  if (vals.some(isNaN)) return res.status(400).json({ error: 'north, south, east, west query params required' });
  const [n, s, e, w] = vals;
  if (n < s) return res.status(400).json({ error: 'north must be > south' });
  if (n - s > 90 || e - w > 180) return res.status(400).json({ error: 'Bounding box too large. Zoom in.' });
  next();
}

module.exports = { validateBounds };