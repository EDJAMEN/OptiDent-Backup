/**
 * OptiDent Framework-Free RESTful API
 * Users Resource Controller
 * 
 * =========================================================================
 * ARCHITECTURAL REQUIREMENTS INDEX (QUICK SEARCH TAGS):
 * - [REQ-3: CODE SEGREGATION - MVC & CONTROLLERS] -> Dedicated controller with business logic ONLY
 * - [REQ-4: RESTFUL NAMING - PLURAL NOUNS & HTTP METHODS] -> /api/v1/users (GET, POST, PUT, PATCH, DELETE)
 * - [REQ-5: RETURN ACTUAL RESOURCE OBJECTS & ARRAYS WITH HATEOAS] -> Returns actual User entities with _links
 * =========================================================================
 * 
 * Handles:
 * - GET    /api/v1/users (Collection retrieval with pagination & filters)
 * - POST   /api/v1/users (Resource creation)
 * - GET    /api/v1/users/:id (Individual resource retrieval)
 * - PUT    /api/v1/users/:id (Full resource replacement)
 * - PATCH  /api/v1/users/:id (Partial resource update)
 * - DELETE /api/v1/users/:id (Resource removal / soft-delete)
 */

import { getCollection, ObjectId } from '../utils/database.js';
import {
  parseJsonBody,
  sendSuccess,
  sendError,
  buildResourceLinks,
  buildCollectionLinks
} from '../utils/httpHelper.js';

