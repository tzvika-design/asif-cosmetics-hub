const claudeService = require('../services/claude');

class PerfumeAgent {
  constructor() {
    this.systemPrompt = `You are ENIGMA Parfume's expert AI assistant. You have deep knowledge of:
- Perfume composition and notes
- Raw materials and their properties
- IFRA regulations and safety limits
- Fragrance families and accords
- Famous perfumes and their compositions

ENIGMA's inventory includes 127 materials:
- 4 Constants (Iso E Super, DPG, Citrofol F, Alcohol)
- 25 Extracts/Accords
- 42 Essential Oils
- 56 Aromachemicals

Always follow these iron rules:
1. Alcohol minimum: 55% for EDP
2. Include 3-4 Fixatives per formula
3. Pyramid: TOP 15-20%, HEART 30-40%, BASE 40-55%
4. Never exceed IFRA limits`;
  }

  async analyze(query) {
    const messages = [{
      role: 'user',
      content: `Analyze this perfume query: "${query}"

Provide:
1. Perfume identification (name, brand, year)
2. Notes pyramid
3. Suggested materials from ENIGMA inventory
4. Formula recommendations

Respond in JSON format.`
    }];

    return await claudeService.chat(messages, this.systemPrompt);
  }

  async recommend({ preferences, budget }) {
    const messages = [{
      role: 'user',
      content: `Based on these preferences:
${JSON.stringify(preferences, null, 2)}

Budget: ${budget || 'not specified'}

Recommend 3-5 perfume options that could be created with ENIGMA's inventory.
Include estimated material cost for each.

Respond in JSON format with array of recommendations.`
    }];

    return await claudeService.chat(messages, this.systemPrompt);
  }

  async generateFormula(perfumeName, notes = null) {
    return await claudeService.generateFormula({
      perfumeName,
      notes,
      bottleSize: 50,
      concentration: 40
    });
  }

  async validateFormula(formula) {
    const messages = [{
      role: 'user',
      content: `Validate this perfume formula:
${JSON.stringify(formula, null, 2)}

Check:
1. Total percentages equal 100%
2. All materials within IFRA limits
3. Minimum 3 fixatives included
4. Proper pyramid balance (BASE 40-55%)
5. Alcohol at least 55%

Return validation result as JSON with:
- valid: boolean
- errors: array of issues
- warnings: array of recommendations
- fixativesCount: number`
    }];

    return await claudeService.chat(messages, this.systemPrompt);
  }
}

module.exports = new PerfumeAgent();
