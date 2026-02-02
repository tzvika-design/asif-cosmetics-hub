/**
 * Shopify Analytics API Routes
 * Fast endpoints using GraphQL service and pre-cached data
 */

const express = require('express');
const router = express.Router();

// Import new services
const shopifyGraphQL = require('../services/shopify-graphql');
const statsPreloader = require('../services/stats-preloader');
const { cache, TTL } = require('../services/cache');

// ==========================================
// HELPER FUNCTIONS
// ==========================================

/**
 * Format date as DD/MM/YYYY (Israeli format)
 */
function formatDateIL(date) {
  const d = new Date(date);
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
}

/**
 * Get date range for a period
 */
function getDateRange(startDate, endDate, period) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (startDate && endDate) {
    const s = new Date(startDate);
    const e = new Date(endDate);
    e.setHours(23, 59, 59, 999);
    return s < e ? { start: s, end: e } : { start: e, end: s };
  }

  switch (period) {
    case 'today':
      const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
      return { start: today, end: todayEnd };

    case 'week':
      const dayOfWeek = today.getDay();
      const weekStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - dayOfWeek);
      return { start: weekStart, end: now };

    case 'month':
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: monthStart, end: now };

    case 'lastMonth':
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { start: lastMonthStart, end: lastMonthEnd };

    case 'year':
      const yearStart = new Date(now.getFullYear(), 0, 1);
      return { start: yearStart, end: now };

    case 'lastYear':
      const lastYearStart = new Date(now.getFullYear() - 1, 0, 1);
      const lastYearEnd = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
      return { start: lastYearStart, end: lastYearEnd };

    default:
      const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: defaultStart, end: now };
  }
}

// ==========================================
// API ENDPOINTS
// ==========================================

/**
 * GET /api/shopify/analytics/summary
 * Main analytics summary - uses preloaded data when possible
 */
