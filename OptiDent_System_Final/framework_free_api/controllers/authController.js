/**
 * OptiDent Framework-Free RESTful API
 * Authentication & Stateless Identity Controller
 * 
 * =========================================================================
 * ARCHITECTURAL REQUIREMENTS INDEX (QUICK SEARCH TAGS):
 * - [REQ-3: CODE SEGREGATION - MVC & CONTROLLERS] -> Dedicated authentication controller
 * - [REQ-4: RESTFUL NAMING] -> POST /api/v1/auth/tokens (Token creation / Login)
 * - [REQ-7: STATELESS AUTHENTICATION - JWT TOKENS] -> Generates cryptographic HMAC-SHA256 JWT
 * =========================================================================
 * 
 * Handles:
 * - POST /api/v1/auth/tokens (Stateless login)
 * - POST /api/v1/auth/registrations (Self-service patient onboarding)
 */

import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getCollection } from '../utils/database.js';
import {
  parseJsonBody,
  sendSuccess,
  sendError,
  generateStatelessToken,
  buildResourceLinks
} from '../utils/httpHelper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Optional bcrypt adapter from local or neighboring modules to verify existing legacy hashes
let bcrypt = null;
try {
  const candidatePaths = [
    path.resolve(__dirname, '../../node_modules/bcryptjs/index.js'),
    path.resolve(__dirname, '../../../OptiDent_NodeJS/node_modules/bcryptjs/index.js'),
    path.resolve(__dirname, '../../OptiDent_NodeJS/node_modules/bcryptjs/index.js')
  ];
  const bcryptPath = candidatePaths.find(p => fs.existsSync(p));
  if (bcryptPath) {
    const m = await import(`file://${bcryptPath.replace(/\\/g, '/')}`);
    bcrypt = m.default || m;
  }
} catch (e) {}

// Simple PBKDF2 native password hashing helper
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash) return false;
  if (password === storedHash) return true;

  if (bcrypt && (storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$') || storedHash.startsWith('$2y$'))) {
    try {
      return bcrypt.compareSync(password, storedHash);
    } catch (e) {}
  }

  if (storedHash.includes(':')) {
    const [salt, key] = storedHash.split(':');
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return key === hash;
  }

  return false;
}

export const authController = {
  /**
   * POST /api/v1/auth/tokens
   * Stateless Authentication Token Issuance (Login)
   */
  async createToken(req, res) {
    try {
      const body = await parseJsonBody(req);
      const { email, password } = body;

      if (!email || !password) {
        return sendError(
          res,
          400,
          'MISSING_REQUIRED_CREDENTIALS',
          'Both "email" and "password" are required fields for authentication.',
          'Provide both email address and password in the JSON request body.'
        );
      }

      const usersCol = getCollection('users');
      const user = await usersCol.findOne({ email: email.toLowerCase().trim() });

      if (!user) {
        return sendError(
          res,
          401,
          'INVALID_CREDENTIALS',
          'The provided email or password does not match any registered account.',
          'Verify your login credentials and try again.'
        );
      }

      if (user.is_deleted || user.status === 'deactivated') {
        return sendError(
          res,
          403,
          'ACCOUNT_DEACTIVATED',
          'This account has been deactivated or archived.',
          'Contact the clinic Super Administrator for account restoration.'
        );
      }

      const storedHash = user.password_hash || user.password;
      const isValid = verifyPassword(password, storedHash);
      if (!isValid) {
        return sendError(
          res,
          401,
          'INVALID_CREDENTIALS',
          'The provided email or password does not match any registered account.',
          'Verify your login credentials and try again.'
        );
      }

      // Generate stateless JWT Bearer token
      const tokenPayload = {
        sub: String(user._id || user.id),
        email: user.email,
        name: user.name || user.full_name || 'OptiDent User',
        role: user.role || 'client'
      };

      const token = generateStatelessToken(tokenPayload, 86400); // 24 hours

      const responseData = {
        token_type: 'Bearer',
        access_token: token,
        expires_in: 86400,
        user: {
          id: tokenPayload.sub,
          name: tokenPayload.name,
          email: tokenPayload.email,
          role: tokenPayload.role
        }
      };

      const links = buildResourceLinks('/api/v1/users', tokenPayload.sub, {
        appointments: { href: `/api/v1/appointments?user_id=${tokenPayload.sub}`, method: 'GET' }
      });

      sendSuccess(res, 201, responseData, links);
    } catch (err) {
      if (err.status) {
        return sendError(res, err.status, err.code, err.message, err.action);
      }
      sendError(res, 500, 'AUTH_INTERNAL_ERROR', err.message, 'Check server status and retry.');
    }
  },

  /**
   * POST /api/v1/auth/registrations
   * Self-Service Patient Registration
   */
  async registerPatient(req, res) {
    try {
      const body = await parseJsonBody(req);
      const { email, password, name, phone } = body;

      if (!email || !password || !name) {
        return sendError(
          res,
          400,
          'MISSING_REGISTRATION_FIELDS',
          'The fields "email", "password", and "name" are mandatory.',
          'Ensure all mandatory registration fields are populated with valid values.'
        );
      }

      const usersCol = getCollection('users');
      const existing = await usersCol.findOne({ email: email.toLowerCase().trim() });
      if (existing) {
        return sendError(
          res,
          400,
          'EMAIL_ALREADY_REGISTERED',
          'An account with this email address already exists in the system.',
          'Log in using this email address or choose a different email.'
        );
      }

      const newUserDoc = {
        email: email.toLowerCase().trim(),
        password: hashPassword(password),
        name: name.trim(),
        phone: (phone || '').trim(),
        role: 'client',
        status: 'active',
        is_deleted: false,
        created_at: new Date().toISOString()
      };

      const result = await usersCol.insertOne(newUserDoc);
      const createdId = String(result.insertedId);

      const token = generateStatelessToken({
        sub: createdId,
        email: newUserDoc.email,
        name: newUserDoc.name,
        role: 'client'
      });

      const responseData = {
        message: 'Patient account created successfully.',
        access_token: token,
        user: {
          id: createdId,
          name: newUserDoc.name,
          email: newUserDoc.email,
          role: 'client'
        }
      };

      const links = buildResourceLinks('/api/v1/users', createdId, {
        book_appointment: { href: '/api/v1/appointments', method: 'POST' }
      });

      sendSuccess(res, 201, responseData, links);
    } catch (err) {
      if (err.status) {
        return sendError(res, err.status, err.code, err.message, err.action);
      }
      sendError(res, 500, 'REGISTRATION_FAILED', err.message, 'Try again with valid input.');
    }
  }
};
