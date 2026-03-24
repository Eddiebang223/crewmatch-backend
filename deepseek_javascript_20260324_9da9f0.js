// backend/src/routes/jobs.js
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware } = require('../middleware/auth');
const { matchContractors } = require('../utils/matching');

const router = express.Router();
const prisma = new PrismaClient();

// Create job posting (GC only)
router.post('/', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'GC') {
      return res.status(403).json({ error: 'Only GCs can post jobs' });
    }
    
    const gc = await prisma.gC.findUnique({
      where: { userId: req.user.id },
    });
    
    if (!gc) {
      return res.status(404).json({ error: 'GC profile not found' });
    }
    
    const { trade, title, description, location, startDate, endDate, hours, rateMin, rateMax, latitude, longitude } = req.body;
    
    const job = await prisma.job.create({
      data: {
        gcId: gc.id,
        trade,
        title,
        description,
        location,
        latitude: latitude || null,
        longitude: longitude || null,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        hours,
        rateMin,
        rateMax,
      },
    });
    
    // AI-powered matching - notify relevant contractors
    const matchedContractors = await matchContractors(job);
    
    // Create notifications (simplified - would use WebSockets in production)
    console.log(`Matched ${matchedContractors.length} contractors for job ${job.id}`);
    
    res.status(201).json(job);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create job' });
  }
});

// Get all jobs (with filters)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { trade, location, status, page = 1, limit = 20 } = req.query;
    
    const where = {};
    if (trade) where.trade = trade;
    if (status) where.status = status;
    if (location) where.location = { contains: location, mode: 'insensitive' };
    
    const jobs = await prisma.job.findMany({
      where,
      include: {
        gc: {
          include: {
            user: {
              select: { name: true, email: true },
            },
          },
        },
        bids: {
          where: {
            contractorId: req.user.role === 'CONTRACTOR' 
              ? (await prisma.contractor.findUnique({ where: { userId: req.user.id } }))?.id 
              : undefined,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: parseInt(limit),
    });
    
    res.json({
      jobs,
      page: parseInt(page),
      limit: parseInt(limit),
      total: await prisma.job.count({ where }),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

// Get job by ID
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const job = await prisma.job.findUnique({
      where: { id: req.params.id },
      include: {
        gc: {
          include: {
            user: true,
          },
        },
        bids: {
          include: {
            contractor: {
              include: {
                user: true,
              },
            },
          },
        },
        hiredContractor: {
          include: {
            user: true,
          },
        },
        payments: true,
      },
    });
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    res.json(job);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch job' });
  }
});

// Update job status
router.patch('/:id/status', authMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    const job = await prisma.job.findUnique({
      where: { id: req.params.id },
      include: { gc: true },
    });
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Check if user owns this job
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { gc: true },
    });
    
    if (user.gc?.id !== job.gcId) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    
    const updatedJob = await prisma.job.update({
      where: { id: req.params.id },
      data: { status },
    });
    
    res.json(updatedJob);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update job' });
  }
});

module.exports = router;