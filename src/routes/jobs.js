const express = require('express');
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');

const router = express.Router();
const prisma = new PrismaClient();

// Middleware to verify JWT token
const authMiddleware = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret-key');
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      include: { gc: true, contractor: true }
    });
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Create a new job (GC only)
router.post('/', authMiddleware, async (req, res) => {
  try {
    // Check if user is a GC
    if (req.user.role !== 'GC') {
      return res.status(403).json({ error: 'Only GCs can post jobs' });
    }
    
    // Get GC profile
    const gc = await prisma.gC.findUnique({
      where: { userId: req.user.id }
    });
    
    if (!gc) {
      return res.status(404).json({ error: 'GC profile not found' });
    }
    
    const { trade, title, description, location, startDate, endDate, hours, rateMin, rateMax } = req.body;
    
    // Validate required fields
    if (!title || !description || !location || !startDate || !endDate || !hours) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Create job
    const job = await prisma.job.create({
      data: {
        gcId: gc.id,
        trade: trade || 'OTHER',
        title,
        description,
        location,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        hours: parseInt(hours),
        rateMin: rateMin ? parseFloat(rateMin) : 0,
        rateMax: rateMax ? parseFloat(rateMax) : 0,
        status: 'OPEN'
      }
    });
    
    res.status(201).json(job);
  } catch (error) {
    console.error('Error creating job:', error);
    res.status(500).json({ error: 'Failed to create job: ' + error.message });
  }
});

// Get all jobs (both GC and contractors)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const jobs = await prisma.job.findMany({
      where: { status: 'OPEN' },
      include: {
        gc: {
          include: {
            user: {
              select: { name: true }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    res.json({ jobs });
  } catch (error) {
    console.error('Error fetching jobs:', error);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

// Get single job
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const job = await prisma.job.findUnique({
      where: { id: req.params.id },
      include: {
        gc: {
          include: {
            user: {
              select: { name: true }
            }
          }
        },
        bids: {
          include: {
            contractor: {
              include: {
                user: {
                  select: { name: true }
                }
              }
            }
          }
        }
      }
    });
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    res.json(job);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch job' });
  }
});

module.exports = router;
