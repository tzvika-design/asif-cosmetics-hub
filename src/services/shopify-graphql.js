/**
 * Shopify GraphQL Service
 * Fast, efficient data fetching using GraphQL API
 */

const axios = require('axios');
const { cache, TTL } = require('./cache');

class ShopifyGraphQL {
  constructor() {
    this.baseUrl = null;
    this.headers = null;
    this.initialized = false;

    // Request logging
    this.requestLog = [];
    this.maxLogEntries = 100;
  }

  /**
   * Initialize the service with credentials
   */
  initialize() {
    if (!process.env.SHOPIFY_STORE_URL || !process.env.SHOPIFY_ACCESS_TOKEN) {
      throw new Error('Shopify credentials not configured');
    }

    const apiVersion = process.env.SHOPIFY_API_VERSION || '2024-01';
    this.baseUrl = `https://${process.env.SHOPIFY_STORE_URL}/admin/api/${apiVersion}/graphql.json`;
    this.headers = {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN
    };
    this.initialized = true;

    console.log('[ShopifyGraphQL] Initialized');
  }

  /**
   * Log a request for debugging
   */
  logRequest(endpoint, dateRange, resultCount, durationMs, fromCache = false) {
    const entry = {
      timestamp: new Date().toISOString(),
      endpoint,
      dateRange,
      resultCount,
      durationMs,
      fromCache
    };

    this.requestLog.unshift(entry);
    if (this.requestLog.length > this.maxLogEntries) {
      this.requestLog.pop();
    }

    const cacheStr = fromCache ? ' [CACHED]' : '';
    console.log(`[ShopifyGraphQL] ${endpoint} | ${dateRange.start} to ${dateRange.end} | ${resultCount} results | ${durationMs}ms${cacheStr}`);
  }

  /**
   * Get recent request logs
   */
  getRequestLog(limit = 20) {
    return this.requestLog.slice(0, limit);
  }

  /**
   * Execute a GraphQL query
   */
  async query(queryString, variables = {}) {
    if (!this.initialized) {
      this.initialize();
    }

    const response = await axios.post(
      this.baseUrl,
      { query: queryString, variables },
      { headers: this.headers, timeout: 60000 }
    );

    if (response.data.errors) {
      console.error('[ShopifyGraphQL] Errors:', response.data.errors);
      throw new Error(response.data.errors[0]?.message || 'GraphQL error');
    }

    return response.data.data;
  }

  /**
   * Format date for Shopify API (ISO format)
   */
  formatDate(date) {
    if (!date) return null;
    const d = new Date(date);
    return d.toISOString();
  }

  /**
   * Format date for display (DD/MM/YYYY)
   */
  formatDateDisplay(date) {
    const d = new Date(date);
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
  }

  /**
   * Get orders with date range - fetches ALL pages
   * @param {Date} startDate - Start of date range
   * @param {Date} endDate - End of date range
   * @returns {Object} - { orders, totals, stats }
   */
  async getOrders(startDate, endDate) {
    const startTime = Date.now();
    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];

    // Check cache
    const cacheKey = cache.generateKey('orders', startStr, endStr);
    const cached = cache.get(cacheKey);
    if (cached) {
      this.logRequest('getOrders', { start: startStr, end: endStr }, cached.orders.length, Date.now() - startTime, true);
      return cached;
    }

    const orders = [];
    let cursor = null;
    let hasNextPage = true;
    let pageCount = 0;

    // GraphQL query for orders
    const query = `
      query getOrders($first: Int!, $after: String, $query: String) {
        orders(first: $first, after: $after, query: $query, sortKey: CREATED_AT, reverse: true) {
          pageInfo {
            hasNextPage
            endCursor
          }
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
            subtotalPriceSet {
              shopMoney {
                amount
              }
            }
            totalDiscountsSet {
              shopMoney {
                amount
              }
            }
            totalTaxSet {
              shopMoney {
                amount
              }
            }
            displayFinancialStatus
            displayFulfillmentStatus
            customer {
              id
              firstName
              lastName
              email
              ordersCount
            }
            discountCodes
            lineItems(first: 50) {
              nodes {
                title
                quantity
                originalTotalSet {
                  shopMoney {
                    amount
                  }
                }
                product {
                  id
                }
              }
            }
          }
        }
      }
    `;

