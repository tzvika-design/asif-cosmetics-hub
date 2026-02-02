require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

// Import routes
const apiRoutes = require('./routes/api');
const agentRoutes = require('./routes/agents');
const webhookRoutes = require('./routes/webhooks');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

// Health check endpoint (for Railway)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'asif-cosmetics-hub',
    timestamp: new Date().toISOString()
  });
});

// API Routes
app.use('/api', apiRoutes);
app.use('/agents', agentRoutes);
app.use('/webhooks', webhookRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Asif Cosmetics Hub',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      api: '/api',
      agents: '/agents',
      webhooks: '/webhooks'
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(err.status || 500).json({
    error: true,
    message: err.message || 'Internal server error'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: true, message: 'Route not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`
  ========================================
    Asif Cosmetics Hub - Running!
  ========================================
    Port: ${PORT}
    Environment: ${process.env.NODE_ENV || 'development'}

    Endpoints:
    - Health: http://localhost:${PORT}/health
    - API: http://localhost:${PORT}/api
    - Agents: http://localhost:${PORT}/agents
  ========================================
  `);
});

module.exports = app;
