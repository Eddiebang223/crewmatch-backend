const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 5000;

// In-memory storage
const users = [];
let jobs = [];
let nextJobId = 1;
let bids = [];
let nextBidId = 1;

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
    message: 'CrewMatch API is running!',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth/register, /api/auth/login',
      jobs: 'GET /api/jobs, POST /api/jobs',
      bids: 'POST /api/bids, GET /api/my-bids'
    }
  });
});

// ========== AUTH ENDPOINTS ==========

// Register
app.post('/api/auth/register', (req, res) => {
  console.log('=== REGISTER ===');
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
  console.log('User created:', email);
  
  const token = jwt.sign(
    { id: newUser.id, email: newUser.email, role: newUser.role },
    'secret-key',
    { expiresIn: '7d' }
  );
  
  res.status(201).json({
    token,
    user: {
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
      role: newUser.role
    }
  });
});

// Login
app.post('/api/auth/login', (req, res) => {
  console.log('=== LOGIN ===');
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
});

// ========== JOB ENDPOINTS ==========

// Get all jobs
app.get('/api/jobs', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  const token = authHeader.replace('Bearer ', '');
  
  try {
    jwt.verify(token, 'secret-key');
    res.json({ jobs: jobs.filter(job => job.status === 'OPEN') });
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
});

// Create job
app.post('/api/jobs', (req, res) => {
  console.log('=== CREATE JOB ===');
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  const token = authHeader.replace('Bearer ', '');
  
  try {
    const decoded = jwt.verify(token, 'secret-key');
    const { title, trade, description, location, startDate, endDate, hours, rateMin, rateMax } = req.body;
    
    if (!title || !description || !location || !startDate || !endDate || !hours) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const newJob = {
      id: nextJobId++,
      title,
      trade: trade || 'OTHER',
      description,
      location,
      startDate,
      endDate,
      hours: parseInt(hours),
      rateMin: rateMin ? parseFloat(rateMin) : 0,
      rateMax: rateMax ? parseFloat(rateMax) : 0,
      status: 'OPEN',
      createdAt: new Date().toISOString(),
      postedBy: decoded.email
    };
    
    jobs.push(newJob);
    console.log('Job created:', newJob.id, newJob.title);
    
    res.status(201).json(newJob);
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
});

// ========== BID ENDPOINTS ==========

// Create bid
app.post('/api/bids', (req, res) => {
  console.log('=== CREATE BID ===');
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  const token = authHeader.replace('Bearer ', '');
  
  try {
    const decoded = jwt.verify(token, 'secret-key');
    const { jobId, proposedRate, message } = req.body;
    
    const job = jobs.find(j => j.id == jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    if (job.status !== 'OPEN') {
      return res.status(400).json({ error: 'Job is no longer available' });
    }
    
    const newBid = {
      id: nextBidId++,
      jobId: parseInt(jobId),
      contractorEmail: decoded.email,
      proposedRate: parseFloat(proposedRate),
      message: message || '',
      status: 'PENDING',
      createdAt: new Date().toISOString()
    };
    
    bids.push(newBid);
    console.log('Bid created:', newBid.id, 'Rate: $' + newBid.proposedRate);
    
    res.status(201).json(newBid);
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
});

// Get contractor's bids
app.get('/api/my-bids', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  const token = authHeader.replace('Bearer ', '');
  
  try {
    const decoded = jwt.verify(token, 'secret-key');
    const myBids = bids.filter(b => b.contractorEmail === decoded.email);
    res.json({ bids: myBids });
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
});

// Get bids for a job (GC)
app.get('/api/jobs/:jobId/bids', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  const token = authHeader.replace('Bearer ', '');
  
  try {
    jwt.verify(token, 'secret-key');
    const { jobId } = req.params;
    const jobBids = bids.filter(b => b.jobId == jobId);
    res.json({ bids: jobBids });
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
});

// Accept/Reject bid
app.patch('/api/bids/:bidId', (req, res) => {
  console.log('=== UPDATE BID ===');
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  const token = authHeader.replace('Bearer ', '');
  
  try {
    jwt.verify(token, 'secret-key');
    const { bidId } = req.params;
    const { status } = req.body;
    
    const bid = bids.find(b => b.id == bidId);
    if (!bid) {
      return res.status(404).json({ error: 'Bid not found' });
    }
    
    bid.status = status;
    console.log(`Bid ${bidId} ${status}`);
    
    if (status === 'ACCEPTED') {
      const job = jobs.find(j => j.id == bid.jobId);
      if (job) {
        job.status = 'FILLED';
        job.hiredContractor = bid.contractorEmail;
        console.log(`Job ${job.id} filled by ${bid.contractorEmail}`);
        
        bids.forEach(b => {
          if (b.jobId === bid.jobId && b.id !== bid.id && b.status === 'PENDING') {
            b.status = 'REJECTED';
          }
        });
      }
    }
    
    res.json({ message: `Bid ${status.toLowerCase()}`, bid });
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ CrewMatch API running on port ${PORT}`);
  console.log(`📍 Health: http://localhost:${PORT}/health`);
});
