const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'crewmatch-secret-key-2024';

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Helper functions
const query = async (text, params) => {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  console.log(`📊 Query: ${text.substring(0, 100)}... (${duration}ms, ${res.rowCount} rows)`);
  return res;
};

const getUserByEmail = async (email) => {
  const res = await query('SELECT * FROM "User" WHERE email = $1', [email]);
  return res.rows[0];
};

const getUserById = async (id) => {
  const res = await query('SELECT * FROM "User" WHERE id = $1', [id]);
  return res.rows[0];
};

const createUser = async (user) => {
  const { id, email, password, name, role, companyName } = user;
  const res = await query(
    `INSERT INTO "User" (id, email, password, name, role, "companyName", "createdAt") 
     VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *`,
    [id, email, password, name, role, companyName]
  );
  return res.rows[0];
};

// ========== CORS - ALLOW ALL VERCEL URLS ==========
const allowedOrigins = [
  'https://crewmatch-frontend.vercel.app',
  'https://crewmatch-frontend-2y8nm0p9f-eddiebang223s-projects.vercel.app',
  'https://crewmatch-frontend-ne01in2z3-eddiebang223s-projects.vercel.app',
  'http://localhost:3000',
  'http://localhost:5000'
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    
    // Check if origin is allowed
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
    status: 'operational'
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
    const user = await getUserById(decoded.id);
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
  console.log(`📝 Registration attempt: ${req.body.email}`);
  try {
    const { email, password, name, role, companyName } = req.body;
    
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }
    
    const existingUser = await getUserByEmail(email);
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
    
    const user = await createUser(newUser);
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
    
    const user = await getUserByEmail(email);
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
    const result = await query('SELECT * FROM "Job" WHERE status = $1 ORDER BY "createdAt" DESC', ['OPEN']);
    res.json({ jobs: result.rows });
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
    
    const jobId = uuidv4();
    await query(
      `INSERT INTO "Job" (id, title, trade, description, location, "startDate", "endDate", hours, "rateMin", "rateMax", status, "gcId", "createdAt") 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'OPEN', $11, NOW())`,
      [jobId, title, trade || 'OTHER', description, location, new Date(startDate), new Date(endDate), parseInt(hours), rateMin ? parseFloat(rateMin) : 0, rateMax ? parseFloat(rateMax) : 0, req.user.id]
    );
    
    const result = await query('SELECT * FROM "Job" WHERE id = $1', [jobId]);
    console.log(`✅ Job created: ${title}`);
    res.status(201).json(result.rows[0]);
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
    
    const jobResult = await query('SELECT * FROM "Job" WHERE id = $1', [jobId]);
    const job = jobResult.rows[0];
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    if (job.status !== 'OPEN') {
      return res.status(400).json({ error: 'Job no longer available' });
    }
    
    const bidId = uuidv4();
    await query(
      `INSERT INTO "Bid" (id, "jobId", "contractorId", "proposedRate", message, status, "createdAt") 
       VALUES ($1, $2, $3, $4, $5, 'PENDING', NOW())`,
      [bidId, jobId, req.user.id, parseFloat(proposedRate), message || '']
    );
    
    const bidResult = await query('SELECT * FROM "Bid" WHERE id = $1', [bidId]);
    console.log(`✅ Bid created: $${proposedRate}/hr for job ${jobId}`);
    res.status(201).json(bidResult.rows[0]);
  } catch (error) {
    console.error('Bid error:', error);
    res.status(500).json({ error: 'Failed to submit bid' });
  }
});

app.get('/api/my-bids', authMiddleware, async (req, res) => {
  try {
    const result = await query('SELECT * FROM "Bid" WHERE "contractorId" = $1 ORDER BY "createdAt" DESC', [req.user.id]);
    res.json({ bids: result.rows });
  } catch (error) {
    console.error('My bids error:', error);
    res.status(500).json({ error: 'Failed to fetch bids' });
  }
});

app.get('/api/jobs/:jobId/bids', authMiddleware, async (req, res) => {
  try {
    const jobResult = await query('SELECT * FROM "Job" WHERE id = $1', [req.params.jobId]);
    const job = jobResult.rows[0];
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    if (job.gcId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    
    const bidsResult = await query('SELECT * FROM "Bid" WHERE "jobId" = $1 ORDER BY "proposedRate" ASC', [req.params.jobId]);
    res.json({ bids: bidsResult.rows });
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
    
    const bidResult = await query('SELECT * FROM "Bid" WHERE id = $1', [req.params.bidId]);
    const bid = bidResult.rows[0];
    if (!bid) {
      return res.status(404).json({ error: 'Bid not found' });
    }
    
    await query('UPDATE "Bid" SET status = $1 WHERE id = $2', [status, req.params.bidId]);
    
    if (status === 'ACCEPTED') {
      const jobResult = await query('SELECT * FROM "Job" WHERE id = $1', [bid.jobId]);
      const job = jobResult.rows[0];
      if (job && job.gcId === req.user.id) {
        await query('UPDATE "Job" SET status = $1 WHERE id = $2', ['FILLED', job.id]);
        console.log(`✅ Job ${job.id} filled by ${bid.contractorId}`);
      }
    }
    
    const updatedBid = await query('SELECT * FROM "Bid" WHERE id = $1', [req.params.bidId]);
    res.json({ message: `Bid ${status.toLowerCase()}`, bid: updatedBid.rows[0] });
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
  console.log(`🗄️  Database: Connected\n`);
});