export const usersController = {
  // =========================================================================
  // [REQ-4: RESTFUL NAMING] & [REQ-5: RETURN ACTUAL RESOURCE OBJECTS & ARRAYS]
  // GET /api/v1/users: Returns an array of User resource objects with pagination
  // and HATEOAS collection links.
  // =========================================================================
  async listUsers(req, res, queryParams) {
    try {
      const page = Math.max(1, parseInt(queryParams.page) || 1);
      const rawLimit = parseInt(queryParams.limit) || 10;
      const limit = Math.min(50, Math.max(1, rawLimit)); // Cap at 50 max

      const filter = { is_deleted: { $ne: true } };
      if (queryParams.role) filter.role = queryParams.role;
      if (queryParams.status) filter.status = queryParams.status;

      const usersCol = getCollection('users');
      const total = await usersCol.countDocuments(filter);
      const skip = (page - 1) * limit;

      const cursor = await usersCol.find(filter);
      const items = await cursor.skip(skip).limit(limit).toArray();

      // Sanitize password hashes out of representation
      const sanitizedItems = items.map(u => ({
        id: String(u._id || u.id),
        email: u.email,
        name: u.name || u.full_name || '',
        role: u.role || 'client',
        status: u.status || 'active',
        phone: u.phone || '',
        created_at: u.created_at || null,
        _links: buildResourceLinks('/api/v1/users', String(u._id || u.id))
      }));

      const data = {
        items: sanitizedItems,
        pagination: {
          page,
          limit,
          total,
          total_pages: Math.max(1, Math.ceil(total / limit))
        }
      };

      const links = buildCollectionLinks('/api/v1/users', page, limit, total, queryParams);
      sendSuccess(res, 200, data, links, true); // Cache-Control: public, max-age=60
    } catch (err) {
      sendError(res, 500, 'USER_QUERY_FAILED', err.message, 'Verify query parameters and database status.');
    }
  },

  /**
   * POST /api/v1/users
   * Create a new user resource
   */
  async createUser(req, res) {
    try {
      const body = await parseJsonBody(req);
      const { email, name, role = 'client', phone = '', status = 'active' } = body;

      if (!email || !name) {
        return sendError(
          res,
          400,
          'VALIDATION_FAILED',
          'Fields "email" and "name" are strictly required to create a user.',
          'Provide email and name in the JSON request body.'
        );
      }

      const usersCol = getCollection('users');
      const existing = await usersCol.findOne({ email: email.toLowerCase().trim() });
      if (existing) {
        return sendError(
          res,
          400,
          'DUPLICATE_RESOURCE',
          'A user with this email address already exists.',
          'Use a different email address or update the existing user via PUT/PATCH.'
        );
      }

      const newDoc = {
        email: email.toLowerCase().trim(),
        name: name.trim(),
        role: role.toLowerCase(),
        phone: phone.trim(),
        status,
        is_deleted: false,
        created_at: new Date().toISOString()
      };

      const result = await usersCol.insertOne(newDoc);
      const newId = String(result.insertedId);

      const representation = {
        id: newId,
        email: newDoc.email,
        name: newDoc.name,
        role: newDoc.role,
        phone: newDoc.phone,
        status: newDoc.status,
        created_at: newDoc.created_at
      };

      const links = buildResourceLinks('/api/v1/users', newId);
      res.setHeader('Location', `/api/v1/users/${newId}`);
      sendSuccess(res, 201, representation, links);
    } catch (err) {
      if (err.status) return sendError(res, err.status, err.code, err.message, err.action);
      sendError(res, 500, 'USER_CREATION_FAILED', err.message, 'Check server status and retry.');
    }
  },

  // =========================================================================
  // [REQ-4: RESTFUL NAMING] & [REQ-5: RETURN ACTUAL RESOURCE OBJECTS & ARRAYS]
  // GET /api/v1/users/:id: Returns an individual User resource entity.
  // =========================================================================
  async getUserById(req, res, id) {
    try {
      const usersCol = getCollection('users');
      let user = null;
      try {
        user = await usersCol.findOne({ _id: new ObjectId(id) });
      } catch (e) {
        user = await usersCol.findOne({ _id: id }) || await usersCol.findOne({ id });
      }

      if (!user || user.is_deleted) {
        return sendError(
          res,
          404,
          'RESOURCE_NOT_FOUND',
          `User with identifier "${id}" does not exist.`,
          'Verify the user ID or query the collection at /api/v1/users.'
        );
      }

      const representation = {
        id: String(user._id || user.id),
        email: user.email,
        name: user.name || user.full_name,
        role: user.role,
        phone: user.phone || '',
        status: user.status || 'active',
        created_at: user.created_at
      };

      const links = buildResourceLinks('/api/v1/users', representation.id, {
        appointments: { href: `/api/v1/appointments?user_id=${representation.id}`, method: 'GET' }
      });

      sendSuccess(res, 200, representation, links, true); // Cache-Control: public, max-age=60
    } catch (err) {
      sendError(res, 500, 'USER_FETCH_FAILED', err.message, 'Check user ID format.');
    }
  },

  /**
   * PUT /api/v1/users/:id
   * Complete replacement of user resource
   */
  async replaceUser(req, res, id) {
    try {
      const body = await parseJsonBody(req);
      const { email, name, role, phone = '', status = 'active' } = body;

      // Full replacement requires all mandatory properties
      if (!email || !name || !role) {
        return sendError(
          res,
          400,
          'INCOMPLETE_REPRESENTATION',
          'PUT requires a complete representation. "email", "name", and "role" are mandatory.',
          'Send all required entity fields for a full resource replacement, or use PATCH for partial updates.'
        );
      }

      const usersCol = getCollection('users');
      const filter = { _id: id.length === 24 ? new ObjectId(id) : id };

      const existing = await usersCol.findOne(filter);
      if (!existing || existing.is_deleted) {
        return sendError(
          res,
          404,
          'RESOURCE_NOT_FOUND',
          `Cannot replace user "${id}" because it does not exist.`,
          'Ensure resource exists or use POST /api/v1/users to create a new one.'
        );
      }

      const updatedDoc = {
        email: email.toLowerCase().trim(),
        name: name.trim(),
        role: role.toLowerCase(),
        phone: phone.trim(),
        status,
        is_deleted: false,
        updated_at: new Date().toISOString()
      };

      await usersCol.updateOne(filter, { $set: updatedDoc });

      const representation = { id, ...updatedDoc };
      const links = buildResourceLinks('/api/v1/users', id);
      sendSuccess(res, 200, representation, links);
    } catch (err) {
      if (err.status) return sendError(res, err.status, err.code, err.message, err.action);
      sendError(res, 500, 'USER_REPLACE_FAILED', err.message, 'Check payload format.');
    }
  },

  /**
   * PATCH /api/v1/users/:id
   * Partial update of specific fields
   */
  async patchUser(req, res, id) {
    try {
      const body = await parseJsonBody(req);
      const allowedFields = ['name', 'phone', 'role', 'status'];
      const updateData = {};

      for (const key of Object.keys(body)) {
        if (allowedFields.includes(key)) {
          updateData[key] = body[key];
        }
      }

      if (Object.keys(updateData).length === 0) {
        return sendError(
          res,
          400,
          'NO_MUTABLE_FIELDS_PROVIDED',
          'No valid mutable fields provided in request body.',
          'Provide at least one of: name, phone, role, status.'
        );
      }

      const usersCol = getCollection('users');
      const filter = { _id: id.length === 24 ? new ObjectId(id) : id };

      const existing = await usersCol.findOne(filter);
      if (!existing || existing.is_deleted) {
        return sendError(
          res,
          404,
          'RESOURCE_NOT_FOUND',
          `User "${id}" not found.`,
          'Verify user ID.'
        );
      }

      updateData.updated_at = new Date().toISOString();
      await usersCol.updateOne(filter, { $set: updateData });

      const updated = await usersCol.findOne(filter);
      const representation = {
        id: String(updated._id || updated.id),
        email: updated.email,
        name: updated.name,
        role: updated.role,
        phone: updated.phone || '',
        status: updated.status,
        updated_at: updated.updated_at
      };

      const links = buildResourceLinks('/api/v1/users', id);
      sendSuccess(res, 200, representation, links);
    } catch (err) {
      if (err.status) return sendError(res, err.status, err.code, err.message, err.action);
      sendError(res, 500, 'USER_PATCH_FAILED', err.message, 'Check patch parameters.');
    }
  },

  /**
   * DELETE /api/v1/users/:id
   * Soft-delete user into Data Recovery Vault
   */
  async deleteUser(req, res, id) {
    try {
      const usersCol = getCollection('users');
      const filter = { _id: id.length === 24 ? new ObjectId(id) : id };

      const user = await usersCol.findOne(filter);
      if (!user || user.is_deleted) {
        return sendError(
          res,
          404,
          'RESOURCE_NOT_FOUND',
          `User "${id}" does not exist or is already deleted.`,
          'Verify user ID.'
        );
      }

      // Soft delete: set is_deleted flag and record deletion metadata
      await usersCol.updateOne(filter, {
        $set: {
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          status: 'deactivated'
        }
      });

      sendSuccess(res, 204); // 204 No Content
    } catch (err) {
      sendError(res, 500, 'USER_DELETE_FAILED', err.message, 'Check delete operation.');
    }
  }
};

