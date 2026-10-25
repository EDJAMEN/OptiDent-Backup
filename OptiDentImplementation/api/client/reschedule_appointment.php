<?php
/**
 * OptiDent System - Client Reschedule Appointment API
 * Self-service appointment rescheduling for patients
 */

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/audit_logger.php';

require_once __DIR__ . '/../config/clinic_hours_helper.php';

$role = strtolower($_SESSION['role'] ?? '');
if (!in_array($role, ['patient', 'client'])) {
    http_response_code(401);
    echo json_encode(["status" => "error", "message" => "Access denied. Patient session required."]);
    exit;
}

// System Integration Switch: Check if patient self-rescheduling is enabled
$clinicProfile = ClinicHoursHelper::getActiveClinicProfile($db);
$integrations = $clinicProfile['integrations'] ?? [];
if (isset($integrations['patient_rescheduling_enabled']) && $integrations['patient_rescheduling_enabled'] === false) {
    http_response_code(403);
    echo json_encode([
        "status" => "error",
        "message" => "Self-service appointment rescheduling is currently suspended by clinic administration. Please contact the front desk directly for assistance."
    ]);
    exit;
}

$input = json_decode(file_get_contents("php://input"), true);
if (!$input) $input = $_POST;

$appointmentId = trim($input['appointment_id'] ?? '');
$newDate = trim($input['appointment_date'] ?? $input['date'] ?? '');
$newTime = trim($input['time_slot'] ?? $input['time'] ?? '');
$doctorName = trim($input['doctor_name'] ?? '');
$reason = trim($input['reason'] ?? 'Patient self-service reschedule');

if (empty($appointmentId) || empty($newDate) || empty($newTime)) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Appointment ID, new date, and time slot are required."]);
    exit;
}

$today = date('Y-m-d');
if ($newDate < $today) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Cannot reschedule to a past date."]);
    exit;
}

// Standardize time format
$ts = strtotime("2026-01-01 " . $newTime);
if ($ts) {
    $newTime = date('h:i A', $ts);
}

// C-005: Prevent Past Time Slots on Current Date
if ($newDate === $today) {
    $nowMinutes = ((int)date('H') * 60) + (int)date('i');
    $slotParts = explode(' ', $newTime);
    $meridiem = strtoupper($slotParts[1] ?? 'AM');
    $tp = explode(':', $slotParts[0] ?? '08:00');
    $sh = (int)($tp[0] ?? 8);
    $sm = (int)($tp[1] ?? 0);
    if ($meridiem === 'PM' && $sh !== 12) $sh += 12;
    if ($meridiem === 'AM' && $sh === 12) $sh = 0;
    $slotMinutes = ($sh * 60) + $sm;

    if ($slotMinutes <= $nowMinutes) {
        http_response_code(409);
        echo json_encode(["status" => "error", "message" => "The time slot {$newTime} has already passed for today. Please select an upcoming slot."]);
        exit;
    }
}

$apt = $db->findOne('appointments', ['_id' => $appointmentId]);
if (!$apt) {
    http_response_code(404);
    echo json_encode(["status" => "error", "message" => "Appointment not found."]);
    exit;
}

// Ensure patient owns this appointment
$sessionEmail = strtolower($_SESSION['email'] ?? '');
$sessionUserId = (string)($_SESSION['user_id'] ?? '');
$aptEmail = strtolower($apt['patient_email'] ?? '');
$aptPatientId = (string)($apt['patient_id'] ?? '');

if ($sessionEmail !== $aptEmail && $sessionUserId !== $aptPatientId) {
    http_response_code(403);
    echo json_encode(["status" => "error", "message" => "Unauthorized. You may only reschedule your own appointments."]);
    exit;
}

$timestamp = date('Y-m-d H:i:s');
$finalDoctor = !empty($doctorName) ? $doctorName : ($apt['doctor_name'] ?? 'First Available Doctor');

// C-005: Validate that newDate & newTime does not conflict with another existing appointment
$allApts = $db->find('appointments', []);
$existingBookings = [];
foreach ($allApts as $a) {
    if (!empty($a['is_deleted']) || !empty($a['is_archived'])) continue;
    if ((string)($a['_id'] ?? '') === (string)$appointmentId) continue; // Exclude current appointment being rescheduled

    $aDate = substr($a['appointment_date'] ?? $a['date'] ?? '', 0, 10);
    $aTime = trim($a['time_slot'] ?? $a['appointment_time'] ?? '');
    if ($aDate === $newDate && strcasecmp($aTime, $newTime) === 0) {
        $st = strtolower($a['status'] ?? 'scheduled');
        if (in_array($st, ['scheduled', 'checked_in', 'waiting', 'in_progress', 'completed'])) {
            $existingBookings[] = $a;
        }
    }
}

$dayAbbr = date('D', strtotime($newDate));
$dayFullName = date('l', strtotime($newDate));

