/**
 * Sales Agent
 * Analyzes sales patterns and identifies trends
 */

const BaseAgent = require('./BaseAgent');
const { prisma } = require('../services/database');

class SalesAgent extends BaseAgent {
  constructor() {
    super('SalesAgent', `אתה אנליסט מכירות לחנות קוסמטיקה בשם "אסיף קוסמטיקס".

תפקידך לנתח דפוסי מכירות ולזהות:
1. מגמות מכירות (עליה/ירידה)
2. מוצרים מובילים ומוצרים שלא מוכרים
3. דפוסים עונתיים וימי שיא
4. הזדמנויות לשיפור מכירות
5. אזהרות על ירידה במכירות

תמיד הסבר את ההיגיון שלך בעברית ברורה ותמציתית.`);
  }

  /**
   * Analyze sales data
   */
  async analyze() {
    // Get last 30 days of daily stats
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const dailyStats = await prisma.dailyStat.findMany({
      where: {
        date: { gte: thirtyDaysAgo }
      },
      orderBy: { date: 'asc' }
    });

    if (dailyStats.length === 0) {
      console.log('[SalesAgent] No daily stats to analyze');
      return { analysis: 'אין נתוני מכירות לניתוח', recommendations: [] };
    }

    // Calculate metrics
    const totalSales = dailyStats.reduce((sum, d) => sum + parseFloat(d.totalSales), 0);
    const totalOrders = dailyStats.reduce((sum, d) => sum + d.orderCount, 0);
    const avgDailySales = totalSales / dailyStats.length;
    const avgDailyOrders = totalOrders / dailyStats.length;

    // Find best and worst days
    const sortedBySales = [...dailyStats].sort((a, b) =>
      parseFloat(b.totalSales) - parseFloat(a.totalSales)
    );
    const bestDay = sortedBySales[0];
    const worstDay = sortedBySales[sortedBySales.length - 1];

    // Calculate week-over-week trend
    const lastWeek = dailyStats.slice(-7);
    const previousWeek = dailyStats.slice(-14, -7);

    const lastWeekSales = lastWeek.reduce((sum, d) => sum + parseFloat(d.totalSales), 0);
    const previousWeekSales = previousWeek.reduce((sum, d) => sum + parseFloat(d.totalSales), 0);
    const weekOverWeekChange = previousWeekSales > 0
      ? ((lastWeekSales - previousWeekSales) / previousWeekSales * 100).toFixed(1)
      : 0;

    const salesMetrics = {
      period: '30 ימים אחרונים',
      totalSales: Math.round(totalSales),
      totalOrders,
      avgDailySales: Math.round(avgDailySales),
      avgDailyOrders: Math.round(avgDailyOrders * 10) / 10,
      bestDay: {
        date: bestDay.date,
        sales: Math.round(parseFloat(bestDay.totalSales)),
        orders: bestDay.orderCount
      },
      worstDay: {
        date: worstDay.date,
        sales: Math.round(parseFloat(worstDay.totalSales)),
        orders: worstDay.orderCount
      },
      weekOverWeekChange: weekOverWeekChange + '%',
      trend: parseFloat(weekOverWeekChange) > 0 ? 'עליה' : parseFloat(weekOverWeekChange) < 0 ? 'ירידה' : 'יציב'
    };

    // Get top products
    const topProducts = await prisma.productStat.findMany({
      orderBy: { totalRevenue: 'desc' },
      take: 10
    });

    // Get AI analysis
    const analysis = await this.getAIAnalysis(
      'מהן המגמות העיקריות במכירות? האם יש סיבה לדאגה או הזדמנויות לשיפור?',
      { salesMetrics, topProducts: topProducts.map(p => ({ title: p.title, revenue: p.totalRevenue, quantity: p.totalQuantitySold })) }
    );

    // Log the analysis
    await this.logAction(
      'Analysis',
      analysis.reasoning || 'ניתוח מכירות הושלם',
      analysis.recommendation,
      { salesMetrics, topProductsCount: topProducts.length },
      analysis.confidence
    );

    // Alert if sales are declining significantly
    if (parseFloat(weekOverWeekChange) < -15) {
      await this.logAction(
        'Alert',
        `ירידה משמעותית במכירות: ${weekOverWeekChange}% בהשוואה לשבוע שעבר`,
        'מומלץ לבדוק סיבות אפשריות ולשקול פעולות שיווקיות',
        { weekOverWeekChange, lastWeekSales, previousWeekSales },
        95
      );
    }

    return {
      analysis: analysis.analysis,
      recommendation: analysis.recommendation,
      metrics: salesMetrics,
      trend: salesMetrics.trend
    };
  }

  /**
   * Get sales recommendations
   */
  async getRecommendations() {
    // Get recent daily stats
    const lastWeek = await prisma.dailyStat.findMany({
      orderBy: { date: 'desc' },
      take: 7
    });

    // Get slow-moving products (low sales in last 30 days)
    const slowMovers = await prisma.productStat.findMany({
      where: {
        totalQuantitySold: { lt: 5 }
      },
      orderBy: { totalQuantitySold: 'asc' },
      take: 10
    });

    // Get best selling products
    const bestSellers = await prisma.productStat.findMany({
      orderBy: { totalQuantitySold: 'desc' },
      take: 10
    });

    return {
      weekSummary: lastWeek.map(d => ({
        date: d.date,
        sales: d.totalSales,
        orders: d.orderCount
      })),
      slowMovers: slowMovers.map(p => ({
        title: p.title,
        quantitySold: p.totalQuantitySold,
        recommendation: 'שקול מבצע או הורדת מחיר'
      })),
      bestSellers: bestSellers.map(p => ({
        title: p.title,
        quantitySold: p.totalQuantitySold,
        revenue: p.totalRevenue
      }))
    };
  }
}

module.exports = SalesAgent;
