const axios = require('axios');

class ShopifyService {
  constructor() {
    this.baseUrl = null;
    this.headers = null;
  }

  initialize() {
    if (!process.env.SHOPIFY_STORE_URL || !process.env.SHOPIFY_ACCESS_TOKEN) {
      throw new Error('Shopify credentials not configured');
    }

    const apiVersion = process.env.SHOPIFY_API_VERSION || '2024-01';
    this.baseUrl = `https://${process.env.SHOPIFY_STORE_URL}/admin/api/${apiVersion}`;
    this.headers = {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN
    };
  }

  getConfig() {
    if (!this.baseUrl) {
      this.initialize();
    }
    return { baseUrl: this.baseUrl, headers: this.headers };
  }

  // Helper to parse Link header for pagination
  parseNextPageUrl(linkHeader) {
    if (!linkHeader) return null;
    const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    return match ? match[1] : null;
  }

  // Orders - with FULL pagination and date filtering
  async getOrders(params = {}) {
    const { baseUrl, headers } = this.getConfig();
    const allOrders = [];

    // Build query params
    const queryParams = {
      status: params.status || 'any',
      limit: 250 // Max allowed by Shopify
    };

    // Add date filtering if provided (ISO format for Shopify API)
    if (params.created_at_min) {
      queryParams.created_at_min = params.created_at_min;
    }
    if (params.created_at_max) {
      queryParams.created_at_max = params.created_at_max;
    }

    const query = new URLSearchParams(queryParams).toString();
    let url = `${baseUrl}/orders.json?${query}`;
    let pageCount = 0;

    console.log(`[Shopify Orders] Starting fetch with params:`, queryParams);

    // Fetch ALL pages
    while (url) {
      pageCount++;
      console.log(`[Shopify Orders] Fetching page ${pageCount}...`);

      try {
        const response = await axios.get(url, {
          headers,
          timeout: 60000
        });

        const orders = response.data.orders || [];
        allOrders.push(...orders);

        console.log(`[Shopify Orders] Page ${pageCount}: got ${orders.length} orders (total so far: ${allOrders.length})`);

        // Check for next page using Link header
        const linkHeader = response.headers?.link;
        url = this.parseNextPageUrl(linkHeader);

        // Rate limiting - wait 500ms between requests
        if (url) {
          await new Promise(r => setTimeout(r, 500));
        }
      } catch (error) {
        console.error(`[Shopify Orders] Error on page ${pageCount}:`, error.message);
        break;
      }
    }

    console.log(`[Shopify Orders] COMPLETE: Fetched ${allOrders.length} orders from ${pageCount} pages`);

    // Calculate totals for logging
    const totalGross = allOrders.reduce((sum, o) => sum + parseFloat(o.total_price || 0), 0);
    const totalNet = allOrders.reduce((sum, o) => sum + parseFloat(o.subtotal_price || 0), 0);
    console.log(`[Shopify Orders] Total gross: ₪${totalGross.toFixed(2)}, Total net (subtotal): ₪${totalNet.toFixed(2)}`);

    return allOrders;
  }

  async getOrder(id) {
    const { baseUrl, headers } = this.getConfig();
    const response = await axios.get(`${baseUrl}/orders/${id}.json`, { headers });
    return response.data.order;
  }

  async createOrder(orderData) {
    const { baseUrl, headers } = this.getConfig();
    const response = await axios.post(`${baseUrl}/orders.json`, { order: orderData }, { headers });
    return response.data.order;
  }

  async updateOrder(id, updates) {
    const { baseUrl, headers } = this.getConfig();
    const response = await axios.put(`${baseUrl}/orders/${id}.json`, { order: updates }, { headers });
    return response.data.order;
  }

