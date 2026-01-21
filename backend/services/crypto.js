/**
 * Secure encryption utilities for sensitive data storage
 * Uses AES-256-GCM (authenticated encryption)
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const CREDENTIALS_FILE = path.join(__dirname, '..', '.credentials.enc');

/**
 * Encrypt data using AES-256-GCM
 * @param {object} data - Data to encrypt
 * @param {string} key - 32-byte hex key (64 hex chars)
 * @returns {string} - Base64 encoded encrypted data with IV and auth tag
 */
function encrypt(data, key) {
  const keyBuffer = Buffer.from(key, 'hex');
  if (keyBuffer.length !== 32) {
    throw new Error('Encryption key must be 32 bytes (64 hex characters)');
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);

  const jsonData = JSON.stringify(data);
  let encrypted = cipher.update(jsonData, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const authTag = cipher.getAuthTag();

  // Combine IV + authTag + encrypted data
  const combined = Buffer.concat([
    iv,
    authTag,
    Buffer.from(encrypted, 'base64')
  ]);

  return combined.toString('base64');
}

/**
 * Decrypt data using AES-256-GCM
 * @param {string} encryptedData - Base64 encoded encrypted data
 * @param {string} key - 32-byte hex key (64 hex chars)
 * @returns {object} - Decrypted data
 */
function decrypt(encryptedData, key) {
  const keyBuffer = Buffer.from(key, 'hex');
  if (keyBuffer.length !== 32) {
    throw new Error('Encryption key must be 32 bytes (64 hex characters)');
  }

  const combined = Buffer.from(encryptedData, 'base64');

  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, null, 'utf8');
  decrypted += decipher.final('utf8');

  return JSON.parse(decrypted);
}

/**
 * Generate a secure random encryption key
 * @returns {string} - 64 character hex string (32 bytes)
 */
function generateKey() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Store encrypted credentials to file
 * @param {object} credentials - Credentials to store
 * @param {string} key - Encryption key
 */
function storeCredentials(credentials, key) {
  const encrypted = encrypt(credentials, key);
  fs.writeFileSync(CREDENTIALS_FILE, encrypted, { mode: 0o600 });
  console.log('Credentials stored securely at:', CREDENTIALS_FILE);
}

/**
 * Load and decrypt credentials from file
 * @param {string} key - Encryption key
 * @returns {object|null} - Decrypted credentials or null if not found
 */
function loadCredentials(key) {
  if (!fs.existsSync(CREDENTIALS_FILE)) {
    return null;
  }

  const encrypted = fs.readFileSync(CREDENTIALS_FILE, 'utf8');
  return decrypt(encrypted, key);
}

/**
 * Check if credentials file exists
 * @returns {boolean}
 */
function credentialsExist() {
  return fs.existsSync(CREDENTIALS_FILE);
}

module.exports = {
  encrypt,
  decrypt,
  generateKey,
  storeCredentials,
  loadCredentials,
  credentialsExist,
  CREDENTIALS_FILE
};
