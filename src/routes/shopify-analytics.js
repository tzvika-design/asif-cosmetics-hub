const express = require('express');
const axios = require('axios');
const shopifyService = require('../services/shopify');

const router = express.Router();

// ==========================================
// RATE LIMITING & CACHING FOR SHOPIFY API
// ==========================================

// Cache storage with 5 minute TTL
const cache = {
  analytics: { data: null, timestamp: 0 },
  salesChart: { data: null, timestamp: 0 },
  topProducts: { data: null, timestamp: 0 },
  topCustomers: { data: null, timestamp: 0 },
  recentOrders: { data: null, timestamp: 0 },
  discounts: { data: null, timestamp: 0 },
  products: { data: null, timestamp: 0 },
  TTL: 5 * 60 * 1000 // 5 minutes
};

// Check if cache is valid
function isCacheValid(cacheKey) {
  const cached = cache[cacheKey];
  return cached.data && (Date.now() - cached.timestamp) < cache.TTL;
}

// Get cache age in seconds
function getCacheAge(cacheKey) {
  return Math.round((Date.now() - cache[cacheKey].timestamp) / 1000) + 's';
}

// Rate limiter: max 2 requests per second to Shopify
const rateLimiter = {
  lastRequestTime: 0,
  minInterval: 500, // 500ms between requests = max 2 per second

  async wait() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.minInterval) {
      const waitTime = this.minInterval - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
  }
};

