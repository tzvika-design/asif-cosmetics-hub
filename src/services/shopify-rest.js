/**
 * Shopify REST API Service
 * Uses REST API instead of GraphQL for reliable order fetching
 * REST API works correctly with date filters (unlike GraphQL)
 */

const axios = require('axios');
const { cache, TTL } = require('./cache');

class ShopifyREST {
  constructor() {
    this.client = null;
    this.initialized = false;
  }

  /**
   * Initialize the REST client
   */
  initialize() {
    if (!process.env.SHOPIFY_STORE_URL || !process.env.SHOPIFY_ACCESS_TOKEN) {
      throw new Error('Shopify credentials not configured');
    }

    const apiVersion = process.env.SHOPIFY_API_VERSION || '2024-01';

    this.client = axios.create({
      baseURL: `https://${process.env.SHOPIFY_STORE_URL}/admin/api/${apiVersion}`,
      headers: {
        'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    this.initialized = true;
    console.log(`[ShopifyREST] Initialized for ${process.env.SHOPIFY_STORE_URL} (API ${apiVersion})`);
  }

  /**
   * Ensure client is initialized
   */
  ensureInitialized() {
    if (!this.initialized) {
      this.initialize();
    }
  }

  /**
   * Extract next page URL from Link header
   */
  extractNextUrl(linkHeader) {
    if (!linkHeader) return null;

    const links = linkHeader.split(',');
    for (const link of links) {
      const match = link.match(/<([^>]+)>;\s*rel="next"/);
      if (match) {
        // Extract just the path from the full URL
        const url = new URL(match[1]);
        return url.pathname + url.search;
      }
    }
    return null;
  }

  /**
   * Format date for Shopify REST API (ISO 8601)
   * Handles Israel timezone (UTC+2/+3)
   */
  formatDateForAPI(date, isEndOfDay = false) {
    const d = new Date(date);
    if (isEndOfDay) {
      d.setHours(23, 59, 59, 999);
    }
    return d.toISOString();
  }

  /**
   * Get orders within a date range
   * @param {Date} startDate - Start of date range
   * @param {Date} endDate - End of date range
   * @returns {Array} - Array of orders
   */
  async getOrders(startDate, endDate) {
    this.ensureInitialized();

    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];

    // Check cache first
    const cacheKey = `shopify_rest_orders_${startStr}_${endStr}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      console.log(`[ShopifyREST] Cache hit for orders ${startStr} to ${endStr} (${cached.length} orders)`);
      return cached;
    }

    const allOrders = [];
    let url = `/orders.json?status=any&limit=250&created_at_min=${this.formatDateForAPI(startDate)}&created_at_max=${this.formatDateForAPI(endDate, true)}`;
    let pageCount = 0;

    console.log(`[ShopifyREST] Fetching orders from ${startStr} to ${endStr}...`);

    while (url) {
      pageCount++;
      try {
        console.log(`[ShopifyREST] Fetching page ${pageCount}...`);
        const response = await this.client.get(url);
        const orders = response.data.orders || [];
        allOrders.push(...orders);

        console.log(`[ShopifyREST] Page ${pageCount}: ${orders.length} orders (total: ${allOrders.length})`);

        // Handle pagination via Link header
        const linkHeader = response.headers.link;
        url = this.extractNextUrl(linkHeader);

        // Rate limiting
        if (url) {
          await new Promise(r => setTimeout(r, 200));
        }
      } catch (error) {
        console.error(`[ShopifyREST] Error on page ${pageCount}:`, error.message);
        break;
      }
    }

    console.log(`[ShopifyREST] COMPLETE: ${allOrders.length} orders from ${startStr} to ${endStr}`);

    // Cache the result
    cache.set(cacheKey, allOrders, TTL.ORDERS);

    return allOrders;
  }

  /**
   * Get today's orders
   */
  async getOrdersToday() {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return this.getOrders(startOfDay, endOfDay);
  }

  /**
   * Get this week's orders (Sunday to now)
   */
  async getOrdersThisWeek() {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek, 0, 0, 0, 0);
    return this.getOrders(startOfWeek, now);
  }

  /**
   * Get this month's orders
   */
  async getOrdersThisMonth() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    return this.getOrders(startOfMonth, now);
  }

  /**
   * Get last month's orders
   */
  async getOrdersLastMonth() {
    const now = new Date();
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    return this.getOrders(startOfLastMonth, endOfLastMonth);
  }

  /**
   * Get this year's orders
   */
  async getOrdersThisYear() {
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
    return this.getOrders(startOfYear, now);
  }

  /**
   * Calculate stats from orders array
   */
  calculateStats(orders) {
    const totalSales = orders.reduce((sum, o) => sum + parseFloat(o.total_price || 0), 0);
    const totalDiscounts = orders.reduce((sum, o) => {
      const discounts = o.total_discounts ? parseFloat(o.total_discounts) : 0;
      return sum + discounts;
    }, 0);
    const orderCount = orders.length;
    const avgOrderValue = orderCount > 0 ? totalSales / orderCount : 0;

    // Count unique customers
    const customerIds = new Set();
    const customerOrderCounts = {};

    orders.forEach(order => {
      if (order.customer?.id) {
        customerIds.add(order.customer.id);
        customerOrderCounts[order.customer.id] = (customerOrderCounts[order.customer.id] || 0) + 1;
      }
    });

    const uniqueCustomers = customerIds.size;
    const returningCustomers = Object.values(customerOrderCounts).filter(c => c > 1).length;

    return {
      totalSales: Math.round(totalSales),
      totalDiscounts: Math.round(totalDiscounts),
      orderCount,
      avgOrderValue: Math.round(avgOrderValue),
      uniqueCustomers,
      returningCustomers,
      returningRate: uniqueCustomers > 0 ? Math.round((returningCustomers / uniqueCustomers) * 100) : 0
    };
  }

  /**
   * Get daily sales breakdown from orders
   */
  getDailySales(orders, startDate, endDate) {
    // Initialize all days in range
    const salesByDate = {};
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const dateKey = currentDate.toISOString().split('T')[0];
      salesByDate[dateKey] = { sales: 0, orders: 0 };
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Aggregate sales by day
    orders.forEach(order => {
      const dateKey = new Date(order.created_at).toISOString().split('T')[0];
      if (salesByDate[dateKey]) {
        salesByDate[dateKey].sales += parseFloat(order.total_price || 0);
        salesByDate[dateKey].orders += 1;
      }
    });

    // Convert to array
    return Object.entries(salesByDate).map(([date, stats]) => ({
      date,
      sales: Math.round(stats.sales),
      orders: stats.orders
    }));
  }

  /**
   * Get top products from orders
   */
  getTopProducts(orders, limit = 10) {
    const productSales = {};

    orders.forEach(order => {
      (order.line_items || []).forEach(item => {
        const productId = item.product_id;
        if (!productId) return;

        if (!productSales[productId]) {
          productSales[productId] = {
            id: productId,
            title: item.title || item.name,
            quantity: 0,
            revenue: 0
          };
        }

        productSales[productId].quantity += item.quantity || 1;
        productSales[productId].revenue += parseFloat(item.price || 0) * (item.quantity || 1);
      });
    });

    // Sort by revenue and return top N
    return Object.values(productSales)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, limit)
      .map(p => ({
        ...p,
        revenue: Math.round(p.revenue)
      }));
  }

  /**
   * Get top customers from orders
   */
  getTopCustomers(orders, limit = 10) {
    const customerStats = {};

    orders.forEach(order => {
      if (!order.customer?.id) return;

      const customerId = order.customer.id;
      if (!customerStats[customerId]) {
        customerStats[customerId] = {
          id: customerId,
          name: `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim() || 'Guest',
          email: order.customer.email,
          orderCount: 0,
          totalSpent: 0
        };
      }

      customerStats[customerId].orderCount += 1;
      customerStats[customerId].totalSpent += parseFloat(order.total_price || 0);
    });

    // Sort by total spent and return top N
    return Object.values(customerStats)
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, limit)
      .map(c => ({
        ...c,
        totalSpent: Math.round(c.totalSpent)
      }));
  }

  /**
   * Get shop info
   */
  async getShopInfo() {
    this.ensureInitialized();

    try {
      const response = await this.client.get('/shop.json');
      return response.data.shop;
    } catch (error) {
      console.error('[ShopifyREST] Error getting shop info:', error.message);
      throw error;
    }
  }

  /**
   * Get customer count
   */
  async getCustomerCount() {
    this.ensureInitialized();

    try {
      const response = await this.client.get('/customers/count.json');
      return response.data.count;
    } catch (error) {
      console.error('[ShopifyREST] Error getting customer count:', error.message);
      return 0;
    }
  }

  /**
   * Get product count
   */
  async getProductCount() {
    this.ensureInitialized();

    try {
      const response = await this.client.get('/products/count.json');
      return response.data.count;
    } catch (error) {
      console.error('[ShopifyREST] Error getting product count:', error.message);
      return 0;
    }
  }
}

// Export singleton
const shopifyRest = new ShopifyREST();

module.exports = shopifyRest;
