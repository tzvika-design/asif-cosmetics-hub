/**
 * Coupon Agent
 * Analyzes coupon profitability and identifies "bleeding" coupons
 */

const BaseAgent = require('./BaseAgent');
const { prisma } = require('../services/database');

class CouponAgent extends BaseAgent {
  constructor() {
    super('CouponAgent', `אתה אנליסט פיננסי המתמחה ברווחיות קופונים בחנות קוסמטיקה בשם "אסיף קוסמטיקס".

תפקידך לנתח נתוני שימוש בקופונים ולזהות:
1. "קופונים מדממים" - קופונים שגורמים להפסד נקי (הנחה > רווח)
2. קופונים מצליחים שכדאי לקדם
3. דפוסי שימוש חשודים (שימוש יתר, שימוש לא הגיוני)
4. המלצות לשיפור אסטרטגיית הקופונים

תמיד הסבר את ההיגיון שלך בעברית ברורה ותמציתית.`);
  }

  /**
   * Analyze coupon performance
   */
  async analyze() {
    // Get coupon data from DB
    const coupons = await prisma.couponStat.findMany({
      where: { timesUsed: { gt: 0 } },
      orderBy: { totalDiscountGiven: 'desc' }
    });

    if (coupons.length === 0) {
      console.log('[CouponAgent] No coupon data to analyze');
      return { analysis: 'אין נתוני קופונים לניתוח', recommendations: [] };
    }

    // Calculate profitability metrics
    const couponMetrics = coupons.map(c => {
      const discountGiven = parseFloat(c.totalDiscountGiven) || 0;
      const revenueGenerated = parseFloat(c.totalRevenueGenerated) || 0;
      const discountRatio = revenueGenerated > 0 ? (discountGiven / revenueGenerated) * 100 : 100;

      return {
        code: c.couponCode,
        type: c.couponType,
        value: c.discountValue,
        timesUsed: c.timesUsed,
        totalDiscount: discountGiven,
        totalRevenue: revenueGenerated,
        discountRatio: discountRatio.toFixed(1) + '%',
        isPotentiallyBleeding: discountRatio > 30, // More than 30% discount ratio
        status: c.status
      };
    });

    // Get AI analysis
    const analysis = await this.getAIAnalysis(
      'אילו קופונים מפסידים כסף וצריך להשבית? אילו קופונים מצליחים במיוחד?',
      couponMetrics
    );

    // Log the analysis
    await this.logAction(
      'Analysis',
      analysis.reasoning || 'ניתוח קופונים הושלם',
      analysis.recommendation,
      { couponsAnalyzed: coupons.length, metrics: couponMetrics },
      analysis.confidence
    );

    // Flag bleeding coupons in database
    const bleedingCoupons = [];
    for (const coupon of coupons) {
      const discountGiven = parseFloat(coupon.totalDiscountGiven) || 0;
      const revenueGenerated = parseFloat(coupon.totalRevenueGenerated) || 0;
      const isBleeding = revenueGenerated > 0 && (discountGiven / revenueGenerated) > 0.3;

      if (isBleeding !== coupon.isBleedingMoney) {
        await prisma.couponStat.update({
          where: { id: coupon.id },
          data: { isBleedingMoney: isBleeding }
        });

        if (isBleeding) {
          bleedingCoupons.push(coupon.couponCode);
        }
      }
    }

    if (bleedingCoupons.length > 0) {
      await this.logAction(
        'Alert',
        `זוהו ${bleedingCoupons.length} קופונים מדממים: ${bleedingCoupons.join(', ')}`,
        'מומלץ לבדוק את הקופונים הללו ולשקול השבתה',
        { bleedingCoupons },
        90
      );
    }

    return {
      analysis: analysis.analysis,
      recommendation: analysis.recommendation,
      metrics: couponMetrics,
      bleedingCoupons
    };
  }

  /**
   * Get recommendations for coupon strategy
   */
  async getRecommendations() {
    // Get bleeding coupons
    const bleedingCoupons = await prisma.couponStat.findMany({
      where: { isBleedingMoney: true, isActive: true }
    });

    // Get top performing coupons
    const topPerformers = await prisma.couponStat.findMany({
      where: {
        isBleedingMoney: false,
        timesUsed: { gt: 5 }
      },
      orderBy: { totalRevenueGenerated: 'desc' },
      take: 5
    });

    return {
      bleedingCoupons: bleedingCoupons.map(c => ({
        code: c.couponCode,
        discountGiven: c.totalDiscountGiven,
        revenueGenerated: c.totalRevenueGenerated,
        recommendation: 'שקול השבתה'
      })),
      topPerformers: topPerformers.map(c => ({
        code: c.couponCode,
        timesUsed: c.timesUsed,
        revenueGenerated: c.totalRevenueGenerated,
        recommendation: 'שקול קידום'
      }))
    };
  }
}

module.exports = CouponAgent;
