const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

// CORS configuration
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Import routes
const authRoutes = require('./routes/auth');
const jobsRoutes = require('./routes/jobs');  // ← ADD THIS

// Use routes
app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobsRoutes);  // ← ADD THIS

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

app.get('/', (req, res) => {
  res.json({ 
    message: 'CrewMatch API is running!',
    status: 'online'
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ CrewMatch API running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
});
