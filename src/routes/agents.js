const express = require('express');
const router = express.Router();

// Import agents
const perfumeAgent = require('../agents/perfumeAgent');
const customerAgent = require('../agents/customerAgent');
const inventoryAgent = require('../agents/inventoryAgent');

// Agent Info
router.get('/', (req, res) => {
  res.json({
    name: 'Asif Cosmetics AI Agents',
    agents: [
      { name: 'perfume', description: 'Perfume analysis and formula generation' },
      { name: 'customer', description: 'Customer support and recommendations' },
      { name: 'inventory', description: 'Inventory management and alerts' }
    ]
  });
});

// Perfume Agent
router.post('/perfume/analyze', async (req, res, next) => {
  try {
    const { query } = req.body;
    const result = await perfumeAgent.analyze(query);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

router.post('/perfume/recommend', async (req, res, next) => {
  try {
    const { preferences, budget } = req.body;
    const recommendations = await perfumeAgent.recommend({ preferences, budget });
    res.json({ success: true, data: recommendations });
  } catch (error) {
    next(error);
  }
});

// Customer Agent
router.post('/customer/chat', async (req, res, next) => {
  try {
    const { message, context } = req.body;
    const response = await customerAgent.chat(message, context);
    res.json({ success: true, data: response });
  } catch (error) {
    next(error);
  }
});

// Inventory Agent
router.get('/inventory/status', async (req, res, next) => {
  try {
    const status = await inventoryAgent.checkStatus();
    res.json({ success: true, data: status });
  } catch (error) {
    next(error);
  }
});

router.get('/inventory/alerts', async (req, res, next) => {
  try {
    const alerts = await inventoryAgent.getAlerts();
    res.json({ success: true, data: alerts });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
