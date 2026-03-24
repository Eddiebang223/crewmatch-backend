// backend/src/routes/bids.js
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Submit bid on job
router.post('/', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'CONTRACTOR') {
      return res.status(403).json({ error: 'Only contractors can bid' });
    }
    
    const { jobId, proposedRate, message } = req.body;
    
    const contractor = await prisma.contractor.findUnique({
      where: { userId: req.user.id },
    });
    
    if (!contractor) {
      return res.status(404).json({ error: 'Contractor profile not found' });
    }
    
    const job = await prisma.job.findUnique({
      where: { id: jobId },
    });
    
    if (!job || job.status !== 'OPEN') {
      return res.status(400).json({ error: 'Job not available for bidding' });
    }
    
    // Check if already bid
    const existingBid = await prisma.bid.findFirst({
      where: {
        jobId,
        contractorId: contractor.id,
      },
    });
    
    if (existingBid) {
      return res.status(400).json({ error: 'Already submitted a bid for this job' });
    }
    
    const bid = await prisma.bid.create({
      data: {
        jobId,
        contractorId: contractor.id,
        proposedRate,
        message,
      },
    });
    
    res.status(201).json(bid);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to submit bid' });
  }
});

// Get bids for a job (GC only)
router.get('/job/:jobId', authMiddleware, async (req, res) => {
  try {
    const job = await prisma.job.findUnique({
      where: { id: req.params.jobId },
      include: { gc: true },
    });
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { gc: true },
    });
    
    if (user.gc?.id !== job.gcId) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    
    const bids = await prisma.bid.findMany({
      where: { jobId: req.params.jobId },
      include: {
        contractor: {
          include: {
            user: true,
          },
        },
      },
      orderBy: { proposedRate: 'asc' },
    });
    
    res.json(bids);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch bids' });
  }
});

// Accept bid
router.patch('/:bidId/accept', authMiddleware, async (req, res) => {
  try {
    const bid = await prisma.bid.findUnique({
      where: { id: req.params.bidId },
      include: {
        job: {
          include: { gc: true },
        },
      },
    });
    
    if (!bid) {
      return res.status(404).json({ error: 'Bid not found' });
    }
    
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { gc: true },
    });
    
    if (user.gc?.id !== bid.job.gcId) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    
    // Update bid status
    await prisma.bid.update({
      where: { id: req.params.bidId },
      data: { status: 'ACCEPTED' },
    });
    
    // Update job with hired contractor
    const updatedJob = await prisma.job.update({
      where: { id: bid.jobId },
      data: {
        hiredContractorId: bid.contractorId,
        status: 'IN_PROGRESS',
      },
    });
    
    // Reject other bids
    await prisma.bid.updateMany({
      where: {
        jobId: bid.jobId,
        id: { not: req.params.bidId },
      },
      data: { status: 'REJECTED' },
    });
    
    res.json({ message: 'Bid accepted', job: updatedJob });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to accept bid' });
  }
});

// Get contractor's bids
router.get('/my-bids', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'CONTRACTOR') {
      return res.status(403).json({ error: 'Only contractors can view their bids' });
    }
    
    const contractor = await prisma.contractor.findUnique({
      where: { userId: req.user.id },
    });
    
    const bids = await prisma.bid.findMany({
      where: { contractorId: contractor.id },
      include: {
        job: {
          include: {
            gc: {
              include: {
                user: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    
    res.json(bids);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch bids' });
  }
});

module.exports = router;