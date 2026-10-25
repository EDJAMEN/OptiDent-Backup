<?php
/**
 * OptiDent System - Doctor Appointment Approval API (Task D-008)
 * Allows doctors to review and approve patient appointment requests,
 * confirming consultation schedules for available clinical slots.
 */

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/audit_logger.php';

$userEmail = $_SESSION['email'] ?? '';
$userRole = strtolower($_SESSION['role'] ?? '');

if (empty($userEmail) || !in_array($userRole, ['doctor', 'super_admin', 'admin'])) {
    http_response_code(401);
    echo json_encode(["status" => "error", "message" => "Unauthorized. Doctor session required."]);
    exit;
}

// Locate doctor details
$doctor = $db->findOne('users', ['email' => $userEmail]);
$doctorName = $doctor['full_name'] ?? ($_SESSION['full_name'] ?? 'Attending Doctor');

$input = json_decode(file_get_contents("php://input"), true);
if (!$input) $input = $_POST;

$appointmentId = trim($input['appointment_id'] ?? '');
$action = strtolower(trim($input['action'] ?? 'approve'));
$notes = trim($input['notes'] ?? ($input['reason'] ?? ''));

if (empty($appointmentId)) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Appointment ID is required."]);
    exit;
}

// 1. Locate appointment
$appointment = $db->findOne('appointments', ['_id' => $appointmentId]);
if (!$appointment) {
    http_response_code(404);
    echo json_encode(["status" => "error", "message" => "Appointment request not found."]);
    exit;
}

$now = date('Y-m-d H:i:s');
$patientName = $appointment['patient_name'] ?? 'Patient';
$apptDate = $appointment['appointment_date'] ?? ($appointment['date'] ?? '');
$timeSlot = $appointment['time_slot'] ?? ($appointment['appointment_time'] ?? '');

if ($action === 'approve') {
    $updateData = [
        'status' => 'scheduled',
        'approval_status' => 'approved',
        'approved_by' => $doctorName,
        'approved_by_email' => $userEmail,
        'approved_at' => $now,
        'last_updated_at' => $now
    ];

    if (!empty($notes)) {
        $updateData['doctor_notes'] = $notes;
    }

    $db->updateOne('appointments', ['_id' => $appointmentId], ['$set' => $updateData]);

    // Audit Logging
    AuditLogger::log(
        'DOCTOR_APPOINTMENT_APPROVED',
        "appointments:{$appointmentId}",
        [
            'task' => 'D-008',
            'doctor' => $doctorName,
            'doctor_email' => $userEmail,
            'patient' => $patientName,
            'schedule_date' => $apptDate,
            'time_slot' => $timeSlot,
            'status' => 'scheduled'
        ]
    );

    http_response_code(200);
    echo json_encode([
        "status" => "success",
        "message" => "Appointment request approved! Consultation schedule confirmed for {$patientName}.",
        "appointment_id" => $appointmentId,
        "new_status" => "scheduled",
        "patient_name" => $patientName,
        "appointment_date" => $apptDate,
        "time_slot" => $timeSlot
    ]);
    exit;

} elseif ($action === 'decline' || $action === 'reject') {
    $declineReason = !empty($notes) ? $notes : 'Doctor schedule conflict / Consultation slot unavailable';

    $updateData = [
        'status' => 'cancelled',
        'approval_status' => 'declined',
        'cancellation_reason' => $declineReason,
        'decline_reason' => $declineReason,
        'cancelled_by' => $userEmail,
        'cancelled_at' => $now,
        'declined_by' => $doctorName,
        'declined_by_email' => $userEmail,
        'declined_at' => $now,
        'last_updated_at' => $now
    ];

    $db->updateOne('appointments', ['_id' => $appointmentId], ['$set' => $updateData]);

    // Audit Logging (D-009)
    AuditLogger::log(
        'DOCTOR_APPOINTMENT_DECLINED',
        "appointments:{$appointmentId}",
        [
            'task' => 'D-009',
            'doctor' => $doctorName,
            'doctor_email' => $userEmail,
            'patient' => $patientName,
            'schedule_date' => $apptDate,
            'time_slot' => $timeSlot,
            'reason' => $declineReason,
            'status' => 'cancelled'
        ]
    );

    http_response_code(200);
    echo json_encode([
        "status" => "success",
        "message" => "Appointment request declined. Patient will be informed of schedule non-accommodation.",
        "appointment_id" => $appointmentId,
        "new_status" => "cancelled",
        "patient_name" => $patientName,
        "decline_reason" => $declineReason
    ]);
    exit;

} else {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Invalid action: {$action}. Expected 'approve' or 'decline'."]);
    exit;
}
