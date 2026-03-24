const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Create job (GC only)
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
    
    const { trade, title, description, location, startDate, endDate, hours, rateMin, rateMax } = req.body;
    
    const job = await prisma.job.create({
      data: {
        gcId: gc.id,
        trade,
        title,
        description,
        location,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        hours: parseInt(hours),
        rateMin: parseFloat(rateMin),
        rateMax: parseFloat(rateMax),
      },
    });
    
    res.status(201).json(job);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create job' });
  }
});

// Get all jobs
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { trade, status, page = 1, limit = 20 } = req.query;
    
    const where = {};
    if (trade) where.trade = trade;
    if (status) where.status = status;
    
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

module.exports = router;
