const express = require('express');
const router = express.Router();

// Import legacy agents
const perfumeAgent = require('../agents/perfumeAgent');
const customerAgent = require('../agents/customerAgent');

// Import new analytics agents
const {
  salesAgent,
  couponAgent,
  inventoryAgent,
  runAllAgents,
  runAgent,
  getAgentStatus
} = require('../agents');

// Import sync service
const shopifySync = require('../services/shopify-sync');

// Import database for agent logs
const { prisma } = require('../services/database');

// ===== Agent Info & Status =====
router.get('/', async (req, res) => {
  try {
    const status = await getAgentStatus();
    res.json({
      name: 'Asif Cosmetics AI Agents',
      agents: [
        { name: 'SalesAgent', description: 'ניתוח מכירות וזיהוי מגמות', status: status.SalesAgent },
        { name: 'CouponAgent', description: 'ניתוח רווחיות קופונים', status: status.CouponAgent },
        { name: 'InventoryAgent', description: 'ניהול מלאי והתרעות', status: status.InventoryAgent },
        { name: 'perfume', description: 'Perfume analysis and formula generation' },
        { name: 'customer', description: 'Customer support and recommendations' }
      ]
    });
  } catch (error) {
    res.json({
      name: 'Asif Cosmetics AI Agents',
      agents: ['SalesAgent', 'CouponAgent', 'InventoryAgent', 'perfume', 'customer'],
      error: error.message
    });
  }
});

// Get agent status
router.get('/status', async (req, res, next) => {
  try {
    const status = await getAgentStatus();
    res.json({ success: true, data: status });
  } catch (error) {
    next(error);
  }
});

// ===== Agent Logs =====
router.get('/logs', async (req, res, next) => {
  try {
    const { agent, type, limit = 50 } = req.query;

    const where = {};
    if (agent) where.agentName = agent;
    if (type) where.actionType = type;

    const logs = await prisma.agentLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit)
    });

    res.json({ success: true, data: logs });
  } catch (error) {
    next(error);
  }
});

// Approve/reject agent recommendation
router.post('/logs/:id/action', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { action, note } = req.body;

    if (!['approved', 'rejected', 'pending'].includes(action)) {
      return res.status(400).json({ error: true, message: 'Invalid action' });
    }

    const log = await prisma.agentLog.update({
      where: { id: parseInt(id) },
      data: {
        status: action,
        reviewedAt: new Date(),
        reviewNote: note
      }
    });

    res.json({ success: true, data: log });
  } catch (error) {
    next(error);
  }
});

// ===== Run Agents =====
router.post('/run', async (req, res, next) => {
  try {
    console.log('[Agents] Manual run all triggered');
    const results = await runAllAgents();
    res.json({ success: true, data: results });
  } catch (error) {
    next(error);
  }
});

router.post('/run/:agentName', async (req, res, next) => {
  try {
    const { agentName } = req.params;
    console.log(`[Agents] Manual run triggered for ${agentName}`);
    const result = await runAgent(agentName);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// ===== Sales Agent =====
router.get('/sales/analysis', async (req, res, next) => {
  try {
    const result = await salesAgent.analyze();
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

router.get('/sales/recommendations', async (req, res, next) => {
  try {
    const result = await salesAgent.getRecommendations();
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// ===== Coupon Agent =====
router.get('/coupon/analysis', async (req, res, next) => {
  try {
    const result = await couponAgent.analyze();
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

router.get('/coupon/recommendations', async (req, res, next) => {
  try {
    const result = await couponAgent.getRecommendations();
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

router.get('/coupon/bleeding', async (req, res, next) => {
  try {
    const bleedingCoupons = await prisma.couponStat.findMany({
      where: { isBleedingMoney: true, isActive: true },
      orderBy: { totalDiscountGiven: 'desc' }
    });
    res.json({ success: true, data: bleedingCoupons });
  } catch (error) {
    next(error);
  }
});

// ===== Inventory Agent =====
router.get('/inventory/analysis', async (req, res, next) => {
  try {
    const result = await inventoryAgent.analyze();
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

router.get('/inventory/recommendations', async (req, res, next) => {
  try {
    const result = await inventoryAgent.getRecommendations();
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// Legacy inventory endpoints (redirect to new)
router.get('/inventory/status', async (req, res, next) => {
  try {
    const result = await inventoryAgent.analyze();
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

router.get('/inventory/alerts', async (req, res, next) => {
  try {
    const result = await inventoryAgent.analyze();
    res.json({
      success: true,
      data: {
        critical: result.criticalItems || [],
        deadStock: result.deadStock || []
      }
    });
  } catch (error) {
    next(error);
  }
});

// ===== Sync Service =====
router.get('/sync/status', async (req, res, next) => {
  try {
    const status = await shopifySync.getStatus();
    res.json({ success: true, data: status });
  } catch (error) {
    next(error);
  }
});

router.post('/sync/run', async (req, res, next) => {
  try {
    console.log('[Agents] Manual sync triggered');
    const result = await shopifySync.runFullSync();
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// ===== Legacy Perfume Agent =====
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

// ===== Legacy Customer Agent =====
router.post('/customer/chat', async (req, res, next) => {
  try {
    const { message, context } = req.body;
    const response = await customerAgent.chat(message, context);
    res.json({ success: true, data: response });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
