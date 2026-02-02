const claudeService = require('../services/claude');

class CustomerAgent {
  constructor() {
    this.systemPrompt = `You are ENIGMA Parfume's customer service AI assistant.

About ENIGMA Parfume:
- Premium custom perfume house in Tel Aviv
- Part of Asif Cosmetics
- Specializes in creating inspired and custom fragrances
- Uses 127 high-quality raw materials

Your responsibilities:
1. Answer questions about perfumes and products
2. Help customers find the right fragrance
3. Explain the perfume creation process
4. Handle order inquiries
5. Provide fragrance recommendations

Communication style:
- Professional but friendly
- Knowledgeable about perfumery
- Patient and helpful
- Respond in the same language as the customer (Hebrew or English)`;
  }

  async chat(message, context = {}) {
    const messages = [];

    // Add conversation history if provided
    if (context.history && Array.isArray(context.history)) {
      messages.push(...context.history);
    }

    // Add current message
    messages.push({
      role: 'user',
      content: message
    });

    return await claudeService.chat(messages, this.systemPrompt);
  }

  async handleInquiry(type, data) {
    const inquiryPrompts = {
      product: `Customer is asking about a product: ${JSON.stringify(data)}
Provide helpful information about this product.`,

      order: `Customer is asking about order #${data.orderId}
Order status: ${data.status || 'Unknown'}
Provide a helpful update and next steps.`,

      recommendation: `Customer is looking for a fragrance recommendation.
Preferences: ${JSON.stringify(data.preferences || {})}
Budget: ${data.budget || 'Not specified'}
Provide 3-5 personalized recommendations.`,

      complaint: `Customer has a complaint: ${data.complaint}
Acknowledge their concern and provide a helpful resolution.`,

      general: data.question || 'How can I help you today?'
    };

    const prompt = inquiryPrompts[type] || inquiryPrompts.general;

    return await claudeService.chat([{ role: 'user', content: prompt }], this.systemPrompt);
  }

  async generateResponse(customerMessage, orderContext = null) {
    let contextInfo = '';
    if (orderContext) {
      contextInfo = `
Customer order context:
- Order ID: ${orderContext.id}
- Status: ${orderContext.status}
- Products: ${JSON.stringify(orderContext.products)}
- Total: ${orderContext.total}
`;
    }

    const messages = [{
      role: 'user',
      content: `${contextInfo}
Customer message: "${customerMessage}"

Provide a helpful, professional response.`
    }];

    return await claudeService.chat(messages, this.systemPrompt);
  }
}

module.exports = new CustomerAgent();
