const express = require('express');
const router = express.Router();
const crypto = require('crypto');

// Webhook Info
router.get('/', (req, res) => {
  res.json({
    name: 'Asif Cosmetics Webhooks',
    endpoints: {
      shopify: '/webhooks/shopify',
      meta: '/webhooks/meta',
      whatsapp: '/webhooks/whatsapp'
    }
  });
});

// Verify Shopify webhook signature
const verifyShopifyWebhook = (req, res, next) => {
  const hmac = req.get('X-Shopify-Hmac-Sha256');
  const body = JSON.stringify(req.body);
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;

  if (!secret) {
    console.warn('SHOPIFY_WEBHOOK_SECRET not set');
    return next();
  }

  const hash = crypto
    .createHmac('sha256', secret)
    .update(body, 'utf8')
    .digest('base64');

  if (hash !== hmac) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  next();
};

// Shopify Webhooks
router.post('/shopify/orders/create', verifyShopifyWebhook, async (req, res) => {
  try {
    const order = req.body;
    console.log('New Shopify order:', order.id);
    // TODO: Process new order
    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Shopify webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/shopify/orders/updated', verifyShopifyWebhook, async (req, res) => {
  try {
    const order = req.body;
    console.log('Updated Shopify order:', order.id);
    // TODO: Process order update
    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Shopify webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Meta (Facebook/Instagram) Webhooks
router.get('/meta', (req, res) => {
  // Webhook verification
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.META_WEBHOOK_SECRET) {
    console.log('Meta webhook verified');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

router.post('/meta', async (req, res) => {
  try {
    const body = req.body;
    console.log('Meta webhook received:', body.object);

    if (body.object === 'page') {
      // Handle Facebook Page events
      body.entry.forEach(entry => {
        entry.messaging?.forEach(event => {
          console.log('FB Message event:', event);
          // TODO: Process Facebook message
        });
      });
    }

    if (body.object === 'instagram') {
      // Handle Instagram events
      body.entry.forEach(entry => {
        console.log('Instagram event:', entry);
        // TODO: Process Instagram event
      });
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Meta webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

// WhatsApp Webhooks
router.get('/whatsapp', (req, res) => {
  // Webhook verification
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('WhatsApp webhook verified');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

router.post('/whatsapp', async (req, res) => {
  try {
    const body = req.body;
    console.log('WhatsApp webhook received');

    if (body.entry) {
      body.entry.forEach(entry => {
        const changes = entry.changes || [];
        changes.forEach(change => {
          if (change.field === 'messages') {
            const messages = change.value.messages || [];
            messages.forEach(msg => {
              console.log('WhatsApp message:', msg);
              // TODO: Process WhatsApp message
            });
          }
        });
      });
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('WhatsApp webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
