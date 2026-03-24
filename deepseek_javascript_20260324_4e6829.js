// backend/src/utils/matching.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Haversine formula to calculate distance between two points
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 3959; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

async function matchContractors(job) {
  try {
    // Find contractors with matching trade
    const contractors = await prisma.contractor.findMany({
      where: {
        trade: job.trade,
        verified: true,
      },
      include: {
        user: true,
      },
    });
    
    // Filter by location and availability
    const matchedContractors = contractors.filter(contractor => {
      // Location check (if coordinates available)
      if (job.latitude && job.longitude && contractor.latitude && contractor.longitude) {
        const distance = getDistance(
          job.latitude,
          job.longitude,
          contractor.latitude,
          contractor.longitude
        );
        if (distance > contractor.serviceRadius) return false;
      }
      
      // Availability check (simplified - check if contractor is free on job dates)
      const availability = contractor.availability;
      if (availability && typeof availability === 'object') {
        const jobStart = new Date(job.startDate);
        const jobEnd = new Date(job.endDate);
        
        // Check each day of the job
        for (let d = new Date(jobStart); d <= jobEnd; d.setDate(d.getDate() + 1)) {
          const dateStr = d.toISOString().split('T')[0];
          if (availability[dateStr] === 'booked') {
            return false;
          }
        }
      }
      
      return true;
    });
    
    // Calculate match score
    const scoredMatches = matchedContractors.map(contractor => {
      let score = 0;
      
      // Rate compatibility (closer to job rate range = higher score)
      if (contractor.hourlyRate >= job.rateMin && contractor.hourlyRate <= job.rateMax) {
        score += 30;
      } else if (contractor.hourlyRate < job.rateMin) {
        score += 15;
      } else {
        score += 10;
      }
      
      // Rating score
      score += (contractor.rating / 5) * 20;
      
      // Distance score (if coordinates available)
      if (job.latitude && job.longitude && contractor.latitude && contractor.longitude) {
        const distance = getDistance(
          job.latitude,
          job.longitude,
          contractor.latitude,
          contractor.longitude
        );
        const distanceScore = Math.max(0, 20 - (distance / contractor.serviceRadius) * 20);
        score += distanceScore;
      }
      
      // Company size preference (2-10 crew members)
      if (contractor.companySize >= 2 && contractor.companySize <= 10) {
        score += 15;
      }
      
      return {
        ...contractor,
        matchScore: score,
      };
    });
    
    // Sort by match score and return top matches
    scoredMatches.sort((a, b) => b.matchScore - a.matchScore);
    
    // Create notifications for top matches (simplified)
    for (const contractor of scoredMatches.slice(0, 20)) {
      // In production, this would trigger push notifications, emails, or WebSocket events
      console.log(`Notifying contractor ${contractor.user.email} about job ${job.id}`);
    }
    
    return scoredMatches;
  } catch (error) {
    console.error('Matching error:', error);
    return [];
  }
}

module.exports = { matchContractors, getDistance };