router.get('/analytics/summary', async (req, res) => {
  const startTime = Date.now();

  try {
    const { startDate, endDate, period } = req.query;
    const effectivePeriod = period || 'month';

    // Try preloaded data first (instant response)
    if (!startDate && !endDate) {
      const preloaded = statsPreloader.getStats(effectivePeriod);
      if (preloaded) {
        console.log(`[API] /analytics/summary (${effectivePeriod}) - PRELOADED in ${Date.now() - startTime}ms`);
        return res.json({
          success: true,
          data: preloaded,
          cached: true,
          responseTime: Date.now() - startTime
        });
      }
    }

    // Fall back to live fetch
    const { start, end } = getDateRange(startDate, endDate, effectivePeriod);
    const stats = await shopifyGraphQL.getStats(start, end);

    console.log(`[API] /analytics/summary (${effectivePeriod}) - LIVE in ${Date.now() - startTime}ms`);

    res.json({
      success: true,
      data: stats,
      cached: false,
      responseTime: Date.now() - startTime
    });

  } catch (error) {
    console.error('[API] /analytics/summary error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/shopify/analytics/sales-chart
 * Daily sales data for chart
 */
router.get('/analytics/sales-chart', async (req, res) => {
  const startTime = Date.now();

  try {
    const { startDate, endDate, period } = req.query;
    const effectivePeriod = period || 'month';

    // Try preloaded data first
    if (!startDate && !endDate && effectivePeriod === 'month') {
      const preloaded = statsPreloader.getDailySales('month');
      if (preloaded) {
        console.log(`[API] /analytics/sales-chart (${effectivePeriod}) - PRELOADED in ${Date.now() - startTime}ms`);
        return res.json({
          success: true,
          data: preloaded.data,
          period: preloaded.period,
          totalOrders: preloaded.totals?.orderCount || 0,
          totalSales: Math.round(preloaded.totals?.netSales || 0),
          cached: true,
          responseTime: Date.now() - startTime
        });
      }
    }

    // Live fetch
    const { start, end } = getDateRange(startDate, endDate, effectivePeriod);
    const salesData = await shopifyGraphQL.getDailySales(start, end);

    console.log(`[API] /analytics/sales-chart (${effectivePeriod}) - LIVE in ${Date.now() - startTime}ms`);

    res.json({
      success: true,
      data: salesData.data,
      period: salesData.period,
      totalOrders: salesData.totals?.orderCount || 0,
      totalSales: Math.round(salesData.totals?.netSales || 0),
      cached: false,
      responseTime: Date.now() - startTime
    });

  } catch (error) {
    console.error('[API] /analytics/sales-chart error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/shopify/analytics/top-products
 * Top products by sales
 */
router.get('/analytics/top-products', async (req, res) => {
  const startTime = Date.now();

  try {
    const { limit = 10, period, startDate, endDate, search } = req.query;
    const effectivePeriod = period || 'month';

    // Try preloaded data first (if no filters)
    if (!startDate && !endDate && !search && effectivePeriod === 'month') {
      const preloaded = statsPreloader.getTopProducts();
      if (preloaded) {
        const byRevenue = preloaded.byRevenue.slice(0, parseInt(limit));
        const byQuantity = preloaded.byQuantity.slice(0, parseInt(limit));

        console.log(`[API] /analytics/top-products - PRELOADED in ${Date.now() - startTime}ms`);
        return res.json({
          success: true,
          data: byRevenue,
          byRevenue,
          byQuantity,
          total: preloaded.total,
          period: preloaded.period,
          cached: true,
          responseTime: Date.now() - startTime
        });
      }
    }

    // Live fetch
    const { start, end } = getDateRange(startDate, endDate, effectivePeriod);
    const productsData = await shopifyGraphQL.getTopProducts(start, end, parseInt(limit));

    // Apply search filter if provided
    let byRevenue = productsData.byRevenue;
    let byQuantity = productsData.byQuantity;

    if (search) {
      const searchLower = search.toLowerCase();
      byRevenue = byRevenue.filter(p => p.title.toLowerCase().includes(searchLower));
      byQuantity = byQuantity.filter(p => p.title.toLowerCase().includes(searchLower));
    }

    console.log(`[API] /analytics/top-products - LIVE in ${Date.now() - startTime}ms`);

    res.json({
      success: true,
      data: byRevenue,
      byRevenue,
      byQuantity,
      total: productsData.total,
      period: productsData.period,
      cached: false,
      responseTime: Date.now() - startTime
    });

  } catch (error) {
    console.error('[API] /analytics/top-products error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/shopify/analytics/top-customers
 * Top customers by spend
 */
router.get('/analytics/top-customers', async (req, res) => {
  const startTime = Date.now();

  try {
    const { limit = 20, period, startDate, endDate, search } = req.query;
    const effectivePeriod = period || 'month';

    // Try preloaded data first (if no filters)
    if (!startDate && !endDate && !search) {
      const preloaded = statsPreloader.getTopCustomers();
      if (preloaded) {
        // Format customers for response
        const customers = preloaded.customers.slice(0, parseInt(limit)).map(c => ({
          id: c.id,
          name: `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'לקוח אנונימי',
          email: c.email || '',
          orderCount: c.ordersCount || 0,
          totalSpend: Math.round(parseFloat(c.totalSpentV2?.amount || 0)),
          lastOrderDate: c.lastOrder?.createdAt ? formatDateIL(c.lastOrder.createdAt) : '-'
        }));

        console.log(`[API] /analytics/top-customers - PRELOADED in ${Date.now() - startTime}ms`);
        return res.json({
          success: true,
          data: customers,
          stats: preloaded.stats,
          period: preloaded.period,
          cached: true,
          responseTime: Date.now() - startTime
        });
      }
    }

    // Live fetch
    const { start, end } = getDateRange(startDate, endDate, effectivePeriod);
    const customersData = await shopifyGraphQL.getCustomers(start, end);

    // Format customers
    let customers = customersData.customers.map(c => ({
      id: c.id,
      name: `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'לקוח אנונימי',
      email: c.email || '',
      orderCount: c.ordersCount || 0,
      totalSpend: Math.round(parseFloat(c.totalSpentV2?.amount || 0)),
      lastOrderDate: c.lastOrder?.createdAt ? formatDateIL(c.lastOrder.createdAt) : '-'
    }));

    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase();
      customers = customers.filter(c =>
        c.name.toLowerCase().includes(searchLower) ||
        c.email.toLowerCase().includes(searchLower)
      );
    }

    // Sort by total spend and limit
    customers = customers
      .sort((a, b) => b.totalSpend - a.totalSpend)
      .slice(0, parseInt(limit));

    console.log(`[API] /analytics/top-customers - LIVE in ${Date.now() - startTime}ms`);

    res.json({
      success: true,
      data: customers,
      stats: customersData.stats,
      period: customersData.period,
      cached: false,
      responseTime: Date.now() - startTime
    });

  } catch (error) {
    console.error('[API] /analytics/top-customers error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/shopify/orders/recent
 * Recent orders list
 */
router.get('/orders/recent', async (req, res) => {
  const startTime = Date.now();

  try {
    const { limit = 20 } = req.query;

    // Get last 7 days of orders
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 7);

    const ordersData = await shopifyGraphQL.getOrders(start, end);

    // Format orders for display
    const statusMap = {
      'PAID': 'שולם',
      'PENDING': 'ממתין',
      'REFUNDED': 'הוחזר',
      'PARTIALLY_REFUNDED': 'הוחזר חלקית',
      'VOIDED': 'בוטל',
      'AUTHORIZED': 'מאושר'
    };

    const recentOrders = ordersData.orders.slice(0, parseInt(limit)).map(order => ({
      id: order.id,
      orderNumber: order.name,
      customerName: order.customer
        ? `${order.customer.firstName || ''} ${order.customer.lastName || ''}`.trim() || 'לקוח אנונימי'
        : 'אורח',
      email: order.customer?.email || '',
      total: Math.round(parseFloat(order.totalPriceSet?.shopMoney?.amount || 0)),
      discountCode: (order.discountCodes || []).join(', ') || '-',
      status: statusMap[order.displayFinancialStatus] || order.displayFinancialStatus,
      statusRaw: order.displayFinancialStatus?.toLowerCase() || 'pending',
      fulfillment: order.displayFulfillmentStatus || 'unfulfilled',
      date: formatDateIL(order.createdAt),
      itemCount: (order.lineItems?.nodes || []).reduce((sum, item) => sum + item.quantity, 0)
    }));

    console.log(`[API] /orders/recent - ${recentOrders.length} orders in ${Date.now() - startTime}ms`);

    res.json({
      success: true,
      data: recentOrders,
      total: recentOrders.length,
      responseTime: Date.now() - startTime
    });

  } catch (error) {
    console.error('[API] /orders/recent error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/shopify/discounts/search
 * Search for discount codes
 */
router.get('/discounts/search', async (req, res) => {
  const startTime = Date.now();

  try {
    const { code } = req.query;

    if (!code || code.trim().length === 0) {
      return res.json({
        success: false,
        message: 'נא להזין קוד קופון לחיפוש'
      });
    }

    const searchTerm = code.trim();
    console.log(`[API] /discounts/search - searching for "${searchTerm}"`);

    const result = await shopifyGraphQL.searchDiscounts(searchTerm);

    if (result.match) {
      console.log(`[API] /discounts/search - found match in ${Date.now() - startTime}ms`);
      return res.json({
        success: true,
        data: result.match,
        allMatches: result.discounts.filter(d =>
          d.code.toUpperCase().includes(searchTerm.toUpperCase())
        ).slice(0, 5),
        responseTime: Date.now() - startTime
      });
    }

    // Not found - show available codes
    console.log(`[API] /discounts/search - no match found in ${Date.now() - startTime}ms`);
    res.json({
      success: false,
      message: `לא נמצא קופון "${code}"`,
      availableCoupons: result.discounts.map(d => d.code).slice(0, 20),
      totalCouponsFound: result.total,
      hint: result.total > 0
        ? `קופונים קיימים (${result.total}): ${result.discounts.map(d => d.code).slice(0, 10).join(', ')}`
        : 'לא נמצאו קופונים במערכת',
      responseTime: Date.now() - startTime
    });

  } catch (error) {
    console.error('[API] /discounts/search error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/shopify/discounts/all
 * Get all discount codes (for debugging)
 */
router.get('/discounts/all', async (req, res) => {
  const startTime = Date.now();

  try {
    const result = await shopifyGraphQL.searchDiscounts();

    res.json({
      success: true,
      data: result.discounts,
      total: result.total,
      responseTime: Date.now() - startTime
    });

  } catch (error) {
    console.error('[API] /discounts/all error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/shopify/products
 * Products list
 */
router.get('/products', async (req, res) => {
  const startTime = Date.now();

  try {
    // Check cache
    const cacheKey = 'api_products_list';
    const cached = cache.get(cacheKey);
    if (cached) {
      console.log(`[API] /products - CACHED in ${Date.now() - startTime}ms`);
      return res.json({ ...cached, cached: true, responseTime: Date.now() - startTime });
    }

    // Use preloaded top products for basic list
    const preloaded = statsPreloader.getTopProducts();
    if (preloaded) {
      const products = preloaded.products.map(p => ({
        id: p.id,
        title: p.title,
        price: '0', // Would need separate query for price
        inventory: 0
      }));

      const result = { success: true, data: products };
      cache.set(cacheKey, result, TTL.PRODUCTS);

      console.log(`[API] /products - from preloaded in ${Date.now() - startTime}ms`);
      return res.json({ ...result, responseTime: Date.now() - startTime });
    }

    // Fallback - empty list (products would need separate GraphQL query)
    res.json({
      success: true,
      data: [],
      message: 'Products list requires separate query',
      responseTime: Date.now() - startTime
    });

  } catch (error) {
    console.error('[API] /products error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/shopify/top-products
 * Legacy endpoint for top products
 */
router.get('/top-products', async (req, res) => {
  const startTime = Date.now();

  try {
    const preloaded = statsPreloader.getTopProducts();
    if (preloaded) {
      res.json({
        success: true,
        data: {
          bestByQuantity: preloaded.byQuantity.slice(0, 10),
          bestByRevenue: preloaded.byRevenue.slice(0, 10),
          lowStock: [], // Would need separate query
          totalProducts: preloaded.total
        },
        responseTime: Date.now() - startTime
      });
    } else {
      // Live fetch
      const end = new Date();
      const start = new Date();
      start.setMonth(start.getMonth() - 1);

      const productsData = await shopifyGraphQL.getTopProducts(start, end, 10);

      res.json({
        success: true,
        data: {
          bestByQuantity: productsData.byQuantity,
          bestByRevenue: productsData.byRevenue,
          lowStock: [],
          totalProducts: productsData.total
        },
        responseTime: Date.now() - startTime
      });
    }
  } catch (error) {
    console.error('[API] /top-products error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/shopify/analytics
 * Legacy analytics endpoint
 */
router.get('/analytics', async (req, res) => {
  const startTime = Date.now();

  try {
    // Get preloaded stats for different periods
    const todayStats = statsPreloader.getStats('today');
    const weekStats = statsPreloader.getStats('week');
    const monthStats = statsPreloader.getStats('month');
    const dailySales = statsPreloader.getDailySales('month');

    if (todayStats && weekStats && monthStats) {
      res.json({
        success: true,
        data: {
          today: {
            orders: todayStats.todayOrders,
            total: todayStats.todaySales,
            average: todayStats.avgOrderValue
          },
          week: {
            orders: weekStats.orderCount,
            total: weekStats.totalSales,
            average: weekStats.avgOrderValue
          },
          month: {
            orders: monthStats.orderCount,
            total: monthStats.totalSales,
            average: monthStats.avgOrderValue
          },
          dailySales: dailySales?.data?.slice(-7) || [],
          currency: 'ILS'
        },
        cached: true,
        responseTime: Date.now() - startTime
      });
    } else {
      // Fallback to live fetch
      const end = new Date();
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - 7);

      const stats = await shopifyGraphQL.getStats(weekStart, end);

      res.json({
        success: true,
        data: {
          today: { orders: stats.todayOrders, total: stats.todaySales, average: stats.avgOrderValue },
          week: { orders: stats.orderCount, total: stats.totalSales, average: stats.avgOrderValue },
          month: { orders: stats.orderCount, total: stats.totalSales, average: stats.avgOrderValue },
          dailySales: [],
          currency: 'ILS'
        },
        cached: false,
        responseTime: Date.now() - startTime
      });
    }
  } catch (error) {
    console.error('[API] /analytics error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/shopify/customers/stats
 * Customer statistics
 */
router.get('/customers/stats', async (req, res) => {
  const startTime = Date.now();

  try {
    const preloaded = statsPreloader.getTopCustomers();
    if (preloaded) {
      res.json({
        success: true,
        data: preloaded.stats,
        cached: true,
        responseTime: Date.now() - startTime
      });
    } else {
      // Live fetch
      const end = new Date();
      const start = new Date();
      start.setFullYear(start.getFullYear() - 1);

      const customersData = await shopifyGraphQL.getCustomers(start, end);

      res.json({
        success: true,
        data: customersData.stats,
        cached: false,
        responseTime: Date.now() - startTime
      });
    }
  } catch (error) {
    console.error('[API] /customers/stats error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/shopify/cache/status
 * Cache and preloader status (for debugging)
 */
router.get('/cache/status', (req, res) => {
  res.json({
    success: true,
    cache: cache.getStats(),
    preloader: statsPreloader.getStatus(),
    requestLog: shopifyGraphQL.getRequestLog(10)
  });
});

/**
 * POST /api/shopify/cache/refresh
 * Force refresh all cached data
 */
router.post('/cache/refresh', async (req, res) => {
  const startTime = Date.now();

  try {
    console.log('[API] /cache/refresh - clearing ALL caches and refreshing');

    // Clear ALL shopify caches
    cache.clearPattern('shopify');
    console.log('[API] Cache cleared');

    // Force refresh preloader
    const status = await statsPreloader.refresh();

    res.json({
      success: true,
      message: 'Cache cleared and data refreshed',
      status,
      responseTime: Date.now() - startTime
    });
  } catch (error) {
    console.error('[API] /cache/refresh error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/shopify/cache/clear
 * Just clear cache (quick)
 */
router.get('/cache/clear', (req, res) => {
  cache.clearPattern('shopify');
  console.log('[API] Cache manually cleared');
  res.json({ success: true, message: 'Cache cleared' });
});

/**
 * GET /api/shopify/debug
 * Diagnostic endpoint - shows raw data from Shopify
 */
router.get('/debug', async (req, res) => {
  const startTime = Date.now();
  const results = {
    timestamp: new Date().toISOString(),
    environment: {
      hasShopifyUrl: !!process.env.SHOPIFY_STORE_URL,
      hasAccessToken: !!process.env.SHOPIFY_ACCESS_TOKEN,
      shopifyUrl: process.env.SHOPIFY_STORE_URL ? `${process.env.SHOPIFY_STORE_URL.substring(0, 10)}...` : 'NOT SET',
      nodeEnv: process.env.NODE_ENV || 'development'
    },
    preloader: statsPreloader.getStatus(),
    cache: cache.getStats(),
    tests: {}
  };

  // Test 1: Try to get today's orders
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const ordersData = await shopifyGraphQL.getOrders(today, new Date());
    results.tests.todayOrders = {
      success: true,
      count: ordersData.orders?.length || 0,
      totalSales: ordersData.totals?.netSales || 0,
      sampleOrder: ordersData.orders?.[0] ? {
        name: ordersData.orders[0].name,
        total: ordersData.orders[0].totalPriceSet?.shopMoney?.amount
      } : null
    };
  } catch (error) {
    results.tests.todayOrders = { success: false, error: error.message };
  }

  // Test 2: Try to get this month's stats
  try {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const stats = await shopifyGraphQL.getStats(monthStart, new Date());
    results.tests.monthStats = {
      success: true,
      totalSales: stats.totalSales,
      orderCount: stats.orderCount,
      avgOrderValue: stats.avgOrderValue,
      todaySales: stats.todaySales,
      todayOrders: stats.todayOrders
    };
  } catch (error) {
    results.tests.monthStats = { success: false, error: error.message };
  }

  // Test 3: Try to get products
  try {
    const monthStart = new Date();
    monthStart.setDate(1);
    const products = await shopifyGraphQL.getTopProducts(monthStart, new Date(), 5);
    results.tests.topProducts = {
      success: true,
      count: products.products?.length || 0,
      sample: products.byRevenue?.slice(0, 3).map(p => ({ title: p.title, revenue: p.revenue }))
    };
  } catch (error) {
    results.tests.topProducts = { success: false, error: error.message };
  }

  // Test 4: Try to get customers
  try {
    const customers = await shopifyGraphQL.getCustomers(null, null);
    results.tests.customers = {
      success: true,
      count: customers.customers?.length || 0,
      stats: customers.stats
    };
  } catch (error) {
    results.tests.customers = { success: false, error: error.message };
  }

  // Test 5: Check preloaded data
  results.tests.preloadedData = {
    today: statsPreloader.getStats('today') ? 'LOADED' : 'EMPTY',
    week: statsPreloader.getStats('week') ? 'LOADED' : 'EMPTY',
    month: statsPreloader.getStats('month') ? 'LOADED' : 'EMPTY',
    topProducts: statsPreloader.getTopProducts() ? 'LOADED' : 'EMPTY',
    topCustomers: statsPreloader.getTopCustomers() ? 'LOADED' : 'EMPTY',
    dailySales: statsPreloader.getDailySales('month') ? 'LOADED' : 'EMPTY'
  };

  // Show preloaded month stats if available
  const monthPreloaded = statsPreloader.getStats('month');
  if (monthPreloaded) {
    results.tests.preloadedMonthStats = {
      totalSales: monthPreloaded.totalSales,
      orderCount: monthPreloaded.orderCount,
      avgOrderValue: monthPreloaded.avgOrderValue
    };
  }

  results.responseTime = Date.now() - startTime;

  res.json(results);
});

/**
 * GET /api/shopify/debug/orders
 * Get raw orders data for debugging
 */
router.get('/debug/orders', async (req, res) => {
  try {
    const { days = 7 } = req.query;
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - parseInt(days));

    const ordersData = await shopifyGraphQL.getOrders(start, end);

    res.json({
      success: true,
      period: { start: formatDateIL(start), end: formatDateIL(end) },
      totals: ordersData.totals,
      orderCount: ordersData.orders?.length || 0,
      orders: ordersData.orders?.slice(0, 20).map(o => ({
        name: o.name,
        createdAt: o.createdAt,
        total: o.totalPriceSet?.shopMoney?.amount,
        customer: o.customer?.firstName ? `${o.customer.firstName} ${o.customer.lastName}` : 'Guest',
        items: o.lineItems?.nodes?.length || 0,
        discounts: o.discountCodes || []
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/shopify/debug/raw
 * Test RAW Shopify API call - no date filter, no cache
 */
router.get('/debug/raw', async (req, res) => {
  const axios = require('axios');

  if (!process.env.SHOPIFY_STORE_URL || !process.env.SHOPIFY_ACCESS_TOKEN) {
    return res.status(400).json({ error: 'Shopify credentials not configured' });
  }

  const apiVersion = process.env.SHOPIFY_API_VERSION || '2024-01';
  const baseUrl = `https://${process.env.SHOPIFY_STORE_URL}/admin/api/${apiVersion}`;

  const results = {
    store: process.env.SHOPIFY_STORE_URL,
    apiVersion,
    tests: {}
  };

  // Test 1: Get shop info
  try {
    const shopResponse = await axios.get(`${baseUrl}/shop.json`, {
      headers: { 'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN }
    });
    results.tests.shop = {
      success: true,
      name: shopResponse.data.shop?.name,
      email: shopResponse.data.shop?.email,
      currency: shopResponse.data.shop?.currency
    };
  } catch (error) {
    results.tests.shop = { success: false, error: error.response?.data || error.message };
  }

  // Test 2: Get orders count (REST API)
  try {
    const countResponse = await axios.get(`${baseUrl}/orders/count.json`, {
      headers: { 'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN }
    });
    results.tests.ordersCount = {
      success: true,
      total: countResponse.data.count
    };
  } catch (error) {
    results.tests.ordersCount = { success: false, error: error.response?.data || error.message };
  }

  // Test 3: Get recent orders (REST API - last 10)
  try {
    const ordersResponse = await axios.get(`${baseUrl}/orders.json?limit=10&status=any`, {
      headers: { 'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN }
    });
    const orders = ordersResponse.data.orders || [];
    results.tests.recentOrders = {
      success: true,
      count: orders.length,
      orders: orders.map(o => ({
        id: o.id,
        name: o.name,
        created_at: o.created_at,
        total_price: o.total_price,
        financial_status: o.financial_status,
        customer: o.customer ? `${o.customer.first_name} ${o.customer.last_name}` : 'Guest'
      }))
    };
  } catch (error) {
    results.tests.recentOrders = { success: false, error: error.response?.data || error.message };
  }

  // Test 4: Get customers count
  try {
    const customersResponse = await axios.get(`${baseUrl}/customers/count.json`, {
      headers: { 'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN }
    });
    results.tests.customersCount = {
      success: true,
      total: customersResponse.data.count
    };
  } catch (error) {
    results.tests.customersCount = { success: false, error: error.response?.data || error.message };
  }

  // Test 5: Get products count
  try {
    const productsResponse = await axios.get(`${baseUrl}/products/count.json`, {
      headers: { 'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN }
    });
    results.tests.productsCount = {
      success: true,
      total: productsResponse.data.count
    };
  } catch (error) {
    results.tests.productsCount = { success: false, error: error.response?.data || error.message };
  }

  // Test 6: GraphQL test - get first 5 orders without date filter
  try {
    const graphqlQuery = `
      query {
        orders(first: 5, sortKey: CREATED_AT, reverse: true) {
          nodes {
            id
            name
            createdAt
            totalPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
          }
        }
      }
    `;

    const graphqlResponse = await axios.post(
      `${baseUrl}/graphql.json`,
      { query: graphqlQuery },
      {
        headers: {
          'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );

    if (graphqlResponse.data.errors) {
      results.tests.graphqlOrders = {
        success: false,
        errors: graphqlResponse.data.errors
      };
    } else {
      const orders = graphqlResponse.data.data?.orders?.nodes || [];
      results.tests.graphqlOrders = {
        success: true,
        count: orders.length,
        orders: orders.map(o => ({
          name: o.name,
          createdAt: o.createdAt,
          total: o.totalPriceSet?.shopMoney?.amount
        }))
      };
    }
  } catch (error) {
    results.tests.graphqlOrders = { success: false, error: error.response?.data || error.message };
  }

  res.json(results);
});

/**
 * POST /api/shopify/sync/trigger
 * Manually trigger a full sync
 */
router.post('/sync/trigger', async (req, res) => {
  try {
    const shopifySync = require('../services/shopify-sync');
    console.log('[API] Manual sync triggered');

    const result = await shopifySync.runFullSync();

    res.json({
      success: true,
      message: 'Sync completed',
      result
    });
  } catch (error) {
    console.error('[API] Sync error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/shopify/debug/query-test
 * Test different GraphQL query formats to find what works
 */
router.get('/debug/query-test', async (req, res) => {
  const axios = require('axios');

  if (!process.env.SHOPIFY_STORE_URL || !process.env.SHOPIFY_ACCESS_TOKEN) {
    return res.status(400).json({ error: 'Shopify credentials not configured' });
  }

  const apiVersion = process.env.SHOPIFY_API_VERSION || '2024-01';
  const graphqlUrl = `https://${process.env.SHOPIFY_STORE_URL}/admin/api/${apiVersion}/graphql.json`;
  const headers = {
    'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
    'Content-Type': 'application/json'
  };

  const results = {
    store: process.env.SHOPIFY_STORE_URL,
    tests: {}
  };

  // Test 1: No filter at all
  try {
    const query1 = `
      query {
        orders(first: 5, sortKey: CREATED_AT, reverse: true) {
          nodes { name createdAt totalPriceSet { shopMoney { amount } } }
        }
      }
    `;
    console.log('[DEBUG] Test 1: No filter');
    const response1 = await axios.post(graphqlUrl, { query: query1 }, { headers });
    results.tests.noFilter = {
      success: !response1.data.errors,
      count: response1.data.data?.orders?.nodes?.length || 0,
      orders: response1.data.data?.orders?.nodes?.map(o => ({ name: o.name, date: o.createdAt, total: o.totalPriceSet?.shopMoney?.amount })),
      errors: response1.data.errors
    };
  } catch (e) {
    results.tests.noFilter = { success: false, error: e.message };
  }

  // Test 2: With date filter - format 1
  try {
    const today = new Date().toISOString().split('T')[0];
    const monthAgo = new Date(Date.now() - 30*24*60*60*1000).toISOString().split('T')[0];
    const queryStr = `created_at:>=${monthAgo} created_at:<=${today}`;

    const query2 = `
      query {
        orders(first: 5, sortKey: CREATED_AT, reverse: true, query: "${queryStr}") {
          nodes { name createdAt totalPriceSet { shopMoney { amount } } }
        }
      }
    `;
    console.log(`[DEBUG] Test 2: Date filter format 1: ${queryStr}`);
    const response2 = await axios.post(graphqlUrl, { query: query2 }, { headers });
    results.tests.dateFormat1 = {
      query: queryStr,
      success: !response2.data.errors,
      count: response2.data.data?.orders?.nodes?.length || 0,
      orders: response2.data.data?.orders?.nodes?.map(o => ({ name: o.name, date: o.createdAt, total: o.totalPriceSet?.shopMoney?.amount })),
      errors: response2.data.errors
    };
  } catch (e) {
    results.tests.dateFormat1 = { success: false, error: e.message };
  }

  // Test 3: With date filter - format 2 (using variables)
  try {
    const today = new Date().toISOString().split('T')[0];
    const monthAgo = new Date(Date.now() - 30*24*60*60*1000).toISOString().split('T')[0];
    const queryStr = `created_at:>=${monthAgo}`;

    const query3 = `
      query getOrders($query: String) {
        orders(first: 5, sortKey: CREATED_AT, reverse: true, query: $query) {
          nodes { name createdAt totalPriceSet { shopMoney { amount } } }
        }
      }
    `;
    console.log(`[DEBUG] Test 3: Date filter via variable: ${queryStr}`);
    const response3 = await axios.post(graphqlUrl, {
      query: query3,
      variables: { query: queryStr }
    }, { headers });
    results.tests.dateFormat2_variable = {
      query: queryStr,
      success: !response3.data.errors,
      count: response3.data.data?.orders?.nodes?.length || 0,
      orders: response3.data.data?.orders?.nodes?.map(o => ({ name: o.name, date: o.createdAt, total: o.totalPriceSet?.shopMoney?.amount })),
      errors: response3.data.errors
    };
  } catch (e) {
    results.tests.dateFormat2_variable = { success: false, error: e.message };
  }

  // Test 4: Just >= filter (simpler)
  try {
    const weekAgo = new Date(Date.now() - 7*24*60*60*1000).toISOString().split('T')[0];
    const queryStr = `created_at:>=${weekAgo}`;

    const query4 = `
      query getOrders($query: String) {
        orders(first: 10, sortKey: CREATED_AT, reverse: true, query: $query) {
          nodes { name createdAt totalPriceSet { shopMoney { amount } } }
        }
      }
    `;
    console.log(`[DEBUG] Test 4: Simple >= filter: ${queryStr}`);
    const response4 = await axios.post(graphqlUrl, {
      query: query4,
      variables: { query: queryStr }
    }, { headers });
    results.tests.simpleGte = {
      query: queryStr,
      success: !response4.data.errors,
      count: response4.data.data?.orders?.nodes?.length || 0,
      orders: response4.data.data?.orders?.nodes?.map(o => ({ name: o.name, date: o.createdAt, total: o.totalPriceSet?.shopMoney?.amount })),
      errors: response4.data.errors
    };
  } catch (e) {
    results.tests.simpleGte = { success: false, error: e.message };
  }

  // Test 5: status:any filter
  try {
    const queryStr = `status:any`;

    const query5 = `
      query getOrders($query: String) {
        orders(first: 5, sortKey: CREATED_AT, reverse: true, query: $query) {
          nodes { name createdAt totalPriceSet { shopMoney { amount } } }
        }
      }
    `;
    console.log(`[DEBUG] Test 5: status:any filter`);
    const response5 = await axios.post(graphqlUrl, {
      query: query5,
      variables: { query: queryStr }
    }, { headers });
    results.tests.statusAny = {
      query: queryStr,
      success: !response5.data.errors,
      count: response5.data.data?.orders?.nodes?.length || 0,
      orders: response5.data.data?.orders?.nodes?.map(o => ({ name: o.name, date: o.createdAt, total: o.totalPriceSet?.shopMoney?.amount })),
      errors: response5.data.errors
    };
  } catch (e) {
    results.tests.statusAny = { success: false, error: e.message };
  }

  res.json(results);
});

// ==========================================
// SIMPLE DEBUG ENDPOINTS (Browser-testable)
// ==========================================

/**
 * GET /api/shopify/test-connection
 * Test basic Shopify connection - returns shop name if credentials work
 */
router.get('/test-connection', async (req, res) => {
  const axios = require('axios');

  const result = {
    timestamp: new Date().toISOString(),
    hasCredentials: {
      SHOPIFY_STORE_URL: !!process.env.SHOPIFY_STORE_URL,
      SHOPIFY_ACCESS_TOKEN: !!process.env.SHOPIFY_ACCESS_TOKEN
    }
  };

  if (!process.env.SHOPIFY_STORE_URL || !process.env.SHOPIFY_ACCESS_TOKEN) {
    result.success = false;
    result.error = 'Missing Shopify credentials';
    return res.status(400).json(result);
  }

  const apiVersion = process.env.SHOPIFY_API_VERSION || '2024-01';
  const baseUrl = `https://${process.env.SHOPIFY_STORE_URL}/admin/api/${apiVersion}`;

  try {
    const shopResponse = await axios.get(`${baseUrl}/shop.json`, {
      headers: { 'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN },
      timeout: 10000
    });

    result.success = true;
    result.shop = {
      name: shopResponse.data.shop?.name,
      email: shopResponse.data.shop?.email,
      domain: shopResponse.data.shop?.domain,
      currency: shopResponse.data.shop?.currency,
      timezone: shopResponse.data.shop?.iana_timezone,
      country: shopResponse.data.shop?.country_name
    };
    result.apiVersion = apiVersion;
    result.message = `Connected to ${result.shop.name}`;

  } catch (error) {
    result.success = false;
    result.error = error.response?.data?.errors || error.message;
    result.statusCode = error.response?.status;
  }

  res.json(result);
});

/**
 * GET /api/shopify/orders-simple
 * Fetch 5 most recent orders via REST API (no date filter, no cache)
 */
router.get('/orders-simple', async (req, res) => {
  const axios = require('axios');

  if (!process.env.SHOPIFY_STORE_URL || !process.env.SHOPIFY_ACCESS_TOKEN) {
    return res.status(400).json({ success: false, error: 'Missing Shopify credentials' });
  }

  const apiVersion = process.env.SHOPIFY_API_VERSION || '2024-01';
  const baseUrl = `https://${process.env.SHOPIFY_STORE_URL}/admin/api/${apiVersion}`;

  try {
    // Fetch 5 most recent orders with status=any
    const ordersResponse = await axios.get(`${baseUrl}/orders.json?limit=5&status=any`, {
      headers: { 'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN },
      timeout: 15000
    });

    const orders = ordersResponse.data.orders || [];

    res.json({
      success: true,
      message: `Found ${orders.length} orders`,
      count: orders.length,
      orders: orders.map(o => ({
        id: o.id,
        name: o.name,
        created_at: o.created_at,
        total_price: o.total_price,
        currency: o.currency,
        financial_status: o.financial_status,
        fulfillment_status: o.fulfillment_status,
        customer: o.customer ? {
          name: `${o.customer.first_name || ''} ${o.customer.last_name || ''}`.trim() || 'Guest',
          email: o.customer.email
        } : { name: 'Guest', email: null },
        line_items_count: o.line_items?.length || 0
      }))
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.response?.data?.errors || error.message,
      statusCode: error.response?.status
    });
  }
});

/**
 * GET /api/shopify/refresh-all
 * Clear cache and fetch fresh data from Shopify
 */
router.get('/refresh-all', async (req, res) => {
  const startTime = Date.now();

  const result = {
    timestamp: new Date().toISOString(),
    steps: []
  };

  try {
    // Step 1: Clear all caches
    cache.clearPattern('shopify');
    result.steps.push({ step: 'Clear cache', success: true, message: 'All shopify caches cleared' });

    // Step 2: Re-initialize and preload stats
    console.log('[API] /refresh-all - Starting full refresh...');
    const preloaderStatus = await statsPreloader.refresh();
    result.steps.push({
      step: 'Preload stats',
      success: preloaderStatus.isReady,
      status: preloaderStatus
    });

    // Step 3: Get summary of what we have now
    const monthStats = statsPreloader.getStats('month');
    const todayStats = statsPreloader.getStats('today');

    result.summary = {
      month: monthStats ? {
        totalSales: monthStats.totalSales,
        orderCount: monthStats.orderCount,
        avgOrderValue: monthStats.avgOrderValue
      } : null,
      today: todayStats ? {
        totalSales: todayStats.totalSales,
        orderCount: todayStats.orderCount
      } : null
    };

    result.success = true;
    result.message = `Refresh complete. Month: ₪${monthStats?.totalSales || 0}, ${monthStats?.orderCount || 0} orders`;
    result.responseTime = Date.now() - startTime;

  } catch (error) {
    console.error('[API] /refresh-all error:', error);
    result.success = false;
    result.error = error.message;
    result.responseTime = Date.now() - startTime;
  }

  res.json(result);
});

/**
 * GET /api/shopify/compare-apis
 * Compare REST API vs GraphQL results side by side
 */
router.get('/compare-apis', async (req, res) => {
  const axios = require('axios');

  if (!process.env.SHOPIFY_STORE_URL || !process.env.SHOPIFY_ACCESS_TOKEN) {
    return res.status(400).json({ success: false, error: 'Missing Shopify credentials' });
  }

  const apiVersion = process.env.SHOPIFY_API_VERSION || '2024-01';
  const baseUrl = `https://${process.env.SHOPIFY_STORE_URL}/admin/api/${apiVersion}`;
  const graphqlUrl = `${baseUrl}/graphql.json`;
  const headers = { 'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN };

  const result = {
    timestamp: new Date().toISOString(),
    store: process.env.SHOPIFY_STORE_URL,
    rest: {},
    graphql: {},
    comparison: {}
  };

  // Test 1: REST API - Get orders
  try {
    const restResponse = await axios.get(`${baseUrl}/orders.json?limit=10&status=any`, {
      headers,
      timeout: 15000
    });
    const restOrders = restResponse.data.orders || [];
    result.rest = {
      success: true,
      count: restOrders.length,
      orders: restOrders.map(o => ({
        name: o.name,
        created_at: o.created_at,
        total_price: o.total_price
      }))
    };
  } catch (e) {
    result.rest = { success: false, error: e.message };
  }

  // Test 2: GraphQL - Get orders WITHOUT query filter
  try {
    const graphqlQuery = `
      query {
        orders(first: 10, sortKey: CREATED_AT, reverse: true) {
          nodes {
            name
            createdAt
            totalPriceSet { shopMoney { amount } }
          }
        }
      }
    `;
    const gqlResponse = await axios.post(graphqlUrl, { query: graphqlQuery }, {
      headers: { ...headers, 'Content-Type': 'application/json' },
      timeout: 15000
    });

    if (gqlResponse.data.errors) {
      result.graphql.noFilter = { success: false, errors: gqlResponse.data.errors };
    } else {
      const gqlOrders = gqlResponse.data.data?.orders?.nodes || [];
      result.graphql.noFilter = {
        success: true,
        count: gqlOrders.length,
        orders: gqlOrders.map(o => ({
          name: o.name,
          created_at: o.createdAt,
          total_price: o.totalPriceSet?.shopMoney?.amount
        }))
      };
    }
  } catch (e) {
    result.graphql.noFilter = { success: false, error: e.message };
  }

  // Test 3: GraphQL - Get orders WITH query:null (how our code does it)
  try {
    const graphqlQuery = `
      query getOrders($query: String) {
        orders(first: 10, sortKey: CREATED_AT, reverse: true, query: $query) {
          nodes {
            name
            createdAt
            totalPriceSet { shopMoney { amount } }
          }
        }
      }
    `;
    const gqlResponse = await axios.post(graphqlUrl, {
      query: graphqlQuery,
      variables: { query: null }
    }, {
      headers: { ...headers, 'Content-Type': 'application/json' },
      timeout: 15000
    });

    if (gqlResponse.data.errors) {
      result.graphql.withNullQuery = { success: false, errors: gqlResponse.data.errors };
    } else {
      const gqlOrders = gqlResponse.data.data?.orders?.nodes || [];
      result.graphql.withNullQuery = {
        success: true,
        count: gqlOrders.length,
        orders: gqlOrders.map(o => ({
          name: o.name,
          created_at: o.createdAt,
          total_price: o.totalPriceSet?.shopMoney?.amount
        }))
      };
    }
  } catch (e) {
    result.graphql.withNullQuery = { success: false, error: e.message };
  }

  // Comparison summary
  result.comparison = {
    restWorks: result.rest.success && result.rest.count > 0,
    graphqlNoFilterWorks: result.graphql.noFilter?.success && result.graphql.noFilter?.count > 0,
    graphqlWithNullWorks: result.graphql.withNullQuery?.success && result.graphql.withNullQuery?.count > 0,
    recommendation: ''
  };

  if (result.comparison.restWorks && !result.comparison.graphqlWithNullWorks) {
    result.comparison.recommendation = 'BUG CONFIRMED: REST works but GraphQL with null query fails. Switch to REST API.';
  } else if (result.comparison.graphqlNoFilterWorks && !result.comparison.graphqlWithNullWorks) {
    result.comparison.recommendation = 'BUG: GraphQL works without query param but fails with query:null. Remove the query variable.';
  }

  res.json(result);
});

module.exports = router;
