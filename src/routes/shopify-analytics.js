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
    console.log('[API] /cache/refresh - starting manual refresh');
    const status = await statsPreloader.refresh();

    res.json({
      success: true,
      status,
      responseTime: Date.now() - startTime
    });
  } catch (error) {
    console.error('[API] /cache/refresh error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
