const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

// Register endpoint
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, role, companyName, trade } = req.body;
    
    // Check if user exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role: role || 'CONTRACTOR',
      },
    });
    
    // Create role-specific profile
    if (role === 'CONTRACTOR') {
      await prisma.contractor.create({
        data: {
          userId: user.id,
          trade: trade || 'OTHER',
          companyName: companyName || name,
          companySize: 2,
          hourlyRate: 50,
          location: '',
          specialties: [],
          availability: {},
        },
      });
    } else {
      // GC
      await prisma.gC.create({
        data: {
          userId: user.id,
          companyName: companyName || name,
          companySize: 10,
        },
      });
    }
    
    // Generate token
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'secret-key',
      { expiresIn: '7d' }
    );
    
    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

module.exports = router;
