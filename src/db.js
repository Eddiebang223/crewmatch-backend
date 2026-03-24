const { Pool } = require('pg');

let pool = null;

const getPool = () => {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
    });
  }
  return pool;
};

const query = async (text, params) => {
  try {
    const start = Date.now();
    const res = await getPool().query(text, params);
    const duration = Date.now() - start;
    console.log(`📊 Query: ${text.substring(0, 100)}... (${duration}ms, ${res.rowCount} rows)`);
    return res;
  } catch (error) {
    console.error('❌ Database error:', error.message);
    throw error;
  }
};

const getUserByEmail = async (email) => {
  const res = await query('SELECT * FROM "User" WHERE email = $1', [email]);
  return res.rows[0];
};

const getUserById = async (id) => {
  const res = await query('SELECT * FROM "User" WHERE id = $1', [id]);
  return res.rows[0];
};

const createUser = async (user) => {
  const { id, email, password, name, role, companyName } = user;
  const res = await query(
    `INSERT INTO "User" (id, email, password, name, role, "companyName", "createdAt") 
     VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *`,
    [id, email, password, name, role, companyName]
  );
  return res.rows[0];
};

const createJob = async (job) => {
  const { id, title, trade, description, location, startDate, endDate, hours, rateMin, rateMax, gcId } = job;
  const res = await query(
    `INSERT INTO "Job" (id, title, trade, description, location, "startDate", "endDate", hours, "rateMin", "rateMax", status, "gcId", "createdAt") 
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'OPEN', $11, NOW()) RETURNING *`,
    [id, title, trade, description, location, startDate, endDate, hours, rateMin, rateMax, gcId]
  );
  return res.rows[0];
};

const getOpenJobs = async () => {
  const res = await query('SELECT * FROM "Job" WHERE status = $1 ORDER BY "createdAt" DESC', ['OPEN']);
  return res.rows;
};

const getJobById = async (id) => {
  const res = await query('SELECT * FROM "Job" WHERE id = $1', [id]);
  return res.rows[0];
};

const createBid = async (bid) => {
  const { id, jobId, contractorId, proposedRate, message } = bid;
  const res = await query(
    `INSERT INTO "Bid" (id, "jobId", "contractorId", "proposedRate", message, status, "createdAt") 
     VALUES ($1, $2, $3, $4, $5, 'PENDING', NOW()) RETURNING *`,
    [id, jobId, contractorId, proposedRate, message]
  );
  return res.rows[0];
};

const getBidsByJobId = async (jobId) => {
  const res = await query('SELECT * FROM "Bid" WHERE "jobId" = $1 ORDER BY "proposedRate" ASC', [jobId]);
  return res.rows;
};

const getBidsByContractorId = async (contractorId) => {
  const res = await query('SELECT * FROM "Bid" WHERE "contractorId" = $1 ORDER BY "createdAt" DESC', [contractorId]);
  return res.rows;
};

const updateBidStatus = async (bidId, status) => {
  const res = await query('UPDATE "Bid" SET status = $1 WHERE id = $2 RETURNING *', [status, bidId]);
  return res.rows[0];
};

const updateJobStatus = async (jobId, status) => {
  const res = await query('UPDATE "Job" SET status = $1 WHERE id = $2 RETURNING *', [status, jobId]);
  return res.rows[0];
};

module.exports = {
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
  updateJobStatus,
  query
};
