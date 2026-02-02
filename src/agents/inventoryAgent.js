/**
 * Inventory Agent
 * Monitors stock levels, predicts stockouts, recommends reorders
 */

const BaseAgent = require('./BaseAgent');
const { prisma } = require('../services/database');

class InventoryAgent extends BaseAgent {
  constructor() {
    super('InventoryAgent', `אתה מנהל מלאי לחנות קוסמטיקה בשם "אסיף קוסמטיקס".

תפקידך לנתח נתוני מלאי ולזהות:
1. מוצרים שעומדים להיגמר (פחות מ-14 יום לפי קצב מכירה נוכחי)
2. מוצרים עם מלאי מת (לא נמכרו יותר מ-30 יום)
3. המלצות להזמנה מחדש
4. אזהרות על מחסור צפוי
5. הזדמנויות לחיסול מלאי עודף

תמיד הסבר את ההיגיון שלך בעברית ברורה ותמציתית.`);
  }

  /**
   * Analyze inventory data
   */
  async analyze() {
    // Get product stats with sales velocity
    const products = await prisma.productStat.findMany({
      orderBy: { totalQuantitySold: 'desc' }
    });

    if (products.length === 0) {
      console.log('[InventoryAgent] No product data to analyze');
      return { analysis: 'אין נתוני מלאי לניתוח', recommendations: [] };
    }

    // Calculate days of inventory remaining for each product
    const inventoryMetrics = products.map(p => {
      const quantitySold = p.totalQuantitySold || 0;
      const currentStock = p.currentStock || 0;

      // Calculate daily sales rate (assume data is for 30 days)
      const dailySalesRate = quantitySold / 30;

      // Days until stockout
      const daysUntilStockout = dailySalesRate > 0
        ? Math.round(currentStock / dailySalesRate)
        : currentStock > 0 ? 999 : 0;

      return {
        productId: p.productId,
        title: p.title,
        sku: p.sku,
        currentStock,
        quantitySold,
        dailySalesRate: Math.round(dailySalesRate * 100) / 100,
        daysUntilStockout,
        status: this.getStockStatus(daysUntilStockout, currentStock, dailySalesRate)
      };
    });

    // Identify critical items (less than 14 days of stock)
    const criticalItems = inventoryMetrics.filter(p =>
      p.daysUntilStockout < 14 && p.dailySalesRate > 0
    );

    // Identify dead stock (no sales in 30 days but has stock)
    const deadStock = inventoryMetrics.filter(p =>
      p.quantitySold === 0 && p.currentStock > 0
    );

    // Get AI analysis
    const analysis = await this.getAIAnalysis(
      'אילו מוצרים צריך להזמין בדחיפות? האם יש מלאי מת שצריך לחסל?',
      {
        totalProducts: products.length,
        criticalItems: criticalItems.slice(0, 10),
        deadStock: deadStock.slice(0, 10),
        summary: {
          criticalCount: criticalItems.length,
          deadStockCount: deadStock.length,
          healthyCount: inventoryMetrics.filter(p => p.status === 'healthy').length
        }
      }
    );

    // Log the analysis
    await this.logAction(
      'Analysis',
      analysis.reasoning || 'ניתוח מלאי הושלם',
      analysis.recommendation,
      {
        productsAnalyzed: products.length,
        criticalItems: criticalItems.length,
        deadStock: deadStock.length
      },
      analysis.confidence
    );

    // Alert for critical items
    if (criticalItems.length > 0) {
      await this.logAction(
        'Alert',
        `זוהו ${criticalItems.length} מוצרים קריטיים שעומדים להיגמר תוך 14 יום`,
        'יש להזמין מלאי בדחיפות',
        { criticalItems: criticalItems.map(p => ({ title: p.title, daysLeft: p.daysUntilStockout })) },
        95
      );
    }

    // Alert for dead stock
    if (deadStock.length > 5) {
      await this.logAction(
        'Alert',
        `זוהו ${deadStock.length} מוצרים ללא מכירות ב-30 יום האחרונים`,
        'שקול מבצע חיסול או הורדה מהמדפים',
        { deadStock: deadStock.map(p => ({ title: p.title, stock: p.currentStock })) },
        85
      );
    }

    return {
      analysis: analysis.analysis,
      recommendation: analysis.recommendation,
      metrics: inventoryMetrics,
      criticalItems,
      deadStock
    };
  }

  /**
   * Get stock status label
   */
  getStockStatus(daysUntilStockout, currentStock, dailySalesRate) {
    if (currentStock === 0) return 'out_of_stock';
    if (dailySalesRate === 0 && currentStock > 0) return 'dead_stock';
    if (daysUntilStockout < 7) return 'critical';
    if (daysUntilStockout < 14) return 'low';
    if (daysUntilStockout < 30) return 'moderate';
    return 'healthy';
  }

  /**
   * Get reorder recommendations
   */
  async getRecommendations() {
    // Get products that need reordering
    const products = await prisma.productStat.findMany({
      where: {
        currentStock: { gt: 0 }
      }
    });

    const recommendations = products.map(p => {
      const dailySalesRate = (p.totalQuantitySold || 0) / 30;
      const daysUntilStockout = dailySalesRate > 0
        ? Math.round(p.currentStock / dailySalesRate)
        : 999;

      // Calculate suggested reorder quantity (30 days supply)
      const suggestedReorder = Math.ceil(dailySalesRate * 30);

      return {
        title: p.title,
        sku: p.sku,
        currentStock: p.currentStock,
        dailySalesRate: Math.round(dailySalesRate * 100) / 100,
        daysUntilStockout,
        suggestedReorder,
        priority: daysUntilStockout < 7 ? 'urgent' : daysUntilStockout < 14 ? 'high' : 'normal'
      };
    })
    .filter(p => p.daysUntilStockout < 30)
    .sort((a, b) => a.daysUntilStockout - b.daysUntilStockout);

    // Get dead stock for clearance
    const deadStock = await prisma.productStat.findMany({
      where: {
        totalQuantitySold: 0,
        currentStock: { gt: 0 }
      }
    });

    return {
      reorderList: recommendations.slice(0, 20),
      deadStock: deadStock.map(p => ({
        title: p.title,
        sku: p.sku,
        currentStock: p.currentStock,
        recommendation: 'שקול מבצע חיסול'
      }))
    };
  }
}

module.exports = InventoryAgent;
