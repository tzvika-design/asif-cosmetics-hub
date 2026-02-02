/**
 * Webhooks Handler
 * Receives real-time updates from Shopify, Meta, WhatsApp
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');

// Import services for updating data
const statsPreloader = require('../services/stats-preloader');
const { cache } = require('../services/cache');

// Try to import database (may not be initialized)
let prisma = null;
try {
  prisma = require('../services/database').prisma;
} catch (e) {
  console.log('[Webhooks] Database not available');
}

// ==========================================
// WEBHOOK INFO
// ==========================================

router.get('/', (req, res) => {
  res.json({
    name: 'Asif Cosmetics Webhooks',
    endpoints: {
      shopify: {
        orders_create: '/webhooks/shopify/orders/create',
        orders_updated: '/webhooks/shopify/orders/updated',
        orders_paid: '/webhooks/shopify/orders/paid',
        products_create: '/webhooks/shopify/products/create',
        products_update: '/webhooks/shopify/products/update',
        customers_create: '/webhooks/shopify/customers/create',
        inventory_update: '/webhooks/shopify/inventory/update',
        app_uninstalled: '/webhooks/shopify/app/uninstalled'
      },
      meta: '/webhooks/meta',
      whatsapp: '/webhooks/whatsapp'
    },
    register: '/webhooks/shopify/register'
  });
});

// ==========================================
// SHOPIFY WEBHOOK VERIFICATION
// ==========================================

/**
 * Verify Shopify webhook HMAC signature
 * Note: For raw body access, we need to configure express differently
 */
