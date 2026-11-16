/**
 * OptiDent Framework-Free RESTful API
 * Clinical Records & Odontogram Resource Controller
 * 
 * Handles:
 * - GET    /api/v1/clinical-records (Patient charts & history)
 * - POST   /api/v1/clinical-records (Charting & procedure logging)
 * - GET    /api/v1/clinical-records/:id (Single chart entry)
 * - PUT    /api/v1/clinical-records/:id (Full replacement)
 * - PATCH  /api/v1/clinical-records/:id (Progress notes/odontogram update)
 * - DELETE /api/v1/clinical-records/:id (Archival)
 */

import { getCollection, ObjectId } from '../utils/database.js';
import {
  parseJsonBody,
  sendSuccess,
  sendError,
  buildResourceLinks,
  buildCollectionLinks
} from '../utils/httpHelper.js';

export const clinicalRecordsController = {
  /**
   * GET /api/v1/clinical-records
   */
  async listRecords(req, res, queryParams) {
    try {
      const page = Math.max(1, parseInt(queryParams.page) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(queryParams.limit) || 10));

      const filter = { is_deleted: { $ne: true } };
      if (queryParams.patient_email) filter.patient_email = queryParams.patient_email.toLowerCase();
      if (queryParams.doctor_email) filter.doctor_email = queryParams.doctor_email.toLowerCase();
      if (queryParams.appointment_id) filter.appointment_id = queryParams.appointment_id;

      const recordsCol = getCollection('clinical_records');
      const total = await recordsCol.countDocuments(filter);
      const skip = (page - 1) * limit;

      const cursor = await recordsCol.find(filter);
      const items = await cursor.sort({ record_date: -1 }).skip(skip).limit(limit).toArray();

      const sanitized = items.map(r => ({
        id: String(r._id || r.id),
        patient_name: r.patient_name || '',
        patient_email: r.patient_email || '',
        doctor_name: r.doctor_name || '',
        diagnosis: r.diagnosis || '',
        procedure_name: r.procedure_name || '',
        tooth_number: r.tooth_number || '',
        tooth_surfaces: r.tooth_surfaces || [],
        notes: r.notes || '',
        fee: parseFloat(r.fee || 0),
        record_date: r.record_date || r.created_at,
        _links: buildResourceLinks('/api/v1/clinical-records', String(r._id || r.id))
      }));

      const data = {
        items: sanitized,
        pagination: { page, limit, total, total_pages: Math.max(1, Math.ceil(total / limit)) }
      };

      const links = buildCollectionLinks('/api/v1/clinical-records', page, limit, total, queryParams);
      sendSuccess(res, 200, data, links, true);
    } catch (err) {
      sendError(res, 500, 'CLINICAL_RECORDS_FETCH_FAILED', err.message, 'Check query parameters.');
    }
  },

  /**
   * POST /api/v1/clinical-records
   */
  async createRecord(req, res, user) {
    try {
      const body = await parseJsonBody(req);
      const {
        patient_name,
        patient_email,
        appointment_id,
        diagnosis,
        procedure_name,
        tooth_number = '',
        tooth_surfaces = [],
        notes = '',
        fee = 0
      } = body;

      if (!patient_name || !diagnosis || !procedure_name) {
        return sendError(
          res,
          400,
          'VALIDATION_FAILED',
          'Fields "patient_name", "diagnosis", and "procedure_name" are required.',
          'Provide required clinical documentation fields.'
        );
      }

      const recordsCol = getCollection('clinical_records');
      const newDoc = {
        patient_name,
        patient_email: patient_email ? patient_email.toLowerCase() : '',
        doctor_name: user ? user.name : 'Attending Dentist',
        doctor_email: user ? user.email : '',
        appointment_id: appointment_id || null,
        diagnosis,
        procedure_name,
        tooth_number,
        tooth_surfaces: Array.isArray(tooth_surfaces) ? tooth_surfaces : [tooth_surfaces],
        notes,
        fee: parseFloat(fee),
        is_deleted: false,
        record_date: new Date().toISOString().slice(0, 10),
        created_at: new Date().toISOString()
      };

      const result = await recordsCol.insertOne(newDoc);
      const newId = String(result.insertedId);

      const representation = { id: newId, ...newDoc };
      const links = buildResourceLinks('/api/v1/clinical-records', newId);

      res.setHeader('Location', `/api/v1/clinical-records/${newId}`);
      sendSuccess(res, 201, representation, links);
    } catch (err) {
      if (err.status) return sendError(res, err.status, err.code, err.message, err.action);
      sendError(res, 500, 'CLINICAL_RECORD_CREATE_FAILED', err.message, 'Check payload.');
    }
  },

  /**
   * GET /api/v1/clinical-records/:id
   */
  async getRecordById(req, res, id) {
    try {
      const recordsCol = getCollection('clinical_records');
      let record = null;
      try {
        record = await recordsCol.findOne({ _id: new ObjectId(id) });
      } catch (e) {
        record = await recordsCol.findOne({ _id: id });
      }

      if (!record || record.is_deleted) {
        return sendError(res, 404, 'RESOURCE_NOT_FOUND', `Clinical record "${id}" not found.`, 'Verify record ID.');
      }

      const representation = { id: String(record._id || record.id), ...record };
      const links = buildResourceLinks('/api/v1/clinical-records', representation.id);
      sendSuccess(res, 200, representation, links, true);
    } catch (err) {
      sendError(res, 500, 'CLINICAL_RECORD_FETCH_FAILED', err.message, 'Check record ID.');
    }
  },

  /**
   * PUT /api/v1/clinical-records/:id
   */
  async replaceRecord(req, res, id) {
    try {
      const body = await parseJsonBody(req);
      const { patient_name, diagnosis, procedure_name, tooth_number = '', tooth_surfaces = [], notes = '', fee = 0 } = body;

      if (!patient_name || !diagnosis || !procedure_name) {
        return sendError(res, 400, 'INCOMPLETE_REPRESENTATION', 'PUT requires complete clinical documentation representation.', 'Provide all required fields.');
      }

      const recordsCol = getCollection('clinical_records');
      const filter = { _id: id.length === 24 ? new ObjectId(id) : id };

      const existing = await recordsCol.findOne(filter);
      if (!existing || existing.is_deleted) {
        return sendError(res, 404, 'RESOURCE_NOT_FOUND', `Record "${id}" not found.`, 'Verify ID.');
      }

      const updatedDoc = {
        patient_name,
        patient_email: existing.patient_email,
        doctor_name: existing.doctor_name,
        doctor_email: existing.doctor_email,
        diagnosis,
        procedure_name,
        tooth_number,
        tooth_surfaces: Array.isArray(tooth_surfaces) ? tooth_surfaces : [tooth_surfaces],
        notes,
        fee: parseFloat(fee),
        is_deleted: false,
        updated_at: new Date().toISOString()
      };

      await recordsCol.updateOne(filter, { $set: updatedDoc });
      const representation = { id, ...updatedDoc };
      sendSuccess(res, 200, representation, buildResourceLinks('/api/v1/clinical-records', id));
    } catch (err) {
      if (err.status) return sendError(res, err.status, err.code, err.message, err.action);
      sendError(res, 500, 'CLINICAL_RECORD_REPLACE_FAILED', err.message, 'Check payload.');
    }
  },

  /**
   * PATCH /api/v1/clinical-records/:id
   */
  async patchRecord(req, res, id) {
    try {
      const body = await parseJsonBody(req);
      const allowed = ['diagnosis', 'procedure_name', 'tooth_number', 'tooth_surfaces', 'notes', 'fee'];
      const updateData = {};

      for (const k of Object.keys(body)) {
        if (allowed.includes(k)) updateData[k] = body[k];
      }

      if (Object.keys(updateData).length === 0) {
        return sendError(res, 400, 'NO_MUTABLE_FIELDS_PROVIDED', 'No valid mutable fields provided.', 'Provide notes, diagnosis, etc.');
      }

      const recordsCol = getCollection('clinical_records');
      const filter = { _id: id.length === 24 ? new ObjectId(id) : id };

      const existing = await recordsCol.findOne(filter);
      if (!existing || existing.is_deleted) {
        return sendError(res, 404, 'RESOURCE_NOT_FOUND', `Record "${id}" not found.`, 'Verify ID.');
      }

      updateData.updated_at = new Date().toISOString();
      await recordsCol.updateOne(filter, { $set: updateData });

      const updated = await recordsCol.findOne(filter);
      const representation = { id: String(updated._id || updated.id), ...updated };
      sendSuccess(res, 200, representation, buildResourceLinks('/api/v1/clinical-records', id));
    } catch (err) {
      if (err.status) return sendError(res, err.status, err.code, err.message, err.action);
      sendError(res, 500, 'CLINICAL_RECORD_PATCH_FAILED', err.message, 'Check patch parameters.');
    }
  },

  /**
   * DELETE /api/v1/clinical-records/:id
   */
  async deleteRecord(req, res, id) {
    try {
      const recordsCol = getCollection('clinical_records');
      const filter = { _id: id.length === 24 ? new ObjectId(id) : id };

      const existing = await recordsCol.findOne(filter);
      if (!existing || existing.is_deleted) {
        return sendError(res, 404, 'RESOURCE_NOT_FOUND', `Record "${id}" not found.`, 'Verify ID.');
      }

      await recordsCol.updateOne(filter, {
        $set: { is_deleted: true, deleted_at: new Date().toISOString() }
      });

      sendSuccess(res, 204);
    } catch (err) {
      sendError(res, 500, 'CLINICAL_RECORD_DELETE_FAILED', err.message, 'Check delete operation.');
    }
  }
};

