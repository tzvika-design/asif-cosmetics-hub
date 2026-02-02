const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');

const router = express.Router();

// Initialize Claude client (lazy loading)
let claudeClient = null;

const getClaudeClient = () => {
  if (!claudeClient) {
    if (!process.env.CLAUDE_API_KEY) {
      throw new Error('CLAUDE_API_KEY is not configured');
    }
    claudeClient = new Anthropic({
      apiKey: process.env.CLAUDE_API_KEY
    });
  }
  return claudeClient;
};

// GET /api/chat - Health check
router.get('/', (req, res) => {
  res.json({
    status: 'ready',
    service: 'Claude Chat API',
    model: 'claude-sonnet-4-20250514'
  });
});

// POST /api/chat - Send message to Claude
router.post('/', async (req, res, next) => {
  try {
    const { message, system, history } = req.body;

    // Validate input
    if (!message) {
      return res.status(400).json({
        error: true,
        message: 'Message is required'
      });
    }

    const client = getClaudeClient();

    // Build messages array
    const messages = [];

    // Add conversation history if provided
    if (history && Array.isArray(history)) {
      messages.push(...history);
    }

    // Add current message
    messages.push({
      role: 'user',
      content: message
    });

    // Create API request params
    const params = {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: messages
    };

    // Add system prompt if provided
    if (system) {
      params.system = system;
    }

    // Call Claude API
    const response = await client.messages.create(params);

    // Extract response text
    const responseText = response.content[0]?.text || '';

    res.json({
      success: true,
      response: responseText,
      usage: {
        input_tokens: response.usage?.input_tokens,
        output_tokens: response.usage?.output_tokens
      },
      model: response.model,
      stop_reason: response.stop_reason
    });

  } catch (error) {
    console.error('Claude API error:', error.message);

    // Handle specific API errors
    if (error.status === 401) {
      return res.status(401).json({
        error: true,
        message: 'Invalid API key'
      });
    }

    if (error.status === 429) {
      return res.status(429).json({
        error: true,
        message: 'Rate limit exceeded. Please try again later.'
      });
    }

    next(error);
  }
});

module.exports = router;
