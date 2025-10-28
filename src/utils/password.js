import argon2 from "argon2";

/**
 * Hash a plain text password using Argon2id
 * @param {string} plain - Plain text password
 * @returns {Promise<string>} Hashed password
 */
async function hashPassword(plain) {
  try {
    return await argon2.hash(plain, {
      type: argon2.argon2id,
      memoryCost: 65536, // 64 MB
      timeCost: 3,        // 3 iterations
      parallelism: 4      // 4 parallel threads
    });
  } catch (error) {
    console.error('Error hashing password:', error);
    throw new Error('Failed to hash password');
  }
}

/**
 * Verify a plain text password against a hash
 * @param {string} hash - Hashed password
 * @param {string} plain - Plain text password to verify
 * @returns {Promise<boolean>} True if password matches
 */
async function verifyPassword(hash, plain) {
  try {
    return await argon2.verify(hash, plain);
  } catch (error) {
    console.error('Error verifying password:', error);
    return false;
  }
}

/**
 * Check if password meets security requirements
 * @param {string} password - Password to validate
 * @returns {Object} { valid: boolean, errors: string[] }
 */
function validatePasswordStrength(password) {
  const errors = [];
  
  if (!password) {
    errors.push('Password is required');
    return { valid: false, errors };
  }
  
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

export { hashPassword, verifyPassword, validatePasswordStrength };