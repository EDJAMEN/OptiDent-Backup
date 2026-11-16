/**
 * OptiDent Framework-Free RESTful API
 * Dental Services Resource Controller
 * 
 * Handles:
 * - GET    /api/v1/services (List dental procedures)
 * - POST   /api/v1/services (Create new service)
 * - GET    /api/v1/services/:id (Single service details)
 * - PUT    /api/v1/services/:id (Full service replacement)
 * - PATCH  /api/v1/services/:id (Partial updates)
 * - DELETE /api/v1/services/:id (Service deactivation)
 */

import { getCollection, ObjectId } from '../utils/database.js';
import {
  parseJsonBody,
  sendSuccess,
  sendError,
  buildResourceLinks,
  buildCollectionLinks
} from '../utils/httpHelper.js';

export const servicesController = {
  /**
   * GET /api/v1/services
   */
  async listServices(req, res, queryParams) {
    try {
      const page = Math.max(1, parseInt(queryParams.page) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(queryParams.limit) || 20));

      const servicesCol = getCollection('services');
      const total = await servicesCol.countDocuments({ is_deleted: { $ne: true } });
      const skip = (page - 1) * limit;

      const cursor = await servicesCol.find({ is_deleted: { $ne: true } });
      const items = await cursor.skip(skip).limit(limit).toArray();

      const sanitized = items.map(s => ({
        id: String(s._id || s.id),
        name: s.name || s.service_name,
        category: s.category || 'General',
        price: parseFloat(s.price || s.fee || 0),
        duration_minutes: parseInt(s.duration_minutes || s.duration || 30),
        description: s.description || '',
        _links: buildResourceLinks('/api/v1/services', String(s._id || s.id))
      }));

      const data = {
        items: sanitized,
        pagination: { page, limit, total, total_pages: Math.max(1, Math.ceil(total / limit)) }
      };

      const links = buildCollectionLinks('/api/v1/services', page, limit, total, queryParams);
      sendSuccess(res, 200, data, links, true);
    } catch (err) {
      sendError(res, 500, 'SERVICES_FETCH_FAILED', err.message, 'Check query parameters.');
    }
  },

  /**
   * POST /api/v1/services
   */
  async createService(req, res) {
    try {
      const body = await parseJsonBody(req);
      const { name, category = 'General', price, duration_minutes = 30, description = '' } = body;

      if (!name || price === undefined) {
        return sendError(res, 400, 'VALIDATION_FAILED', 'Fields "name" and "price" are required.', 'Provide name and numeric price.');
      }

      const servicesCol = getCollection('services');
      const newDoc = {
        name: name.trim(),
        category,
        price: parseFloat(price),
        duration_minutes: parseInt(duration_minutes),
        description,
        is_deleted: false,
        created_at: new Date().toISOString()
      };

      const result = await servicesCol.insertOne(newDoc);
      const newId = String(result.insertedId);

      const representation = { id: newId, ...newDoc };
      const links = buildResourceLinks('/api/v1/services', newId);

      res.setHeader('Location', `/api/v1/services/${newId}`);
      sendSuccess(res, 201, representation, links);
    } catch (err) {
      if (err.status) return sendError(res, err.status, err.code, err.message, err.action);
      sendError(res, 500, 'SERVICE_CREATION_FAILED', err.message, 'Check service payload.');
    }
  },

  /**
   * GET /api/v1/services/:id
   */
  async getServiceById(req, res, id) {
    try {
      const servicesCol = getCollection('services');
      let service = null;
      try {
        service = await servicesCol.findOne({ _id: new ObjectId(id) });
      } catch (e) {
        service = await servicesCol.findOne({ _id: id });
      }

      if (!service || service.is_deleted) {
        return sendError(res, 404, 'RESOURCE_NOT_FOUND', `Service "${id}" not found.`, 'Verify service ID.');
      }

      const representation = {
        id: String(service._id || service.id),
        name: service.name,
        category: service.category,
        price: service.price,
        duration_minutes: service.duration_minutes,
        description: service.description
      };

      const links = buildResourceLinks('/api/v1/services', representation.id);
      sendSuccess(res, 200, representation, links, true);
    } catch (err) {
      sendError(res, 500, 'SERVICE_FETCH_FAILED', err.message, 'Check service ID.');
    }
  },

  /**
   * PUT /api/v1/services/:id
   */
  async replaceService(req, res, id) {
    try {
      const body = await parseJsonBody(req);
      const { name, category, price, duration_minutes, description = '' } = body;

      if (!name || !category || price === undefined || duration_minutes === undefined) {
        return sendError(res, 400, 'INCOMPLETE_REPRESENTATION', 'All fields (name, category, price, duration_minutes) are required for PUT.', 'Provide full representation.');
      }

      const servicesCol = getCollection('services');
      const filter = { _id: id.length === 24 ? new ObjectId(id) : id };

      const existing = await servicesCol.findOne(filter);
      if (!existing || existing.is_deleted) {
        return sendError(res, 404, 'RESOURCE_NOT_FOUND', `Service "${id}" not found.`, 'Verify ID.');
      }

      const updatedDoc = {
        name: name.trim(),
        category,
        price: parseFloat(price),
        duration_minutes: parseInt(duration_minutes),
        description,
        is_deleted: false,
        updated_at: new Date().toISOString()
      };

      await servicesCol.updateOne(filter, { $set: updatedDoc });
      const representation = { id, ...updatedDoc };
      sendSuccess(res, 200, representation, buildResourceLinks('/api/v1/services', id));
    } catch (err) {
      if (err.status) return sendError(res, err.status, err.code, err.message, err.action);
      sendError(res, 500, 'SERVICE_REPLACE_FAILED', err.message, 'Check payload.');
    }
  },

  /**
   * PATCH /api/v1/services/:id
   */
  async patchService(req, res, id) {
    try {
      const body = await parseJsonBody(req);
      const allowed = ['name', 'category', 'price', 'duration_minutes', 'description'];
      const updateData = {};

      for (const k of Object.keys(body)) {
        if (allowed.includes(k)) updateData[k] = body[k];
      }

      if (Object.keys(updateData).length === 0) {
        return sendError(res, 400, 'NO_MUTABLE_FIELDS_PROVIDED', 'No valid fields provided.', 'Provide price, name, etc.');
      }

      const servicesCol = getCollection('services');
      const filter = { _id: id.length === 24 ? new ObjectId(id) : id };

      const existing = await servicesCol.findOne(filter);
      if (!existing || existing.is_deleted) {
        return sendError(res, 404, 'RESOURCE_NOT_FOUND', `Service "${id}" not found.`, 'Verify ID.');
      }

      updateData.updated_at = new Date().toISOString();
      await servicesCol.updateOne(filter, { $set: updateData });

      const updated = await servicesCol.findOne(filter);
      const representation = { id: String(updated._id || updated.id), ...updated };
      sendSuccess(res, 200, representation, buildResourceLinks('/api/v1/services', id));
    } catch (err) {
      if (err.status) return sendError(res, err.status, err.code, err.message, err.action);
      sendError(res, 500, 'SERVICE_PATCH_FAILED', err.message, 'Check patch parameters.');
    }
  },

  /**
   * DELETE /api/v1/services/:id
   */
  async deleteService(req, res, id) {
    try {
      const servicesCol = getCollection('services');
      const filter = { _id: id.length === 24 ? new ObjectId(id) : id };

      const existing = await servicesCol.findOne(filter);
      if (!existing || existing.is_deleted) {
        return sendError(res, 404, 'RESOURCE_NOT_FOUND', `Service "${id}" not found.`, 'Verify ID.');
      }

      await servicesCol.updateOne(filter, {
        $set: { is_deleted: true, deleted_at: new Date().toISOString() }
      });

      sendSuccess(res, 204);
    } catch (err) {
      sendError(res, 500, 'SERVICE_DELETE_FAILED', err.message, 'Check delete operation.');
    }
  }
};

