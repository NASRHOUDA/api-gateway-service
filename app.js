require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { createProxyMiddleware } = require('http-proxy-middleware');
const logger = require('./utils/logger');
const app = express();
const client = require('prom-client');
client.collectDefaultMetrics({ timeout: 5000 });
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5]
});
app.use((req, res, next) => {
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    end({ method: req.method, route: req.path, status_code: res.statusCode });
  });
  next();
});
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300 });
app.use(limiter);
app.get('/health', (req, res) => {
  res.json({ status: 'ok', gateway: 'up' });
});
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

function proxyErrorHandler(serviceName) {
  return (err, req, res) => {
    logger.error(`Proxy error: ${serviceName} unreachable`, {
      route: req.path,
      method: req.method,
      error: err.message,
    });
    if (!res.headersSent) {
      res.status(502).json({ error: `Bad Gateway: ${serviceName} unreachable` });
    }
  };
}

app.use('/api/auth', createProxyMiddleware({
  target: process.env.AUTH_SERVICE_URL,
  changeOrigin: true,
  onError: proxyErrorHandler('auth-service'),
}));
app.use('/api/users', createProxyMiddleware({
  target: process.env.USER_SERVICE_URL,
  changeOrigin: true,
  onError: proxyErrorHandler('user-service'),
}));
app.use('/api/tasks', createProxyMiddleware({
  target: process.env.TASK_SERVICE_URL,
  changeOrigin: true,
  onError: proxyErrorHandler('task-service'),
}));
app.use('/api/notifications', createProxyMiddleware({
  target: process.env.NOTIFICATION_SERVICE_URL,
  changeOrigin: true,
  onError: proxyErrorHandler('notification-service'),
}));
function requireInternalKey(req, res, next) {
  const key = req.headers['x-internal-api-key'];
  if (!key || key !== process.env.INTERNAL_API_KEY) {
    logger.warn('Forbidden: invalid or missing internal API key', { route: req.path, method: req.method });
    return res.status(403).json({ error: 'Forbidden: invalid or missing internal API key' });
  }
  next();
}
app.use('/internal/tasks', requireInternalKey, createProxyMiddleware({
  target: process.env.TASK_SERVICE_URL,
  changeOrigin: true,
  onError: proxyErrorHandler('task-service'),
}));
app.use('/internal/users', requireInternalKey, createProxyMiddleware({
  target: process.env.USER_SERVICE_URL,
  changeOrigin: true,
  onError: proxyErrorHandler('user-service'),
}));
app.use('/', createProxyMiddleware({
  target: process.env.FRONTEND_SERVICE_URL,
  changeOrigin: true,
  onError: proxyErrorHandler('frontend-service'),
}));
const PORT = process.env.PORT || 5000;
if (require.main === module) {
  app.listen(PORT, () => {
    logger.info(`API Gateway démarré sur le port ${PORT}`);
  });
}
module.exports = app;
