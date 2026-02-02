/**
 * AI Agents Index
 * Central export for all analytics agents
 */

const BaseAgent = require('./BaseAgent');
const SalesAgent = require('./SalesAgent');
const CouponAgent = require('./CouponAgent');
const InventoryAgent = require('./inventoryAgent');

// Create singleton instances
const salesAgent = new SalesAgent();
const couponAgent = new CouponAgent();
const inventoryAgent = new InventoryAgent();

// All agents in priority order
const agents = [
  salesAgent,
  couponAgent,
  inventoryAgent
];

/**
 * Run all enabled agents
 */
async function runAllAgents() {
  console.log('[Agents] Starting scheduled run...');
  const results = {};

  for (const agent of agents) {
    try {
      const shouldRun = await agent.shouldRun();
      if (shouldRun) {
        results[agent.name] = await agent.run();
      } else {
        console.log(`[Agents] ${agent.name} skipped (not due yet)`);
        results[agent.name] = { skipped: true };
      }
    } catch (error) {
      console.error(`[Agents] ${agent.name} failed:`, error.message);
      results[agent.name] = { error: error.message };
    }
  }

  console.log('[Agents] Scheduled run complete');
  return results;
}

/**
 * Force run a specific agent
 */
async function runAgent(agentName) {
  const agent = agents.find(a => a.name === agentName);
  if (!agent) {
    throw new Error(`Agent not found: ${agentName}`);
  }
  return await agent.run();
}

/**
 * Get status of all agents
 */
async function getAgentStatus() {
  const status = {};

  for (const agent of agents) {
    const config = await agent.getConfig();
    status[agent.name] = {
      enabled: config?.isEnabled || false,
      lastRunAt: config?.lastRunAt || null,
      nextRunAt: config?.nextRunAt || null,
      runInterval: config?.runInterval || 60
    };
  }

  return status;
}

module.exports = {
  // Agents
  salesAgent,
  couponAgent,
  inventoryAgent,
  agents,

  // Functions
  runAllAgents,
  runAgent,
  getAgentStatus,

  // Base class for custom agents
  BaseAgent
};
