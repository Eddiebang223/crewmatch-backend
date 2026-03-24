const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Get contractor profile
router.get('/me', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'CONTRACTOR') {
      return res.status(403).json({ error: 'Not a contractor' });
    }
    
    const contractor = await prisma.contractor.findUnique({
      where: { userId: req.user.id },
      include: {
        user: true,
        reviews: true,
      },
    });
    
    res.json(contractor);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Update contractor profile
router.put('/me', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'CONTRACTOR') {
      return res.status(403).json({ error: 'Not a contractor' });
    }
    
    const { companyName, trade, hourlyRate, location, serviceRadius, specialties } = req.body;
    
    const contractor = await prisma.contractor.update({
      where: { userId: req.user.id },
      data: {
        companyName,
        trade,
        hourlyRate,
        location,
        serviceRadius,
        specialties,
      },
    });
    
    res.json(contractor);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Get all contractors (for GCs)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { trade, minRating } = req.query;
    
    const where = {};
    if (trade) where.trade = trade;
    if (minRating) where.rating = { gte: parseFloat(minRating) };
    
    const contractors = await prisma.contractor.findMany({
      where,
      include: {
        user: {
          select: { name: true, email: true },
        },
      },
      orderBy: { rating: 'desc' },
    });
    
    res.json(contractors);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch contractors' });
  }
});

module.exports = router;
