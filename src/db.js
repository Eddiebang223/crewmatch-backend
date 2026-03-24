const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Helper function to run queries
async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  console.log('Executed query', { text, duration, rows: res.rowCount });
  return res;
}

// Helper to get a single user by email
async function getUserByEmail(email) {
  const result = await query('SELECT * FROM "User" WHERE email = $1', [email]);
  return result.rows[0];
}

// Helper to get a single user by id
async function getUserById(id) {
  const result = await query('SELECT * FROM "User" WHERE id = $1', [id]);
  return result.rows[0];
}

// Helper to create a user
async function createUser(user) {
  const { id, email, password, name, role, companyName } = user;
  const result = await query(
    'INSERT INTO "User" (id, email, password, name, role, "companyName") VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
    [id, email, password, name, role, companyName]
  );
  return result.rows[0];
}

// Helper to create a job
async function createJob(job) {
  const { id, title, trade, description, location, startDate, endDate, hours, rateMin, rateMax, gcId } = job;
  const result = await query(
    `INSERT INTO "Job" (id, title, trade, description, location, "startDate", "endDate", hours, "rateMin", "rateMax", status, "gcId") 
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'OPEN', $11) RETURNING *`,
    [id, title, trade, description, location, startDate, endDate, hours, rateMin, rateMax, gcId]
  );
  return result.rows[0];
}

// Helper to get all open jobs
async function getOpenJobs() {
  const result = await query('SELECT * FROM "Job" WHERE status = $1 ORDER BY "createdAt" DESC', ['OPEN']);
  return result.rows;
}

// Helper to get job by id
async function getJobById(id) {
  const result = await query('SELECT * FROM "Job" WHERE id = $1', [id]);
  return result.rows[0];
}

// Helper to create a bid
async function createBid(bid) {
  const { id, jobId, contractorId, proposedRate, message } = bid;
  const result = await query(
    `INSERT INTO "Bid" (id, "jobId", "contractorId", "proposedRate", message, status) 
     VALUES ($1, $2, $3, $4, $5, 'PENDING') RETURNING *`,
    [id, jobId, contractorId, proposedRate, message]
  );
  return result.rows[0];
}

// Helper to get bids for a job
async function getBidsByJobId(jobId) {
  const result = await query('SELECT * FROM "Bid" WHERE "jobId" = $1 ORDER BY "proposedRate" ASC', [jobId]);
  return result.rows;
}

// Helper to get bids by contractor
async function getBidsByContractorId(contractorId) {
  const result = await query('SELECT * FROM "Bid" WHERE "contractorId" = $1 ORDER BY "createdAt" DESC', [contractorId]);
  return result.rows;
}

// Helper to update bid status
async function updateBidStatus(bidId, status) {
  const result = await query('UPDATE "Bid" SET status = $1 WHERE id = $2 RETURNING *', [status, bidId]);
  return result.rows[0];
}

// Helper to update job status
async function updateJobStatus(jobId, status) {
  const result = await query('UPDATE "Job" SET status = $1 WHERE id = $2 RETURNING *', [status, jobId]);
  return result.rows[0];
}

module.exports = {
  query,
  getUserByEmail,
  getUserById,
  createUser,
  createJob,
  getOpenJobs,
  getJobById,
  createBid,
  getBidsByJobId,
  getBidsByContractorId,
  updateBidStatus,
  updateJobStatus
};
