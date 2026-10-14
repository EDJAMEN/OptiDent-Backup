<?php
/**
 * OptiDent System - Save / Create / Update Clinical Dental Record API (Task D-004)
 * Allows doctors to record detailed diagnoses, treatments, operative notes, teeth surfaces, vital signs, and prescriptions.
 */

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST, OPTIONS");

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
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
$doctorName = $_SESSION['full_name'] ?? 'Attending Doctor';

if (empty($userEmail) || !in_array($userRole, ['doctor', 'super_admin', 'admin'])) {
    http_response_code(401);
    echo json_encode(["status" => "error", "message" => "Unauthorized. Doctor access required."]);
    exit;
}

$input = json_decode(file_get_contents("php://input"), true);
if (!$input) $input = $_POST;

$appointmentId = trim($input['appointment_id'] ?? '');
$patientName   = trim($input['patient_name'] ?? '');
$patientPhone  = trim($input['patient_phone'] ?? '');
$patientEmail  = trim($input['patient_email'] ?? '');
$serviceName   = trim($input['service_name'] ?? 'Dental Consultation & Treatment');
$treatmentCategory = trim($input['treatment_category'] ?? 'General Dentistry');
$diagnosis     = trim($input['diagnosis'] ?? '');
$teethSelected = $input['teeth_selected'] ?? [];
$toothSurfaces = $input['tooth_surfaces'] ?? [];
$vitalSigns    = $input['vital_signs'] ?? [];
$anesthesia    = trim($input['anesthesia'] ?? '');
$procedureNotes = trim($input['procedure_notes'] ?? '');
$prescription  = trim($input['prescription'] ?? '');
$followUpDate  = trim($input['follow_up_date'] ?? '');
$postOpCare    = trim($input['post_op_instructions'] ?? '');
$recordDate    = trim($input['record_date'] ?? date('Y-m-d'));

if (!is_array($teethSelected)) {
    $teethSelected = array_filter(array_map('trim', explode(',', (string)$teethSelected)));
}
if (!is_array($toothSurfaces)) {
    $toothSurfaces = array_filter(array_map('trim', explode(',', (string)$toothSurfaces)));
}

