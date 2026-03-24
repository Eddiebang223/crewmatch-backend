const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'crewmatch-secret-key-2024';

// ALLOWED FRONTEND URLS
const allowedOrigins = [
  'https://crewmatch-frontend-2y8nm0p9f-eddiebang223s-projects.vercel.app',
  'https://crewmatch-frontend.vercel.app',
  'http://localhost:3000',
  'http://localhost:5000'
];

// CORS configuration - FIXES THE ERROR
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('Blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  exposedHeaders: ['Content-Length', 'X-Request-Id']
}));

// Handle preflight requests
app.options('*', cors());

app.use(express.json());

// Logging middleware
app.use((req, res, next) => {
  console.log(`📝 ${req.method} ${req.path} - Origin: ${req.headers.origin}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.get('/', (req, res) => {
  res.json({ 
    name: 'CrewMatch API',
    version: '2.0.0',
    status: 'operational',
    endpoints: {
      auth: '/api/auth/register, /api/auth/login',
      jobs: '/api/jobs',
      bids: '/api/bids, /api/my-bids',
      health: '/health'
    }
  });
});

// ========== AUTH MIDDLEWARE ==========
const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  const token = authHeader.replace('Bearer ', '');
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await db.getUserById(decoded.id);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    req.user = user;
    next();
  } catch (error) {
    console.error('Auth error:', error.message);
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// ========== AUTH ENDPOINTS ==========

app.post('/api/auth/register', async (req, res) => {
  console.log('📝 Registration attempt:', req.body.email);
  try {
    const { email, password, name, role, companyName } = req.body;
    
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }
    
    const existingUser = await db.getUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
      id: uuidv4(),
      email,
      password: hashedPassword,
      name,
      role: role || 'CONTRACTOR',
      companyName: companyName || name
    };
    
    const user = await db.createUser(newUser);
    console.log(`✅ User created: ${email}`);
    
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await db.getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
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
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ========== JOB ENDPOINTS ==========

app.get('/api/jobs', authMiddleware, async (req, res) => {
  try {
    const jobs = await db.getOpenJobs();
    res.json({ jobs });
  } catch (error) {
    console.error('Jobs error:', error);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

app.post('/api/jobs', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'GC') {
      return res.status(403).json({ error: 'Only GCs can post jobs' });
    }
    
    const { title, trade, description, location, startDate, endDate, hours, rateMin, rateMax } = req.body;
    
    if (!title || !description || !location || !startDate || !endDate || !hours) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const newJob = {
      id: uuidv4(),
      title,
      trade: trade || 'OTHER',
      description,
      location,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      hours: parseInt(hours),
      rateMin: rateMin ? parseFloat(rateMin) : 0,
      rateMax: rateMax ? parseFloat(rateMax) : 0,
      gcId: req.user.id
    };
    
    const job = await db.createJob(newJob);
    console.log(`✅ Job created: ${job.title}`);
    res.status(201).json(job);
  } catch (error) {
    console.error('Job creation error:', error);
    res.status(500).json({ error: 'Failed to create job' });
  }
});

// ========== BID ENDPOINTS ==========

app.post('/api/bids', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'CONTRACTOR') {
      return res.status(403).json({ error: 'Only contractors can bid' });
    }
    
    const { jobId, proposedRate, message } = req.body;
    
    if (!jobId || !proposedRate) {
      return res.status(400).json({ error: 'Job ID and rate required' });
    }
    
    const job = await db.getJobById(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    if (job.status !== 'OPEN') {
      return res.status(400).json({ error: 'Job no longer available' });
    }
    
    const newBid = {
      id: uuidv4(),
      jobId,
      contractorId: req.user.id,
      proposedRate: parseFloat(proposedRate),
      message: message || ''
    };
    
    const bid = await db.createBid(newBid);
    console.log(`✅ Bid created: $${bid.proposedRate}/hr for job ${jobId}`);
    res.status(201).json(bid);
  } catch (error) {
    console.error('Bid error:', error);
    res.status(500).json({ error: 'Failed to submit bid' });
  }
});

app.get('/api/my-bids', authMiddleware, async (req, res) => {
  try {
    const bids = await db.getBidsByContractorId(req.user.id);
    res.json({ bids });
  } catch (error) {
    console.error('My bids error:', error);
    res.status(500).json({ error: 'Failed to fetch bids' });
  }
});

app.get('/api/jobs/:jobId/bids', authMiddleware, async (req, res) => {
  try {
    const job = await db.getJobById(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    if (job.gcId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    
    const bids = await db.getBidsByJobId(req.params.jobId);
    res.json({ bids });
  } catch (error) {
    console.error('Job bids error:', error);
    res.status(500).json({ error: 'Failed to fetch bids' });
  }
});

app.patch('/api/bids/:bidId', authMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    if (!status || !['ACCEPTED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    const bid = await db.updateBidStatus(req.params.bidId, status);
    
    if (status === 'ACCEPTED') {
      const job = await db.getJobById(bid.jobId);
      if (job && job.gcId === req.user.id) {
        await db.updateJobStatus(job.id, 'FILLED');
        console.log(`✅ Job ${job.id} filled by ${bid.contractorId}`);
      }
    }
    
    res.json({ message: `Bid ${status.toLowerCase()}`, bid });
  } catch (error) {
    console.error('Bid update error:', error);
    res.status(500).json({ error: 'Failed to update bid' });
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 CrewMatch API v2.0.0`);
  console.log(`📡 Running on port ${PORT}`);
  console.log(`💚 Health: http://localhost:${PORT}/health`);
  console.log(`🌐 Allowed origins: ${allowedOrigins.join(', ')}`);
  console.log(`🗄️  Database: ${process.env.DATABASE_URL ? 'Connected' : 'Not configured'}\n`);
});
