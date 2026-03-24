// backend/src/index.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');

dotenv.config();

const app = express();
const prisma = new PrismaClient();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/jobs', require('./routes/jobs'));
app.use('/api/contractors', require('./routes/contractors'));
app.use('/api/gc', require('./routes/gc'));
app.use('/api/bids', require('./routes/bids'));
app.use('/api/reviews', require('./routes/reviews'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/messages', require('./routes/messages'));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});