// Fetch all active doctors
$allUsers = $db->find('users', ['role' => 'doctor']);
$activeDoctors = [];
foreach ($allUsers as $u) {
    if (!empty($u['is_deleted']) || !empty($u['is_archived'])) continue;
    $activeDoctors[] = $u;
}

if (!empty($finalDoctor) && strcasecmp($finalDoctor, 'First Available Doctor') !== 0) {
    $matchedDoc = null;
    foreach ($activeDoctors as $d) {
        if (strcasecmp($d['full_name'] ?? '', $finalDoctor) === 0 || (string)($d['_id'] ?? '') === $finalDoctor) {
            $matchedDoc = $d;
            break;
        }
    }

    if ($matchedDoc) {
        $finalDoctor = $matchedDoc['full_name'];
        $sched = ClinicHoursHelper::resolveDoctorSchedule($matchedDoc);
        $onDuty = ClinicHoursHelper::isDayInWorkingDays($dayAbbr, $sched['working_days']);

        if (!$onDuty) {
            http_response_code(409);
            echo json_encode([
                "status" => "error",
                "message" => "{$finalDoctor} is off duty on {$dayFullName}s. Working days: {$sched['working_days']}."
            ]);
            exit;
        }

        // Check if doctor is already booked at this time slot
        foreach ($existingBookings as $eb) {
            $ebDoc = $eb['doctor_name'] ?? '';
            if (strcasecmp($ebDoc, $finalDoctor) === 0 || strcasecmp($ebDoc, 'First Available Doctor') === 0) {
                http_response_code(409);
                echo json_encode([
                    "status" => "error",
                    "message" => "The {$newTime} slot with {$finalDoctor} is already booked. Please choose another available slot."
                ]);
                exit;
            }
        }
    }
} else {
    // Check if at least one on-duty doctor is free
    $freeDoc = null;
    foreach ($activeDoctors as $d) {
        $sched = ClinicHoursHelper::resolveDoctorSchedule($d);
        if (!ClinicHoursHelper::isDayInWorkingDays($dayAbbr, $sched['working_days'])) continue;

        $hasSlot = false;
        foreach ($sched['time_slots'] as $s) {
            if (strcasecmp(trim($s), $newTime) === 0) {
                $hasSlot = true;
                break;
            }
        }
        if (!$hasSlot) continue;

        $dBooked = false;
        foreach ($existingBookings as $eb) {
            $ebDoc = $eb['doctor_name'] ?? '';
            if (strcasecmp($ebDoc, $d['full_name'] ?? '') === 0 || strcasecmp($ebDoc, 'First Available Doctor') === 0) {
                $dBooked = true;
                break;
            }
        }

        if (!$dBooked) {
            $freeDoc = $d;
            break;
        }
    }

    if (!$freeDoc) {
        http_response_code(409);
        echo json_encode([
            "status" => "error",
            "message" => "All healthcare providers are booked at {$newTime} on {$newDate}. Please select another slot."
        ]);
        exit;
    }

    $finalDoctor = $freeDoc['full_name'];
}

$historyEntry = [
    'from_date' => $apt['appointment_date'] ?? $apt['date'] ?? '',
    'from_time' => $apt['time_slot'] ?? $apt['appointment_time'] ?? '',
    'to_date' => $newDate,
    'to_time' => $newTime,
    'from_doctor' => $apt['doctor_name'] ?? '',
    'to_doctor' => $finalDoctor,
    'reason' => $reason,
    'rescheduled_at' => $timestamp,
    'rescheduled_by' => $sessionEmail
];

$existingHistory = isset($apt['reschedule_history']) && is_array($apt['reschedule_history']) 
    ? $apt['reschedule_history'] 
    : [];
$existingHistory[] = $historyEntry;

$updateFields = [
    'appointment_date' => $newDate,
    'date' => $newDate,
    'time_slot' => $newTime,
    'appointment_time' => $newTime,
    'doctor_name' => $finalDoctor,
    'status' => 'scheduled',
    'rescheduled_at' => $timestamp,
    'rescheduled_by' => $sessionEmail,
    'reschedule_reason' => $reason,
    'reschedule_history' => $existingHistory,
    'updated_at' => $timestamp,
    'updated_by' => $sessionEmail
];

$db->updateOne('appointments', ['_id' => $appointmentId], ['$set' => $updateFields]);

AuditLogger::log(
    'CLIENT_RESCHEDULED_APPOINTMENT',
    "appointments:{$appointmentId}",
    [
        'appointment_id' => $appointmentId,
        'patient_email' => $sessionEmail,
        'new_date' => $newDate,
        'new_time' => $newTime
    ]
);

http_response_code(200);
echo json_encode([
    "status" => "success",
    "message" => "Your appointment has been successfully rescheduled to {$newDate} at {$newTime}."
]);
