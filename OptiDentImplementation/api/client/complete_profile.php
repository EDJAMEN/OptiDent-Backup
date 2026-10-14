<?php
/**
 * OptiDent System - Patient Complete Profile & Clinical Safety Details (Step 2)
 * Task C-001: Fill up personal information and clinical safety after account registration.
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

// Verify patient session
$userId = $_SESSION['user_id'] ?? '';
$userEmail = $_SESSION['email'] ?? '';
$userRole = strtolower($_SESSION['role'] ?? '');

if (empty($userId) && empty($userEmail)) {
    http_response_code(401);
    echo json_encode(["status" => "error", "message" => "Please complete Step 1 registration first."]);
    exit;
}

$input = json_decode(file_get_contents("php://input"), true);
if (!$input) {
    $input = $_POST;
}

$phone = trim($input['phone'] ?? '');
$dob = trim($input['dob'] ?? '');
$gender = trim($input['gender'] ?? 'Not Specified');
$bloodType = trim($input['blood_type'] ?? 'Unknown');
$address = trim($input['address'] ?? '');
$allergies = trim($input['allergies'] ?? $input['medical_alerts'] ?? 'None recorded');
$emergName = trim($input['emergency_contact_name'] ?? '');
$emergPhone = trim($input['emergency_contact_phone'] ?? '');

// Calculate Age from Date of Birth
$age = null;
if (!empty($dob)) {
    try {
        $birthDate = new DateTime($dob);
        $today = new DateTime('today');
        $age = $birthDate->diff($today)->y;
    } catch (\Exception $e) {
        $age = null;
    }
}

// Find user to update
$filter = !empty($userId) ? ['_id' => $userId] : ['email' => $userEmail];

$updateFields = [
    'phone' => $phone,
    'dob' => $dob,
    'age' => $age,
    'gender' => $gender,
    'blood_type' => $bloodType,
    'address' => $address,
    'allergies' => $allergies ?: 'None recorded',
    'medical_alerts' => $allergies ?: 'None recorded',
    'emergency_contact_name' => $emergName,
    'emergency_contact_phone' => $emergPhone,
    'profile_completed' => true,
    'updated_at' => date('Y-m-d H:i:s')
];

$db->updateOne('users', $filter, ['$set' => $updateFields]);

// Audit trail
AuditLogger::log(
    'PATIENT_PROFILE_COMPLETED',
    "users:{$userEmail}",
    [
        'user_id' => $userId,
        'email' => $userEmail,
        'phone' => $phone,
        'has_allergies' => ($allergies !== 'None recorded' && !empty($allergies))
    ]
);

http_response_code(200);
echo json_encode([
    "status" => "success",
    "message" => "Personal information and clinical safety details saved successfully!",
    "redirect" => "client_dashboard.html"
]);
