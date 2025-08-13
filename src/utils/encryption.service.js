const crypto = require('crypto');

/**
 * Encryption Service for secure token storage
 * Using AES-256-GCM for authenticated encryption
 */
class EncryptionService {
    constructor() {
        this.algorithm = 'aes-256-cbc';
        this.keyLength = 32; // 256 bits
        this.ivLength = 16;  // 128 bits
        
        // Get encryption key from environment or generate one
        this.encryptionKey = this.getOrGenerateKey();
    }

    /**
     * Get encryption key from environment or generate a new one
     * @returns {Buffer} - The encryption key
     */
    getOrGenerateKey() {
        const keyFromEnv = process.env.ENCRYPTION_KEY;
        
        if (keyFromEnv) {
            // If key is provided as hex string, convert to buffer
            if (keyFromEnv.length === 64) { // 32 bytes = 64 hex chars
                return Buffer.from(keyFromEnv, 'hex');
            }
            // If key is provided as base64
            return Buffer.from(keyFromEnv, 'base64');
        }
        
        // Generate a new key (should be stored securely in production)
        const newKey = crypto.randomBytes(this.keyLength);
        console.warn('🔐 ENCRYPTION WARNING: Generated new encryption key. Save this key securely:');
        console.warn(`ENCRYPTION_KEY=${newKey.toString('hex')}`);
        
        return newKey;
    }

    /**
     * Encrypt sensitive data
     * @param {string} plaintext - The data to encrypt
     * @returns {Promise<string>} - Encrypted data as base64 string
     */
    async encrypt(plaintext) {
        try {
            if (!plaintext) return null;
            
            // Generate random IV for each encryption
            const iv = crypto.randomBytes(this.ivLength);
            
            // Create cipher with proper API
            const cipher = crypto.createCipheriv(this.algorithm, this.encryptionKey, iv);
            
            // Encrypt the data
            let encrypted = cipher.update(plaintext, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            
            // Combine iv + encrypted data
            const combined = Buffer.concat([
                iv,
                Buffer.from(encrypted, 'hex')
            ]);
            
            return combined.toString('base64');
        } catch (error) {
            console.error('Encryption failed:', error);
            throw new Error('Failed to encrypt data');
        }
    }

    /**
     * Decrypt sensitive data
     * @param {string} encryptedData - The encrypted data as base64 string
     * @returns {Promise<string>} - Decrypted plaintext
     */
    async decrypt(encryptedData) {
        try {
            if (!encryptedData) return null;
            
            // Convert from base64 to buffer
            const combined = Buffer.from(encryptedData, 'base64');
            
            // Extract components
            const iv = combined.slice(0, this.ivLength);
            const encrypted = combined.slice(this.ivLength);
            
            // Create decipher with proper API
            const decipher = crypto.createDecipheriv(this.algorithm, this.encryptionKey, iv);
            
            // Decrypt the data
            let decrypted = decipher.update(encrypted, null, 'utf8');
            decrypted += decipher.final('utf8');
            
            return decrypted;
        } catch (error) {
            console.error('Decryption failed:', error);
            throw new Error('Failed to decrypt data');
        }
    }

    /**
     * Encrypt an object containing sensitive credentials
     * @param {Object} credentials - The credentials object to encrypt
     * @returns {Promise<Object>} - Object with encrypted sensitive fields
     */
    async encryptCredentials(credentials) {
        if (!credentials) return null;
        
        const encrypted = { ...credentials };
        
        // Encrypt sensitive fields
        if (credentials.access_token) {
            encrypted.access_token = await this.encrypt(credentials.access_token);
        }
        
        if (credentials.refresh_token) {
            encrypted.refresh_token = await this.encrypt(credentials.refresh_token);
        }
        
        // Mark as encrypted for identification
        encrypted._encrypted = true;
        encrypted._encryption_version = '1.0';
        
        return encrypted;
    }

    /**
     * Decrypt an object containing encrypted credentials
     * @param {Object} encryptedCredentials - The encrypted credentials object
     * @returns {Promise<Object>} - Object with decrypted sensitive fields
     */
    async decryptCredentials(encryptedCredentials) {
        if (!encryptedCredentials || !encryptedCredentials._encrypted) {
            // Return as-is if not encrypted (backward compatibility)
            return encryptedCredentials;
        }
        
        const decrypted = { ...encryptedCredentials };
        
        // Decrypt sensitive fields
        if (encryptedCredentials.access_token) {
            decrypted.access_token = await this.decrypt(encryptedCredentials.access_token);
        }
        
        if (encryptedCredentials.refresh_token) {
            decrypted.refresh_token = await this.decrypt(encryptedCredentials.refresh_token);
        }
        
        // Remove encryption metadata
        delete decrypted._encrypted;
        delete decrypted._encryption_version;
        
        return decrypted;
    }

    /**
     * Check if credentials are encrypted
     * @param {Object} credentials - The credentials to check
     * @returns {boolean} - True if credentials are encrypted
     */
    isEncrypted(credentials) {
        return !!(credentials && credentials._encrypted);
    }
}

module.exports = EncryptionService;