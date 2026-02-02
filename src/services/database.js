/**
 * Database Service
 * Prisma client singleton for PostgreSQL access
 */

const { PrismaClient } = require('@prisma/client');

// Use singleton pattern for Prisma client
let prisma;

if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient();
} else {
  // In development, store in global to prevent multiple instances during hot reload
  if (!global.prisma) {
    global.prisma = new PrismaClient({
      log: ['query', 'info', 'warn', 'error']
    });
  }
  prisma = global.prisma;
}

/**
 * Connect to database
 */
async function connect() {
  try {
    await prisma.$connect();
    console.log('[Database] Connected to PostgreSQL');
    return true;
  } catch (error) {
    console.error('[Database] Connection failed:', error.message);
    return false;
  }
}

/**
 * Disconnect from database
 */
async function disconnect() {
  await prisma.$disconnect();
  console.log('[Database] Disconnected');
}

/**
 * Check if database is available
 */
async function healthCheck() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'healthy', message: 'Database connected' };
  } catch (error) {
    return { status: 'unhealthy', message: error.message };
  }
}

/**
 * Get database stats
 */
async function getStats() {
  try {
    const [orderCount, customerCount, dailyStatCount, couponCount, syncLogCount] = await Promise.all([
      prisma.order.count(),
      prisma.customerStat.count(),
      prisma.dailyStat.count(),
      prisma.couponStat.count(),
      prisma.syncLog.count()
    ]);

    return {
      orders: orderCount,
      customers: customerCount,
      dailyStats: dailyStatCount,
      coupons: couponCount,
      syncLogs: syncLogCount
    };
  } catch (error) {
    return { error: error.message };
  }
}

module.exports = {
  prisma,
  connect,
  disconnect,
  healthCheck,
  getStats
};
