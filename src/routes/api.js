const express = require('express');
const router = express.Router();

// Import services
const claudeService = require('../services/claude');
const shopifyService = require('../services/shopify');

// API Info
router.get('/', (req, res) => {
  res.json({
    name: 'Asif Cosmetics API',
    version: '1.0.0',
    endpoints: {
      perfumes: '/api/perfumes',
      formulas: '/api/formulas',
      inventory: '/api/inventory',
      orders: '/api/orders'
    }
  });
});

// Perfume endpoints
router.get('/perfumes', async (req, res, next) => {
  try {
    // TODO: Connect to data source
    res.json({ message: 'Get all perfumes', data: [] });
  } catch (error) {
    next(error);
  }
});

router.post('/perfumes/analyze', async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: true, message: 'Perfume name required' });
    }
    const analysis = await claudeService.analyzePerfume(name);
    res.json({ success: true, data: analysis });
  } catch (error) {
    next(error);
  }
});

// Formula endpoints
router.get('/formulas', async (req, res, next) => {
  try {
    res.json({ message: 'Get all formulas', data: [] });
  } catch (error) {
    next(error);
  }
});

router.post('/formulas/generate', async (req, res, next) => {
  try {
    const { perfumeName, notes, bottleSize, concentration } = req.body;
    const formula = await claudeService.generateFormula({
      perfumeName,
      notes,
      bottleSize: bottleSize || 50,
      concentration: concentration || 40
    });
    res.json({ success: true, data: formula });
  } catch (error) {
    next(error);
  }
});

// Inventory endpoints
router.get('/inventory', async (req, res, next) => {
  try {
    res.json({ message: 'Get inventory', data: [] });
  } catch (error) {
    next(error);
  }
});

// Orders (Shopify integration)
router.get('/orders', async (req, res, next) => {
  try {
    const orders = await shopifyService.getOrders();
    res.json({ success: true, data: orders });
  } catch (error) {
    next(error);
  }
});

router.get('/orders/:id', async (req, res, next) => {
  try {
    const order = await shopifyService.getOrder(req.params.id);
    res.json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