  // Products - with pagination
  async getProducts(params = {}) {
    const { baseUrl, headers } = this.getConfig();
    const allProducts = [];

    const queryParams = {
      limit: 250,
      ...params
    };

    const query = new URLSearchParams(queryParams).toString();
    let url = `${baseUrl}/products.json?${query}`;
    let pageCount = 0;

    while (url) {
      pageCount++;
      try {
        const response = await axios.get(url, { headers, timeout: 30000 });
        const products = response.data.products || [];
        allProducts.push(...products);

        const linkHeader = response.headers?.link;
        url = this.parseNextPageUrl(linkHeader);

        if (url) await new Promise(r => setTimeout(r, 300));
      } catch (error) {
        console.error(`[Shopify Products] Error:`, error.message);
        break;
      }
    }

    console.log(`[Shopify Products] Fetched ${allProducts.length} products from ${pageCount} pages`);
    return allProducts;
  }

  async getProduct(id) {
    const { baseUrl, headers } = this.getConfig();
    const response = await axios.get(`${baseUrl}/products/${id}.json`, { headers });
    return response.data.product;
  }

  async createProduct(productData) {
    const { baseUrl, headers } = this.getConfig();
    const response = await axios.post(`${baseUrl}/products.json`, { product: productData }, { headers });
    return response.data.product;
  }

  async updateProduct(id, updates) {
    const { baseUrl, headers } = this.getConfig();
    const response = await axios.put(`${baseUrl}/products/${id}.json`, { product: updates }, { headers });
    return response.data.product;
  }

  // Customers - with FULL pagination and date filtering
  async getCustomers(params = {}) {
    const { baseUrl, headers } = this.getConfig();
    const allCustomers = [];

    const queryParams = {
      limit: 250, // Max allowed
      ...params
    };

    const query = new URLSearchParams(queryParams).toString();
    let url = `${baseUrl}/customers.json?${query}`;
    let pageCount = 0;

    console.log(`[Shopify Customers] Starting fetch...`);

    while (url) {
      pageCount++;
      try {
        const response = await axios.get(url, { headers, timeout: 60000 });
        const customers = response.data.customers || [];
        allCustomers.push(...customers);

        console.log(`[Shopify Customers] Page ${pageCount}: got ${customers.length} (total: ${allCustomers.length})`);

        const linkHeader = response.headers?.link;
        url = this.parseNextPageUrl(linkHeader);

        if (url) await new Promise(r => setTimeout(r, 500));
      } catch (error) {
        console.error(`[Shopify Customers] Error:`, error.message);
        break;
      }
    }

    console.log(`[Shopify Customers] COMPLETE: Fetched ${allCustomers.length} customers from ${pageCount} pages`);
    return allCustomers;
  }

  async getCustomer(id) {
    const { baseUrl, headers } = this.getConfig();
    const response = await axios.get(`${baseUrl}/customers/${id}.json`, { headers });
    return response.data.customer;
  }

  // Inventory
  async getInventoryLevels(params = {}) {
    const { baseUrl, headers } = this.getConfig();
    const query = new URLSearchParams(params).toString();
    const response = await axios.get(`${baseUrl}/inventory_levels.json?${query}`, { headers });
    return response.data.inventory_levels;
  }

  async adjustInventory(inventoryItemId, locationId, adjustment) {
    const { baseUrl, headers } = this.getConfig();
    const response = await axios.post(`${baseUrl}/inventory_levels/adjust.json`, {
      inventory_item_id: inventoryItemId,
      location_id: locationId,
      available_adjustment: adjustment
    }, { headers });
    return response.data.inventory_level;
  }

  // GraphQL endpoint for complex queries (like discounts)
  async graphql(query, variables = {}) {
    const { baseUrl, headers } = this.getConfig();
    const graphqlUrl = baseUrl.replace('/admin/api/', '/admin/api/').replace('.json', '') + '/graphql.json';

    const response = await axios.post(
      `https://${process.env.SHOPIFY_STORE_URL}/admin/api/${process.env.SHOPIFY_API_VERSION || '2024-01'}/graphql.json`,
      { query, variables },
      { headers, timeout: 30000 }
    );

    return response.data;
  }
}

module.exports = new ShopifyService();
