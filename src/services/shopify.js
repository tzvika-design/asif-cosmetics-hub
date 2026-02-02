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

  // Orders
  async getOrders(params = {}) {
    const { baseUrl, headers } = this.getConfig();
    const query = new URLSearchParams({
      status: 'any',
      limit: 50,
      ...params
    }).toString();

    const response = await axios.get(`${baseUrl}/orders.json?${query}`, { headers });
    return response.data.orders;
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

  // Products
  async getProducts(params = {}) {
    const { baseUrl, headers } = this.getConfig();
    const query = new URLSearchParams({
      limit: 50,
      ...params
    }).toString();

    const response = await axios.get(`${baseUrl}/products.json?${query}`, { headers });
    return response.data.products;
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

  // Customers
  async getCustomers(params = {}) {
    const { baseUrl, headers } = this.getConfig();
    const query = new URLSearchParams({
      limit: 50,
      ...params
    }).toString();

    const response = await axios.get(`${baseUrl}/customers.json?${query}`, { headers });
    return response.data.customers;
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
}

module.exports = new ShopifyService();