    // Build date query
    const dateQuery = `created_at:>=${this.formatDate(startDate)} AND created_at:<=${this.formatDate(endDate)}`;

    while (hasNextPage) {
      pageCount++;
      console.log(`[ShopifyGraphQL] Fetching orders page ${pageCount}...`);

      try {
        const data = await this.query(query, {
          first: 250,
          after: cursor,
          query: dateQuery
        });

        const pageOrders = data.orders.nodes || [];
        orders.push(...pageOrders);

        hasNextPage = data.orders.pageInfo.hasNextPage;
        cursor = data.orders.pageInfo.endCursor;

        // Rate limiting - wait between pages
        if (hasNextPage) {
          await new Promise(r => setTimeout(r, 300));
        }
      } catch (error) {
        console.error(`[ShopifyGraphQL] Error on page ${pageCount}:`, error.message);
        break;
      }
    }

    // Calculate totals
    const totals = {
      grossSales: 0,      // Before discounts
      netSales: 0,        // After discounts (what customer paid)
      discounts: 0,
      tax: 0,
      orderCount: orders.length
    };

    orders.forEach(order => {
      const subtotal = parseFloat(order.subtotalPriceSet?.shopMoney?.amount || 0);
      const total = parseFloat(order.totalPriceSet?.shopMoney?.amount || 0);
      const discount = parseFloat(order.totalDiscountsSet?.shopMoney?.amount || 0);
      const tax = parseFloat(order.totalTaxSet?.shopMoney?.amount || 0);

      totals.grossSales += subtotal + discount; // Original price before discount
      totals.netSales += total;
      totals.discounts += discount;
      totals.tax += tax;
    });

    totals.avgOrderValue = orders.length > 0 ? totals.netSales / orders.length : 0;

    const result = {
      orders,
      totals,
      period: {
        start: this.formatDateDisplay(startDate),
        end: this.formatDateDisplay(endDate)
      },
      fetchedAt: new Date().toISOString()
    };

    // Cache the result
    cache.set(cacheKey, result, TTL.ORDERS);

    this.logRequest('getOrders', { start: startStr, end: endStr }, orders.length, Date.now() - startTime);

