<?php
/**
 * OptiDent System - Receptionist Doctor Schedule & Slot Monitoring API
 * Task R-008: Appointment Schedule Monitoring
 * Fetches dentist schedules, working days, time slot occupancy, and conflicts for any given date
 */

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/clinic_hours_helper.php';

$role = strtolower($_SESSION['role'] ?? '');
if (!in_array($role, ['receptionist', 'staff', 'super_admin', 'admin', 'doctor'])) {
    http_response_code(401);
    echo json_encode(["status" => "error", "message" => "Access denied. Authorized session required."]);
    exit;
}

$targetDate = trim($_GET['date'] ?? $_POST['date'] ?? date('Y-m-d'));
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $targetDate)) {
    $targetDate = date('Y-m-d');
}

$doctorFilter = trim($_GET['doctor_name'] ?? $_GET['doctor_id'] ?? $_POST['doctor_name'] ?? '');

// Determine day of week
$timestamp = strtotime($targetDate);
$dayAbbr = date('D', $timestamp);      // 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'
$dayFullName = date('l', $timestamp);  // 'Monday', 'Tuesday', ...

// Fetch active doctors
$allUsers = $db->find('users', ['role' => 'doctor']);
$doctors = [];
foreach ($allUsers as $u) {
    if (!empty($u['is_deleted']) || !empty($u['is_archived'])) continue;
    $doctors[] = $u;
}

// Fetch all active appointments for the target date
$rawAppointments = $db->find('appointments', []);
$dateAppointments = [];
foreach ($rawAppointments as $apt) {
    if (!empty($apt['is_deleted']) || !empty($apt['is_archived'])) continue;
    
    $aptDate = substr($apt['appointment_date'] ?? $apt['date'] ?? '', 0, 10);
    if ($aptDate !== $targetDate) continue;

    $st = strtolower($apt['status'] ?? 'scheduled');
    // Only active bookings count as slot occupancy
    if (in_array($st, ['scheduled', 'checked_in', 'waiting', 'in_progress', 'completed'])) {
        $dateAppointments[] = $apt;
    }
}

// Master clinic profile
$clinicProfile = ClinicHoursHelper::getActiveClinicProfile($db);
$masterSlots = (!empty($clinicProfile['time_slots']) && is_array($clinicProfile['time_slots']))
    ? $clinicProfile['time_slots']
    : ['08:00 AM', '09:00 AM', '10:00 AM', '11:00 AM', '01:00 PM', '02:00 PM', '03:00 PM', '04:00 PM'];

$doctorSchedules = [];
$totalCapacitySlots = 0;
$totalBookedSlots = 0;
$totalAvailableSlots = 0;
$doctorsOnDutyCount = 0;

