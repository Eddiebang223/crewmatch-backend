const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: '*',
  credentials: true
}));
app.use(express.json());

// ========== HEALTH CHECKS ==========
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
  res.json({ 
    message: 'CrewMatch API is running with PostgreSQL!',
    version: '2.0.0'
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
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret-key');
    const user = await db.getUserById(decoded.id);
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// ========== AUTH ENDPOINTS ==========

// Register
app.post('/api/auth/register', async (req, res) => {
  console.log('=== REGISTER ===');
  const { email, password, name, role, companyName } = req.body;
  
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Email, password, and name are required' });
  }
  
  try {
    // Check if user exists
    const existingUser = await db.getUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user
    const newUser = {
      id: uuidv4(),
      email,
      password: hashedPassword,
      name,
      role: role || 'CONTRACTOR',
      companyName: companyName || name
    };
    
    const user = await db.createUser(newUser);
    console.log('User created:', email);
    
    // Create token
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'secret-key',
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

// Login
app.post('/api/auth/login', async (req, res) => {
  console.log('=== LOGIN ===');
  const { email, password } = req.body;
  
  try {
    const user = await db.getUserByEmail(email);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'secret-key',
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

// Get all open jobs
app.get('/api/jobs', authMiddleware, async (req, res) => {
  try {
    const jobs = await db.getOpenJobs();
    res.json({ jobs });
  } catch (error) {
    console.error('Error fetching jobs:', error);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

// Create job
app.post('/api/jobs', authMiddleware, async (req, res) => {
  console.log('=== CREATE JOB ===');
  
  if (req.user.role !== 'GC') {
    return res.status(403).json({ error: 'Only GCs can post jobs' });
  }
  
  const { title, trade, description, location, startDate, endDate, hours, rateMin, rateMax } = req.body;
  
  if (!title || !description || !location || !startDate || !endDate || !hours) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  try {
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
    console.log('Job created:', job.id, job.title);
    
    res.status(201).json(job);
  } catch (error) {
    console.error('Job creation error:', error);
    res.status(500).json({ error: 'Failed to create job' });
  }
});

// ========== BID ENDPOINTS ==========

// Create bid
app.post('/api/bids', authMiddleware, async (req, res) => {
  console.log('=== CREATE BID ===');
  
  if (req.user.role !== 'CONTRACTOR') {
    return res.status(403).json({ error: 'Only contractors can bid' });
  }
  
  const { jobId, proposedRate, message } = req.body;
  
  if (!jobId || !proposedRate) {
    return res.status(400).json({ error: 'Job ID and proposed rate are required' });
  }
  
  try {
    const job = await db.getJobById(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    if (job.status !== 'OPEN') {
      return res.status(400).json({ error: 'Job is no longer available' });
    }
    
    const newBid = {
      id: uuidv4(),
      jobId,
      contractorId: req.user.id,
      proposedRate: parseFloat(proposedRate),
      message: message || ''
    };
    
    const bid = await db.createBid(newBid);
    console.log('Bid created:', bid.id, 'Rate: $' + bid.proposedRate);
    
    res.status(201).json(bid);
  } catch (error) {
    console.error('Bid creation error:', error);
    res.status(500).json({ error: 'Failed to submit bid' });
  }
});

// Get contractor's bids
app.get('/api/my-bids', authMiddleware, async (req, res) => {
  try {
    const bids = await db.getBidsByContractorId(req.user.id);
    res.json({ bids });
  } catch (error) {
    console.error('Error fetching bids:', error);
    res.status(500).json({ error: 'Failed to fetch bids' });
  }
});

// Get bids for a job (GC only)
app.get('/api/jobs/:jobId/bids', authMiddleware, async (req, res) => {
  try {
    const job = await db.getJobById(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    if (job.gcId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to view these bids' });
    }
    
    const bids = await db.getBidsByJobId(req.params.jobId);
    res.json({ bids });
  } catch (error) {
    console.error('Error fetching job bids:', error);
    res.status(500).json({ error: 'Failed to fetch bids' });
  }
});

// Accept or reject bid
app.patch('/api/bids/:bidId', authMiddleware, async (req, res) => {
  console.log('=== UPDATE BID ===');
  const { bidId } = req.params;
  const { status } = req.body;
  
  if (!status || !['ACCEPTED', 'REJECTED'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  
  try {
    const bid = await db.updateBidStatus(bidId, status);
    
    if (status === 'ACCEPTED') {
      const job = await db.getJobById(bid.jobId);
      if (job && job.gcId === req.user.id) {
        await db.updateJobStatus(job.id, 'FILLED');
        console.log(`Job ${job.id} filled by contractor ${bid.contractorId}`);
      }
    }
    
    res.json({ message: `Bid ${status.toLowerCase()}`, bid });
  } catch (error) {
    console.error('Bid update error:', error);
    res.status(500).json({ error: 'Failed to update bid' });
  }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ CrewMatch API running on port ${PORT}`);
  console.log(`📍 Health: http://localhost:${PORT}/health`);
  console.log(`📦 PostgreSQL database connected`);
});
