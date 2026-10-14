<?php
/**
 * OptiDent System - Receptionist Create Appointment API
 * Front-desk scheduling of appointments linked to doctors and patients
 */

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST, OPTIONS");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/audit_logger.php';

$role = strtolower($_SESSION['role'] ?? '');
if (!in_array($role, ['receptionist', 'staff', 'super_admin', 'admin'])) {
    http_response_code(401);
    echo json_encode(["status" => "error", "message" => "Access denied. Receptionist session required."]);
    exit;
}

$input = json_decode(file_get_contents("php://input"), true);
if (!$input) $input = $_POST;

$patientName = trim($input['patient_name'] ?? '');
$patientEmail = trim($input['patient_email'] ?? '');
$patientPhone = trim($input['patient_phone'] ?? '');
$doctorName = trim($input['doctor_name'] ?? '');
$serviceName = trim($input['service_name'] ?? 'Dental Consultation');
$appointmentDate = trim($input['appointment_date'] ?? date('Y-m-d'));
$timeSlot = trim($input['time_slot'] ?? '09:00 AM');
$operatoryChair = trim($input['operatory_chair'] ?? 'Operatory Chair 1');
$notes = trim($input['notes'] ?? '');

if (empty($patientName) || empty($appointmentDate) || empty($timeSlot)) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Patient name, appointment date, and time slot are required."]);
    exit;
}

// Ensure patient user exists or find email
if (empty($patientEmail)) {
    $existingPatient = $db->findOne('users', ['full_name' => $patientName, 'role' => 'patient']);
    if ($existingPatient) {
        $patientEmail = $existingPatient['email'];
        if (empty($patientPhone)) $patientPhone = $existingPatient['phone'] ?? '';
    }
}

$appointmentDoc = [
    "patient_name" => $patientName,
    "patient_email" => $patientEmail,
    "patient_phone" => $patientPhone,
    "doctor_name" => $doctorName ?: 'Dr. Super Admin',
    "service_name" => $serviceName,
    "appointment_date" => $appointmentDate,
    "date" => $appointmentDate,
    "time_slot" => $timeSlot,
    "appointment_time" => $timeSlot,
    "operatory_chair" => $operatoryChair,
    "status" => "scheduled",
    "notes" => $notes,
    "is_deleted" => false,
    "is_archived" => false,
    "created_at" => date('Y-m-d H:i:s'),
    "booked_by" => $_SESSION['email'] ?? 'receptionist'
];

$insertedId = $db->insertOne('appointments', $appointmentDoc);

AuditLogger::log(
    'APPOINTMENT_BOOKED',
    "appointments:{$insertedId}",
    [
        'patient_name' => $patientName,
        'doctor_name' => $doctorName,
        'date' => $appointmentDate,
        'time' => $timeSlot,
        'booked_by' => $_SESSION['email'] ?? 'receptionist'
    ]
);

http_response_code(201);
echo json_encode([
    "status" => "success",
    "message" => "Appointment successfully booked for {$patientName}.",
    "appointment_id" => (string) $insertedId
]);
