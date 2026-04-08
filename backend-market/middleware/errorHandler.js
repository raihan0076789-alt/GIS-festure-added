/**
 * middleware/errorHandler.js
 */
function errorHandler(err, req, res, next) {
  console.error('[backend-market]', err.message);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

module.exports = { errorHandler };