module.exports = {
  // Server config
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',

  // Claude API
  claude: {
    apiKey: process.env.CLAUDE_API_KEY,
    model: 'claude-sonnet-4-20250514'
  },

  // Shopify
  shopify: {
    storeUrl: process.env.SHOPIFY_STORE_URL,
    accessToken: process.env.SHOPIFY_ACCESS_TOKEN,
    apiVersion: process.env.SHOPIFY_API_VERSION || '2024-01',
    webhookSecret: process.env.SHOPIFY_WEBHOOK_SECRET
  },

  // Meta (Facebook/Instagram/WhatsApp)
  meta: {
    appId: process.env.META_APP_ID,
    appSecret: process.env.META_APP_SECRET,
    accessToken: process.env.META_ACCESS_TOKEN,
    pixelId: process.env.META_PIXEL_ID,
    whatsapp: {
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
      businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
      verifyToken: process.env.WHATSAPP_VERIFY_TOKEN
    },
    webhookSecret: process.env.META_WEBHOOK_SECRET
  },

  // ENIGMA Perfume settings
  enigma: {
    defaultBottleSize: 50,
    defaultConcentration: 40,
    minAlcoholPercent: 55,
    minFixatives: 3,
    pyramid: {
      top: { min: 15, max: 20 },
      heart: { min: 30, max: 40 },
      base: { min: 40, max: 55 }
    }
  }
};
