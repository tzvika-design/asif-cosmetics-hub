const axios = require('axios');

class MetaService {
  constructor() {
    this.graphUrl = 'https://graph.facebook.com/v18.0';
  }

  getConfig() {
    if (!process.env.META_ACCESS_TOKEN) {
      throw new Error('META_ACCESS_TOKEN not configured');
    }
    return {
      accessToken: process.env.META_ACCESS_TOKEN,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.META_ACCESS_TOKEN}`
      }
    };
  }

  // WhatsApp Business API
  async sendWhatsAppMessage(to, message) {
    const { accessToken } = this.getConfig();
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!phoneNumberId) {
      throw new Error('WHATSAPP_PHONE_NUMBER_ID not configured');
    }

    const response = await axios.post(
      `${this.graphUrl}/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: to,
        type: 'text',
        text: { body: message }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );

    return response.data;
  }

  async sendWhatsAppTemplate(to, templateName, languageCode = 'he', components = []) {
    const { accessToken } = this.getConfig();
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    const response = await axios.post(
      `${this.graphUrl}/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: languageCode },
          components: components
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );

    return response.data;
  }

  // Facebook Page API
  async postToPage(pageId, message, link = null) {
    const { accessToken } = this.getConfig();

    const data = { message };
    if (link) data.link = link;

    const response = await axios.post(
      `${this.graphUrl}/${pageId}/feed`,
      data,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );

    return response.data;
  }

  // Instagram API
  async createInstagramPost(igUserId, imageUrl, caption) {
    const { accessToken } = this.getConfig();

    // Step 1: Create media container
    const containerResponse = await axios.post(
      `${this.graphUrl}/${igUserId}/media`,
      {
        image_url: imageUrl,
        caption: caption
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );

    const creationId = containerResponse.data.id;

    // Step 2: Publish the container
    const publishResponse = await axios.post(
      `${this.graphUrl}/${igUserId}/media_publish`,
      { creation_id: creationId },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );

    return publishResponse.data;
  }

  // Conversions API (for tracking)
  async trackConversion(eventName, userData, customData = {}) {
    const { accessToken } = this.getConfig();
    const pixelId = process.env.META_PIXEL_ID;

    if (!pixelId) {
      throw new Error('META_PIXEL_ID not configured');
    }

    const response = await axios.post(
      `${this.graphUrl}/${pixelId}/events`,
      {
        data: [{
          event_name: eventName,
          event_time: Math.floor(Date.now() / 1000),
          user_data: userData,
          custom_data: customData,
          action_source: 'website'
        }]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );

    return response.data;
  }
}

module.exports = new MetaService();
