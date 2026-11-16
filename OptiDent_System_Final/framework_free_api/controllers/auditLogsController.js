/**
 * OptiDent Framework-Free RESTful API
 * Audit Logs Resource Controller
 * 
 * Handles:
 * - GET  /api/v1/audit-logs (Paginated forensic audit trail)
 * - POST /api/v1/audit-logs (Log an administrative or system action)
 * - GET  /api/v1/audit-logs/:id (Individual audit record)
 */

import { getCollection, ObjectId } from '../utils/database.js';
import {
  parseJsonBody,
  sendSuccess,
  sendError,
  buildResourceLinks,
  buildCollectionLinks
} from '../utils/httpHelper.js';

export const auditLogsController = {
  /**
   * GET /api/v1/audit-logs
   */
  async listLogs(req, res, queryParams) {
    try {
      const page = Math.max(1, parseInt(queryParams.page) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(queryParams.limit) || 20));

      const filter = {};
      if (queryParams.action) filter.action = queryParams.action;
      if (queryParams.actor_email) filter.user_email = queryParams.actor_email.toLowerCase();

      const auditCol = getCollection('audit_logs');
      const total = await auditCol.countDocuments(filter);
      const skip = (page - 1) * limit;

      const cursor = await auditCol.find(filter);
      const items = await cursor.sort({ created_at: -1, timestamp: -1 }).skip(skip).limit(limit).toArray();

      const sanitized = items.map(l => ({
        id: String(l._id || l.id),
        action: l.action || 'UNKNOWN_ACTION',
        actor_name: l.actor_name || l.user_name || 'System',
        user_email: l.user_email || l.actor_email || 'system@optident.local',
        user_role: l.user_role || l.actor_role || 'system',
        ip_address: l.ip_address || l.ip || '127.0.0.1',
        details: l.details || l.event_details || '',
        timestamp: l.timestamp || l.created_at || new Date().toISOString(),
        _links: buildResourceLinks('/api/v1/audit-logs', String(l._id || l.id))
      }));

      const data = {
        items: sanitized,
        pagination: { page, limit, total, total_pages: Math.max(1, Math.ceil(total / limit)) }
      };

      const links = buildCollectionLinks('/api/v1/audit-logs', page, limit, total, queryParams);
      sendSuccess(res, 200, data, links, true);
    } catch (err) {
      sendError(res, 500, 'AUDIT_LOG_FETCH_FAILED', err.message, 'Verify query parameters.');
    }
  },

  /**
   * POST /api/v1/audit-logs
   */
  async createLog(req, res, user) {
    try {
      const body = await parseJsonBody(req);
      const { action, details = '', ip_address = '127.0.0.1' } = body;

      if (!action) {
        return sendError(res, 400, 'VALIDATION_FAILED', 'Field "action" is mandatory.', 'Provide an action identifier.');
      }

      // Compute Asia/Manila Standard Time
      const manilaTimestamp = new Date().toLocaleString('en-US', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });

      const auditCol = getCollection('audit_logs');
      const newDoc = {
        action: action.toUpperCase().trim(),
        actor_name: user ? user.name : 'System',
        user_email: user ? user.email : 'system@optident.local',
        user_role: user ? user.role : 'super_admin',
        ip_address: req.socket.remoteAddress || ip_address,
        details,
        timestamp: manilaTimestamp,
        created_at: new Date().toISOString()
      };

      const result = await auditCol.insertOne(newDoc);
      const newId = String(result.insertedId);

      const representation = { id: newId, ...newDoc };
      const links = buildResourceLinks('/api/v1/audit-logs', newId);

      res.setHeader('Location', `/api/v1/audit-logs/${newId}`);
      sendSuccess(res, 201, representation, links);
    } catch (err) {
      if (err.status) return sendError(res, err.status, err.code, err.message, err.action);
      sendError(res, 500, 'AUDIT_LOG_CREATE_FAILED', err.message, 'Check payload.');
    }
  },

  /**
   * GET /api/v1/audit-logs/:id
   */
  async getLogById(req, res, id) {
    try {
      const auditCol = getCollection('audit_logs');
      let log = null;
      try {
        log = await auditCol.findOne({ _id: new ObjectId(id) });
      } catch (e) {
        log = await auditCol.findOne({ _id: id });
      }

      if (!log) {
        return sendError(res, 404, 'RESOURCE_NOT_FOUND', `Audit log "${id}" not found.`, 'Verify log ID.');
      }

      const representation = { id: String(log._id || log.id), ...log };
      sendSuccess(res, 200, representation, buildResourceLinks('/api/v1/audit-logs', representation.id), true);
    } catch (err) {
      sendError(res, 500, 'AUDIT_LOG_FETCH_FAILED', err.message, 'Check ID.');
    }
  }
};

