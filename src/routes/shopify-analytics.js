const express = require('express');
const shopifyService = require('../services/shopify');

const router = express.Router();

// ==========================================
// RATE LIMITING & CACHING FOR SHOPIFY API
// ==========================================

// Cache for discounts (5 minute TTL)
let discountsCache = {
  data: null,
  timestamp: 0,
  TTL: 5 * 60 * 1000 // 5 minutes
};

// Rate limiter: max 2 requests per second to Shopify
const rateLimiter = {
  lastRequestTime: 0,
  minInterval: 500, // 500ms between requests = max 2 per second

  async wait() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.minInterval) {
      const waitTime = this.minInterval - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
  }
};

// Helper function for rate-limited API calls
async function rateLimitedRequest(requestFn) {
  await rateLimiter.wait();
  return requestFn();
}

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

// GET /api/shopify/discounts - Coupon codes and usage (WITH RATE LIMITING & CACHING)
router.get('/discounts', async (req, res) => {
  try {
    // Check cache first (5 minute TTL)
    const now = Date.now();
    if (discountsCache.data && (now - discountsCache.timestamp) < discountsCache.TTL) {
      console.log('=== RETURNING CACHED DISCOUNTS ===');
      return res.json({
        success: true,
        data: discountsCache.data,
        total: discountsCache.data.length,
        cached: true,
        cacheAge: Math.round((now - discountsCache.timestamp) / 1000) + 's'
      });
    }

    const { baseUrl, headers } = shopifyService.getConfig();
    const axios = require('axios');
    const allDiscounts = [];

    console.log('=== FETCHING SHOPIFY DISCOUNTS (RATE LIMITED) ===');

    // 1. Fetch ALL price rules with pagination (rate limited)
    let priceRulesUrl = `${baseUrl}/price_rules.json?limit=250`;
    let allPriceRules = [];

    while (priceRulesUrl) {
      console.log('Fetching price rules:', priceRulesUrl);

      // Rate limited request
      const priceRulesResponse = await rateLimitedRequest(() =>
        axios.get(priceRulesUrl, { headers })
      );

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

    // 2. Get discount codes for each price rule (rate limited, with 1 second delay between rules)
    for (let i = 0; i < allPriceRules.length; i++) {
      const rule = allPriceRules[i];
      let codesUrl = `${baseUrl}/price_rules/${rule.id}/discount_codes.json?limit=250`;

      // Add 1 second delay between price rules (not just rate limit)
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      while (codesUrl) {
        try {
          // Rate limited request
          const codesResponse = await rateLimitedRequest(() =>
            axios.get(codesUrl, { headers })
          );

          const codes = codesResponse.data.discount_codes || [];

          console.log(`Price rule "${rule.title}" (ID: ${rule.id}): ${codes.length} codes`);

          // Add each discount code as a separate entry
          for (const code of codes) {
            allDiscounts.push({
              id: code.id,
              priceRuleId: rule.id,
              code: code.code,
              title: code.code,
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
          // Handle 429 Too Many Requests specifically
          if (e.response?.status === 429) {
            console.log('Rate limited by Shopify, waiting 2 seconds...');
            await new Promise(resolve => setTimeout(resolve, 2000));
            continue; // Retry the same URL
          }
          console.log(`Error fetching codes for rule ${rule.id}:`, e.message);
          codesUrl = null;
        }
      }
    }

    // 3. Try to fetch automatic discounts (GraphQL API) - rate limited
    try {
      console.log('Fetching automatic discounts via GraphQL...');

      // Wait before GraphQL call
      await new Promise(resolve => setTimeout(resolve, 1000));

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

      const graphqlResponse = await rateLimitedRequest(() =>
        axios.post(graphqlUrl, graphqlQuery, { headers })
      );

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
                if (codeData.usageCount && codeData.usageCount > existingCode.usageCount) {
                  existingCode.usageCount = codeData.usageCount;
                }
              } else {
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

    // Update cache
    discountsCache.data = allDiscounts;
    discountsCache.timestamp = Date.now();

    console.log(`=== TOTAL DISCOUNTS: ${allDiscounts.length} (CACHED FOR 5 MIN) ===`);

    res.json({
      success: true,
      data: allDiscounts,
      total: allDiscounts.length,
      cached: false
    });

  } catch (error) {
    console.error('Discounts error:', error.message);

    // If we have cached data, return it even if stale
    if (discountsCache.data) {
      console.log('Returning stale cache due to error');
      return res.json({
        success: true,
        data: discountsCache.data,
        total: discountsCache.data.length,
        cached: true,
        stale: true
      });
    }

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
