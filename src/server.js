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
// SIMPLE DATA ENDPOINTS - DIRECT API CALLS
// ==========================================

// Quick test - just 1 page
app.get('/api/shopify/quick', async (req, res) => {
  const token = process.env.SHOPIFY_ACCESS_TOKEN;
  if (!token) return res.json({ error: 'No token' });

  try {
    const r = await axios.get('https://asif-cosmetics.myshopify.com/admin/api/2024-01/orders.json?status=any&limit=5', {
      headers: { 'X-Shopify-Access-Token': token }
    });
    res.json({
      success: true,
      count: r.data.orders?.length,
      orders: r.data.orders?.map(o => ({ name: o.name, total: o.total_price, date: o.created_at }))
    });
  } catch (e) {
    res.json({ error: e.message, status: e.response?.status });
  }
});

// 2025 data - PAID ONLY to match Shopify Admin
// Use ?all=true to see all orders including cancelled/refunded
app.get('/api/shopify/2025', async (req, res) => {
  const token = process.env.SHOPIFY_ACCESS_TOKEN;
  if (!token) return res.json({ error: 'No token' });

  const maxPages = parseInt(req.query.pages) || 100; // Fetch ALL pages
  const showAll = req.query.all === 'true';
  const allOrders = [];
  let page = 0;

  // Use financial_status=paid to match Shopify Admin's sales reports
  const financialFilter = showAll ? '' : '&financial_status=paid';
  let nextUrl = `https://asif-cosmetics.myshopify.com/admin/api/2024-01/orders.json?status=any${financialFilter}&limit=250&created_at_min=2025-01-01T00:00:00Z&created_at_max=2025-12-31T23:59:59Z`;

  try {
    while (nextUrl && page < maxPages) {
      page++;
      const r = await axios.get(nextUrl, {
        headers: { 'X-Shopify-Access-Token': token },
        timeout: 15000
      });
      const orders = r.data.orders || [];
      allOrders.push(...orders);

      if (page % 10 === 0) {
        console.log(`[2025 Endpoint] Page ${page}: ${allOrders.length} orders...`);
      }

      const link = r.headers.link;
      if (link && link.includes('rel="next"')) {
        const m = link.match(/<([^>]+)>;\s*rel="next"/);
        nextUrl = m ? m[1] : null;
      } else {
        nextUrl = null;
      }

      // Small delay to avoid rate limits
      if (nextUrl) await new Promise(r => setTimeout(r, 100));
    }

    // Filter out cancelled orders
    const validOrders = showAll ? allOrders : allOrders.filter(o => !o.cancelled_at && o.financial_status !== 'voided');

    const grossSales = validOrders.reduce((s, o) => s + parseFloat(o.subtotal_price || 0) + parseFloat(o.total_discounts || 0), 0);
    const netSales = validOrders.reduce((s, o) => s + parseFloat(o.total_price || 0), 0);
    const totalDiscounts = validOrders.reduce((s, o) => s + parseFloat(o.total_discounts || 0), 0);

    // Analyze order dates to check for date range issues
    const orderDates = validOrders.map(o => new Date(o.created_at));
    const firstDate = orderDates.length ? new Date(Math.min(...orderDates)) : null;
    const lastDate = orderDates.length ? new Date(Math.max(...orderDates)) : null;

    // Count by financial status
    const statusCounts = {};
    validOrders.forEach(o => {
      statusCounts[o.financial_status] = (statusCounts[o.financial_status] || 0) + 1;
    });

    // Count by source/channel
    const sourceCounts = {};
    validOrders.forEach(o => {
      const source = o.source_name || 'unknown';
      sourceCounts[source] = (sourceCounts[source] || 0) + 1;
    });

    res.json({
      success: true,
      mode: showAll ? 'ALL orders (including cancelled/refunded)' : 'PAID orders only (matches Shopify Admin)',
      pages: page,
      ordersFetched: allOrders.length,
      ordersValid: validOrders.length,
      grossSales: Math.round(grossSales),
      netSales: Math.round(netSales),
      totalDiscounts: Math.round(totalDiscounts),
      hasMore: !!nextUrl,
      dateRange: {
        first: firstDate?.toISOString(),
        last: lastDate?.toISOString()
      },
      byFinancialStatus: statusCounts,
      bySource: sourceCounts,
      shopifyAdminExpected: {
        orders: 8043,
        grossSales: 2873833
      },
      note: showAll ? 'Add ?all=false to see paid orders only' : 'Add ?all=true to see all orders including cancelled',
      sample: validOrders.slice(0, 5).map(o => ({
        name: o.name,
        created_at: o.created_at,
        total: o.total_price,
        financial_status: o.financial_status,
        source: o.source_name,
        cancelled: !!o.cancelled_at
      }))
    });
  } catch (e) {
    res.json({ error: e.message, orders: allOrders.length, pages: page });
  }
});

// Clear cache and refresh data
app.get('/api/shopify/clear-cache', async (req, res) => {
  cache.clearPattern('shopify');
  console.log('[Server] Cache cleared');
  res.json({
    success: true,
    message: 'All Shopify cache cleared. Data will be refreshed on next request.',
    timestamp: new Date().toISOString()
  });
});

