const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 5000;

// Simple in-memory storage
const users = [];

// Middleware
app.use(cors({
  origin: '*',
  credentials: true
}));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
  res.json({ 
    message: 'CrewMatch API is running!',
    version: '1.0.0'
  });
});

// REGISTER endpoint
app.post('/api/auth/register', (req, res) => {
  console.log('=== REGISTER REQUEST ===');
  console.log('Body:', req.body);
  
  try {
    const { email, password, name, role, companyName } = req.body;
    
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }
    
    const existingUser = users.find(u => u.email === email);
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }
    
    const newUser = {
      id: users.length + 1,
      email,
      password,
      name,
      role: role || 'CONTRACTOR',
      companyName: companyName || name
    };
    
    users.push(newUser);
    console.log('User created:', newUser.email);
    
    const token = jwt.sign(
      { id: newUser.id, email: newUser.email, role: newUser.role },
      'secret-key',
      { expiresIn: '7d' }
    );
    
    res.status(201).json({
      token: token,
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role
      }
    });
    
  } catch (error) {
    console.error('REGISTER ERROR:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// LOGIN endpoint
app.post('/api/auth/login', (req, res) => {
  console.log('=== LOGIN REQUEST ===');
  console.log('Body:', req.body);
  
  try {
    const { email, password } = req.body;
    
    const user = users.find(u => u.email === email && u.password === password);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      'secret-key',
      { expiresIn: '7d' }
    );
    
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// JOBS endpoint
app.get('/api/jobs', (req, res) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  const token = authHeader.replace('Bearer ', '');
  
  try {
    const decoded = jwt.verify(token, 'secret-key');
    console.log('Jobs requested by:', decoded.email);
    
    res.json({
      jobs: [
        {
          id: 1,
          title: "Sample Electrical Job",
          trade: "ELECTRICIAN",
          description: "Need experienced electrician for commercial building project.",
          location: "Austin, TX",
          startDate: "2026-04-01",
          endDate: "2026-04-07",
          hours: 40,
          rateMin: 45,
          rateMax: 60,
          status: "OPEN"
        }
      ]
    });
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ CrewMatch API running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
});