// Case 1: Updating an existing appointment / clinical record
if (!empty($appointmentId)) {
    $appointment = $db->findOne('appointments', ['_id' => $appointmentId]);
    if (!$appointment) {
        http_response_code(404);
        echo json_encode(["status" => "error", "message" => "Clinical appointment record not found."]);
        exit;
    }

    // If fields are left blank in the update form, retain current values
    if (empty($diagnosis)) {
        $diagnosis = $appointment['diagnosis'] ?? 'Clinical examination';
    }
    if (empty($procedureNotes)) {
        $procedureNotes = $appointment['procedure_notes'] ?? '';
    }
    if (empty($prescription) && isset($appointment['prescription'])) {
        $prescription = $appointment['prescription'];
    }
    if (empty($postOpCare) && isset($appointment['post_op_instructions'])) {
        $postOpCare = $appointment['post_op_instructions'];
    }
    if (empty($followUpDate) && isset($appointment['follow_up_date'])) {
        $followUpDate = $appointment['follow_up_date'];
    }

    // Preserve previous clinical details in edit_history so old information is never lost
    $existingHistory = $appointment['edit_history'] ?? [];
    $currentDiagnosis = trim($appointment['diagnosis'] ?? '');
    $currentNotes = trim($appointment['procedure_notes'] ?? '');
    $currentRx = trim($appointment['prescription'] ?? '');

    if (!empty($currentDiagnosis) || !empty($currentNotes)) {
        if ($currentDiagnosis !== $diagnosis || $currentNotes !== $procedureNotes || $currentRx !== $prescription) {
            $existingHistory[] = [
                'updated_at' => $appointment['last_updated_at'] ?? ($appointment['completed_at'] ?? date('Y-m-d H:i:s')),
                'doctor' => $appointment['attending_doctor'] ?? $doctorName,
                'diagnosis' => $currentDiagnosis,
                'procedure_notes' => $currentNotes,
                'prescription' => $currentRx,
                'post_op_instructions' => trim($appointment['post_op_instructions'] ?? ''),
                'follow_up_date' => trim($appointment['follow_up_date'] ?? '')
            ];
        }
    }

    $updateFields = [
        'status' => 'completed',
        'diagnosis' => $diagnosis,
        'teeth_selected' => $teethSelected,
        'tooth_surfaces' => $toothSurfaces,
        'vital_signs' => $vitalSigns,
        'anesthesia' => $anesthesia,
        'procedure_notes' => $procedureNotes,
        'prescription' => $prescription,
        'follow_up_date' => $followUpDate,
        'post_op_instructions' => $postOpCare,
        'treatment_category' => $treatmentCategory,
        'completed_at' => $appointment['completed_at'] ?? date('Y-m-d H:i:s'),
        'last_updated_at' => date('Y-m-d H:i:s'),
        'attending_doctor' => $doctorName,
        'doctor_email' => $userEmail,
        'edit_history' => $existingHistory
    ];

    if (!empty($serviceName) && $serviceName !== $appointment['service_name']) {
        $updateFields['service_name'] = $serviceName;
    }

    $db->updateOne('appointments', ['_id' => $appointmentId], ['$set' => $updateFields]);

    AuditLogger::log(
        'CLINICAL_RECORD_UPDATED',
        "appointments:{$appointmentId}",
        [
            'doctor' => $userEmail,
            'patient' => $appointment['patient_name'] ?? 'N/A',
            'diagnosis' => $diagnosis,
            'teeth' => $teethSelected,
            'action' => 'Updated existing clinical record'
        ]
    );

    http_response_code(200);
    echo json_encode([
        "status" => "success",
        "message" => "Clinical dental record saved and updated successfully!",
        "record_id" => $appointmentId
    ]);
    exit;
}

// Case 2: Creating a new direct clinical record for a patient
if (empty($patientName)) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Patient name is required when creating a new clinical entry."]);
    exit;
}

if (empty($diagnosis)) {
    $diagnosis = 'Clinical Examination & Assessment';
}

$newRecordId = uniqid('rec_', true);
$newRecord = [
    '_id' => $newRecordId,
    'patient_name' => $patientName,
    'patient_phone' => $patientPhone,
    'patient_email' => $patientEmail,
    'service_name' => $serviceName,
    'treatment_category' => $treatmentCategory,
    'appointment_date' => $recordDate,
    'appointment_time' => date('h:i A'),
    'chair_room' => 'Operatory Suite A',
    'status' => 'completed',
    'diagnosis' => $diagnosis,
    'teeth_selected' => $teethSelected,
    'tooth_surfaces' => $toothSurfaces,
    'vital_signs' => $vitalSigns,
    'anesthesia' => $anesthesia,
    'procedure_notes' => $procedureNotes,
    'prescription' => $prescription,
    'follow_up_date' => $followUpDate,
    'post_op_instructions' => $postOpCare,
    'attending_doctor' => $doctorName,
    'doctor_email' => $userEmail,
    'created_at' => date('Y-m-d H:i:s'),
    'completed_at' => date('Y-m-d H:i:s')
];

$db->insertOne('appointments', $newRecord);

AuditLogger::log(
    'CLINICAL_RECORD_CREATED',
    "appointments:{$newRecordId}",
    [
        'doctor' => $userEmail,
        'patient' => $patientName,
        'diagnosis' => $diagnosis,
        'service' => $serviceName,
        'teeth' => $teethSelected
    ]
);

http_response_code(200);
echo json_encode([
    "status" => "success",
    "message" => "New clinical treatment record successfully documented and saved!",
    "record_id" => $newRecordId
]);