// Get official order counts from Shopify
app.get('/api/shopify/order-counts', async (req, res) => {
  const token = process.env.SHOPIFY_ACCESS_TOKEN;
  if (!token) return res.json({ error: 'No token' });

  const baseUrl = 'https://asif-cosmetics.myshopify.com/admin/api/2024-01/orders/count.json';
  const dateFilter = 'created_at_min=2025-01-01T00:00:00Z&created_at_max=2025-12-31T23:59:59Z';

  try {
    // Get counts with different filters
    const [allCount, paidCount, pendingCount, refundedCount, cancelledCount] = await Promise.all([
      axios.get(`${baseUrl}?status=any&${dateFilter}`, { headers: { 'X-Shopify-Access-Token': token } }),
      axios.get(`${baseUrl}?status=any&financial_status=paid&${dateFilter}`, { headers: { 'X-Shopify-Access-Token': token } }),
      axios.get(`${baseUrl}?status=any&financial_status=pending&${dateFilter}`, { headers: { 'X-Shopify-Access-Token': token } }),
      axios.get(`${baseUrl}?status=any&financial_status=refunded&${dateFilter}`, { headers: { 'X-Shopify-Access-Token': token } }),
      axios.get(`${baseUrl}?status=cancelled&${dateFilter}`, { headers: { 'X-Shopify-Access-Token': token } })
    ]);

    res.json({
      year: 2025,
      counts: {
        all: allCount.data.count,
        paid: paidCount.data.count,
        pending: pendingCount.data.count,
        refunded: refundedCount.data.count,
        cancelled: cancelledCount.data.count
      },
      shopifyAdminExpected: 8043,
      analysis: {
        paidMinusCancelled: paidCount.data.count - cancelledCount.data.count,
        allMinusCancelledMinusRefunded: allCount.data.count - cancelledCount.data.count - refundedCount.data.count
      }
    });
  } catch (e) {
    res.json({ error: e.message });
  }
});

// Compare paid vs all orders (diagnostic)
app.get('/api/shopify/compare-2025', async (req, res) => {
  const token = process.env.SHOPIFY_ACCESS_TOKEN;
  if (!token) return res.json({ error: 'No token' });

  const results = { paid: null, all: null };

  try {
    // Get PAID orders only (3 pages for quick test)
    let paidOrders = [];
    let paidUrl = 'https://asif-cosmetics.myshopify.com/admin/api/2024-01/orders.json?status=any&financial_status=paid&limit=250&created_at_min=2025-01-01T00:00:00Z&created_at_max=2025-12-31T23:59:59Z';
    for (let i = 0; i < 35 && paidUrl; i++) {
      const r = await axios.get(paidUrl, {
        headers: { 'X-Shopify-Access-Token': token },
        timeout: 15000
      });
      paidOrders.push(...(r.data.orders || []));
      const link = r.headers.link;
      if (link && link.includes('rel="next"')) {
        const m = link.match(/<([^>]+)>;\s*rel="next"/);
        paidUrl = m ? m[1] : null;
      } else {
        paidUrl = null;
      }
      if (paidUrl) await new Promise(r => setTimeout(r, 100));
    }

    // Filter out cancelled
    paidOrders = paidOrders.filter(o => !o.cancelled_at);
    const paidGross = paidOrders.reduce((s, o) => s + parseFloat(o.subtotal_price || 0) + parseFloat(o.total_discounts || 0), 0);
    const paidNet = paidOrders.reduce((s, o) => s + parseFloat(o.total_price || 0), 0);

    results.paid = {
      orders: paidOrders.length,
      grossSales: Math.round(paidGross),
      netSales: Math.round(paidNet),
      hasMore: !!paidUrl
    };

    // Get ALL orders (3 pages for quick test)
    let allOrders = [];
    let allUrl = 'https://asif-cosmetics.myshopify.com/admin/api/2024-01/orders.json?status=any&limit=250&created_at_min=2025-01-01T00:00:00Z&created_at_max=2025-12-31T23:59:59Z';
    for (let i = 0; i < 35 && allUrl; i++) {
      const r = await axios.get(allUrl, {
        headers: { 'X-Shopify-Access-Token': token },
        timeout: 15000
      });
      allOrders.push(...(r.data.orders || []));
      const link = r.headers.link;
      if (link && link.includes('rel="next"')) {
        const m = link.match(/<([^>]+)>;\s*rel="next"/);
        allUrl = m ? m[1] : null;
      } else {
        allUrl = null;
      }
      if (allUrl) await new Promise(r => setTimeout(r, 100));
    }

    const allGross = allOrders.reduce((s, o) => s + parseFloat(o.subtotal_price || 0) + parseFloat(o.total_discounts || 0), 0);
    const allNet = allOrders.reduce((s, o) => s + parseFloat(o.total_price || 0), 0);

    results.all = {
      orders: allOrders.length,
      grossSales: Math.round(allGross),
      netSales: Math.round(allNet),
      hasMore: !!allUrl
    };

    results.difference = {
      extraOrders: results.all.orders - results.paid.orders,
      extraGross: results.all.grossSales - results.paid.grossSales,
      extraNet: results.all.netSales - results.paid.netSales
    };

    results.shopifyAdmin = {
      expected: '8,043 orders, ₪2,873,832 gross sales',
      note: 'PAID orders should match these numbers'
    };

    res.json(results);
  } catch (e) {
    res.json({ error: e.message, results });
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
