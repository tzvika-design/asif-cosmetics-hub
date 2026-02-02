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

// GET /api/shopify/discounts - Coupon codes and usage (FIXED)
router.get('/discounts', async (req, res) => {
  try {
    const { baseUrl, headers } = shopifyService.getConfig();
    const axios = require('axios');
    const allDiscounts = [];

    console.log('=== FETCHING SHOPIFY DISCOUNTS ===');

    // 1. Fetch ALL price rules with pagination
    let priceRulesUrl = `${baseUrl}/price_rules.json?limit=250`;
    let allPriceRules = [];

    while (priceRulesUrl) {
      console.log('Fetching price rules:', priceRulesUrl);
      const priceRulesResponse = await axios.get(priceRulesUrl, { headers });
      const rules = priceRulesResponse.data.price_rules || [];
      allPriceRules = allPriceRules.concat(rules);
      console.log(`Got ${rules.length} price rules, total: ${allPriceRules.length}`);

      // Check for pagination link
      const linkHeader = priceRulesResponse.headers.link;
      priceRulesUrl = null;
      if (linkHeader) {
        const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        if (nextMatch) priceRulesUrl = nextMatch[1];
      }
    }

    console.log(`Total price rules found: ${allPriceRules.length}`);

    // 2. Get discount codes for each price rule (with pagination)
    for (const rule of allPriceRules) {
      let codesUrl = `${baseUrl}/price_rules/${rule.id}/discount_codes.json?limit=250`;

      while (codesUrl) {
        try {
          const codesResponse = await axios.get(codesUrl, { headers });
          const codes = codesResponse.data.discount_codes || [];

          console.log(`Price rule "${rule.title}" (ID: ${rule.id}): ${codes.length} codes`);

          // Add each discount code as a separate entry
          for (const code of codes) {
            console.log(`  - Code: "${code.code}", usage_count: ${code.usage_count}`);
            allDiscounts.push({
              id: code.id,
              priceRuleId: rule.id,
              code: code.code,
              title: code.code, // Use code as title for display
              value: rule.value,
              valueType: rule.value_type,
              targetType: rule.target_type,
              usageCount: code.usage_count || 0,
              usageLimit: rule.usage_limit,
              startsAt: rule.starts_at,
              endsAt: rule.ends_at,
              source: 'price_rule'
            });
          }

          // Check for pagination
          const linkHeader = codesResponse.headers.link;
          codesUrl = null;
          if (linkHeader) {
            const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
            if (nextMatch) codesUrl = nextMatch[1];
          }
        } catch (e) {
          console.log(`Error fetching codes for rule ${rule.id}:`, e.message);
          codesUrl = null;
        }
      }
    }

    // 3. Try to fetch automatic discounts (GraphQL API)
    try {
      console.log('Fetching automatic discounts via GraphQL...');
      const graphqlUrl = baseUrl.replace('/admin/api/2024-01', '/admin/api/2024-01/graphql.json');

      const graphqlQuery = {
        query: `{
          discountNodes(first: 100) {
            edges {
              node {
                id
                discount {
                  ... on DiscountCodeBasic {
                    title
                    codes(first: 10) {
                      edges {
                        node {
                          code
                          usageCount: asyncUsageCount
                        }
                      }
                    }
                  }
                  ... on DiscountCodeBxgy {
                    title
                    codes(first: 10) {
                      edges {
                        node {
                          code
                          usageCount: asyncUsageCount
                        }
                      }
                    }
                  }
                  ... on DiscountCodeFreeShipping {
                    title
                    codes(first: 10) {
                      edges {
                        node {
                          code
                          usageCount: asyncUsageCount
                        }
                      }
                    }
                  }
                  ... on DiscountAutomaticBasic {
                    title
                  }
                  ... on DiscountAutomaticBxgy {
                    title
                  }
                }
              }
            }
          }
        }`
      };

      const graphqlResponse = await axios.post(graphqlUrl, graphqlQuery, { headers });

      if (graphqlResponse.data?.data?.discountNodes?.edges) {
        const nodes = graphqlResponse.data.data.discountNodes.edges;
        console.log(`GraphQL returned ${nodes.length} discount nodes`);

        for (const edge of nodes) {
          const node = edge.node;
          const discount = node.discount;

          if (discount?.codes?.edges) {
            for (const codeEdge of discount.codes.edges) {
              const codeData = codeEdge.node;
              const existingCode = allDiscounts.find(d => d.code === codeData.code);

              if (existingCode) {
                // Update usage count if GraphQL has better data
                if (codeData.usageCount && codeData.usageCount > existingCode.usageCount) {
                  console.log(`Updating ${codeData.code} usage: ${existingCode.usageCount} -> ${codeData.usageCount}`);
                  existingCode.usageCount = codeData.usageCount;
                }
              } else {
                console.log(`GraphQL found new code: ${codeData.code}, usage: ${codeData.usageCount}`);
                allDiscounts.push({
                  id: node.id,
                  code: codeData.code,
                  title: codeData.code,
                  usageCount: codeData.usageCount || 0,
                  source: 'graphql'
                });
              }
            }
          }
        }
      }
    } catch (graphqlError) {
      console.log('GraphQL fetch failed (optional):', graphqlError.message);
    }

    // Sort by usage count (highest first)
    allDiscounts.sort((a, b) => b.usageCount - a.usageCount);

    console.log(`=== TOTAL DISCOUNTS: ${allDiscounts.length} ===`);
    console.log('Top 5 by usage:');
    allDiscounts.slice(0, 5).forEach(d => {
      console.log(`  ${d.code}: ${d.usageCount} uses`);
    });

    res.json({
      success: true,
      data: allDiscounts,
      total: allDiscounts.length
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