// Helper function for rate-limited API calls with timeout and retry
async function rateLimitedRequest(requestFn, retries = 2) {
  await rateLimiter.wait();

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await requestFn();
    } catch (error) {
      if (error.response?.status === 429) {
        console.log(`Rate limited (429), waiting 3 seconds before retry ${attempt}/${retries}...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
        if (attempt === retries) throw error;
        continue;
      }
      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        console.log(`Request timeout, retry ${attempt}/${retries}...`);
        if (attempt === retries) throw error;
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }
      throw error;
    }
  }
}

// Axios config with timeout (increased for large requests)
const axiosConfig = (headers, timeout = 30000) => ({
  headers,
  timeout
});

// Helper: Format date as DD/MM/YYYY (Israeli format)
function formatDateIL(date) {
  const d = new Date(date);
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
}

// Helper: Parse date range params
// Returns { start, end } where start is OLDER date, end is NEWER date
function getDateRange(startDate, endDate, period) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (startDate && endDate) {
    const s = new Date(startDate);
    const e = new Date(endDate);
    // Ensure start is before end
    return s < e ? { start: s, end: e } : { start: e, end: s };
  }

  switch (period) {
    case 'today':
      return { start: today, end: now };
    case 'week':
      // Last 7 days
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { start: weekAgo, end: now };
    case 'month':
      // Last 30 days
      const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { start: monthAgo, end: now };
    case '30days':
      return { start: new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000), end: now };
    case '90days':
      return { start: new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000), end: now };
    case 'lastMonth':
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start: lastMonthStart, end: lastMonthEnd };
    case 'year':
      // Last 365 days (full year back)
      const yearAgo = new Date(today.getTime() - 365 * 24 * 60 * 60 * 1000);
      return { start: yearAgo, end: now };
    default:
      // Default to last 30 days
      const defaultStart = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { start: defaultStart, end: now };
  }
}

// ==========================================
// API ENDPOINTS
// ==========================================

// GET /api/shopify/analytics/summary - Main analytics summary
router.get('/analytics/summary', async (req, res) => {
  try {
    const { startDate, endDate, period } = req.query;
    const { start, end } = getDateRange(startDate, endDate, period || 'month');

    console.log(`[Analytics Summary] Period: ${period}, Range: ${start.toISOString()} to ${end.toISOString()}`);

    // Check cache only for default requests
    const cacheKey = 'analytics_' + (period || 'default');
    if (!startDate && !endDate && isCacheValid('analytics')) {
      console.log('Returning cached analytics summary');
      return res.json({ ...cache.analytics.data, cached: true, cacheAge: getCacheAge('analytics') });
    }

    // Fetch orders with date filtering at API level
    const orders = await shopifyService.getOrders({
      status: 'any',
      limit: 250,
      created_at_min: start.toISOString(),
      created_at_max: end.toISOString()
    });

    const customers = await shopifyService.getCustomers({ limit: 250 });

    console.log(`[Analytics Summary] Fetched ${orders.length} orders for period`);

    // Calculate metrics from orders (already filtered by API)
    const totalSales = orders.reduce((sum, o) => sum + parseFloat(o.total_price || 0), 0);
    const orderCount = orders.length;
    const avgOrderValue = orderCount > 0 ? totalSales / orderCount : 0;

    // Returning customers calculation
    const customerOrderCounts = {};
    orders.forEach(o => {
      if (o.customer?.id) {
        customerOrderCounts[o.customer.id] = (customerOrderCounts[o.customer.id] || 0) + 1;
      }
    });
    const totalCustomers = Object.keys(customerOrderCounts).length;
    const returningCustomers = Object.values(customerOrderCounts).filter(c => c > 1).length;
    const returningRate = totalCustomers > 0 ? Math.round((returningCustomers / totalCustomers) * 100) : 0;

    // Today's specific stats (need separate query)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayOrders = orders.filter(o => new Date(o.created_at) >= today);
    const todaySales = todayOrders.reduce((sum, o) => sum + parseFloat(o.total_price || 0), 0);

    const result = {
      success: true,
      data: {
        totalSales,
        orderCount,
        avgOrderValue,
        returningRate,
        todaySales,
        todayOrders: todayOrders.length,
        totalCustomers: customers.length,
        period: {
          start: formatDateIL(start),
          end: formatDateIL(end)
        }
      }
    };

    // Update cache for default requests
    if (!startDate && !endDate) {
      cache.analytics.data = result;
      cache.analytics.timestamp = Date.now();
    }

    res.json(result);

  } catch (error) {
    console.error('Analytics summary error:', error.message);
    if (cache.analytics.data) {
      return res.json({ ...cache.analytics.data, cached: true, stale: true });
    }
    res.status(500).json({ error: true, message: error.message });
  }
});

// GET /api/shopify/analytics/sales-chart - Sales data for chart
router.get('/analytics/sales-chart', async (req, res) => {
  try {
    const { startDate, endDate, period } = req.query;
    const { start, end } = getDateRange(startDate, endDate, period || '30days');

    console.log(`[Sales Chart] Period: ${period}, Range: ${start.toISOString()} to ${end.toISOString()}`);

    if (!startDate && !endDate && isCacheValid('salesChart')) {
      console.log('Returning cached sales chart');
      return res.json({ ...cache.salesChart.data, cached: true, cacheAge: getCacheAge('salesChart') });
    }

    // Fetch orders with date filtering at API level
    const orders = await shopifyService.getOrders({
      status: 'any',
      limit: 250,
      created_at_min: start.toISOString(),
      created_at_max: end.toISOString()
    });

    console.log(`[Sales Chart] Fetched ${orders.length} orders for chart`);

    // Group by day
    const salesByDate = {};

    // Generate all dates in range
    const dateLabels = [];
    const currentDate = new Date(start);
    while (currentDate <= end) {
      const dateKey = currentDate.toISOString().split('T')[0];
      salesByDate[dateKey] = { sales: 0, orders: 0 };
      dateLabels.push({
        date: dateKey,
        label: formatDateIL(currentDate),
        dayName: currentDate.toLocaleDateString('he-IL', { weekday: 'short' })
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Fill in actual data from orders (already filtered by API)
    orders.forEach(order => {
      const dateKey = new Date(order.created_at).toISOString().split('T')[0];
      if (salesByDate[dateKey]) {
        salesByDate[dateKey].sales += parseFloat(order.total_price || 0);
        salesByDate[dateKey].orders += 1;
      }
    });

    // Convert to array
    const chartData = dateLabels.map(d => ({
      date: d.date,
      label: d.label,
      dayName: d.dayName,
      sales: Math.round(salesByDate[d.date].sales),
      orders: salesByDate[d.date].orders
    }));

    const result = {
      success: true,
      data: chartData,
      period: { start: formatDateIL(start), end: formatDateIL(end) },
      totalOrders: orders.length,
      totalSales: Math.round(orders.reduce((sum, o) => sum + parseFloat(o.total_price || 0), 0))
    };

    if (!startDate && !endDate) {
      cache.salesChart.data = result;
      cache.salesChart.timestamp = Date.now();
    }

    res.json(result);

  } catch (error) {
    console.error('Sales chart error:', error.message);
    if (cache.salesChart.data) {
      return res.json({ ...cache.salesChart.data, cached: true, stale: true });
    }
    res.status(500).json({ error: true, message: error.message });
  }
});

// GET /api/shopify/analytics/top-products - Top products by sales
router.get('/analytics/top-products', async (req, res) => {
  try {
    const { limit = 10, period, startDate, endDate, search } = req.query;
    const { start, end } = getDateRange(startDate, endDate, period || 'month');

    console.log(`[Top Products] Period: ${period}, Range: ${start.toISOString()} to ${end.toISOString()}`);

    // Skip cache if filtering
    const useCache = !period && !startDate && !endDate && !search;
    if (useCache && isCacheValid('topProducts')) {
      console.log('Returning cached top products');
      return res.json({ ...cache.topProducts.data, cached: true, cacheAge: getCacheAge('topProducts') });
    }

    // Fetch products and orders with date filtering
    const [products, orders] = await Promise.all([
      shopifyService.getProducts({ limit: 250 }),
      shopifyService.getOrders({
        status: 'any',
        limit: 250,
        created_at_min: start.toISOString(),
        created_at_max: end.toISOString()
      })
    ]);

    console.log(`[Top Products] Fetched ${orders.length} orders, ${products.length} products`);

    // Build product map for inventory lookup
    const productMap = {};
    products.forEach(p => {
      productMap[p.id] = {
        title: p.title,
        image: p.images?.[0]?.src || null,
        inventory: (p.variants || []).reduce((sum, v) => sum + (v.inventory_quantity || 0), 0),
        price: p.variants?.[0]?.price || '0'
      };
    });

    // Count sales from line items (orders already filtered by API)
    const productSales = {};
    orders.forEach(order => {
      (order.line_items || []).forEach(item => {
        const productId = item.product_id;
        if (!productSales[productId]) {
          productSales[productId] = {
            id: productId,
            title: item.title,
            quantity: 0,
            revenue: 0,
            image: productMap[productId]?.image || null,
            inventory: productMap[productId]?.inventory || 0
          };
        }
        productSales[productId].quantity += item.quantity;
        productSales[productId].revenue += parseFloat(item.price) * item.quantity;
      });
    });

    // Convert to array and apply search filter
    let topProducts = Object.values(productSales);

    if (search) {
      const searchLower = search.toLowerCase();
      topProducts = topProducts.filter(p => p.title.toLowerCase().includes(searchLower));
    }

    // Sort by revenue and limit
    const byRevenue = [...topProducts]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, parseInt(limit))
      .map(p => ({ ...p, revenue: Math.round(p.revenue) }));

    // Sort by quantity
    const byQuantity = [...topProducts]
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, parseInt(limit))
      .map(p => ({ ...p, revenue: Math.round(p.revenue) }));

    const result = {
      success: true,
      data: byRevenue,
      byQuantity,
      byRevenue,
      total: topProducts.length,
      period: { start: formatDateIL(start), end: formatDateIL(end) }
    };

    // Only cache if no filters
    if (useCache) {
      cache.topProducts.data = result;
      cache.topProducts.timestamp = Date.now();
    }

    res.json(result);

  } catch (error) {
    console.error('Top products error:', error.message);
    if (cache.topProducts.data) {
      return res.json({ ...cache.topProducts.data, cached: true, stale: true });
    }
    res.status(500).json({ error: true, message: error.message });
  }
});

// GET /api/shopify/analytics/top-customers - Top customers by spend
router.get('/analytics/top-customers', async (req, res) => {
  try {
    const { limit = 20, period, startDate, endDate, search } = req.query;
    const { start, end } = getDateRange(startDate, endDate, period || 'month');

    console.log(`[Top Customers] Period: ${period}, Range: ${start.toISOString()} to ${end.toISOString()}`);

    // Skip cache if filtering
    const useCache = !period && !startDate && !endDate && !search;
    if (useCache && isCacheValid('topCustomers')) {
      console.log('Returning cached top customers');
      return res.json({ ...cache.topCustomers.data, cached: true, cacheAge: getCacheAge('topCustomers') });
    }

    // Fetch orders with date filtering at API level
    const orders = await shopifyService.getOrders({
      status: 'any',
      limit: 250,
      created_at_min: start.toISOString(),
      created_at_max: end.toISOString()
    });

    console.log(`[Top Customers] Fetched ${orders.length} orders`);

    // Aggregate by customer (orders already filtered by API)
    const customerStats = {};
    orders.forEach(order => {
      if (!order.customer?.id) return;

      const customerId = order.customer.id;
      if (!customerStats[customerId]) {
        customerStats[customerId] = {
          id: customerId,
          name: `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim() || 'לקוח אנונימי',
          email: order.customer.email || '',
          orderCount: 0,
          totalSpend: 0,
          lastOrderDate: null
        };
      }

      customerStats[customerId].orderCount += 1;
      customerStats[customerId].totalSpend += parseFloat(order.total_price || 0);

      const orderDate = new Date(order.created_at);
      if (!customerStats[customerId].lastOrderDate || orderDate > new Date(customerStats[customerId].lastOrderDate)) {
        customerStats[customerId].lastOrderDate = order.created_at;
      }
    });

    // Convert to array and apply search filter
    let customers = Object.values(customerStats);

    if (search) {
      const searchLower = search.toLowerCase();
      customers = customers.filter(c =>
        c.name.toLowerCase().includes(searchLower) ||
        c.email.toLowerCase().includes(searchLower)
      );
    }

    // Sort by total spend
    const topCustomers = customers
      .sort((a, b) => b.totalSpend - a.totalSpend)
      .slice(0, parseInt(limit))
      .map(c => ({
        ...c,
        totalSpend: Math.round(c.totalSpend),
        lastOrderDate: formatDateIL(c.lastOrderDate),
        avgOrder: Math.round(c.totalSpend / c.orderCount)
      }));

    // Calculate LTV average
    const totalLTV = customers.reduce((sum, c) => sum + c.totalSpend, 0);
    const avgLTV = customers.length > 0 ? Math.round(totalLTV / customers.length) : 0;

    const result = {
      success: true,
      data: topCustomers,
      stats: {
        totalCustomers: customers.length,
        avgLTV
      },
      period: { start: formatDateIL(start), end: formatDateIL(end) }
    };

    // Only cache if no filters
    if (useCache) {
      cache.topCustomers.data = result;
      cache.topCustomers.timestamp = Date.now();
    }

    res.json(result);

  } catch (error) {
    console.error('Top customers error:', error.message);
    if (cache.topCustomers.data) {
      return res.json({ ...cache.topCustomers.data, cached: true, stale: true });
    }
    res.status(500).json({ error: true, message: error.message });
  }
});

