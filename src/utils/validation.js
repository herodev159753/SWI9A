/**
 * Utility for input validation and sanitization.
 * Prevents XSS by encoding HTML special characters.
 */

export const sanitizeInput = (input) => {
  if (typeof input !== 'string') return '';
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
};

export const validateEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
};

export const validatePhone = (phone) => {
  // Supports various formats (e.g., +1234567890, 123-456-7890)
  const re = /^\+?[1-9]\d{1,14}$/;
  return re.test(phone.replace(/[\s-]/g, ''));
};

export const validateGPS = (lat, lng) => {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
};