const verifyShopifyWebhook = (req, res, next) => {
  const hmac = req.get('X-Shopify-Hmac-Sha256');
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET || process.env.SHOPIFY_API_SECRET;

  if (!secret) {
    console.warn('[Webhook] No webhook secret configured - accepting without verification');
    return next();
  }

  if (!hmac) {
    console.warn('[Webhook] No HMAC header - accepting for development');
    return next();
  }

  // For proper verification, we need raw body
  // This is a simplified version
  const body = JSON.stringify(req.body);
  const hash = crypto
    .createHmac('sha256', secret)
    .update(body, 'utf8')
    .digest('base64');

  if (hash !== hmac) {
    console.error('[Webhook] Invalid HMAC signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  next();
};

// ==========================================
// SHOPIFY ORDER WEBHOOKS
// ==========================================

/**
 * POST /webhooks/shopify/orders/create
 * New order created
 */
router.post('/shopify/orders/create', verifyShopifyWebhook, async (req, res) => {
  const startTime = Date.now();

  try {
    const order = req.body;
    console.log(`[Webhook] 🛒 New order: #${order.name || order.id}`);
    console.log(`[Webhook]    Total: ₪${order.total_price}, Customer: ${order.customer?.first_name || 'Guest'}`);

    // Save order to database if available
    if (prisma) {
      try {
        await prisma.order.upsert({
          where: { shopifyOrderId: String(order.id) },
          update: {
            orderNumber: order.name,
            totalPrice: parseFloat(order.total_price) || 0,
            subtotalPrice: parseFloat(order.subtotal_price) || 0,
            totalDiscount: parseFloat(order.total_discounts) || 0,
            financialStatus: order.financial_status,
            fulfillmentStatus: order.fulfillment_status || 'unfulfilled',
            customerEmail: order.customer?.email,
            discountCodes: order.discount_codes?.map(d => d.code) || [],
            lineItems: order.line_items || [],
            updatedAt: new Date()
          },
          create: {
            shopifyOrderId: String(order.id),
            orderNumber: order.name,
            totalPrice: parseFloat(order.total_price) || 0,
            subtotalPrice: parseFloat(order.subtotal_price) || 0,
            totalDiscount: parseFloat(order.total_discounts) || 0,
            financialStatus: order.financial_status,
            fulfillmentStatus: order.fulfillment_status || 'unfulfilled',
            customerEmail: order.customer?.email,
            discountCodes: order.discount_codes?.map(d => d.code) || [],
            lineItems: order.line_items || [],
            orderDate: new Date(order.created_at)
          }
        });
        console.log(`[Webhook]    Saved to database`);
      } catch (dbError) {
        console.error(`[Webhook]    DB error: ${dbError.message}`);
      }
    }

    // Clear relevant caches so next request gets fresh data
    cache.clearPattern('shopify_orders');
    cache.clearPattern('shopify_stats');
    cache.clearPattern('shopify_daily_sales');
    console.log(`[Webhook]    Cache cleared`);

    // Trigger async refresh of preloader (don't wait)
    statsPreloader.preloadAll().catch(err => {
      console.error('[Webhook] Preloader refresh error:', err.message);
    });

    console.log(`[Webhook]    Processed in ${Date.now() - startTime}ms`);
    res.status(200).json({ received: true, orderId: order.id });

  } catch (error) {
    console.error('[Webhook] orders/create error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /webhooks/shopify/orders/updated
 * Order updated
 */
router.post('/shopify/orders/updated', verifyShopifyWebhook, async (req, res) => {
  try {
    const order = req.body;
    console.log(`[Webhook] 📝 Order updated: #${order.name || order.id}`);

    // Update in database if available
    if (prisma) {
      try {
        await prisma.order.upsert({
          where: { shopifyOrderId: String(order.id) },
          update: {
            financialStatus: order.financial_status,
            fulfillmentStatus: order.fulfillment_status || 'unfulfilled',
            totalPrice: parseFloat(order.total_price) || 0,
            updatedAt: new Date()
          },
          create: {
            shopifyOrderId: String(order.id),
            orderNumber: order.name,
            totalPrice: parseFloat(order.total_price) || 0,
            subtotalPrice: parseFloat(order.subtotal_price) || 0,
            totalDiscount: parseFloat(order.total_discounts) || 0,
            financialStatus: order.financial_status,
            fulfillmentStatus: order.fulfillment_status || 'unfulfilled',
            customerEmail: order.customer?.email,
            discountCodes: order.discount_codes?.map(d => d.code) || [],
            lineItems: order.line_items || [],
            orderDate: new Date(order.created_at)
          }
        });
      } catch (dbError) {
        console.error(`[Webhook] DB error: ${dbError.message}`);
      }
    }

    // Clear caches
    cache.clearPattern('shopify_orders');
    cache.clearPattern('shopify_stats');

    res.status(200).json({ received: true });

  } catch (error) {
    console.error('[Webhook] orders/updated error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /webhooks/shopify/orders/paid
 * Order payment completed
 */
router.post('/shopify/orders/paid', verifyShopifyWebhook, async (req, res) => {
  try {
    const order = req.body;
    console.log(`[Webhook] 💰 Order paid: #${order.name || order.id} - ₪${order.total_price}`);

    // Clear caches and refresh
    cache.clearPattern('shopify_orders');
    cache.clearPattern('shopify_stats');
    statsPreloader.preloadAll().catch(() => {});

    res.status(200).json({ received: true });

  } catch (error) {
    console.error('[Webhook] orders/paid error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// SHOPIFY PRODUCT WEBHOOKS
// ==========================================

/**
 * POST /webhooks/shopify/products/create
 * New product created
 */
router.post('/shopify/products/create', verifyShopifyWebhook, async (req, res) => {
  try {
    const product = req.body;
    console.log(`[Webhook] 📦 New product: ${product.title}`);

    // Save to database
    if (prisma) {
      try {
        await prisma.productStat.upsert({
          where: { productId: String(product.id) },
          update: {
            title: product.title,
            currentStock: product.variants?.reduce((sum, v) => sum + (v.inventory_quantity || 0), 0) || 0
          },
          create: {
            productId: String(product.id),
            title: product.title,
            sku: product.variants?.[0]?.sku || '',
            currentStock: product.variants?.reduce((sum, v) => sum + (v.inventory_quantity || 0), 0) || 0,
            totalQuantitySold: 0,
            totalRevenue: 0
          }
        });
      } catch (dbError) {
        console.error(`[Webhook] DB error: ${dbError.message}`);
      }
    }

    cache.clearPattern('shopify_top_products');
    res.status(200).json({ received: true });

  } catch (error) {
    console.error('[Webhook] products/create error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /webhooks/shopify/products/update
 * Product updated
 */
router.post('/shopify/products/update', verifyShopifyWebhook, async (req, res) => {
  try {
    const product = req.body;
    console.log(`[Webhook] 📦 Product updated: ${product.title}`);

    if (prisma) {
      try {
        await prisma.productStat.upsert({
          where: { productId: String(product.id) },
          update: {
            title: product.title,
            currentStock: product.variants?.reduce((sum, v) => sum + (v.inventory_quantity || 0), 0) || 0
          },
          create: {
            productId: String(product.id),
            title: product.title,
            sku: product.variants?.[0]?.sku || '',
            currentStock: product.variants?.reduce((sum, v) => sum + (v.inventory_quantity || 0), 0) || 0,
            totalQuantitySold: 0,
            totalRevenue: 0
          }
        });
      } catch (dbError) {
        console.error(`[Webhook] DB error: ${dbError.message}`);
      }
    }

    cache.clearPattern('shopify_top_products');
    res.status(200).json({ received: true });

  } catch (error) {
    console.error('[Webhook] products/update error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// SHOPIFY CUSTOMER WEBHOOKS
// ==========================================

/**
 * POST /webhooks/shopify/customers/create
 * New customer created
 */
router.post('/shopify/customers/create', verifyShopifyWebhook, async (req, res) => {
  try {
    const customer = req.body;
    console.log(`[Webhook] 👤 New customer: ${customer.first_name} ${customer.last_name}`);

    if (prisma) {
      try {
        await prisma.customerStat.upsert({
          where: { customerId: String(customer.id) },
          update: {
            email: customer.email || '',
            firstName: customer.first_name || '',
            lastName: customer.last_name || ''
          },
          create: {
            customerId: String(customer.id),
            email: customer.email || '',
            firstName: customer.first_name || '',
            lastName: customer.last_name || '',
            totalOrders: 0,
            totalSpent: 0
          }
        });
      } catch (dbError) {
        console.error(`[Webhook] DB error: ${dbError.message}`);
      }
    }

    cache.clearPattern('shopify_customers');
    res.status(200).json({ received: true });

  } catch (error) {
    console.error('[Webhook] customers/create error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// SHOPIFY INVENTORY WEBHOOKS
// ==========================================

/**
 * POST /webhooks/shopify/inventory/update
 * Inventory level changed
 */
router.post('/shopify/inventory/update', verifyShopifyWebhook, async (req, res) => {
  try {
    const inventory = req.body;
    console.log(`[Webhook] 📊 Inventory updated: Item ${inventory.inventory_item_id}, Available: ${inventory.available}`);

    // Note: inventory webhooks give inventory_item_id, not product_id
    // Would need to look up the product to update ProductStat

    cache.clearPattern('shopify_top_products');
    res.status(200).json({ received: true });

  } catch (error) {
    console.error('[Webhook] inventory/update error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// SHOPIFY APP WEBHOOKS
// ==========================================

/**
 * POST /webhooks/shopify/app/uninstalled
 * App was uninstalled from store
 */
router.post('/shopify/app/uninstalled', verifyShopifyWebhook, async (req, res) => {
  try {
    const shop = req.body;
    console.log(`[Webhook] ⚠️ App uninstalled from: ${shop.domain || shop.myshopify_domain}`);

    // Clean up any stored data for this shop if needed

    res.status(200).json({ received: true });

  } catch (error) {
    console.error('[Webhook] app/uninstalled error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// WEBHOOK REGISTRATION
// ==========================================

/**
 * POST /webhooks/shopify/register
 * Register webhooks with Shopify
 */
router.post('/shopify/register', async (req, res) => {
  const axios = require('axios');

  if (!process.env.SHOPIFY_STORE_URL || !process.env.SHOPIFY_ACCESS_TOKEN) {
    return res.status(400).json({
      success: false,
      error: 'Shopify credentials not configured'
    });
  }

  const appUrl = process.env.APP_URL || req.protocol + '://' + req.get('host');
  const apiVersion = process.env.SHOPIFY_API_VERSION || '2024-01';
  const shopifyUrl = `https://${process.env.SHOPIFY_STORE_URL}/admin/api/${apiVersion}`;

  const webhooksToRegister = [
    { topic: 'orders/create', address: `${appUrl}/webhooks/shopify/orders/create` },
    { topic: 'orders/updated', address: `${appUrl}/webhooks/shopify/orders/updated` },
    { topic: 'orders/paid', address: `${appUrl}/webhooks/shopify/orders/paid` },
    { topic: 'products/create', address: `${appUrl}/webhooks/shopify/products/create` },
    { topic: 'products/update', address: `${appUrl}/webhooks/shopify/products/update` },
    { topic: 'customers/create', address: `${appUrl}/webhooks/shopify/customers/create` },
    { topic: 'inventory_levels/update', address: `${appUrl}/webhooks/shopify/inventory/update` }
  ];

  const results = {
    success: [],
    failed: [],
    existing: []
  };

  try {
    // First, get existing webhooks
    const existingResponse = await axios.get(`${shopifyUrl}/webhooks.json`, {
      headers: {
        'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
        'Content-Type': 'application/json'
      }
    });

    const existingWebhooks = existingResponse.data.webhooks || [];
    const existingTopics = existingWebhooks.map(w => w.topic);

    console.log(`[Webhooks] Found ${existingWebhooks.length} existing webhooks`);

    // Register each webhook
    for (const webhook of webhooksToRegister) {
      if (existingTopics.includes(webhook.topic)) {
        results.existing.push(webhook.topic);
        console.log(`[Webhooks] ${webhook.topic} already registered`);
        continue;
      }

      try {
        await axios.post(
          `${shopifyUrl}/webhooks.json`,
          {
            webhook: {
              topic: webhook.topic,
              address: webhook.address,
              format: 'json'
            }
          },
          {
            headers: {
              'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
              'Content-Type': 'application/json'
            }
          }
        );

        results.success.push(webhook.topic);
        console.log(`[Webhooks] ✅ Registered: ${webhook.topic}`);

      } catch (error) {
        results.failed.push({
          topic: webhook.topic,
          error: error.response?.data?.errors || error.message
        });
        console.error(`[Webhooks] ❌ Failed: ${webhook.topic}`, error.response?.data?.errors || error.message);
      }
    }

    res.json({
      success: true,
      appUrl,
      results,
      message: `Registered ${results.success.length} webhooks, ${results.existing.length} already existed, ${results.failed.length} failed`
    });

  } catch (error) {
    console.error('[Webhooks] Registration error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data
    });
  }
});

/**
 * GET /webhooks/shopify/list
 * List all registered webhooks
 */
router.get('/shopify/list', async (req, res) => {
  const axios = require('axios');

  if (!process.env.SHOPIFY_STORE_URL || !process.env.SHOPIFY_ACCESS_TOKEN) {
    return res.status(400).json({
      success: false,
      error: 'Shopify credentials not configured'
    });
  }

  const apiVersion = process.env.SHOPIFY_API_VERSION || '2024-01';
  const shopifyUrl = `https://${process.env.SHOPIFY_STORE_URL}/admin/api/${apiVersion}`;

  try {
    const response = await axios.get(`${shopifyUrl}/webhooks.json`, {
      headers: {
        'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
        'Content-Type': 'application/json'
      }
    });

    const webhooks = response.data.webhooks || [];

    res.json({
      success: true,
      count: webhooks.length,
      webhooks: webhooks.map(w => ({
        id: w.id,
        topic: w.topic,
        address: w.address,
        createdAt: w.created_at
      }))
    });

  } catch (error) {
    console.error('[Webhooks] List error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==========================================
// META (FACEBOOK/INSTAGRAM) WEBHOOKS
// ==========================================

router.get('/meta', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.META_WEBHOOK_SECRET) {
    console.log('[Webhook] Meta webhook verified');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

router.post('/meta', async (req, res) => {
  try {
    const body = req.body;
    console.log('[Webhook] Meta event:', body.object);

    if (body.object === 'page') {
      body.entry?.forEach(entry => {
        entry.messaging?.forEach(event => {
          console.log('[Webhook] FB Message:', event.message?.text?.substring(0, 50));
        });
      });
    }

    if (body.object === 'instagram') {
      body.entry?.forEach(entry => {
        console.log('[Webhook] Instagram event:', entry.id);
      });
    }

    res.status(200).json({ received: true });

  } catch (error) {
    console.error('[Webhook] Meta error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// WHATSAPP WEBHOOKS
// ==========================================

router.get('/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('[Webhook] WhatsApp webhook verified');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

router.post('/whatsapp', async (req, res) => {
  try {
    const body = req.body;
    console.log('[Webhook] WhatsApp event received');

    body.entry?.forEach(entry => {
      entry.changes?.forEach(change => {
        if (change.field === 'messages') {
          change.value.messages?.forEach(msg => {
            console.log('[Webhook] WhatsApp message:', msg.type, msg.from);
          });
        }
      });
    });

    res.status(200).json({ received: true });

  } catch (error) {
    console.error('[Webhook] WhatsApp error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
