// @package pg ^8.11.0
// @package bcrypt ^5.1.0
// @package rate-limiter-flexible ^2.4.1
// @package audit-logger ^2.0.0
// @package crypto-service ^3.0.0

import { Pool, QueryResult } from 'pg';
import { hash, compare } from 'bcrypt';
import { RateLimiter } from 'rate-limiter-flexible';
import { AuditLogger } from 'audit-logger';
import { EncryptionService } from 'crypto-service';
import { User, UserRole } from '../interfaces/auth.interface';
import { createDatabasePool } from '../config/database.config';

/**
 * Enhanced user model implementing secure data persistence, validation, and audit logging
 * Compliant with GDPR and SOC 2 requirements for user data handling
 */
export class UserModel {
    private readonly SALT_ROUNDS = 12;
    private readonly PASSWORD_HISTORY_LIMIT = 5;
    private readonly MAX_LOGIN_ATTEMPTS = 5;
    private readonly LOCKOUT_DURATION = 15 * 60; // 15 minutes

    private readonly dbPool: Pool;
    private readonly auditLogger: AuditLogger;
    private readonly encryptionService: EncryptionService;
    private readonly rateLimiter: RateLimiter;

    constructor(
        dbPool: Pool,
        auditLogger: AuditLogger,
        encryptionService: EncryptionService
    ) {
        this.dbPool = dbPool;
        this.auditLogger = auditLogger;
        this.encryptionService = encryptionService;

        // Initialize rate limiter for security operations
        this.rateLimiter = new RateLimiter({
            points: this.MAX_LOGIN_ATTEMPTS,
            duration: this.LOCKOUT_DURATION,
            blockDuration: this.LOCKOUT_DURATION
        });
    }

    /**
     * Creates a new user with enhanced security validation
     * @param userData User data for creation
     * @returns Created user object with sensitive data masked
     * @throws Error if validation fails or database operation fails
     */
    async create(userData: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User> {
        const client = await this.dbPool.connect();
        
        try {
            await client.query('BEGIN');

            // Validate email uniqueness
            const existingUser = await client.query(
                'SELECT id FROM users WHERE email = $1',
                [userData.email]
            );

            if (existingUser.rows.length > 0) {
                throw new Error('Email already exists');
            }

            // Hash password with secure salt
            const passwordHash = await hash(userData.passwordHash, this.SALT_ROUNDS);

            // Encrypt sensitive data
            const encryptedEmail = await this.encryptionService.encrypt(userData.email);
            const encryptedPreferences = await this.encryptionService.encrypt(
                JSON.stringify(userData.preferences)
            );

            // Insert user record
            const result: QueryResult<User> = await client.query(
                `INSERT INTO users (
                    email, password_hash, role, status,
                    last_login, preferences, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW()) 
                RETURNING *`,
                [
                    encryptedEmail,
                    passwordHash,
                    userData.role,
                    'active',
                    new Date(),
                    encryptedPreferences
                ]
            );

            await client.query('COMMIT');

            // Create audit log
            await this.auditLogger.log({
                action: 'USER_CREATED',
                userId: result.rows[0].id,
                metadata: {
                    role: userData.role,
                    timestamp: new Date()
                }
            });

            // Return sanitized user object
            const user = result.rows[0];
            delete user.passwordHash;
            return user;

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Securely retrieves user by ID with data decryption
     * @param id User ID
     * @returns Decrypted user object if found
     */
    async findById(id: string): Promise<User | null> {
        const result: QueryResult<User> = await this.dbPool.query(
            'SELECT * FROM users WHERE id = $1',
            [id]
        );

        if (result.rows.length === 0) {
            return null;
        }

        const user = result.rows[0];

        // Decrypt sensitive data
        user.email = await this.encryptionService.decrypt(user.email);
        user.preferences = JSON.parse(
            await this.encryptionService.decrypt(user.preferences as string)
        );

        // Log access for audit
        await this.auditLogger.log({
            action: 'USER_ACCESSED',
            userId: id,
            metadata: {
                timestamp: new Date()
            }
        });

        // Remove sensitive data
        delete user.passwordHash;
        return user;
    }

    /**
     * Securely verifies user password with rate limiting
     * @param userId User ID
     * @param password Password to verify
     * @returns Password validity status
     */
    async verifyPassword(userId: string, password: string): Promise<boolean> {
        try {
            // Check rate limiter
            await this.rateLimiter.consume(userId);

            const result: QueryResult<User> = await this.dbPool.query(
                'SELECT password_hash FROM users WHERE id = $1',
                [userId]
            );

            if (result.rows.length === 0) {
                throw new Error('User not found');
            }

            const isValid = await compare(password, result.rows[0].passwordHash);

            // Log verification attempt
            await this.auditLogger.log({
                action: 'PASSWORD_VERIFICATION',
                userId,
                metadata: {
                    success: isValid,
                    timestamp: new Date()
                }
            });

            if (!isValid) {
                // Update failed attempts counter
                await this.dbPool.query(
                    'UPDATE users SET failed_login_attempts = failed_login_attempts + 1 WHERE id = $1',
                    [userId]
                );
            } else {
                // Reset failed attempts on success
                await this.dbPool.query(
                    'UPDATE users SET failed_login_attempts = 0, last_login = NOW() WHERE id = $1',
                    [userId]
                );
            }

            return isValid;

        } catch (error) {
            if (error.name === 'RateLimiterError') {
                await this.auditLogger.log({
                    action: 'ACCOUNT_LOCKED',
                    userId,
                    metadata: {
                        reason: 'Too many failed attempts',
                        timestamp: new Date()
                    }
                });
                throw new Error('Account temporarily locked due to too many failed attempts');
            }
            throw error;
        }
    }
}