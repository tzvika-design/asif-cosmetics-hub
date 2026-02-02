const express = require('express');
const axios = require('axios');
const crypto = require('crypto');

const router = express.Router();

// Shopify OAuth Configuration
const SHOPIFY_STORE = process.env.SHOPIFY_STORE_URL || 'asifcosmetics.myshopify.com';
const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const SHOPIFY_CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;

// Scopes needed for the app
const SCOPES = [
  'read_products',
  'write_products',
  'read_orders',
  'write_orders',
  'read_customers',
  'write_customers',
  'read_inventory',
  'write_inventory',
  'read_fulfillments',
  'write_fulfillments'
].join(',');

// Store nonce for security verification
const nonceStore = new Map();

// GET /api/shopify/status - Check connection status
router.get('/status', (req, res) => {
  const hasToken = !!process.env.SHOPIFY_ACCESS_TOKEN;
  const hasCredentials = !!SHOPIFY_CLIENT_ID && !!SHOPIFY_CLIENT_SECRET;

  res.json({
    status: hasToken ? 'connected' : 'not_connected',
    store: SHOPIFY_STORE,
    hasCredentials,
    hasAccessToken: hasToken
  });
});

// GET /api/shopify/install - Start OAuth flow
router.get('/install', (req, res) => {
  if (!SHOPIFY_CLIENT_ID) {
    return res.status(500).json({
      error: true,
      message: 'SHOPIFY_CLIENT_ID not configured'
    });
  }

  // Generate nonce for security
  const nonce = crypto.randomBytes(16).toString('hex');
  nonceStore.set(nonce, Date.now());

  // Clean up old nonces (older than 10 minutes)
  const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
  for (const [key, timestamp] of nonceStore.entries()) {
    if (timestamp < tenMinutesAgo) {
      nonceStore.delete(key);
    }
  }

  // Build redirect URI (force https for Railway/production)
  const host = req.get('host');
  const isProduction = host.includes('railway.app') || host.includes('up.railway.app') || process.env.NODE_ENV === 'production';
  const protocol = isProduction ? 'https' : req.protocol;
  const redirectUri = `${protocol}://${host}/api/shopify/callback`;

  // Build Shopify OAuth URL
  const authUrl = new URL(`https://${SHOPIFY_STORE}/admin/oauth/authorize`);
  authUrl.searchParams.set('client_id', SHOPIFY_CLIENT_ID);
  authUrl.searchParams.set('scope', SCOPES);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('state', nonce);

  console.log('Redirecting to Shopify OAuth:', authUrl.toString());

  res.redirect(authUrl.toString());
});

