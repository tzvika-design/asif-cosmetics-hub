const Anthropic = require('@anthropic-ai/sdk');

class ClaudeService {
  constructor() {
    this.client = null;
    this.model = 'claude-sonnet-4-20250514';
  }

  getClient() {
    if (!this.client) {
      if (!process.env.CLAUDE_API_KEY) {
        throw new Error('CLAUDE_API_KEY not configured');
      }
      this.client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
    }
    return this.client;
  }

  async analyzePerfume(perfumeName) {
    const client = this.getClient();

    const response = await client.messages.create({
      model: this.model,
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: `Analyze the fragrance "${perfumeName}" and provide:
1. Brand and year of release
2. Perfumer (nose)
3. Fragrance family
4. Notes pyramid (Top, Heart, Base)
5. Similar fragrances

Return as JSON format.`
      }]
    });

    return this.parseResponse(response);
  }

  async generateFormula({ perfumeName, notes, bottleSize, concentration }) {
    const client = this.getClient();

    const response = await client.messages.create({
      model: this.model,
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: `You are ENIGMA Parfume's expert AI formulator.

Create a formula for "${perfumeName}" with these specifications:
- Bottle size: ${bottleSize}ml
- Concentration: ${concentration}%
${notes ? `- Notes to include: ${JSON.stringify(notes)}` : ''}

IRON RULES:
1. Alcohol minimum: 55% (${(bottleSize * 0.55).toFixed(1)}ml)
2. Include 3-4 Fixatives
3. Pyramid: TOP 15-20%, HEART 30-40%, BASE 40-55%

CRITICAL LIMITS (per 50ml):
- Cinnamon 10%: MAX 0.3ml
- Vanillin Signature: MAX 0.5ml
- Coumarin: MAX 0.75ml
- Cashmeran: MAX 2.0ml
- Galaxolide 50%: MAX 5.0ml
- Hedione: MAX 7.5ml

Return ONLY JSON:
{
  "name": "Formula Name",
  "topNotes": [{"material": "name", "percentage": 18, "ml": 3.6}],
  "heartNotes": [{"material": "name", "percentage": 32, "ml": 6.4}],
  "baseNotes": [{"material": "name", "percentage": 50, "ml": 10}],
  "totalFragrance": ${(bottleSize * concentration / 100).toFixed(1)},
  "alcohol": ${(bottleSize * 0.55).toFixed(1)},
  "dpg": ${(bottleSize * concentration / 100 * 0.1).toFixed(1)}
}`
      }]
    });

    return this.parseResponse(response);
  }

  async chat(messages, systemPrompt = null) {
    const client = this.getClient();

    const params = {
      model: this.model,
      max_tokens: 2000,
      messages
    };

    if (systemPrompt) {
      params.system = systemPrompt;
    }

    const response = await client.messages.create(params);
    return this.parseResponse(response);
  }

  parseResponse(response) {
    const content = response.content[0];
    if (content.type === 'text') {
      // Try to parse as JSON
      const text = content.text;
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch (e) {
          return { text };
        }
      }
      return { text };
    }
    return response.content;
  }
}

module.exports = new ClaudeService();
