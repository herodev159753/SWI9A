/**
 * Lightweight client-side rate limiter to prevent repeated rapid submissions.
 */

const rateLimitMap = new Map();

export const checkRateLimit = (key, limit = 5, timeframe = 60000) => {
  const now = Date.now();
  const userData = rateLimitMap.get(key) || { count: 0, firstAttempt: now };

  // Reset if timeframe passed
  if (now - userData.firstAttempt > timeframe) {
    userData.count = 1;
    userData.firstAttempt = now;
    rateLimitMap.set(key, userData);
    return { allowed: true };
  }

  if (userData.count >= limit) {
    const waitTime = Math.ceil((timeframe - (now - userData.firstAttempt)) / 1000);
    return { allowed: false, waitTime };
  }

  userData.count += 1;
  rateLimitMap.set(key, userData);
  return { allowed: true };
};

export const resetRateLimit = (key) => {
  rateLimitMap.delete(key);
};
