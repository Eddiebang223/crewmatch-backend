const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Create review
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { revieweeId, jobId, rating, comment } = req.body;
    
    const review = await prisma.review.create({
      data: {
        reviewerId: req.user.id,
        revieweeId,
        jobId,
        rating: parseInt(rating),
        comment,
      },
    });
    
    // Update contractor rating
    const contractor = await prisma.contractor.findUnique({
      where: { userId: revieweeId },
    });
    
    if (contractor) {
      const reviews = await prisma.review.findMany({
        where: { revieweeId },
      });
      const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
      
      await prisma.contractor.update({
        where: { id: contractor.id },
        data: {
          rating: avgRating,
          totalRatings: reviews.length,
        },
      });
    }
    
    res.status(201).json(review);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create review' });
  }
});

// Get reviews for a user
router.get('/user/:userId', authMiddleware, async (req, res) => {
  try {
    const reviews = await prisma.review.findMany({
      where: { revieweeId: req.params.userId },
      include: {
        reviewer: {
          select: { name: true },
        },
        job: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    
    res.json(reviews);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

module.exports = router;
