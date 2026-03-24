const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

// CORS configuration - allow frontend to connect
app.use(cors({
  origin: '*',  // Allow all origins for testing
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

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

// Register endpoint
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name, role, companyName } = req.body;
    
    console.log('Registration attempt:', { email, name, role });
    
    // For now, just return success (temporary without database)
    res.json({
      token: 'test-token-123',
      user: { id: '1', email, name, role }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log('Login attempt:', { email });
    
    // For now, just return success
    res.json({
      token: 'test-token-123',
      user: { id: '1', email, name: 'Test User', role: 'GC' }
    });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ CrewMatch API running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
});