foreach ($doctors as $doc) {
    $docName = $doc['full_name'] ?? 'Doctor';
    if (!empty($doctorFilter) && strcasecmp($docName, $doctorFilter) !== 0 && (string)($doc['_id'] ?? '') !== $doctorFilter) {
        continue;
    }

    $sched = ClinicHoursHelper::resolveDoctorSchedule($doc);
    $workingDaysStr = $sched['working_days'] ?? 'Mon - Fri';

    // Check if doctor is on duty on this day of the week
    $isOnDuty = ClinicHoursHelper::isDayInWorkingDays($dayAbbr, $workingDaysStr);
    if ($isOnDuty) {
        $doctorsOnDutyCount++;
    }

    // Get doctor's defined time slots
    $slotsList = (!empty($sched['time_slots']) && is_array($sched['time_slots']))
        ? $sched['time_slots']
        : $masterSlots;

    $slotsData = [];
    $docBookedCount = 0;
    $docAvailableCount = 0;

    foreach ($slotsList as $timeSlot) {
        // Standardize slot time format for comparison
        $cleanSlot = trim($timeSlot);
        
        // Find if this doctor has an appointment at this time slot
        $matchedApt = null;
        foreach ($dateAppointments as $apt) {
            $aptDoc = $apt['doctor_name'] ?? '';
            $aptTime = trim($apt['time_slot'] ?? $apt['appointment_time'] ?? '');
            
            // Check matching doctor (or First Available Doctor assigned) and time slot
            $docMatches = (strcasecmp($aptDoc, $docName) === 0 || strcasecmp($aptDoc, 'First Available Doctor') === 0);
            $timeMatches = (strcasecmp($aptTime, $cleanSlot) === 0);

            if ($docMatches && $timeMatches) {
                $matchedApt = $apt;
                break;
            }
        }

        if (!$isOnDuty) {
            $slotsData[] = [
                'time' => $cleanSlot,
                'status' => 'off_duty',
                'status_label' => 'Off Duty',
                'appointment' => null
            ];
        } elseif ($matchedApt) {
            $docBookedCount++;
            $totalBookedSlots++;
            $slotsData[] = [
                'time' => $cleanSlot,
                'status' => 'booked',
                'status_label' => 'Booked',
                'appointment' => [
                    'id' => (string) $matchedApt['_id'],
                    'patient_name' => $matchedApt['patient_name'] ?? 'Patient',
                    'patient_phone' => $matchedApt['patient_phone'] ?? '',
                    'service_name' => $matchedApt['service_name'] ?? 'Consultation',
                    'operatory_chair' => $matchedApt['operatory_chair'] ?? 'Operatory Chair 1',
                    'status' => strtolower($matchedApt['status'] ?? 'scheduled'),
                    'notes' => $matchedApt['notes'] ?? ''
                ]
            ];
        } else {
            $docAvailableCount++;
            $totalAvailableSlots++;
            $slotsData[] = [
                'time' => $cleanSlot,
                'status' => 'available',
                'status_label' => 'Available',
                'appointment' => null
            ];
        }

        if ($isOnDuty) {
            $totalCapacitySlots++;
        }
    }

    $doctorSchedules[] = [
        'doctor_id' => (string) $doc['_id'],
        'full_name' => $docName,
        'specialization' => $doc['specialization'] ?? 'General Dentistry',
        'professional_id' => $doc['professional_id'] ?? 'PRC-VERIFIED',
        'phone' => $doc['phone'] ?? '',
        'email' => $doc['email'] ?? '',
        'working_days' => $workingDaysStr,
        'schedule_days' => $sched['schedule_days'],
        'opening_time' => $sched['opening_time'],
        'closing_time' => $sched['closing_time'],
        'lunch_break' => $sched['lunch_break'],
        'is_on_duty_today' => $isOnDuty,
        'total_slots' => count($slotsList),
        'booked_count' => $docBookedCount,
        'available_count' => $docAvailableCount,
        'slots' => $slotsData
    ];
}

$utilizationRate = ($totalCapacitySlots > 0) 
    ? round(($totalBookedSlots / $totalCapacitySlots) * 100, 1) 
    : 0;

echo json_encode([
    "status" => "success",
    "selected_date" => $targetDate,
    "day_name" => $dayFullName,
    "day_abbr" => $dayAbbr,
    "summary" => [
        "total_doctors" => count($doctors),
        "doctors_on_duty" => $doctorsOnDutyCount,
        "total_capacity_slots" => $totalCapacitySlots,
        "booked_slots" => $totalBookedSlots,
        "available_slots" => $totalAvailableSlots,
        "utilization_rate" => $utilizationRate
    ],
    "doctor_schedules" => $doctorSchedules,
    "master_slots" => $masterSlots
]);

if (!function_exists('isDayInWorkingDays')) {
    /**
     * Checks if an abbreviated day name (Mon, Tue, etc.) falls within doctor's working_days string
     */
    function isDayInWorkingDays($dayAbbr, $workingDaysStr) {
        return ClinicHoursHelper::isDayInWorkingDays($dayAbbr, $workingDaysStr);
    }
}
