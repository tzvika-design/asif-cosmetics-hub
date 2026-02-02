const claudeService = require('../services/claude');

class InventoryAgent {
  constructor() {
    this.lowStockThreshold = 100; // ml
    this.criticalStockThreshold = 50; // ml

    this.systemPrompt = `You are ENIGMA Parfume's inventory management AI assistant.

Your responsibilities:
1. Monitor stock levels of 127 raw materials
2. Alert when materials are running low
3. Suggest reorder quantities
4. Track usage patterns
5. Optimize inventory turnover

Material categories:
- Constants (4): Iso E Super, DPG, Citrofol F, Alcohol
- Extracts (25): Premium accords and compositions
- Essential Oils (42): Natural oils at various dilutions
- Aromachemicals (56): Synthetic aroma compounds

Key considerations:
- Some materials have short shelf life
- Certain materials are harder to source
- Seasonal demand variations
- IFRA regulation changes may affect usage`;
  }

  async checkStatus(inventory = []) {
    const messages = [{
      role: 'user',
      content: `Analyze this inventory status:
${JSON.stringify(inventory, null, 2)}

Low stock threshold: ${this.lowStockThreshold}ml
Critical stock threshold: ${this.criticalStockThreshold}ml

Provide:
1. Overall inventory health score (0-100)
2. Materials needing immediate reorder
3. Materials to watch
4. Estimated days until stockout for critical items

Respond in JSON format.`
    }];

    return await claudeService.chat(messages, this.systemPrompt);
  }

  async getAlerts(inventory = []) {
    const alerts = [];

    // Check each material against thresholds
    for (const item of inventory) {
      if (item.quantity <= this.criticalStockThreshold) {
        alerts.push({
          level: 'critical',
          material: item.name,
          quantity: item.quantity,
          message: `CRITICAL: ${item.name} is at ${item.quantity}ml - immediate reorder required`
        });
      } else if (item.quantity <= this.lowStockThreshold) {
        alerts.push({
          level: 'warning',
          material: item.name,
          quantity: item.quantity,
          message: `WARNING: ${item.name} is at ${item.quantity}ml - consider reordering`
        });
      }
    }

    return alerts;
  }

  async suggestReorder(material, currentStock, avgUsage) {
    const messages = [{
      role: 'user',
      content: `Material: ${material}
Current stock: ${currentStock}ml
Average monthly usage: ${avgUsage}ml

Suggest:
1. Recommended reorder quantity
2. Optimal reorder point
3. Safety stock level
4. Any seasonal considerations

Respond in JSON format.`
    }];

    return await claudeService.chat(messages, this.systemPrompt);
  }

  async analyzeUsage(usageHistory) {
    const messages = [{
      role: 'user',
      content: `Analyze this material usage history:
${JSON.stringify(usageHistory, null, 2)}

Provide:
1. Usage trends
2. Top 10 most used materials
3. Seasonal patterns
4. Anomalies or unusual usage
5. Cost optimization suggestions

Respond in JSON format.`
    }];

    return await claudeService.chat(messages, this.systemPrompt);
  }

  async forecastDemand(salesData, currentInventory) {
    const messages = [{
      role: 'user',
      content: `Based on sales data:
${JSON.stringify(salesData, null, 2)}

And current inventory:
${JSON.stringify(currentInventory, null, 2)}

Forecast:
1. Material demand for next 30/60/90 days
2. Potential stockouts
3. Recommended purchase plan
4. Budget estimate

Respond in JSON format.`
    }];

    return await claudeService.chat(messages, this.systemPrompt);
  }
}

module.exports = new InventoryAgent();
