import jwt from "jsonwebtoken";
import crypto from "crypto";

const ACCESS_SECRET = process.env.ACCESS_TOKEN_SECRET;
const REFRESH_SECRET = process.env.REFRESH_TOKEN_SECRET;
const ACCESS_EXP = process.env.ACCESS_TOKEN_EXP || "15m";
const REFRESH_EXP = process.env.REFRESH_TOKEN_EXP || "30d";

// Validate that secrets are set
if (!ACCESS_SECRET || !REFRESH_SECRET) {
  throw new Error('JWT secrets must be set in environment variables');
}

if (ACCESS_SECRET.length < 32 || REFRESH_SECRET.length < 32) {
  console.warn('⚠️  Warning: JWT secrets should be at least 32 characters long for security');
}

/**
 * Sign an access token (short-lived)
 * @param {Object} payload - Token payload (e.g., { sub: userId, role: 'user' })
 * @returns {string} Signed JWT token
 */
function signAccess(payload) {
  return jwt.sign(payload, ACCESS_SECRET, { 
    expiresIn: ACCESS_EXP,
    issuer: 'worker-app',
    audience: 'worker-app-users'
  });
}

/**
 * Sign a refresh token (long-lived)
 * @param {Object} payload - Token payload (e.g., { sub: userId, rid: refreshId })
 * @returns {string} Signed JWT token
 */
function signRefresh(payload) {
  return jwt.sign(payload, REFRESH_SECRET, { 
    expiresIn: REFRESH_EXP,
    issuer: 'worker-app',
    audience: 'worker-app-users'
  });
}

/**
 * Verify an access token
 * @param {string} token - JWT token to verify
 * @returns {Object} Decoded token payload
 * @throws {Error} If token is invalid or expired
 */
function verifyAccess(token) {
  return jwt.verify(token, ACCESS_SECRET, {
    issuer: 'worker-app',
    audience: 'worker-app-users'
  });
}

/**
 * Verify a refresh token
 * @param {string} token - JWT token to verify
 * @returns {Object} Decoded token payload
 * @throws {Error} If token is invalid or expired
 */
function verifyRefresh(token) {
  return jwt.verify(token, REFRESH_SECRET, {
    issuer: 'worker-app',
    audience: 'worker-app-users'
  });
}

/**
 * Generate a unique refresh token ID
 * @returns {string} Random hex string
 */
function genRefreshId() {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Decode a token without verifying (useful for debugging)
 * @param {string} token - JWT token to decode
 * @returns {Object|null} Decoded token or null if invalid
 */
function decodeToken(token) {
  try {
    return jwt.decode(token);
  } catch (error) {
    return null;
  }
}

/**
 * Check if a token is expired without verifying signature
 * @param {string} token - JWT token to check
 * @returns {boolean} True if expired
 */
function isTokenExpired(token) {
  try {
    const decoded = jwt.decode(token);
    if (!decoded || !decoded.exp) return true;
    return Date.now() >= decoded.exp * 1000;
  } catch (error) {
    return true;
  }
}

export { 
  signAccess, 
  signRefresh, 
  verifyAccess, 
  verifyRefresh, 
  genRefreshId,
  decodeToken,
  isTokenExpired
};