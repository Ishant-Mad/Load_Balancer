// server.js
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const bodyParser = require('body-parser');
const app = express();
const PORT = process.env.PORT || 8080;

// Environment variables
const AGENT_URL = process.env.AGENT_URL || 'http://localhost:5111';
const API_KEY = process.env.API_KEY || 'your-secret-api-key';

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Serve static frontend files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static('client/build'));
}

// Request logger middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// API key validation middleware
const validateApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey || apiKey !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  next();
};

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString()
  });
});

// Forward agent health check
app.get('/api/agent/health', async (req, res) => {
  try {
    const response = await axios.get(`${AGENT_URL}/health`);
    res.json(response.data);
  } catch (error) {
    console.error('Error connecting to agent:', error.message);
    res.status(503).json({
      status: 'disconnected',
      error: 'Cannot connect to agent'
    });
  }
});

// Forward agent stats
app.get('/api/agent/stats', async (req, res) => {
  try {
    const response = await axios.get(`${AGENT_URL}/stats`);
    res.json(response.data);
    // console.log(response.data);
  } catch (error) {
    console.error('Error fetching agent stats:', error.message);
    res.status(503).json({
      error: 'Cannot fetch agent stats',
      message: error.message
    });
  }
});

// Set algorithm
app.post('/api/agent/set_algorithm', async (req, res) => {
  try {
    const { algorithm } = req.body;
    const response = await axios.post(`${AGENT_URL}/set_algorithm`, { algorithm });
    res.json(response.data);
  } catch (error) {
    console.error('Error setting algorithm:', error.message);
    res.status(500).json({
      error: 'Failed to set algorithm',
      message: error.message
    });
  }
});

// Run task
app.post('/api/agent/run_task', async (req, res) => {
  try {
    const { type, duration } = req.body;
    const response = await axios.post(`${AGENT_URL}/run_task`, { type, duration });
    res.json(response.data);
  } catch (error) {
    console.error('Error running task:', error.message);
    res.status(500).json({
      error: 'Failed to run task',
      message: error.message
    });
  }
});

// Clear history
app.post('/api/agent/clear_history', async (req, res) => {
  try {
    const response = await axios.post(`${AGENT_URL}/clear_history`);
    res.json(response.data);
  } catch (error) {
    console.error('Error clearing history:', error.message);
    res.status(500).json({
      error: 'Failed to clear history',
      message: error.message
    });
  }
});

// Endpoint for agent to push data (optional, for future use)
app.post('/api/agent/push_data', validateApiKey, (req, res) => {
  // Here you could store data in a database if needed
  console.log('Received data from agent:', req.body);
  res.json({ status: 'received' });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Connecting to agent at: ${AGENT_URL}`);
});
