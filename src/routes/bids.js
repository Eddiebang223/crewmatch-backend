const express = require('express');
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');

const router = express.Router();
const prisma = new PrismaClient();

// Auth middleware
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

// Submit a bid (Contractor only)
router.post('/', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'CONTRACTOR') {
      return res.status(403).json({ error: 'Only contractors can bid' });
    }
    
    const contractor = await prisma.contractor.findUnique({
      where: { userId: req.user.id }
    });
    
    if (!contractor) {
      return res.status(404).json({ error: 'Contractor profile not found' });
    }
    
    const { jobId, proposedRate, message } = req.body;
    
    const job = await prisma.job.findUnique({
      where: { id: jobId }
    });
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    if (job.status !== 'OPEN') {
      return res.status(400).json({ error: 'Job is no longer available' });
    }
    
    const bid = await prisma.bid.create({
      data: {
        jobId,
        contractorId: contractor.id,
        proposedRate: parseFloat(proposedRate),
        message
      }
    });
    
    res.status(201).json(bid);
  } catch (error) {
    console.error('Error creating bid:', error);
    res.status(500).json({ error: 'Failed to submit bid' });
  }
});

// Get bids for a job (GC only)
router.get('/job/:jobId', authMiddleware, async (req, res) => {
  try {
    const job = await prisma.job.findUnique({
      where: { id: req.params.jobId }
    });
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    const gc = await prisma.gC.findUnique({
      where: { userId: req.user.id }
    });
    
    if (!gc || job.gcId !== gc.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    
    const bids = await prisma.bid.findMany({
      where: { jobId: req.params.jobId },
      include: {
        contractor: {
          include: {
            user: {
              select: { name: true }
            }
          }
        }
      },
      orderBy: { proposedRate: 'asc' }
    });
    
    res.json({ bids });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch bids' });
  }
});

module.exports = router;