    return result;
  }

  /**
   * Get customers with their order stats
   * @param {Date} startDate - Start of date range (for filtering by last order)
   * @param {Date} endDate - End of date range
   * @returns {Object} - { customers, stats }
   */
  async getCustomers(startDate, endDate) {
    const startTime = Date.now();
    const startStr = startDate?.toISOString().split('T')[0] || 'all';
    const endStr = endDate?.toISOString().split('T')[0] || 'all';

    // Check cache
    const cacheKey = cache.generateKey('customers', startStr, endStr);
    const cached = cache.get(cacheKey);
    if (cached) {
      this.logRequest('getCustomers', { start: startStr, end: endStr }, cached.customers.length, Date.now() - startTime, true);
      return cached;
    }

    const customers = [];
    let cursor = null;
    let hasNextPage = true;
    let pageCount = 0;

    const query = `
      query getCustomers($first: Int!, $after: String) {
        customers(first: $first, after: $after, sortKey: TOTAL_SPENT, reverse: true) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
            firstName
            lastName
            email
            createdAt
            ordersCount
            totalSpentV2 {
              amount
              currencyCode
            }
            lastOrder {
              id
              createdAt
              totalPriceSet {
                shopMoney {
                  amount
                }
              }
            }
          }
        }
      }
    `;

    while (hasNextPage) {
      pageCount++;
      console.log(`[ShopifyGraphQL] Fetching customers page ${pageCount}...`);

      try {
        const data = await this.query(query, {
          first: 250,
          after: cursor
        });

        const pageCustomers = data.customers.nodes || [];
        customers.push(...pageCustomers);

        hasNextPage = data.customers.pageInfo.hasNextPage;
        cursor = data.customers.pageInfo.endCursor;

        if (hasNextPage) {
          await new Promise(r => setTimeout(r, 300));
        }
      } catch (error) {
        console.error(`[ShopifyGraphQL] Error on page ${pageCount}:`, error.message);
        break;
      }
    }

    // Filter by date range if provided
    let filteredCustomers = customers;
    if (startDate && endDate) {
      filteredCustomers = customers.filter(c => {
        if (!c.lastOrder?.createdAt) return false;
        const lastOrderDate = new Date(c.lastOrder.createdAt);
        return lastOrderDate >= startDate && lastOrderDate <= endDate;
      });
    }

    // Calculate stats
    const stats = {
      totalCustomers: filteredCustomers.length,
      totalSpent: filteredCustomers.reduce((sum, c) => sum + parseFloat(c.totalSpentV2?.amount || 0), 0),
      avgLTV: 0,
      newCustomers: 0,
      returningCustomers: 0
    };

    filteredCustomers.forEach(c => {
      if (c.ordersCount > 1) {
        stats.returningCustomers++;
      } else {
        stats.newCustomers++;
      }
    });

    stats.avgLTV = stats.totalCustomers > 0 ? stats.totalSpent / stats.totalCustomers : 0;
    stats.returningRate = stats.totalCustomers > 0
      ? Math.round((stats.returningCustomers / stats.totalCustomers) * 100)
      : 0;

    const result = {
      customers: filteredCustomers,
      stats,
      period: {
        start: startDate ? this.formatDateDisplay(startDate) : 'all',
        end: endDate ? this.formatDateDisplay(endDate) : 'all'
      },
      fetchedAt: new Date().toISOString()
    };

    cache.set(cacheKey, result, TTL.CUSTOMERS);

    this.logRequest('getCustomers', { start: startStr, end: endStr }, filteredCustomers.length, Date.now() - startTime);

    return result;
  }

  /**
   * Search for discount codes
   * @param {string} searchTerm - Code or title to search for
   * @returns {Object} - { discounts, match }
   */
  async searchDiscounts(searchTerm = '') {
    const startTime = Date.now();

    // Check cache for full discount list
    const cacheKey = cache.generateKey('discounts', 'all', 'all', { search: searchTerm || 'all' });
    const cached = cache.get(cacheKey);
    if (cached) {
      this.logRequest('searchDiscounts', { start: 'n/a', end: 'n/a' }, cached.discounts.length, Date.now() - startTime, true);
      return cached;
    }

    const discounts = [];
    let cursor = null;
    let hasNextPage = true;

    const query = `
      query getDiscounts($first: Int!, $after: String, $query: String) {
        codeDiscountNodes(first: $first, after: $after, query: $query) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
            codeDiscount {
              ... on DiscountCodeBasic {
                title
                status
                startsAt
                endsAt
                usageLimit
                codes(first: 10) {
                  nodes {
                    code
                    usageCount: asyncUsageCount
                  }
                }
                customerGets {
                  value {
                    ... on DiscountPercentage {
                      percentage
                    }
                    ... on DiscountAmount {
                      amount {
                        amount
                      }
                    }
                  }
                }
              }
              ... on DiscountCodeBxgy {
                title
                status
                startsAt
                endsAt
                usageLimit
                codes(first: 10) {
                  nodes {
                    code
                    usageCount: asyncUsageCount
                  }
                }
              }
              ... on DiscountCodeFreeShipping {
                title
                status
                startsAt
                endsAt
                usageLimit
                codes(first: 10) {
                  nodes {
                    code
                    usageCount: asyncUsageCount
                  }
                }
              }
            }
          }
        }
      }
    `;

    // Build search query
    const searchQuery = searchTerm ? `title:*${searchTerm}* OR code:*${searchTerm}*` : null;

    while (hasNextPage) {
      try {
        const data = await this.query(query, {
          first: 100,
          after: cursor,
          query: searchQuery
        });

        const nodes = data.codeDiscountNodes?.nodes || [];

        for (const node of nodes) {
          const discount = node.codeDiscount;
          if (!discount) continue;

          const codes = discount.codes?.nodes || [];
          for (const codeNode of codes) {
            let value = null;
            let valueType = 'unknown';

            if (discount.customerGets?.value?.percentage) {
              value = discount.customerGets.value.percentage * 100;
              valueType = 'percentage';
            } else if (discount.customerGets?.value?.amount?.amount) {
              value = parseFloat(discount.customerGets.value.amount.amount);
              valueType = 'fixed_amount';
            }

            discounts.push({
              id: node.id,
              code: codeNode.code,
              title: discount.title || '',
              value,
              valueType,
              usageCount: codeNode.usageCount || 0,
              usageLimit: discount.usageLimit,
              startsAt: discount.startsAt,
              endsAt: discount.endsAt,
              status: discount.status?.toLowerCase() || 'unknown',
              isActive: discount.status === 'ACTIVE'
            });
          }
        }

        hasNextPage = data.codeDiscountNodes?.pageInfo?.hasNextPage;
        cursor = data.codeDiscountNodes?.pageInfo?.endCursor;

        if (hasNextPage) {
          await new Promise(r => setTimeout(r, 300));
        }
      } catch (error) {
        console.error('[ShopifyGraphQL] Discount search error:', error.message);
        break;
      }
    }

    // Find exact match if searching
    let match = null;
    if (searchTerm) {
      const searchUpper = searchTerm.toUpperCase();
      match = discounts.find(d => d.code.toUpperCase() === searchUpper);
      if (!match) {
        match = discounts.find(d =>
          d.code.toUpperCase().includes(searchUpper) ||
          d.title.toUpperCase().includes(searchUpper)
        );
      }
    }

    const result = {
      discounts,
      match,
      total: discounts.length,
      fetchedAt: new Date().toISOString()
    };

    cache.set(cacheKey, result, TTL.DISCOUNTS);

    this.logRequest('searchDiscounts', { start: 'n/a', end: 'n/a' }, discounts.length, Date.now() - startTime);

    return result;
  }

  /**
   * Get top products by sales
   * @param {Date} startDate - Start of date range
   * @param {Date} endDate - End of date range
   * @param {number} limit - Max products to return
   */
  async getTopProducts(startDate, endDate, limit = 10) {
    const startTime = Date.now();
    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];

    // Check cache
    const cacheKey = cache.generateKey('top_products', startStr, endStr, { limit });
    const cached = cache.get(cacheKey);
    if (cached) {
      this.logRequest('getTopProducts', { start: startStr, end: endStr }, cached.products.length, Date.now() - startTime, true);
      return cached;
    }

    // Get orders for the period
    const ordersData = await this.getOrders(startDate, endDate);

    // Aggregate product sales
    const productSales = {};

    ordersData.orders.forEach(order => {
      (order.lineItems?.nodes || []).forEach(item => {
        const productId = item.product?.id;
        if (!productId) return;

        if (!productSales[productId]) {
          productSales[productId] = {
            id: productId,
            title: item.title,
            quantity: 0,
            revenue: 0
          };
        }

        productSales[productId].quantity += item.quantity;
        productSales[productId].revenue += parseFloat(item.originalTotalSet?.shopMoney?.amount || 0);
      });
    });

    // Convert to array and sort
    const products = Object.values(productSales);
    const byRevenue = [...products].sort((a, b) => b.revenue - a.revenue).slice(0, limit);
    const byQuantity = [...products].sort((a, b) => b.quantity - a.quantity).slice(0, limit);

    const result = {
      products: byRevenue,
      byRevenue,
      byQuantity,
      total: products.length,
      period: {
        start: this.formatDateDisplay(startDate),
        end: this.formatDateDisplay(endDate)
      },
      fetchedAt: new Date().toISOString()
    };

    cache.set(cacheKey, result, TTL.PRODUCTS);

    this.logRequest('getTopProducts', { start: startStr, end: endStr }, byRevenue.length, Date.now() - startTime);

    return result;
  }

  /**
   * Get aggregated stats for a period
   * @param {Date} startDate - Start of date range
   * @param {Date} endDate - End of date range
   */
  async getStats(startDate, endDate) {
    const startTime = Date.now();
    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];

    // Check cache
    const cacheKey = cache.generateKey('stats', startStr, endStr);
    const cached = cache.get(cacheKey);
    if (cached) {
      this.logRequest('getStats', { start: startStr, end: endStr }, 1, Date.now() - startTime, true);
      return cached;
    }

    // Get orders for the period
    const ordersData = await this.getOrders(startDate, endDate);

    // Count unique customers and returning customers
    const customerOrders = {};
    ordersData.orders.forEach(order => {
      if (order.customer?.id) {
        customerOrders[order.customer.id] = (customerOrders[order.customer.id] || 0) + 1;
      }
    });

    const uniqueCustomers = Object.keys(customerOrders).length;
    const returningCustomers = Object.values(customerOrders).filter(c => c > 1).length;

    // Today's stats (if in range)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayOrders = ordersData.orders.filter(o => new Date(o.createdAt) >= today);
    const todaySales = todayOrders.reduce((sum, o) => sum + parseFloat(o.totalPriceSet?.shopMoney?.amount || 0), 0);

    const result = {
      totalSales: Math.round(ordersData.totals.netSales),
      totalSalesGross: Math.round(ordersData.totals.grossSales),
      totalDiscounts: Math.round(ordersData.totals.discounts),
      orderCount: ordersData.totals.orderCount,
      avgOrderValue: Math.round(ordersData.totals.avgOrderValue),
      uniqueCustomers,
      returningCustomers,
      returningRate: uniqueCustomers > 0 ? Math.round((returningCustomers / uniqueCustomers) * 100) : 0,
      todaySales: Math.round(todaySales),
      todayOrders: todayOrders.length,
      period: {
        start: this.formatDateDisplay(startDate),
        end: this.formatDateDisplay(endDate)
      },
      fetchedAt: new Date().toISOString()
    };

    cache.set(cacheKey, result, TTL.STATS);

    this.logRequest('getStats', { start: startStr, end: endStr }, 1, Date.now() - startTime);

    return result;
  }

  /**
   * Get daily sales data for charting
   * @param {Date} startDate - Start of date range
   * @param {Date} endDate - End of date range
   */
  async getDailySales(startDate, endDate) {
    const startTime = Date.now();
    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];

    // Check cache
    const cacheKey = cache.generateKey('daily_sales', startStr, endStr);
    const cached = cache.get(cacheKey);
    if (cached) {
      this.logRequest('getDailySales', { start: startStr, end: endStr }, cached.data.length, Date.now() - startTime, true);
      return cached;
    }

    // Get orders for the period
    const ordersData = await this.getOrders(startDate, endDate);

    // Initialize all days in range
    const salesByDate = {};
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dateKey = currentDate.toISOString().split('T')[0];
      salesByDate[dateKey] = { sales: 0, orders: 0 };
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Aggregate sales by day
    ordersData.orders.forEach(order => {
      const dateKey = new Date(order.createdAt).toISOString().split('T')[0];
      if (salesByDate[dateKey]) {
        salesByDate[dateKey].sales += parseFloat(order.totalPriceSet?.shopMoney?.amount || 0);
        salesByDate[dateKey].orders += 1;
      }
    });

    // Convert to array
    const data = Object.entries(salesByDate).map(([date, stats]) => ({
      date,
      label: this.formatDateDisplay(date),
      sales: Math.round(stats.sales),
      orders: stats.orders
    }));

    const result = {
      data,
      totals: ordersData.totals,
      period: {
        start: this.formatDateDisplay(startDate),
        end: this.formatDateDisplay(endDate)
      },
      fetchedAt: new Date().toISOString()
    };

    cache.set(cacheKey, result, TTL.STATS);

    this.logRequest('getDailySales', { start: startStr, end: endStr }, data.length, Date.now() - startTime);

    return result;
  }
}

// Export singleton
const shopifyGraphQL = new ShopifyGraphQL();

module.exports = shopifyGraphQL;