// GET /api/shopify/callback - Handle OAuth callback
router.get('/callback', async (req, res) => {
  const { code, state, shop, hmac } = req.query;

  console.log('Shopify callback received:', { code: !!code, state, shop, hmac: !!hmac });

  // Verify state/nonce
  if (!state || !nonceStore.has(state)) {
    return res.status(403).send(`
      <html>
        <head><title>Error</title></head>
        <body style="font-family: sans-serif; padding: 40px; text-align: center;">
          <h1>❌ Invalid State</h1>
          <p>Security verification failed. Please try again.</p>
          <a href="/api/shopify/install">Try Again</a>
        </body>
      </html>
    `);
  }

  // Remove used nonce
  nonceStore.delete(state);

  if (!code) {
    return res.status(400).send(`
      <html>
        <head><title>Error</title></head>
        <body style="font-family: sans-serif; padding: 40px; text-align: center;">
          <h1>❌ Authorization Failed</h1>
          <p>No authorization code received from Shopify.</p>
          <a href="/api/shopify/install">Try Again</a>
        </body>
      </html>
    `);
  }

  try {
    // Exchange code for access token
    const tokenUrl = `https://${SHOPIFY_STORE}/admin/oauth/access_token`;

    const response = await axios.post(tokenUrl, {
      client_id: SHOPIFY_CLIENT_ID,
      client_secret: SHOPIFY_CLIENT_SECRET,
      code: code
    });

    const { access_token, scope } = response.data;

    console.log('Access token received!');
    console.log('Granted scopes:', scope);

    // Display success page with token
    // In production, you'd save this to a database
    res.send(`
      <!DOCTYPE html>
      <html lang="he" dir="rtl">
        <head>
          <meta charset="UTF-8">
          <title>Shopify Connected</title>
          <style>
            body {
              font-family: 'Segoe UI', sans-serif;
              background: #0d0d0f;
              color: #e8e8ec;
              padding: 40px;
              max-width: 600px;
              margin: 0 auto;
            }
            .success-box {
              background: rgba(34, 197, 94, 0.1);
              border: 1px solid #22c55e;
              border-radius: 12px;
              padding: 24px;
              margin-bottom: 24px;
            }
            h1 { color: #22c55e; }
            .token-box {
              background: #1a1a1f;
              border: 1px solid #2a2a32;
              border-radius: 8px;
              padding: 16px;
              margin: 16px 0;
              word-break: break-all;
              font-family: monospace;
              font-size: 12px;
            }
            .warning {
              background: rgba(245, 158, 11, 0.1);
              border: 1px solid #f59e0b;
              border-radius: 8px;
              padding: 16px;
              margin-top: 16px;
            }
            a {
              color: #d4a853;
              text-decoration: none;
            }
            a:hover { text-decoration: underline; }
            .btn {
              display: inline-block;
              background: #d4a853;
              color: #0d0d0f;
              padding: 12px 24px;
              border-radius: 8px;
              margin-top: 16px;
              font-weight: bold;
            }
          </style>
        </head>
        <body>
          <div class="success-box">
            <h1>✅ Shopify Connected Successfully!</h1>
            <p>Your store <strong>${SHOPIFY_STORE}</strong> is now connected.</p>
          </div>

          <h2>🔑 Access Token</h2>
          <p>Copy this token and add it to Railway as <code>SHOPIFY_ACCESS_TOKEN</code>:</p>
          <div class="token-box">${access_token}</div>

          <h2>📋 Granted Scopes</h2>
          <div class="token-box">${scope}</div>

          <div class="warning">
            <strong>⚠️ Important:</strong>
            <ol>
              <li>Copy the access token above</li>
              <li>Go to Railway Dashboard → Variables</li>
              <li>Add: <code>SHOPIFY_ACCESS_TOKEN</code> = (paste token)</li>
              <li>Redeploy the service</li>
            </ol>
          </div>

          <a href="/" class="btn">← Back to Dashboard</a>
        </body>
      </html>
    `);

  } catch (error) {
    console.error('Token exchange error:', error.response?.data || error.message);

    res.status(500).send(`
      <html>
        <head><title>Error</title></head>
        <body style="font-family: sans-serif; padding: 40px; text-align: center; background: #0d0d0f; color: #e8e8ec;">
          <h1 style="color: #ef4444;">❌ Token Exchange Failed</h1>
          <p>Error: ${error.response?.data?.error_description || error.message}</p>
          <pre style="background: #1a1a1f; padding: 16px; border-radius: 8px; text-align: left; overflow: auto;">
${JSON.stringify(error.response?.data || error.message, null, 2)}
          </pre>
          <a href="/api/shopify/install" style="color: #d4a853;">Try Again</a>
        </body>
      </html>
    `);
  }
});

// GET /api/shopify/test - Test the connection
router.get('/test', async (req, res) => {
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

  if (!accessToken) {
    return res.status(400).json({
      error: true,
      message: 'SHOPIFY_ACCESS_TOKEN not configured. Go to /api/shopify/install to connect.'
    });
  }

  try {
    // Test API call - get shop info
    const response = await axios.get(`https://${SHOPIFY_STORE}/admin/api/2024-01/shop.json`, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      }
    });

    res.json({
      success: true,
      message: 'Shopify connection working!',
      shop: {
        name: response.data.shop.name,
        email: response.data.shop.email,
        domain: response.data.shop.domain,
        currency: response.data.shop.currency,
        timezone: response.data.shop.timezone
      }
    });

  } catch (error) {
    res.status(500).json({
      error: true,
      message: 'Shopify API error',
      details: error.response?.data || error.message
    });
  }
});

module.exports = router;
