const express = require('express');
const shopifyService = require('../services/shopify');

const router = express.Router();

// GET /api/shopify/analytics - Sales summary
router.get('/analytics', async (req, res) => {
  try {
    const orders = await shopifyService.getOrders({ status: 'any', limit: 250 });

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Filter orders by date
    const todayOrders = orders.filter(o => new Date(o.created_at) >= today);
    const weekOrders = orders.filter(o => new Date(o.created_at) >= weekAgo);
    const monthOrders = orders.filter(o => new Date(o.created_at) >= monthAgo);

    // Calculate totals
    const calcTotal = (orderList) => orderList.reduce((sum, o) => sum + parseFloat(o.total_price || 0), 0);
    const calcAvg = (orderList) => orderList.length > 0 ? calcTotal(orderList) / orderList.length : 0;

    // Daily sales for chart (last 7 days)
    const dailySales = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
      const nextDate = new Date(date.getTime() + 24 * 60 * 60 * 1000);
      const dayOrders = orders.filter(o => {
        const orderDate = new Date(o.created_at);
        return orderDate >= date && orderDate < nextDate;
      });
      dailySales.push({
        date: date.toISOString().split('T')[0],
        day: date.toLocaleDateString('he-IL', { weekday: 'short' }),
        orders: dayOrders.length,
        total: calcTotal(dayOrders)
      });
    }

    res.json({
      success: true,
      data: {
        today: {
          orders: todayOrders.length,
          total: calcTotal(todayOrders),
          average: calcAvg(todayOrders)
        },
        week: {
          orders: weekOrders.length,
          total: calcTotal(weekOrders),
          average: calcAvg(weekOrders)
        },
        month: {
          orders: monthOrders.length,
          total: calcTotal(monthOrders),
          average: calcAvg(monthOrders)
        },
        dailySales,
        currency: orders[0]?.currency || 'ILS'
      }
    });

  } catch (error) {
    console.error('Analytics error:', error.message);
    res.status(500).json({
      error: true,
      message: error.message
    });
  }
});

// GET /api/shopify/discounts - Coupon codes and usage
router.get('/discounts', async (req, res) => {
  try {
    const { baseUrl, headers } = shopifyService.getConfig();

    // Get price rules (discount codes are attached to price rules)
    const priceRulesResponse = await require('axios').get(
      `${baseUrl}/price_rules.json`,
      { headers }
    );

    const priceRules = priceRulesResponse.data.price_rules || [];

    // Get discount codes for each price rule
    const discountsWithCodes = await Promise.all(
      priceRules.map(async (rule) => {
        try {
          const codesResponse = await require('axios').get(
            `${baseUrl}/price_rules/${rule.id}/discount_codes.json`,
            { headers }
          );
          return {
            id: rule.id,
            title: rule.title,
            value: rule.value,
            valueType: rule.value_type,
            targetType: rule.target_type,
            usageLimit: rule.usage_limit,
            startsAt: rule.starts_at,
            endsAt: rule.ends_at,
            codes: codesResponse.data.discount_codes || []
          };
        } catch (e) {
          return {
            id: rule.id,
            title: rule.title,
            value: rule.value,
            valueType: rule.value_type,
            codes: []
          };
        }
      })
    );

    // Calculate usage stats
    const discountStats = discountsWithCodes.map(discount => ({
      ...discount,
      totalUsage: discount.codes.reduce((sum, code) => sum + (code.usage_count || 0), 0)
    }));

    // Sort by usage
    discountStats.sort((a, b) => b.totalUsage - a.totalUsage);

    res.json({
      success: true,
      data: discountStats
    });

  } catch (error) {
    console.error('Discounts error:', error.message);
    res.status(500).json({
      error: true,
      message: error.message
    });
  }
});

// GET /api/shopify/top-products - Best sellers and low stock
router.get('/top-products', async (req, res) => {
  try {
    // Get all products
    const products = await shopifyService.getProducts({ limit: 250 });

    // Get recent orders to calculate sales
    const orders = await shopifyService.getOrders({ status: 'any', limit: 250 });

    // Count product sales from line items
    const productSales = {};
    orders.forEach(order => {
      (order.line_items || []).forEach(item => {
        const productId = item.product_id;
        if (!productSales[productId]) {
          productSales[productId] = {
            id: productId,
            title: item.title,
            quantity: 0,
            revenue: 0
          };
        }
        productSales[productId].quantity += item.quantity;
        productSales[productId].revenue += parseFloat(item.price) * item.quantity;
      });
    });

    // Convert to array and sort
    const salesArray = Object.values(productSales);
    const bestByQuantity = [...salesArray].sort((a, b) => b.quantity - a.quantity).slice(0, 10);
    const bestByRevenue = [...salesArray].sort((a, b) => b.revenue - a.revenue).slice(0, 10);

    // Find low stock products
    const lowStock = products
      .map(p => {
        const totalInventory = (p.variants || []).reduce((sum, v) => sum + (v.inventory_quantity || 0), 0);
        return {
          id: p.id,
          title: p.title,
          image: p.images?.[0]?.src || null,
          inventory: totalInventory,
          price: p.variants?.[0]?.price || '0'
        };
      })
      .filter(p => p.inventory <= 5 && p.inventory >= 0)
      .sort((a, b) => a.inventory - b.inventory)
      .slice(0, 10);

    res.json({
      success: true,
      data: {
        bestByQuantity,
        bestByRevenue,
        lowStock,
        totalProducts: products.length
      }
    });

  } catch (error) {
    console.error('Top products error:', error.message);
    res.status(500).json({
      error: true,
      message: error.message
    });
  }
});

// GET /api/shopify/products - Get all products for dropdown
router.get('/products', async (req, res) => {
  try {
    const products = await shopifyService.getProducts({ limit: 250 });

    const simplifiedProducts = products.map(p => ({
      id: p.id,
      title: p.title,
      description: p.body_html ? p.body_html.replace(/<[^>]*>/g, '').substring(0, 200) : '',
      image: p.images?.[0]?.src || null,
      price: p.variants?.[0]?.price || '0',
      inventory: (p.variants || []).reduce((sum, v) => sum + (v.inventory_quantity || 0), 0)
    }));

    res.json({
      success: true,
      data: simplifiedProducts
    });

  } catch (error) {
    console.error('Products error:', error.message);
    res.status(500).json({
      error: true,
      message: error.message
    });
  }
});

module.exports = router;
