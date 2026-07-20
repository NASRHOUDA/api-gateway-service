require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { createProxyMiddleware } = require('http-proxy-middleware');
const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300 });
app.use(limiter);
app.get('/health', (req, res) => {
  res.json({ status: 'ok', gateway: 'up' });
});
app.use('/api/auth', createProxyMiddleware({
  target: process.env.AUTH_SERVICE_URL,
  changeOrigin: true,
}));
app.use('/api/users', createProxyMiddleware({
  target: process.env.USER_SERVICE_URL,
  changeOrigin: true,
}));
app.use('/api/tasks', createProxyMiddleware({
  target: process.env.TASK_SERVICE_URL,
  changeOrigin: true,
}));
app.use('/api/notifications', createProxyMiddleware({
  target: process.env.NOTIFICATION_SERVICE_URL,
  changeOrigin: true,
}));
function requireInternalKey(req, res, next) {
  const key = req.headers['x-internal-api-key'];
  if (!key || key !== process.env.INTERNAL_API_KEY) {
    return res.status(403).json({ error: 'Forbidden: invalid or missing internal API key' });
  }
  next();
}
app.use('/internal/tasks', requireInternalKey, createProxyMiddleware({
  target: process.env.TASK_SERVICE_URL,
  changeOrigin: true,
}));
app.use('/internal/users', requireInternalKey, createProxyMiddleware({
  target: process.env.USER_SERVICE_URL,
  changeOrigin: true,
}));
app.use('/', createProxyMiddleware({
  target: process.env.FRONTEND_SERVICE_URL,
  changeOrigin: true,
}));
const PORT = process.env.PORT || 5000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚪 API Gateway démarré sur le port ${PORT}`);
  });
}
module.exports = app;
