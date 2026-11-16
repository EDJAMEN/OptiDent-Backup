/**
 * OptiDent Framework-Free RESTful API
 * Data Recovery Vault Resource Controller
 * 
 * Handles:
 * - GET    /api/v1/recovery-vault (List soft-deleted items across domain collections)
 * - POST   /api/v1/recovery-vault/:id/restorations (Restore record to active state)
 * - DELETE /api/v1/recovery-vault/:id (Permanently purge record from database)
 */

import { getCollection, ObjectId } from '../utils/database.js';
import {
  parseJsonBody,
  sendSuccess,
  sendError,
  buildResourceLinks,
  buildCollectionLinks
} from '../utils/httpHelper.js';

export const recoveryVaultController = {
  /**
   * GET /api/v1/recovery-vault
   */
  async listVaultRecords(req, res, queryParams) {
    try {
      const page = Math.max(1, parseInt(queryParams.page) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(queryParams.limit) || 20));
      const targetCollection = queryParams.collection || 'all';

      const items = [];

      // Query users
      if (targetCollection === 'all' || targetCollection === 'users') {
        const usersCol = getCollection('users');
        const deletedUsers = await usersCol.find({ is_deleted: true }).toArray();
        deletedUsers.forEach(u => {
          items.push({
            id: String(u._id || u.id),
            collection: 'users',
            title: u.name || u.full_name || u.email,
            identifier: u.email,
            role: u.role || 'client',
            deleted_at: u.deleted_at || u.updated_at || 'Unknown',
            _links: {
              restore: { href: `/api/v1/recovery-vault/${String(u._id || u.id)}/restorations?collection=users`, method: 'POST' },
              purge: { href: `/api/v1/recovery-vault/${String(u._id || u.id)}?collection=users`, method: 'DELETE' }
            }
          });
        });
      }

      // Query appointments
      if (targetCollection === 'all' || targetCollection === 'appointments') {
        const apptCol = getCollection('appointments');
        const deletedAppts = await apptCol.find({ is_deleted: true }).toArray();
        deletedAppts.forEach(a => {
          items.push({
            id: String(a._id || a.id),
            collection: 'appointments',
            title: `${a.service_name || 'Consultation'} - ${a.patient_name || 'Patient'}`,
            identifier: `${a.appointment_date || ''} ${a.appointment_time || ''}`,
            role: 'appointment',
            deleted_at: a.deleted_at || a.updated_at || 'Unknown',
            _links: {
              restore: { href: `/api/v1/recovery-vault/${String(a._id || a.id)}/restorations?collection=appointments`, method: 'POST' },
              purge: { href: `/api/v1/recovery-vault/${String(a._id || a.id)}?collection=appointments`, method: 'DELETE' }
            }
          });
        });
      }

      const total = items.length;
      const skip = (page - 1) * limit;
      const paginatedItems = items.slice(skip, skip + limit);

      const data = {
        items: paginatedItems,
        pagination: { page, limit, total, total_pages: Math.max(1, Math.ceil(total / limit)) }
      };

      const links = buildCollectionLinks('/api/v1/recovery-vault', page, limit, total, queryParams);
      sendSuccess(res, 200, data, links, false);
    } catch (err) {
      sendError(res, 500, 'VAULT_QUERY_FAILED', err.message, 'Check query parameters.');
    }
  },

  /**
   * POST /api/v1/recovery-vault/:id/restorations
   * Restore a soft-deleted record back to active status
   */
  async restoreRecord(req, res, id, queryParams) {
    try {
      const collectionName = queryParams.collection || 'users';
      const col = getCollection(collectionName);
      const filter = { _id: id.length === 24 ? new ObjectId(id) : id };

      const existing = await col.findOne(filter);
      if (!existing) {
        return sendError(res, 404, 'RESOURCE_NOT_FOUND', `Vault record "${id}" in collection "${collectionName}" not found.`, 'Verify ID and collection parameter.');
      }

      await col.updateOne(filter, {
        $set: {
          is_deleted: false,
          status: 'active',
          restored_at: new Date().toISOString()
        },
        $unset: {
          deleted_at: ""
        }
      });

      const restored = await col.findOne(filter);
      const representation = {
        id: String(restored._id || restored.id),
        collection: collectionName,
        restored: true,
        restored_at: new Date().toISOString()
      };

      const links = buildResourceLinks(`/api/v1/${collectionName}`, id);
      sendSuccess(res, 200, representation, links);
    } catch (err) {
      sendError(res, 500, 'VAULT_RESTORE_FAILED', err.message, 'Check parameters.');
    }
  },

  /**
   * DELETE /api/v1/recovery-vault/:id
   * Permanently purge a record
   */
  async purgeRecord(req, res, id, queryParams) {
    try {
      const collectionName = queryParams.collection || 'users';
      const col = getCollection(collectionName);
      const filter = { _id: id.length === 24 ? new ObjectId(id) : id };

      const existing = await col.findOne(filter);
      if (!existing) {
        return sendError(res, 404, 'RESOURCE_NOT_FOUND', `Record "${id}" not found.`, 'Verify ID.');
      }

      await col.deleteOne(filter);
      sendSuccess(res, 204);
    } catch (err) {
      sendError(res, 500, 'VAULT_PURGE_FAILED', err.message, 'Check parameters.');
    }
  }
};

