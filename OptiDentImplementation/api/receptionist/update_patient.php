<?php
/**
 * OptiDent System - Receptionist Update Patient Profile API
 * Task R-004: Update contact details, address, and medical alerts for existing patients
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

// Verify receptionist session
$role = strtolower($_SESSION['role'] ?? '');
if (!in_array($role, ['receptionist', 'staff', 'super_admin', 'admin'])) {
    http_response_code(401);
    echo json_encode(["status" => "error", "message" => "Access denied. Receptionist session required."]);
    exit;
}

$input = json_decode(file_get_contents("php://input"), true);
if (!$input) $input = $_POST;

$patientId = trim($input['patient_id'] ?? $input['id'] ?? '');
$phone = trim($input['phone'] ?? '');
$email = strtolower(trim($input['email'] ?? ''));
$address = trim($input['address'] ?? '');
$dob = trim($input['dob'] ?? '');
$gender = trim($input['gender'] ?? '');
$bloodType = trim($input['blood_type'] ?? '');
$allergies = trim($input['allergies'] ?? $input['medical_alerts'] ?? '');
$emergencyName = trim($input['emergency_contact_name'] ?? '');
$emergencyPhone = trim($input['emergency_contact_phone'] ?? '');

if (empty($patientId)) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Patient ID is required."]);
    exit;
}

$filter = ['_id' => $patientId];

$patient = $db->findOne('users', $filter);
if (!$patient) {
    http_response_code(404);
    echo json_encode(["status" => "error", "message" => "Patient record not found."]);
    exit;
}

// Check if new phone belongs to another patient
if (!empty($phone) && $phone !== ($patient['phone'] ?? '')) {
    $existing = $db->findOne('users', ['phone' => $phone, 'role' => 'patient']);
    if ($existing && (string)$existing['_id'] !== (string)$patient['_id']) {
        http_response_code(409);
        echo json_encode(["status" => "error", "message" => "Phone number {$phone} is already registered to another patient ({$existing['full_name']})."]);
        exit;
    }
}

// Auto age calculation
$age = $patient['age'] ?? null;
if (!empty($dob)) {
    try {
        $b = new DateTime($dob);
        $now = new DateTime('today');
        $age = $b->diff($now)->y;
    } catch (Exception $e) {
        $age = null;
    }
}

$updateFields = [
    "phone" => $phone ?: ($patient['phone'] ?? ''),
    "address" => $address,
    "dob" => $dob ?: ($patient['dob'] ?? ''),
    "age" => $age,
    "gender" => $gender ?: ($patient['gender'] ?? 'Not Specified'),
    "blood_type" => $bloodType ?: ($patient['blood_type'] ?? 'Unknown'),
    "allergies" => $allergies,
    "medical_alerts" => $allergies,
    "emergency_contact_name" => $emergencyName,
    "emergency_contact_phone" => $emergencyPhone,
    "updated_at" => date('Y-m-d H:i:s'),
    "updated_by" => $_SESSION['email'] ?? 'receptionist'
];

if (!empty($email) && stripos($email, '@clinic.local') === false) {
    $updateFields["email"] = $email;
}

$db->updateOne('users', $filter, ['$set' => $updateFields]);

AuditLogger::log(
    'PATIENT_UPDATED',
    "users:{$patient['_id']}",
    [
        'patient_name' => $patient['full_name'],
        'updated_fields' => array_keys($updateFields),
        'updated_by' => $_SESSION['email'] ?? 'receptionist'
    ]
);

http_response_code(200);
echo json_encode([
    "status" => "success",
    "message" => "Patient {$patient['full_name']}'s details updated successfully.",
    "patient" => array_merge($patient, $updateFields)
]);
