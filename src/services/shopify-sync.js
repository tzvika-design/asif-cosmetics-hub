/**
 * Shopify Sync Service
 * Syncs data from Shopify to PostgreSQL database
 */

const shopifyGraphQL = require('./shopify-graphql');
const { prisma } = require('./database');

class ShopifySyncService {
  constructor() {
    this.isRunning = false;
    this.lastSyncAt = null;
    this.syncInterval = null;
  }

  /**
   * Start automatic sync on schedule
   * @param {number} intervalMinutes - Minutes between syncs
   */
  startAutoSync(intervalMinutes = 60) {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    console.log(`[ShopifySync] Starting auto-sync every ${intervalMinutes} minutes`);

    // Run initial sync
    this.runFullSync().catch(err => {
      console.error('[ShopifySync] Initial sync failed:', err.message);
    });

    // Schedule recurring syncs
    this.syncInterval = setInterval(() => {
      this.runFullSync().catch(err => {
        console.error('[ShopifySync] Scheduled sync failed:', err.message);
      });
    }, intervalMinutes * 60 * 1000);
  }

  /**
   * Stop automatic sync
   */
  stopAutoSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log('[ShopifySync] Auto-sync stopped');
    }
  }

  /**
   * Run a full sync of all data types
   */
  async runFullSync() {
    if (this.isRunning) {
      console.log('[ShopifySync] Sync already in progress, skipping');
      return { skipped: true };
    }

    this.isRunning = true;
    const startTime = Date.now();
    console.log('[ShopifySync] Starting full sync...');

    const results = {
      dailyStats: null,
      productStats: null,
      customerStats: null,
      couponStats: null,
      errors: []
    };

    try {
      // Sync in order of dependency
      results.dailyStats = await this.syncDailyStats();
      results.productStats = await this.syncProductStats();
      results.customerStats = await this.syncCustomerStats();
      results.couponStats = await this.syncCouponStats();

      // Log successful sync
      await this.logSync('full', 'success', {
        duration: Date.now() - startTime,
        ...results
      });

      this.lastSyncAt = new Date();

    } catch (error) {
      console.error('[ShopifySync] Full sync error:', error.message);
      results.errors.push(error.message);

      await this.logSync('full', 'error', {
        duration: Date.now() - startTime,
        error: error.message
      });
    }

    this.isRunning = false;
    console.log(`[ShopifySync] Full sync completed in ${Date.now() - startTime}ms`);

    return results;
  }

  /**
   * Sync daily stats for the last 90 days
   */
  async syncDailyStats() {
    console.log('[ShopifySync] Syncing daily stats...');
    const startTime = Date.now();

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 90);

    try {
      const dailySales = await shopifyGraphQL.getDailySales(startDate, endDate);

      let created = 0;
      let updated = 0;

      for (const day of dailySales.data) {
        const dateObj = new Date(day.date);
        dateObj.setHours(0, 0, 0, 0);

        const existing = await prisma.dailyStat.findUnique({
          where: { date: dateObj }
        });

        const data = {
          date: dateObj,
          totalSales: day.sales,
          orderCount: day.orders,
          avgOrderValue: day.orders > 0 ? Math.round(day.sales / day.orders) : 0
        };

        if (existing) {
          await prisma.dailyStat.update({
            where: { date: dateObj },
            data
          });
          updated++;
        } else {
          await prisma.dailyStat.create({ data });
          created++;
        }
      }

      console.log(`[ShopifySync] Daily stats: ${created} created, ${updated} updated in ${Date.now() - startTime}ms`);

      return { created, updated, days: dailySales.data.length };

    } catch (error) {
      console.error('[ShopifySync] Daily stats sync error:', error.message);
      throw error;
    }
  }

  /**
   * Sync product stats
   */
  async syncProductStats() {
    console.log('[ShopifySync] Syncing product stats...');
    const startTime = Date.now();

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    try {
      // Get orders to extract product data
      const ordersData = await shopifyGraphQL.getOrders(startDate, endDate);

      // Aggregate by product
      const productSales = {};

      for (const order of ordersData.orders) {
        const lineItems = order.lineItems?.nodes || [];

        for (const item of lineItems) {
          const productId = item.product?.id;
          if (!productId) continue;

          if (!productSales[productId]) {
            productSales[productId] = {
              productId,
              title: item.title,
              totalQuantitySold: 0,
              totalRevenue: 0,
              orderCount: 0
            };
          }

          productSales[productId].totalQuantitySold += item.quantity;
          productSales[productId].totalRevenue += parseFloat(item.originalTotalSet?.shopMoney?.amount || 0);
          productSales[productId].orderCount += 1;
        }
      }

      let created = 0;
      let updated = 0;

      for (const stats of Object.values(productSales)) {
        const existing = await prisma.productStat.findUnique({
          where: { productId: stats.productId }
        });

        if (existing) {
          await prisma.productStat.update({
            where: { productId: stats.productId },
            data: {
              title: stats.title,
              totalQuantitySold: stats.totalQuantitySold,
              totalRevenue: stats.totalRevenue
            }
          });
          updated++;
        } else {
          await prisma.productStat.create({
            data: {
              productId: stats.productId,
              title: stats.title,
              totalQuantitySold: stats.totalQuantitySold,
              totalRevenue: stats.totalRevenue,
              currentStock: 0 // Will be updated by inventory sync
            }
          });
          created++;
        }
      }

      console.log(`[ShopifySync] Product stats: ${created} created, ${updated} updated in ${Date.now() - startTime}ms`);

      return { created, updated, products: Object.keys(productSales).length };

    } catch (error) {
      console.error('[ShopifySync] Product stats sync error:', error.message);
      throw error;
    }
  }

  /**
   * Sync customer stats
   */
  async syncCustomerStats() {
    console.log('[ShopifySync] Syncing customer stats...');
    const startTime = Date.now();

    try {
      // Get all customers
      const customersData = await shopifyGraphQL.getCustomers(null, null);

      let created = 0;
      let updated = 0;

      for (const customer of customersData.customers) {
        const customerId = customer.id;

        const existing = await prisma.customerStat.findUnique({
          where: { customerId }
        });

        const data = {
          customerId,
          email: customer.email || '',
          firstName: customer.firstName || '',
          lastName: customer.lastName || '',
          totalOrders: customer.ordersCount || 0,
          totalSpent: parseFloat(customer.totalSpentV2?.amount || 0),
          lastOrderAt: customer.lastOrder?.createdAt ? new Date(customer.lastOrder.createdAt) : null
        };

        if (existing) {
          await prisma.customerStat.update({
            where: { customerId },
            data
          });
          updated++;
        } else {
          await prisma.customerStat.create({ data });
          created++;
        }
      }

      console.log(`[ShopifySync] Customer stats: ${created} created, ${updated} updated in ${Date.now() - startTime}ms`);

      return { created, updated, customers: customersData.customers.length };

    } catch (error) {
      console.error('[ShopifySync] Customer stats sync error:', error.message);
      throw error;
    }
  }

  /**
   * Sync coupon stats
   */
  async syncCouponStats() {
    console.log('[ShopifySync] Syncing coupon stats...');
    const startTime = Date.now();

    try {
      // Get all discounts
      const discountsData = await shopifyGraphQL.searchDiscounts('');

      // Get orders to calculate coupon usage
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 90);
      const ordersData = await shopifyGraphQL.getOrders(startDate, endDate);

      // Calculate coupon usage from orders
      const couponUsage = {};

      for (const order of ordersData.orders) {
        const codes = order.discountCodes || [];
        const orderTotal = parseFloat(order.totalPriceSet?.shopMoney?.amount || 0);
        const orderDiscount = parseFloat(order.totalDiscountsSet?.shopMoney?.amount || 0);

        for (const code of codes) {
          if (!couponUsage[code]) {
            couponUsage[code] = {
              timesUsed: 0,
              totalDiscountGiven: 0,
              totalRevenueGenerated: 0
            };
          }

          couponUsage[code].timesUsed += 1;
          couponUsage[code].totalDiscountGiven += orderDiscount / codes.length; // Split if multiple codes
          couponUsage[code].totalRevenueGenerated += orderTotal;
        }
      }

      let created = 0;
      let updated = 0;

      for (const discount of discountsData.discounts) {
        const couponCode = discount.code;
        const usage = couponUsage[couponCode] || { timesUsed: 0, totalDiscountGiven: 0, totalRevenueGenerated: 0 };

        const existing = await prisma.couponStat.findUnique({
          where: { couponCode }
        });

        // Calculate if bleeding
        const discountRatio = usage.totalRevenueGenerated > 0
          ? usage.totalDiscountGiven / usage.totalRevenueGenerated
          : 0;
        const isBleedingMoney = discountRatio > 0.3;

        const data = {
          couponCode,
          couponType: discount.valueType || 'unknown',
          discountValue: discount.value || 0,
          timesUsed: usage.timesUsed || discount.usageCount || 0,
          totalDiscountGiven: usage.totalDiscountGiven,
          totalRevenueGenerated: usage.totalRevenueGenerated,
          isActive: discount.isActive,
          status: discount.status,
          isBleedingMoney
        };

        if (existing) {
          await prisma.couponStat.update({
            where: { couponCode },
            data
          });
          updated++;
        } else {
          await prisma.couponStat.create({ data });
          created++;
        }
      }

      console.log(`[ShopifySync] Coupon stats: ${created} created, ${updated} updated in ${Date.now() - startTime}ms`);

      return { created, updated, coupons: discountsData.discounts.length };

    } catch (error) {
      console.error('[ShopifySync] Coupon stats sync error:', error.message);
      throw error;
    }
  }

  /**
   * Log sync operation to database
   */
  async logSync(syncType, status, details = {}) {
    try {
      await prisma.syncLog.create({
        data: {
          syncType,
          status,
          details,
          recordsProcessed: details.created + details.updated || 0,
          errorMessage: status === 'error' ? details.error : null
        }
      });
    } catch (error) {
      console.error('[ShopifySync] Failed to log sync:', error.message);
    }
  }

  /**
   * Get sync status
   */
  async getStatus() {
    const lastSync = await prisma.syncLog.findFirst({
      where: { status: 'success' },
      orderBy: { startedAt: 'desc' }
    });

    const lastError = await prisma.syncLog.findFirst({
      where: { status: 'error' },
      orderBy: { startedAt: 'desc' }
    });

    const stats = await prisma.$transaction([
      prisma.dailyStat.count(),
      prisma.productStat.count(),
      prisma.customerStat.count(),
      prisma.couponStat.count()
    ]);

    return {
      isRunning: this.isRunning,
      lastSyncAt: this.lastSyncAt || lastSync?.startedAt || null,
      lastSyncStatus: lastSync?.status || 'never',
      lastError: lastError?.errorMessage || null,
      lastErrorAt: lastError?.startedAt || null,
      recordCounts: {
        dailyStats: stats[0],
        productStats: stats[1],
        customerStats: stats[2],
        couponStats: stats[3]
      }
    };
  }
}

// Export singleton
const shopifySync = new ShopifySyncService();

module.exports = shopifySync;
