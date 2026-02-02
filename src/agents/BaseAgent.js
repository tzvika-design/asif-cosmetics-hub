/**
 * Base Agent Class
 * Foundation for all AI-powered agents in the system
 */

const Anthropic = require('@anthropic-ai/sdk');
const { prisma } = require('../services/database');

class BaseAgent {
  constructor(name, systemPrompt) {
    this.name = name;
    this.systemPrompt = systemPrompt;
    this.anthropic = null;
    this.isInitialized = false;
  }

  /**
   * Initialize the Anthropic client
   */
  initialize() {
    if (this.isInitialized) return;

    if (!process.env.ANTHROPIC_API_KEY && !process.env.CLAUDE_API_KEY) {
      console.warn(`[${this.name}] No Anthropic API key configured`);
      return;
    }

    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY
    });
    this.isInitialized = true;
    console.log(`[${this.name}] Initialized`);
  }

  /**
   * Log action to database for transparency
   * @param {string} actionType - Type of action (Analysis, Recommendation, Alert)
   * @param {string} reasoning - The "why" behind the action
   * @param {string} recommendation - Suggested action
   * @param {object} data - Raw data snapshot
   * @param {number} confidence - 0-100 confidence score
   */
  async logAction(actionType, reasoning, recommendation = null, data = null, confidence = null) {
    try {
      const log = await prisma.agentLog.create({
        data: {
          agentName: this.name,
          actionType,
          reasoning,
          recommendation,
          data,
          confidence,
          status: 'pending'
        }
      });

      console.log(`[${this.name}] Logged action: ${actionType} (ID: ${log.id})`);
      return log;
    } catch (error) {
      console.error(`[${this.name}] Failed to log action:`, error.message);
      return null;
    }
  }

  /**
   * Get AI analysis using Claude
   * @param {string} prompt - The question to ask
   * @param {object} data - Data to analyze
   * @returns {object} - { analysis, recommendation, confidence, reasoning }
   */
  async getAIAnalysis(prompt, data) {
    if (!this.isInitialized) {
      this.initialize();
    }

    if (!this.anthropic) {
      console.warn(`[${this.name}] Anthropic client not available, returning mock response`);
      return {
        analysis: 'AI analysis not available - API key not configured',
        recommendation: null,
        confidence: 0,
        reasoning: 'Anthropic API key not configured'
      };
    }

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: this.systemPrompt,
        messages: [
          {
            role: 'user',
            content: `Analyze this data and provide insights in JSON format:

Data: ${JSON.stringify(data, null, 2)}

Question: ${prompt}

Respond ONLY with valid JSON in this exact format:
{
  "analysis": "Your analysis here in Hebrew",
  "recommendation": "Your recommendation here in Hebrew",
  "confidence": 85,
  "reasoning": "Why you made this recommendation in Hebrew"
}`
          }
        ]
      });

      const text = response.content[0].text;

      // Try to parse JSON from response
      try {
        // Find JSON in response (it might have extra text)
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
      } catch (parseError) {
        console.error(`[${this.name}] Failed to parse AI response:`, parseError.message);
      }

      // Return raw text if JSON parsing fails
      return {
        analysis: text,
        recommendation: null,
        confidence: 50,
        reasoning: 'Could not parse structured response'
      };

    } catch (error) {
      console.error(`[${this.name}] AI analysis error:`, error.message);
      return {
        analysis: `Error: ${error.message}`,
        recommendation: null,
        confidence: 0,
        reasoning: 'API call failed'
      };
    }
  }

  /**
   * Get agent configuration from database
   */
  async getConfig() {
    try {
      let config = await prisma.agentConfig.findUnique({
        where: { agentName: this.name }
      });

      if (!config) {
        // Create default config
        config = await prisma.agentConfig.create({
          data: {
            agentName: this.name,
            displayName: this.name,
            isEnabled: true,
            runInterval: 60
          }
        });
      }

      return config;
    } catch (error) {
      console.error(`[${this.name}] Failed to get config:`, error.message);
      return null;
    }
  }

  /**
   * Update last run time
   */
  async updateLastRun() {
    try {
      await prisma.agentConfig.update({
        where: { agentName: this.name },
        data: {
          lastRunAt: new Date(),
          nextRunAt: new Date(Date.now() + 60 * 60 * 1000) // 1 hour from now
        }
      });
    } catch (error) {
      console.error(`[${this.name}] Failed to update last run:`, error.message);
    }
  }

  /**
   * Check if agent should run based on schedule
   */
  async shouldRun() {
    const config = await this.getConfig();
    if (!config || !config.isEnabled) return false;

    if (!config.lastRunAt) return true;

    const minutesSinceLastRun = (Date.now() - new Date(config.lastRunAt).getTime()) / (1000 * 60);
    return minutesSinceLastRun >= config.runInterval;
  }

  /**
   * Run the agent (must be implemented by subclass)
   */
  async run() {
    const config = await this.getConfig();
    if (!config?.isEnabled) {
      console.log(`[${this.name}] Agent is disabled, skipping`);
      return null;
    }

    console.log(`[${this.name}] Starting analysis...`);
    const startTime = Date.now();

    try {
      const result = await this.analyze();
      await this.updateLastRun();

      const duration = Date.now() - startTime;
      console.log(`[${this.name}] Completed in ${duration}ms`);

      return result;
    } catch (error) {
      console.error(`[${this.name}] Run failed:`, error.message);

      await this.logAction(
        'Error',
        `Agent run failed: ${error.message}`,
        null,
        { error: error.message },
        0
      );

      return null;
    }
  }

  /**
   * Analyze data (must be implemented by subclass)
   */
  async analyze() {
    throw new Error(`${this.name}: analyze() must be implemented by subclass`);
  }

  /**
   * Get recommendations (must be implemented by subclass)
   */
  async getRecommendations() {
    throw new Error(`${this.name}: getRecommendations() must be implemented by subclass`);
  }
}

module.exports = BaseAgent;
