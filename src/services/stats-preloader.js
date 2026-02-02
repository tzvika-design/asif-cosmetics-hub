/**
 * Stats Preloader Service
 * Pre-calculates and caches stats on server start
 * Refreshes every 10 minutes
 */

const shopifyGraphQL = require('./shopify-graphql');
const { cache, TTL } = require('./cache');

class StatsPreloader {
  constructor() {
    this.isLoading = false;
    this.lastLoadTime = null;
    this.refreshInterval = null;
    this.stats = {
      today: null,
      week: null,
      month: null,
      lastMonth: null,
      year: null,
      lastYear: null,
      dailySales: {},
      monthlySales: {},
      topProducts: null,
      topCustomers: null
    };
  }

  /**
   * Get date range for a period
   */
  getDateRange(period) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

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

  /**
   * Pre-load stats for all common periods
   */
  async preloadAll() {
    if (this.isLoading) {
      console.log('[StatsPreloader] Already loading, skipping...');
      return;
    }

    this.isLoading = true;
    const startTime = Date.now();
    console.log('[StatsPreloader] ========================================');
    console.log('[StatsPreloader] Starting preload of all stats...');

    // Check environment first
    if (!process.env.SHOPIFY_STORE_URL || !process.env.SHOPIFY_ACCESS_TOKEN) {
      console.error('[StatsPreloader] ERROR: Shopify credentials not configured!');
      console.error('[StatsPreloader] Set SHOPIFY_STORE_URL and SHOPIFY_ACCESS_TOKEN in environment');
      this.isLoading = false;
      return;
    }

    console.log(`[StatsPreloader] Store: ${process.env.SHOPIFY_STORE_URL}`);

    let loadedCount = 0;
    let errorCount = 0;

    try {
      // Load stats for common periods in parallel
      const periods = ['today', 'week', 'month', 'lastMonth', 'year'];

      console.log('[StatsPreloader] Loading period stats...');
      await Promise.all(periods.map(async (period) => {
        try {
          const { start, end } = this.getDateRange(period);
          this.stats[period] = await shopifyGraphQL.getStats(start, end);
          const sales = this.stats[period].totalSales || 0;
          const orders = this.stats[period].orderCount || 0;
          console.log(`[StatsPreloader] ${period}: ₪${sales.toLocaleString()}, ${orders} orders`);
          loadedCount++;
        } catch (error) {
          console.error(`[StatsPreloader] Error loading ${period}:`, error.message);
          errorCount++;
        }
      }));

      // Load month daily sales for chart
      try {
        console.log('[StatsPreloader] Loading daily sales for chart...');
        const { start: monthStart, end: monthEnd } = this.getDateRange('month');
        const dailySalesData = await shopifyGraphQL.getDailySales(monthStart, monthEnd);
        this.stats.dailySales.month = dailySalesData;
        console.log(`[StatsPreloader] Daily sales: ${dailySalesData.data?.length || 0} days loaded`);
        loadedCount++;
      } catch (error) {
        console.error('[StatsPreloader] Error loading daily sales:', error.message);
        errorCount++;
      }

      // Load top products for month
      try {
        console.log('[StatsPreloader] Loading top products...');
        const { start: monthStart, end: monthEnd } = this.getDateRange('month');
        this.stats.topProducts = await shopifyGraphQL.getTopProducts(monthStart, monthEnd, 20);
        console.log(`[StatsPreloader] Top products: ${this.stats.topProducts?.products?.length || 0} products`);
        loadedCount++;
      } catch (error) {
        console.error('[StatsPreloader] Error loading top products:', error.message);
        errorCount++;
      }

      // Load top customers (all time, sorted by spend)
      try {
        console.log('[StatsPreloader] Loading top customers...');
        const yearAgo = new Date();
        yearAgo.setFullYear(yearAgo.getFullYear() - 1);
        this.stats.topCustomers = await shopifyGraphQL.getCustomers(yearAgo, new Date());
        console.log(`[StatsPreloader] Customers: ${this.stats.topCustomers?.customers?.length || 0} customers`);
        loadedCount++;
      } catch (error) {
        console.error('[StatsPreloader] Error loading customers:', error.message);
        errorCount++;
      }

      this.lastLoadTime = new Date();

      const elapsed = Date.now() - startTime;
      console.log('[StatsPreloader] ========================================');
      console.log(`[StatsPreloader] Preload complete in ${elapsed}ms`);
      console.log(`[StatsPreloader] Loaded: ${loadedCount}, Errors: ${errorCount}`);

      // Summary of loaded data
      if (this.stats.month) {
        console.log(`[StatsPreloader] Month summary: ₪${this.stats.month.totalSales?.toLocaleString() || 0}, ${this.stats.month.orderCount || 0} orders`);
      }
      console.log('[StatsPreloader] ========================================');

    } catch (error) {
      console.error('[StatsPreloader] Preload error:', error.message);
      console.error('[StatsPreloader] Stack:', error.stack);
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Get preloaded stats for a period
   * @param {string} period - Period name (today, week, month, lastMonth, year, lastYear)
   * @returns {Object|null}
   */
  getStats(period) {
    return this.stats[period] || null;
  }

  /**
   * Get preloaded daily sales
   * @param {string} period - Period name
   */
  getDailySales(period = 'month') {
    return this.stats.dailySales[period] || null;
  }

  /**
   * Get preloaded top products
   */
  getTopProducts() {
    return this.stats.topProducts || null;
  }

  /**
   * Get preloaded top customers
   */
  getTopCustomers() {
    return this.stats.topCustomers || null;
  }

  /**
   * Check if data is ready
   */
  isReady() {
    return this.stats.month !== null;
  }

  /**
   * Get status info
   */
  getStatus() {
    return {
      isLoading: this.isLoading,
      isReady: this.isReady(),
      lastLoadTime: this.lastLoadTime?.toISOString() || null,
      periodsLoaded: Object.keys(this.stats).filter(k => this.stats[k] !== null).length,
      cacheStats: cache.getStats()
    };
  }

  /**
   * Start automatic refresh every 10 minutes
   */
  startAutoRefresh() {
    // Clear any existing interval
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }

    // Refresh every 10 minutes
    const refreshMs = 10 * 60 * 1000;
    this.refreshInterval = setInterval(() => {
      console.log('[StatsPreloader] Auto-refresh triggered');
      this.preloadAll();
    }, refreshMs);

    console.log('[StatsPreloader] Auto-refresh enabled (every 10 minutes)');
  }

  /**
   * Stop automatic refresh
   */
  stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
      console.log('[StatsPreloader] Auto-refresh disabled');
    }
  }

  /**
   * Initialize on server start
   */
  async initialize() {
    console.log('[StatsPreloader] Initializing...');

    // Clear all caches to ensure fresh data
    console.log('[StatsPreloader] Clearing all caches...');
    cache.clearPattern('shopify');

    // Start preloading immediately
    await this.preloadAll();

    // Enable auto-refresh
    this.startAutoRefresh();

    return this.getStatus();
  }

  /**
   * Force refresh all stats
   */
  async refresh() {
    // Clear cache for stats
    cache.clearPattern('shopify_stats');
    cache.clearPattern('shopify_orders');
    cache.clearPattern('shopify_daily_sales');
    cache.clearPattern('shopify_top_products');
    cache.clearPattern('shopify_customers');

    // Reload
    await this.preloadAll();

    return this.getStatus();
  }
}

// Export singleton
const statsPreloader = new StatsPreloader();

module.exports = statsPreloader;
