const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Get GC profile
router.get('/me', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'GC') {
      return res.status(403).json({ error: 'Not a GC' });
    }
    
    const gc = await prisma.gC.findUnique({
      where: { userId: req.user.id },
      include: {
        user: true,
        jobs: {
          include: {
            bids: true,
            hiredContractor: {
              include: {
                user: true,
              },
            },
          },
        },
      },
    });
    
    res.json(gc);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Update GC profile
router.put('/me', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'GC') {
      return res.status(403).json({ error: 'Not a GC' });
    }
    
    const { companyName, companySize } = req.body;
    
    const gc = await prisma.gC.update({
      where: { userId: req.user.id },
      data: {
        companyName,
        companySize,
      },
    });
    
    res.json(gc);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

module.exports = router;
