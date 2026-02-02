require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

// Import routes
const apiRoutes = require('./routes/api');
const agentRoutes = require('./routes/agents');
const webhookRoutes = require('./routes/webhooks');
const chatRoutes = require('./routes/chat');
const shopifyAuthRoutes = require('./routes/shopify-auth');
const shopifyAnalyticsRoutes = require('./routes/shopify-analytics');
const metaRoutes = require('./routes/meta');

// Import services
const statsPreloader = require('./services/stats-preloader');
const { cache } = require('./services/cache');
const { connect: connectDB, disconnect: disconnectDB, healthCheck: dbHealthCheck } = require('./services/database');
const shopifySync = require('./services/shopify-sync');
const { runAllAgents, getAgentStatus } = require('./agents');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
// Configure helmet to allow scripts from same origin
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"]
    }
  }
}));
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

// Health check endpoint (for Railway)
app.get('/health', async (req, res) => {
  const dbStatus = await dbHealthCheck();
  const agentStatus = await getAgentStatus().catch(() => ({}));
  const syncStatus = await shopifySync.getStatus().catch(() => ({}));

  res.json({
    status: dbStatus.status === 'healthy' ? 'ok' : 'degraded',
    service: 'asif-cosmetics-hub',
    timestamp: new Date().toISOString(),
    database: dbStatus,
    preloader: statsPreloader.getStatus(),
    cache: cache.getStats(),
    sync: syncStatus,
    agents: agentStatus
  });
});

// ==========================================
// OAUTH ROUTES - Direct routes for getting new access token
// ==========================================
const axios = require('axios');

app.get('/api/shopify/auth/start', (req, res) => {
  const shop = 'asif-cosmetics.myshopify.com';
  const clientId = '4669eaf94832ba48190302d0fef50aba';
  const scopes = 'read_all_orders,read_orders,read_customers,read_products,read_inventory,read_discounts,read_price_rules,read_analytics';
  const redirectUri = 'https://asif-cosmetics-hub-production.up.railway.app/api/shopify/callback';
  const state = 'asif_' + Date.now();

  const authUrl = `https://${shop}/admin/oauth/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;

  console.log('[OAuth] Redirecting to:', authUrl);
  res.redirect(authUrl);
});

app.get('/api/shopify/callback', async (req, res) => {
  const { code, state, error } = req.query;

  console.log('[OAuth] Callback received:', { code: !!code, state, error });

  if (error) {
    return res.send(`<html><body style="font-family:Arial;padding:50px;"><h1>Error</h1><p>${error}</p></body></html>`);
  }

  if (!code) {
    return res.send(`<html><body style="font-family:Arial;padding:50px;"><h1>Error</h1><p>No code received</p></body></html>`);
  }

  try {
    const response = await axios.post('https://asif-cosmetics.myshopify.com/admin/oauth/access_token', {
      client_id: '4669eaf94832ba48190302d0fef50aba',
      client_secret: process.env.SHOPIFY_CLIENT_SECRET,
      code: code
    });

    const accessToken = response.data.access_token;
    const scope = response.data.scope;

    console.log('[OAuth] SUCCESS! Got access token. Scopes:', scope);

    res.send(`
      <html>
        <head>
          <title>OAuth Success</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 50px; background: #1a1a2e; color: #fff; text-align: center; }
            .success { color: #4CAF50; }
            textarea { width: 100%; height: 100px; font-size: 14px; padding: 10px; margin: 20px 0; }
            .scopes { background: #2d2d44; padding: 15px; border-radius: 8px; margin: 20px 0; text-align: left; }
            button { background: #d4a853; color: #000; border: none; padding: 15px 30px; font-size: 16px; cursor: pointer; border-radius: 5px; }
          </style>
        </head>
        <body>
          <h1 class="success">Success! 🎉</h1>
          <p>Your new access token:</p>
          <textarea id="token" readonly>${accessToken}</textarea>
          <button onclick="navigator.clipboard.writeText(document.getElementById('token').value); alert('Copied!');">Copy Token</button>
          <div class="scopes">
            <strong>Granted Scopes:</strong><br>
            ${scope}
          </div>
          <p>Copy this token and add it to Railway as <strong>SHOPIFY_ACCESS_TOKEN</strong></p>
        </body>
      </html>
    `);

  } catch (err) {
    console.error('[OAuth] Error:', err.response?.data || err.message);
    res.send(`
      <html>
        <body style="font-family:Arial;padding:50px;background:#1a1a2e;color:#fff;">
          <h1 style="color:#ff4444;">Error</h1>
          <p>${err.response?.data?.error_description || err.response?.data?.error || err.message}</p>
          <p>Make sure SHOPIFY_CLIENT_SECRET is set in Railway environment variables.</p>
          <a href="/api/shopify/auth/start" style="color:#d4a853;">Try Again</a>
        </body>
      </html>
    `);
  }
});

// ==========================================
// API Routes
// ==========================================
app.use('/api', apiRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/shopify', shopifyAuthRoutes);
app.use('/api/shopify', shopifyAnalyticsRoutes);
app.use('/api/meta', metaRoutes);
app.use('/agents', agentRoutes);
app.use('/webhooks', webhookRoutes);

// Root endpoint - serve dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// API info endpoint
app.get('/api-info', (req, res) => {
  res.json({
    name: 'Asif Cosmetics Hub',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      api: '/api',
      chat: '/api/chat',
      agents: '/agents',
      webhooks: '/webhooks'
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(err.status || 500).json({
    error: true,
    message: err.message || 'Internal server error'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: true, message: 'Route not found' });
});

// Start server
app.listen(PORT, async () => {
  console.log(`
  ========================================
    Asif Cosmetics Hub - Running!
  ========================================
    Port: ${PORT}
    Environment: ${process.env.NODE_ENV || 'development'}

    Endpoints:
    - Health: http://localhost:${PORT}/health
    - API: http://localhost:${PORT}/api
    - Agents: http://localhost:${PORT}/agents
  ========================================
  `);

  // Connect to PostgreSQL database
  if (process.env.DATABASE_URL) {
    console.log('[Server] Connecting to database...');
    const dbConnected = await connectDB();
    if (dbConnected) {
      console.log('[Server] Database connected successfully');

      // Start Shopify sync (every 60 minutes)
      if (process.env.SHOPIFY_STORE_URL && process.env.SHOPIFY_ACCESS_TOKEN) {
        shopifySync.startAutoSync(60);
      }

      // Run agents on schedule (every 60 minutes)
      setInterval(() => {
        runAllAgents().catch(err => {
          console.error('[Server] Agent run failed:', err.message);
        });
      }, 60 * 60 * 1000);

    } else {
      console.warn('[Server] Database connection failed - running in limited mode');
    }
  } else {
    console.log('[Server] DATABASE_URL not configured - skipping database');
  }

  // Pre-load stats in background (don't block server start)
  if (process.env.SHOPIFY_STORE_URL && process.env.SHOPIFY_ACCESS_TOKEN) {
    console.log('[Server] Starting stats preloader...');
    statsPreloader.initialize().then(status => {
      console.log('[Server] Stats preloader ready:', status);
    }).catch(err => {
      console.error('[Server] Stats preloader error:', err.message);
    });
  } else {
    console.log('[Server] Shopify not configured - skipping preloader');
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[Server] SIGTERM received, shutting down...');
  statsPreloader.stopAutoRefresh();
  shopifySync.stopAutoSync();
  cache.destroy();
  await disconnectDB();
  process.exit(0);
});

module.exports = app;