// GET /api/shopify/orders/recent - Recent orders list
router.get('/orders/recent', async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    if (isCacheValid('recentOrders')) {
      console.log('Returning cached recent orders');
      return res.json({ ...cache.recentOrders.data, cached: true, cacheAge: getCacheAge('recentOrders') });
    }

    const orders = await shopifyService.getOrders({ status: 'any', limit: parseInt(limit) });

    const recentOrders = orders.map(order => {
      // Extract discount codes
      const discountCodes = (order.discount_codes || []).map(d => d.code).join(', ') || '-';

      // Financial status translation
      const statusMap = {
        'paid': 'שולם',
        'pending': 'ממתין',
        'refunded': 'הוחזר',
        'partially_refunded': 'הוחזר חלקית',
        'voided': 'בוטל',
        'authorized': 'מאושר'
      };

      return {
        id: order.id,
        orderNumber: order.order_number || order.name,
        customerName: order.customer
          ? `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim() || 'לקוח אנונימי'
          : 'אורח',
        email: order.customer?.email || '',
        total: Math.round(parseFloat(order.total_price || 0)),
        discountCode: discountCodes,
        status: statusMap[order.financial_status] || order.financial_status,
        statusRaw: order.financial_status,
        fulfillment: order.fulfillment_status || 'unfulfilled',
        date: formatDateIL(order.created_at),
        itemCount: (order.line_items || []).reduce((sum, item) => sum + item.quantity, 0)
      };
    });

    const result = {
      success: true,
      data: recentOrders,
      total: recentOrders.length
    };

    cache.recentOrders.data = result;
    cache.recentOrders.timestamp = Date.now();

    res.json(result);

  } catch (error) {
    console.error('Recent orders error:', error.message);
    if (cache.recentOrders.data) {
      return res.json({ ...cache.recentOrders.data, cached: true, stale: true });
    }
    res.status(500).json({ error: true, message: error.message });
  }
});

// GET /api/shopify/customers/stats - Customer statistics
router.get('/customers/stats', async (req, res) => {
  try {
    const [customers, orders] = await Promise.all([
      shopifyService.getCustomers({ limit: 250 }),
      shopifyService.getOrders({ status: 'any', limit: 250 })
    ]);

    const now = new Date();
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // New customers this month
    const newCustomersThisMonth = customers.filter(c => new Date(c.created_at) >= monthAgo).length;

    // Calculate returning rate and LTV
    const customerOrderCounts = {};
    const customerSpend = {};

    orders.forEach(o => {
      if (o.customer?.id) {
        customerOrderCounts[o.customer.id] = (customerOrderCounts[o.customer.id] || 0) + 1;
        customerSpend[o.customer.id] = (customerSpend[o.customer.id] || 0) + parseFloat(o.total_price || 0);
      }
    });

    const uniqueCustomers = Object.keys(customerOrderCounts).length;
    const returningCustomers = Object.values(customerOrderCounts).filter(c => c > 1).length;
    const returningRate = uniqueCustomers > 0 ? Math.round((returningCustomers / uniqueCustomers) * 100) : 0;

    const totalSpend = Object.values(customerSpend).reduce((sum, s) => sum + s, 0);
    const avgLTV = uniqueCustomers > 0 ? Math.round(totalSpend / uniqueCustomers) : 0;

    res.json({
      success: true,
      data: {
        totalCustomers: customers.length,
        newThisMonth: newCustomersThisMonth,
        returningRate,
        avgLTV,
        uniqueBuyers: uniqueCustomers
      }
    });

  } catch (error) {
    console.error('Customer stats error:', error.message);
    res.status(500).json({ error: true, message: error.message });
  }
});

// ==========================================
// LEGACY ENDPOINTS (for backward compatibility)
// ==========================================

// GET /api/shopify/analytics - Legacy endpoint
router.get('/analytics', async (req, res) => {
  try {
    const orders = await shopifyService.getOrders({ status: 'any', limit: 250 });

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    const todayOrders = orders.filter(o => new Date(o.created_at) >= today);
    const weekOrders = orders.filter(o => new Date(o.created_at) >= weekAgo);
    const monthOrders = orders.filter(o => new Date(o.created_at) >= monthAgo);

    const calcTotal = (orderList) => orderList.reduce((sum, o) => sum + parseFloat(o.total_price || 0), 0);
    const calcAvg = (orderList) => orderList.length > 0 ? calcTotal(orderList) / orderList.length : 0;

    const dailySales = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
      const nextDate = new Date(date.getTime() + 24 * 60 * 60 * 1000);
      const dayOrders = orders.filter(o => {
        const orderDate = new Date(o.created_at);
        return orderDate >= date && orderDate < nextDate;
      });
      dailySales.push({
        date: date.toISOString().split('T')[0],
        day: date.toLocaleDateString('he-IL', { weekday: 'short' }),
        orders: dayOrders.length,
        total: calcTotal(dayOrders)
      });
    }

    res.json({
      success: true,
      data: {
        today: { orders: todayOrders.length, total: calcTotal(todayOrders), average: calcAvg(todayOrders) },
        week: { orders: weekOrders.length, total: calcTotal(weekOrders), average: calcAvg(weekOrders) },
        month: { orders: monthOrders.length, total: calcTotal(monthOrders), average: calcAvg(monthOrders) },
        dailySales,
        currency: orders[0]?.currency || 'ILS'
      }
    });

  } catch (error) {
    console.error('Analytics error:', error.message);
    res.status(500).json({ error: true, message: error.message });
  }
});

// GET /api/shopify/discounts/search - Search for specific coupon code
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

    const searchCode = code.trim().toUpperCase();
    console.log(`[Coupon Search] Searching for: "${searchCode}"`);

    const { baseUrl, headers } = shopifyService.getConfig();

    if (!baseUrl || !headers) {
      console.error('[Coupon Search] Missing Shopify config');
      return res.status(500).json({ success: false, message: 'Shopify לא מוגדר' });
    }

    // Fetch price rules with shorter timeout
    const priceRulesUrl = `${baseUrl}/price_rules.json?limit=100`;
    console.log(`[Coupon Search] Fetching price rules...`);

    let priceRulesResponse;
    try {
      priceRulesResponse = await axios.get(priceRulesUrl, {
        headers,
        timeout: 15000 // 15 second timeout
      });
    } catch (e) {
      console.error('[Coupon Search] Error fetching price rules:', e.message);
      return res.json({ success: false, message: 'שגיאה בחיבור ל-Shopify: ' + e.message });
    }

    const rules = priceRulesResponse.data.price_rules || [];
    console.log(`[Coupon Search] Found ${rules.length} price rules, searching...`);

    let foundCoupon = null;

    // Search discount codes for each rule (with early exit)
    for (let i = 0; i < rules.length && !foundCoupon; i++) {
      const rule = rules[i];

      // Add small delay every 5 rules to avoid rate limiting
      if (i > 0 && i % 5 === 0) {
        await new Promise(r => setTimeout(r, 200));
      }

      try {
        const codesUrl = `${baseUrl}/price_rules/${rule.id}/discount_codes.json`;
        const codesResponse = await axios.get(codesUrl, {
          headers,
          timeout: 10000
        });

        const codes = codesResponse.data.discount_codes || [];

        for (const c of codes) {
          if (c.code.toUpperCase() === searchCode) {
            foundCoupon = {
              id: c.id,
              priceRuleId: rule.id,
              code: c.code,
              value: rule.value,
              valueType: rule.value_type,
              targetType: rule.target_type,
              usageCount: c.usage_count || 0,
              usageLimit: rule.usage_limit,
              startsAt: rule.starts_at,
              endsAt: rule.ends_at,
              isActive: isDiscountActive(rule),
              minimumAmount: rule.prerequisite_subtotal_range?.greater_than_or_equal_to || null,
              oncePerCustomer: rule.once_per_customer || false
            };
            console.log(`[Coupon Search] FOUND "${c.code}" in rule ${rule.id}`);
            break;
          }
        }
      } catch (e) {
        // Skip this rule on error, continue searching
        console.log(`[Coupon Search] Skipped rule ${rule.id}: ${e.message}`);
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(`[Coupon Search] Completed in ${elapsed}ms, found: ${!!foundCoupon}`);

    if (foundCoupon) {
      res.json({ success: true, data: foundCoupon });
    } else {
      res.json({ success: false, message: `לא נמצא קופון "${code}"` });
    }

  } catch (error) {
    console.error('[Coupon Search] Error:', error.message);
    res.json({ success: false, message: 'שגיאה בחיפוש: ' + error.message });
  }
});

// GET /api/shopify/discounts - Legacy endpoint (still available for backwards compatibility)
router.get('/discounts', async (req, res) => {
  try {
    // Return empty with message to use search instead
    res.json({
      success: true,
      data: [],
      message: 'השתמש בחיפוש קופון ספציפי'
    });
  } catch (error) {
    res.status(500).json({ error: true, message: error.message });
  }
});

// Helper function to check if a discount is active
function isDiscountActive(rule) {
  const now = new Date();

  // Check start date
  if (rule.starts_at) {
    const startDate = new Date(rule.starts_at);
    if (now < startDate) return false;
  }

  // Check end date
  if (rule.ends_at) {
    const endDate = new Date(rule.ends_at);
    if (now > endDate) return false;
  }

  // Check usage limit
  if (rule.usage_limit && rule.usage_limit > 0) {
    // Note: We can't check actual usage here without additional API call
  }

  return true;
}

// GET /api/shopify/top-products - Legacy endpoint
router.get('/top-products', async (req, res) => {
  try {
    const [products, orders] = await Promise.all([
      shopifyService.getProducts({ limit: 250 }),
      shopifyService.getOrders({ status: 'any', limit: 250 })
    ]);

    const productSales = {};
    orders.forEach(order => {
      (order.line_items || []).forEach(item => {
        const productId = item.product_id;
        if (!productSales[productId]) {
          productSales[productId] = { id: productId, title: item.title, quantity: 0, revenue: 0 };
        }
        productSales[productId].quantity += item.quantity;
        productSales[productId].revenue += parseFloat(item.price) * item.quantity;
      });
    });

    const salesArray = Object.values(productSales);
    const bestByQuantity = [...salesArray].sort((a, b) => b.quantity - a.quantity).slice(0, 10);
    const bestByRevenue = [...salesArray].sort((a, b) => b.revenue - a.revenue).slice(0, 10);

    const lowStock = products
      .map(p => ({
        id: p.id,
        title: p.title,
        image: p.images?.[0]?.src || null,
        inventory: (p.variants || []).reduce((sum, v) => sum + (v.inventory_quantity || 0), 0),
        price: p.variants?.[0]?.price || '0'
      }))
      .filter(p => p.inventory <= 5 && p.inventory >= 0)
      .sort((a, b) => a.inventory - b.inventory)
      .slice(0, 10);

    res.json({
      success: true,
      data: { bestByQuantity, bestByRevenue, lowStock, totalProducts: products.length }
    });

  } catch (error) {
    console.error('Top products error:', error.message);
    res.status(500).json({ error: true, message: error.message });
  }
});

// GET /api/shopify/products - Products list
router.get('/products', async (req, res) => {
  try {
    if (isCacheValid('products')) {
      console.log('Returning cached products');
      return res.json({ ...cache.products.data, cached: true, cacheAge: getCacheAge('products') });
    }

    const products = await shopifyService.getProducts({ limit: 250 });

    const simplifiedProducts = products.map(p => ({
      id: p.id,
      title: p.title,
      description: p.body_html ? p.body_html.replace(/<[^>]*>/g, '').substring(0, 200) : '',
      image: p.images?.[0]?.src || null,
      price: p.variants?.[0]?.price || '0',
      inventory: (p.variants || []).reduce((sum, v) => sum + (v.inventory_quantity || 0), 0)
    }));

    const result = { success: true, data: simplifiedProducts };

    cache.products.data = result;
    cache.products.timestamp = Date.now();

    res.json(result);

  } catch (error) {
    console.error('Products error:', error.message);
    if (cache.products.data) {
      return res.json({ ...cache.products.data, cached: true, stale: true });
    }
    res.status(500).json({ error: true, message: error.message });
  }
});

module.exports = router;
