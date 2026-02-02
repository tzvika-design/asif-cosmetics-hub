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
    this.baseURL = null;
  }

  /**
   * Initialize the REST client
   */
  initialize() {
    if (!process.env.SHOPIFY_STORE_URL || !process.env.SHOPIFY_ACCESS_TOKEN) {
      throw new Error('Shopify credentials not configured');
    }

    const apiVersion = process.env.SHOPIFY_API_VERSION || '2024-01';
    this.baseURL = `https://${process.env.SHOPIFY_STORE_URL}/admin/api/${apiVersion}`;

    this.client = axios.create({
      baseURL: this.baseURL,
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
   * Shopify uses cursor-based pagination with Link headers
   */
  extractNextUrl(linkHeader) {
    if (!linkHeader) {
      return null;
    }

    try {
      // Link header format: <url>; rel="next", <url>; rel="previous"
      const links = linkHeader.split(',');
      for (const link of links) {
        if (link.includes('rel="next"')) {
          const match = link.match(/<([^>]+)>/);
          if (match) {
            // Return full URL - axios will handle it
            return match[1];
          }
        }
      }
    } catch (error) {
      console.error('[ShopifyREST] Error parsing Link header:', error.message);
    }
    return null;
  }

  /**
   * Format date for Shopify REST API (ISO 8601)
   */
  formatDateForAPI(date, isEndOfDay = false) {
    const d = new Date(date);
    if (isEndOfDay) {
      d.setHours(23, 59, 59, 999);
    }
    return d.toISOString();
  }

  /**
   * Check if order is from a valid sales channel
   * - Matrixify orders from Jan-Feb 2025 are INCLUDED (real WordPress sales before Shopify launch)
   * - Matrixify orders from March 2025+ are EXCLUDED (Shopify was live)
   */
  isValidSalesOrder(order) {
    const source = (order.source_name || '').toLowerCase();

    // If it's a Matrixify import, only include if from Jan-Feb 2025
    if (source.includes('matrixify')) {
      const orderDate = new Date(order.created_at);
      const marchFirst2025 = new Date('2025-03-01T00:00:00Z');
      // Include Matrixify orders BEFORE March 2025 (WordPress era)
      return orderDate < marchFirst2025;
    }

    // All other sources are valid
    return true;
  }

  /**
   * Get orders within a date range - FETCHES ALL PAGES
   * @param {Date} startDate - Start of date range
   * @param {Date} endDate - End of date range
   * @param {Object} options - Optional filters
   * @param {boolean} options.paidOnly - Only include paid orders (default: true to match Shopify Admin)
   * @param {boolean} options.excludeCancelled - Exclude cancelled orders (default: true)
   * @param {boolean} options.excludeImports - Exclude imported orders like Matrixify (default: true)
   * @returns {Array} - Array of orders
   */
  async getOrders(startDate, endDate, options = {}) {
    this.ensureInitialized();

    // Default to paid only to match Shopify Admin reports
    const paidOnly = options.paidOnly !== false;
    const excludeCancelled = options.excludeCancelled !== false;
    const excludeImports = options.excludeImports !== false;

    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];
    const filterKey = `${paidOnly ? '_paid' : '_all'}${excludeImports ? '_noimport' : ''}`;

    // Check cache first
    const cacheKey = `shopify_rest_orders_${startStr}_${endStr}${filterKey}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      console.log(`[ShopifyREST] Cache hit for orders ${startStr} to ${endStr} (${cached.length} orders)`);
      return cached;
    }

    const allOrders = [];
    let pageCount = 0;
    const maxPages = 100; // Safety limit

    // Build initial URL with date filters
    // Use financial_status=paid to only get completed paid orders (matches Shopify Admin)
    const params = new URLSearchParams({
      status: excludeCancelled ? 'any' : 'any', // We filter cancelled in post-processing
      financial_status: paidOnly ? 'paid' : 'any',
      limit: '250',
      created_at_min: this.formatDateForAPI(startDate),
      created_at_max: this.formatDateForAPI(endDate, true)
    });

    let url = `/orders.json?${params.toString()}`;

    console.log(`[ShopifyREST] Fetching orders: ${startStr} to ${endStr} (paidOnly=${paidOnly}, excludeCancelled=${excludeCancelled})`);

    while (url && pageCount < maxPages) {
      pageCount++;
      try {

        // For subsequent pages, url is a full URL
        const response = pageCount === 1
          ? await this.client.get(url)
          : await axios.get(url, {
              headers: { 'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN },
              timeout: 30000
            });

        const orders = response.data.orders || [];
        allOrders.push(...orders);

        if (pageCount % 10 === 0) {
          console.log(`[ShopifyREST] Page ${pageCount}: ${allOrders.length} orders so far...`);
        }

        // Check for next page
        const linkHeader = response.headers.link || response.headers['link'];
        const nextUrl = this.extractNextUrl(linkHeader);

        if (nextUrl) {
          url = nextUrl;
          // Minimal delay - Shopify allows 2 requests/second
          await new Promise(r => setTimeout(r, 100));
        } else {
          console.log(`[ShopifyREST] No more pages`);
          url = null;
        }
      } catch (error) {
        console.error(`[ShopifyREST] Error on page ${pageCount}:`, error.message);
        if (error.response?.status === 429) {
          console.log('[ShopifyREST] Rate limited, waiting 2 seconds...');
          await new Promise(r => setTimeout(r, 2000));
          continue; // Retry same page
        }
        break;
      }
    }

    if (pageCount >= maxPages) {
      console.warn(`[ShopifyREST] WARNING: Hit max pages limit (${maxPages})`);
    }

    // Post-process: filter orders
    let filteredOrders = allOrders;
    let cancelledCount = 0;
    let importedCount = 0;

    filteredOrders = allOrders.filter(order => {
      // Exclude cancelled orders
      if (excludeCancelled && order.cancelled_at) {
        cancelledCount++;
        return false;
      }
      // Exclude voided orders
      if (excludeCancelled && order.financial_status === 'voided') {
        cancelledCount++;
        return false;
      }
      // Exclude imported orders (Matrixify, etc.)
      if (excludeImports && !this.isValidSalesOrder(order)) {
        importedCount++;
        return false;
      }
      return true;
    });

    if (cancelledCount > 0) {
      console.log(`[ShopifyREST] Filtered out ${cancelledCount} cancelled/voided orders`);
    }
    if (importedCount > 0) {
      console.log(`[ShopifyREST] Filtered out ${importedCount} imported orders (Matrixify, etc.)`);
    }

    console.log(`[ShopifyREST] Done: ${filteredOrders.length} valid orders from ${allOrders.length} total (${pageCount} pages)`);

    // Cache the result
    cache.set(cacheKey, filteredOrders, TTL.ORDERS);

    return filteredOrders;
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
   * Get last year's orders
   * NOTE: Requires read_all_orders scope for orders older than 60 days
   */
  async getOrdersLastYear() {
    const now = new Date();
    const startOfLastYear = new Date(now.getFullYear() - 1, 0, 1, 0, 0, 0, 0);
    const endOfLastYear = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
    return this.getOrders(startOfLastYear, endOfLastYear);
  }

  /**
   * Calculate stats from orders array
   * Matches Shopify Admin reporting:
   * - Gross sales = item prices before discounts (subtotal + discounts)
   * - Net sales = total_price (what customer actually paid)
   */
  calculateStats(orders) {
    // Filter out cancelled/voided orders for accurate stats
    const validOrders = orders.filter(o => !o.cancelled_at && o.financial_status !== 'voided');

    const totalSales = validOrders.reduce((sum, o) => sum + parseFloat(o.total_price || 0), 0);
    const subtotalSales = validOrders.reduce((sum, o) => sum + parseFloat(o.subtotal_price || 0), 0);
    const totalDiscounts = validOrders.reduce((sum, o) => {
      const discounts = o.total_discounts ? parseFloat(o.total_discounts) : 0;
      return sum + discounts;
    }, 0);
    const totalTax = validOrders.reduce((sum, o) => sum + parseFloat(o.total_tax || 0), 0);
    const totalShipping = validOrders.reduce((sum, o) => {
      const shipping = o.total_shipping_price_set?.shop_money?.amount || 0;
      return sum + parseFloat(shipping);
    }, 0);

    const orderCount = validOrders.length;
    const avgOrderValue = orderCount > 0 ? totalSales / orderCount : 0;

    // Gross sales = subtotal before discounts applied
    // This matches Shopify Admin's "Gross sales" calculation
    const grossSales = subtotalSales + totalDiscounts;

    // Count unique customers
    const customerIds = new Set();
    const customerOrderCounts = {};

    validOrders.forEach(order => {
      if (order.customer?.id) {
        customerIds.add(order.customer.id);
        customerOrderCounts[order.customer.id] = (customerOrderCounts[order.customer.id] || 0) + 1;
      }
    });

    const uniqueCustomers = customerIds.size;
    const returningCustomers = Object.values(customerOrderCounts).filter(c => c > 1).length;

    return {
      totalSales: Math.round(totalSales),        // Net total (what customer paid)
      netSales: Math.round(totalSales),          // Same as totalSales for clarity
      subtotalSales: Math.round(subtotalSales),  // After discounts, before shipping/tax
      totalDiscounts: Math.round(totalDiscounts),
      totalTax: Math.round(totalTax),
      totalShipping: Math.round(totalShipping),
      grossSales: Math.round(grossSales),        // Before discounts (matches Shopify Admin)
      orderCount,
      avgOrderValue: Math.round(avgOrderValue),
      uniqueCustomers,
      returningCustomers,
      returningRate: uniqueCustomers > 0 ? Math.round((returningCustomers / uniqueCustomers) * 100) : 0
    };
  }

  /**
   * Format date as DD/MM/YYYY (Israeli format)
   */
  formatDateDisplay(date) {
    const d = new Date(date);
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
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

    // Convert to array with both date and label fields for chart compatibility
    return Object.entries(salesByDate).map(([date, stats]) => ({
      date,
      label: this.formatDateDisplay(date), // DD/MM/YYYY format for chart
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
  getTopCustomersFromOrders(orders, limit = 10) {
    const customerStats = {};

    orders.forEach(order => {
      if (!order.customer?.id) return;

      const customerId = order.customer.id;
      if (!customerStats[customerId]) {
        customerStats[customerId] = {
          id: customerId,
          name: `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim() || 'לקוח',
          email: order.customer.email,
          phone: order.customer.phone,
          orderCount: 0,
          totalSpent: 0,
          lastOrderDate: null
        };
      }

      customerStats[customerId].orderCount += 1;
      customerStats[customerId].totalSpent += parseFloat(order.total_price || 0);

      const orderDate = new Date(order.created_at);
      if (!customerStats[customerId].lastOrderDate || orderDate > new Date(customerStats[customerId].lastOrderDate)) {
        customerStats[customerId].lastOrderDate = order.created_at;
      }
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
   * Get all customers from REST API
   */
  async getCustomers(limit = 250) {
    this.ensureInitialized();

    const cacheKey = 'shopify_rest_customers';
    const cached = cache.get(cacheKey);
    if (cached) {
      console.log(`[ShopifyREST] Cache hit for customers (${cached.length})`);
      return cached;
    }

    const allCustomers = [];
    let url = `/customers.json?limit=${limit}`;
    let pageCount = 0;
    const maxPages = 50;

    console.log('[ShopifyREST] Fetching customers...');

    while (url && pageCount < maxPages) {
      pageCount++;
      try {
        const response = pageCount === 1
          ? await this.client.get(url)
          : await axios.get(url, {
              headers: { 'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN },
              timeout: 30000
            });

        const customers = response.data.customers || [];
        allCustomers.push(...customers);

        console.log(`[ShopifyREST] Customers page ${pageCount}: ${customers.length} (total: ${allCustomers.length})`);

        const linkHeader = response.headers.link || response.headers['link'];
        url = this.extractNextUrl(linkHeader);

        if (url) {
          await new Promise(r => setTimeout(r, 250));
        }
      } catch (error) {
        console.error(`[ShopifyREST] Error fetching customers:`, error.message);
        break;
      }
    }

    console.log(`[ShopifyREST] Total customers: ${allCustomers.length}`);

    // Cache for 10 minutes
    cache.set(cacheKey, allCustomers, TTL.CUSTOMERS);

    return allCustomers;
  }

  /**
   * Get all products from REST API
   */
  async getProducts(limit = 250) {
    this.ensureInitialized();

    const cacheKey = 'shopify_rest_products';
    const cached = cache.get(cacheKey);
    if (cached) {
      console.log(`[ShopifyREST] Cache hit for products (${cached.length})`);
      return cached;
    }

    const allProducts = [];
    let url = `/products.json?limit=${limit}`;
    let pageCount = 0;
    const maxPages = 50;

    console.log('[ShopifyREST] Fetching products...');

    while (url && pageCount < maxPages) {
      pageCount++;
      try {
        const response = pageCount === 1
          ? await this.client.get(url)
          : await axios.get(url, {
              headers: { 'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN },
              timeout: 30000
            });

        const products = response.data.products || [];
        allProducts.push(...products);

        console.log(`[ShopifyREST] Products page ${pageCount}: ${products.length} (total: ${allProducts.length})`);

        const linkHeader = response.headers.link || response.headers['link'];
        url = this.extractNextUrl(linkHeader);

        if (url) {
          await new Promise(r => setTimeout(r, 250));
        }
      } catch (error) {
        console.error(`[ShopifyREST] Error fetching products:`, error.message);
        break;
      }
    }

    console.log(`[ShopifyREST] Total products: ${allProducts.length}`);

    // Cache for 10 minutes
    cache.set(cacheKey, allProducts, TTL.PRODUCTS);

    return allProducts;
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

  /**
   * Get order count for date range
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @param {boolean} paidOnly - Only count paid orders (default: true)
   */
  async getOrderCount(startDate, endDate, paidOnly = true) {
    this.ensureInitialized();

    try {
      const params = new URLSearchParams({
        status: 'any',
        created_at_min: this.formatDateForAPI(startDate),
        created_at_max: this.formatDateForAPI(endDate, true)
      });

      // Add financial status filter to match paid orders only
      if (paidOnly) {
        params.set('financial_status', 'paid');
      }

      const response = await this.client.get(`/orders/count.json?${params.toString()}`);
      return response.data.count;
    } catch (error) {
      console.error('[ShopifyREST] Error getting order count:', error.message);
      return 0;
    }
  }

  /**
   * Debug: Get pagination info for a date range
   */
  async debugOrders(startDate, endDate) {
    this.ensureInitialized();

    const result = {
      dateRange: {
        start: startDate.toISOString(),
        end: endDate.toISOString()
      },
      orderCount: 0,
      pages: [],
      totalFetched: 0,
      totalSales: 0
    };

    try {
      // Get count first
      result.orderCount = await this.getOrderCount(startDate, endDate);

      // Fetch orders and log each page
      const orders = await this.getOrders(startDate, endDate);
      result.totalFetched = orders.length;
      result.totalSales = orders.reduce((sum, o) => sum + parseFloat(o.total_price || 0), 0);

      // Sample of orders
      result.sampleOrders = orders.slice(0, 5).map(o => ({
        name: o.name,
        created_at: o.created_at,
        total: o.total_price
      }));

      result.match = result.orderCount === result.totalFetched;
      result.message = result.match
        ? 'All orders fetched successfully'
        : `WARNING: Count says ${result.orderCount} but only fetched ${result.totalFetched}`;

    } catch (error) {
      result.error = error.message;
    }

    return result;
  }
}

// Export singleton
const shopifyRest = new ShopifyREST();

module.exports = shopifyRest;
