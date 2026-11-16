/**
 * OptiDent Framework-Free RESTful API
 * Appointments Resource Controller
 * 
 * Handles:
 * - GET    /api/v1/appointments (Paginated collection retrieval with filtering)
 * - POST   /api/v1/appointments (Appointment creation)
 * - GET    /api/v1/appointments/:id (Individual appointment representation)
 * - PUT    /api/v1/appointments/:id (Full appointment replacement)
 * - PATCH  /api/v1/appointments/:id (Partial status/details update)
 * - DELETE /api/v1/appointments/:id (Cancellation / soft-delete)
 */

import { getCollection, ObjectId } from '../utils/database.js';
import {
  parseJsonBody,
  sendSuccess,
  sendError,
  buildResourceLinks,
  buildCollectionLinks
} from '../utils/httpHelper.js';

export const appointmentsController = {
  /**
   * GET /api/v1/appointments
   * Paginated collection of appointments with dynamic filtering
   */
  async listAppointments(req, res, queryParams) {
    try {
      const page = Math.max(1, parseInt(queryParams.page) || 1);
      const rawLimit = parseInt(queryParams.limit) || 10;
      const limit = Math.min(50, Math.max(1, rawLimit)); // Cap at 50

      const filter = { is_deleted: { $ne: true } };
      if (queryParams.status) filter.status = queryParams.status.toLowerCase();
      if (queryParams.date) filter.appointment_date = queryParams.date;
      if (queryParams.doctor_email) filter.doctor_email = queryParams.doctor_email.toLowerCase();
      if (queryParams.patient_email) filter.patient_email = queryParams.patient_email.toLowerCase();

      const apptCol = getCollection('appointments');
      const total = await apptCol.countDocuments(filter);
      const skip = (page - 1) * limit;

      const cursor = await apptCol.find(filter);
      const items = await cursor.sort({ appointment_date: -1, appointment_time: -1 }).skip(skip).limit(limit).toArray();

      const sanitizedItems = items.map(a => ({
        id: String(a._id || a.id),
        patient_name: a.patient_name || a.name || 'Patient',
        patient_email: a.patient_email || a.email || '',
        doctor_name: a.doctor_name || a.dentist_name || 'Assigned Doctor',
        doctor_email: a.doctor_email || a.dentist_email || '',
        service_name: a.service_name || a.service || 'Dental Consultation',
        appointment_date: a.appointment_date || a.date || '',
        appointment_time: a.appointment_time || a.time || '',
        status: a.status || 'scheduled',
        operatory_chair: a.operatory_chair || 'Operatory Chair 1',
        chief_complaint: a.chief_complaint || '',
        created_at: a.created_at || null,
        _links: buildResourceLinks('/api/v1/appointments', String(a._id || a.id), {
          patient: a.patient_email ? { href: `/api/v1/users?email=${encodeURIComponent(a.patient_email)}`, method: 'GET' } : null
        })
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

      const links = buildCollectionLinks('/api/v1/appointments', page, limit, total, queryParams);
      sendSuccess(res, 200, data, links, true); // Cache-Control: public, max-age=60
    } catch (err) {
      sendError(res, 500, 'APPOINTMENT_QUERY_FAILED', err.message, 'Verify query parameters.');
    }
  },

  /**
   * POST /api/v1/appointments
   * Create a new appointment
   */
  async createAppointment(req, res, user) {
    try {
      const body = await parseJsonBody(req);
      const {
        patient_name,
        patient_email,
        doctor_name = 'First Available Doctor',
        doctor_email = '',
        service_name,
        appointment_date,
        appointment_time,
        chief_complaint = '',
        operatory_chair = 'Operatory Chair 1'
      } = body;

      // Validation
      if (!service_name || !appointment_date || !appointment_time) {
        return sendError(
          res,
          400,
          'VALIDATION_FAILED',
          'Fields "service_name", "appointment_date", and "appointment_time" are mandatory.',
          'Provide service, date, and time in the JSON request body.'
        );
      }

      // Check slot conflict
      const apptCol = getCollection('appointments');
      const conflict = await apptCol.findOne({
        appointment_date,
        appointment_time,
        is_deleted: { $ne: true },
        status: { $nin: ['cancelled', 'declined'] }
      });

      if (conflict) {
        return sendError(
          res,
          409,
          'SLOT_ALREADY_RESERVED',
          `The slot ${appointment_date} at ${appointment_time} is already booked.`,
          'Select a different time slot or another date.'
        );
      }

      const newApptDoc = {
        patient_name: patient_name || (user ? user.name : 'Patient'),
        patient_email: patient_email || (user ? user.email : ''),
        doctor_name,
        doctor_email,
        service_name,
        appointment_date,
        appointment_time,
        chief_complaint,
        operatory_chair,
        status: 'scheduled',
        is_deleted: false,
        created_at: new Date().toISOString()
      };

      const result = await apptCol.insertOne(newApptDoc);
      const newId = String(result.insertedId);

      const representation = { id: newId, ...newApptDoc };
      const links = buildResourceLinks('/api/v1/appointments', newId);

      res.setHeader('Location', `/api/v1/appointments/${newId}`);
      sendSuccess(res, 201, representation, links);
    } catch (err) {
      if (err.status) return sendError(res, err.status, err.code, err.message, err.action);
      sendError(res, 500, 'APPOINTMENT_CREATION_FAILED', err.message, 'Check server status.');
    }
  },

  /**
   * GET /api/v1/appointments/:id
   * Retrieve single appointment
   */
  async getAppointmentById(req, res, id) {
    try {
      const apptCol = getCollection('appointments');
      let appt = null;
      try {
        appt = await apptCol.findOne({ _id: new ObjectId(id) });
      } catch (e) {
        appt = await apptCol.findOne({ _id: id }) || await apptCol.findOne({ id });
      }

      if (!appt || appt.is_deleted) {
        return sendError(
          res,
          404,
          'RESOURCE_NOT_FOUND',
          `Appointment "${id}" does not exist.`,
          'Verify appointment ID.'
        );
      }

      const representation = {
        id: String(appt._id || appt.id),
        patient_name: appt.patient_name,
        patient_email: appt.patient_email,
        doctor_name: appt.doctor_name,
        doctor_email: appt.doctor_email,
        service_name: appt.service_name,
        appointment_date: appt.appointment_date,
        appointment_time: appt.appointment_time,
        status: appt.status,
        operatory_chair: appt.operatory_chair || 'Operatory Chair 1',
        chief_complaint: appt.chief_complaint || '',
        created_at: appt.created_at
      };

      const links = buildResourceLinks('/api/v1/appointments', representation.id);
      sendSuccess(res, 200, representation, links, true);
    } catch (err) {
      sendError(res, 500, 'APPOINTMENT_FETCH_FAILED', err.message, 'Check ID format.');
    }
  },

  /**
   * PUT /api/v1/appointments/:id
   * Complete replacement of appointment resource
   */
  async replaceAppointment(req, res, id) {
    try {
      const body = await parseJsonBody(req);
      const {
        patient_name,
        patient_email,
        doctor_name,
        doctor_email,
        service_name,
        appointment_date,
        appointment_time,
        status,
        operatory_chair = 'Operatory Chair 1',
        chief_complaint = ''
      } = body;

      if (!service_name || !appointment_date || !appointment_time || !status) {
        return sendError(
          res,
          400,
          'INCOMPLETE_REPRESENTATION',
          'PUT requires complete representation: service_name, appointment_date, appointment_time, and status are mandatory.',
          'Provide all required fields or use PATCH for partial updates.'
        );
      }

      const apptCol = getCollection('appointments');
      const filter = { _id: id.length === 24 ? new ObjectId(id) : id };

      const existing = await apptCol.findOne(filter);
      if (!existing || existing.is_deleted) {
        return sendError(res, 404, 'RESOURCE_NOT_FOUND', `Appointment "${id}" not found.`, 'Verify ID.');
      }

      const updatedDoc = {
        patient_name: patient_name || existing.patient_name,
        patient_email: patient_email || existing.patient_email,
        doctor_name: doctor_name || existing.doctor_name,
        doctor_email: doctor_email || existing.doctor_email,
        service_name,
        appointment_date,
        appointment_time,
        status: status.toLowerCase(),
        operatory_chair,
        chief_complaint,
        is_deleted: false,
        updated_at: new Date().toISOString()
      };

      await apptCol.updateOne(filter, { $set: updatedDoc });

      const representation = { id, ...updatedDoc };
      const links = buildResourceLinks('/api/v1/appointments', id);
      sendSuccess(res, 200, representation, links);
    } catch (err) {
      if (err.status) return sendError(res, err.status, err.code, err.message, err.action);
      sendError(res, 500, 'APPOINTMENT_REPLACE_FAILED', err.message, 'Check payload.');
    }
  },

  /**
   * PATCH /api/v1/appointments/:id
   * Partial update of specific fields
   */
  async patchAppointment(req, res, id) {
    try {
      const body = await parseJsonBody(req);
      const allowed = ['status', 'appointment_date', 'appointment_time', 'doctor_name', 'doctor_email', 'operatory_chair', 'chief_complaint'];
      const updateData = {};

      for (const k of Object.keys(body)) {
        if (allowed.includes(k)) {
          updateData[k] = body[k];
        }
      }

      if (Object.keys(updateData).length === 0) {
        return sendError(
          res,
          400,
          'NO_MUTABLE_FIELDS_PROVIDED',
          'No valid mutable fields provided in request body.',
          'Provide at least one of: status, appointment_date, appointment_time, doctor_name, operatory_chair.'
        );
      }

      const apptCol = getCollection('appointments');
      const filter = { _id: id.length === 24 ? new ObjectId(id) : id };

      const existing = await apptCol.findOne(filter);
      if (!existing || existing.is_deleted) {
        return sendError(res, 404, 'RESOURCE_NOT_FOUND', `Appointment "${id}" not found.`, 'Verify ID.');
      }

      updateData.updated_at = new Date().toISOString();
      await apptCol.updateOne(filter, { $set: updateData });

      const updated = await apptCol.findOne(filter);
      const representation = {
        id: String(updated._id || updated.id),
        patient_name: updated.patient_name,
        patient_email: updated.patient_email,
        doctor_name: updated.doctor_name,
        service_name: updated.service_name,
        appointment_date: updated.appointment_date,
        appointment_time: updated.appointment_time,
        status: updated.status,
        operatory_chair: updated.operatory_chair,
        updated_at: updated.updated_at
      };

      const links = buildResourceLinks('/api/v1/appointments', id);
      sendSuccess(res, 200, representation, links);
    } catch (err) {
      if (err.status) return sendError(res, err.status, err.code, err.message, err.action);
      sendError(res, 500, 'APPOINTMENT_PATCH_FAILED', err.message, 'Check patch parameters.');
    }
  },

  /**
   * DELETE /api/v1/appointments/:id
   * Cancel / soft-delete appointment
   */
  async deleteAppointment(req, res, id) {
    try {
      const apptCol = getCollection('appointments');
      const filter = { _id: id.length === 24 ? new ObjectId(id) : id };

      const existing = await apptCol.findOne(filter);
      if (!existing || existing.is_deleted) {
        return sendError(res, 404, 'RESOURCE_NOT_FOUND', `Appointment "${id}" not found or already deleted.`, 'Verify ID.');
      }

      await apptCol.updateOne(filter, {
        $set: {
          is_deleted: true,
          status: 'cancelled',
          deleted_at: new Date().toISOString()
        }
      });

      sendSuccess(res, 204);
    } catch (err) {
      sendError(res, 500, 'APPOINTMENT_DELETE_FAILED', err.message, 'Check deletion request.');
    }
  }
};

