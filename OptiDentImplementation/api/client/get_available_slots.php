<?php
/**
 * OptiDent System - Real-Time Dynamic Slot Availability API (C-005)
 * Returns live, accurate slot availability for patients/clients based on doctor duty schedules & existing bookings
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

// Accept date from query or body
$targetDate = trim($_GET['date'] ?? $_POST['date'] ?? date('Y-m-d'));
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $targetDate)) {
    $targetDate = date('Y-m-d');
}

$doctorParam = trim($_GET['doctor_name'] ?? $_GET['doctor_id'] ?? $_POST['doctor_name'] ?? 'First Available Doctor');
$excludeApptId = trim($_GET['exclude_appointment_id'] ?? $_POST['exclude_appointment_id'] ?? '');

$todayDate = date('Y-m-d');
$isPastDate = ($targetDate < $todayDate);
$isToday = ($targetDate === $todayDate);

$dateTimestamp = strtotime($targetDate);
$dayAbbr = date('D', $dateTimestamp);       // Mon, Tue, Wed, Thu, Fri, Sat, Sun
$dayFullName = date('l', $dateTimestamp);   // Monday, Tuesday, ...

// Current time in minutes for today's past slot comparison
$nowHours = (int)date('H');
$nowMinutes = (int)date('i');
$currentMinuteOfDay = ($nowHours * 60) + $nowMinutes;

// Master Clinic Profile
$clinicProfile = ClinicHoursHelper::getActiveClinicProfile($db);
$masterSlots = (!empty($clinicProfile['time_slots']) && is_array($clinicProfile['time_slots']))
    ? $clinicProfile['time_slots']
    : ['08:00 AM', '09:00 AM', '10:00 AM', '11:00 AM', '01:00 PM', '02:00 PM', '03:00 PM', '04:00 PM'];

// Fetch all active doctors
$allUsers = $db->find('users', ['role' => 'doctor']);
$doctors = [];
foreach ($allUsers as $u) {
    if (!empty($u['is_deleted']) || !empty($u['is_archived'])) continue;
    $doctors[] = $u;
}

// Fetch all active bookings for target date
$rawAppointments = $db->find('appointments', []);
$activeAppointments = [];
foreach ($rawAppointments as $apt) {
    if (!empty($apt['is_deleted']) || !empty($apt['is_archived'])) continue;
    
    // Ignore excluded appointment (e.g. self-rescheduling)
    if (!empty($excludeApptId) && (string)($apt['_id'] ?? '') === $excludeApptId) {
        continue;
    }

    $aptDate = substr($apt['appointment_date'] ?? $apt['date'] ?? '', 0, 10);
    if ($aptDate !== $targetDate) continue;

    $st = strtolower($apt['status'] ?? 'scheduled');
    if (in_array($st, ['pending', 'scheduled', 'checked_in', 'waiting', 'in_progress', 'completed'])) {
        $activeAppointments[] = $apt;
    }
}

// Helper to convert '09:00 AM' to minute of day
function slotTimeToMinute($timeStr) {
    $timeStr = trim($timeStr);
    $parts = explode(' ', $timeStr);
    $meridiem = strtoupper($parts[1] ?? 'AM');
    $timeParts = explode(':', $parts[0] ?? '08:00');
    $h = (int)($timeParts[0] ?? 8);
    $m = (int)($timeParts[1] ?? 0);
    if ($meridiem === 'PM' && $h !== 12) $h += 12;
    if ($meridiem === 'AM' && $h === 12) $h = 0;
    return ($h * 60) + $m;
}

$isSpecificDoctor = (!empty($doctorParam) && strcasecmp($doctorParam, 'First Available Doctor') !== 0);
$matchedDoctor = null;

if ($isSpecificDoctor) {
    foreach ($doctors as $d) {
        if (strcasecmp($d['full_name'] ?? '', $doctorParam) === 0 || (string)($d['_id'] ?? '') === $doctorParam) {
            $matchedDoctor = $d;
            break;
        }
    }
}

$slotsResponse = [];
$isOnDuty = true;
$dutyMessage = '';
$availableCount = 0;
$bookedCount = 0;

if ($isPastDate) {
    $isOnDuty = false;
    $dutyMessage = "Past dates cannot be scheduled. Please choose today or an upcoming date.";
} elseif ($isSpecificDoctor) {
    if (!$matchedDoctor) {
        // Fallback: Doctor record not found
        $isOnDuty = true;
        $dutyMessage = "Selected healthcare provider schedule loaded.";
        $docSlots = $masterSlots;
    } else {
        $sched = ClinicHoursHelper::resolveDoctorSchedule($matchedDoctor);
        $isOnDuty = ClinicHoursHelper::isDayInWorkingDays($dayAbbr, $sched['working_days']);
        $docSlots = (!empty($sched['time_slots']) && is_array($sched['time_slots'])) 
            ? $sched['time_slots'] 
            : $masterSlots;

        $docDisplayName = $matchedDoctor['full_name'];
        if (stripos($docDisplayName, 'Dr.') !== 0) {
            $docDisplayName = "Dr. " . $docDisplayName;
        }

        if (!$isOnDuty) {
            $dutyMessage = "{$docDisplayName} is off duty on {$dayFullName}s. Regular duty days: {$sched['working_days']} ({$sched['opening_time']} - {$sched['closing_time']}).";
        } else {
            $dutyMessage = "{$docDisplayName} is on duty on {$dayFullName} ({$sched['opening_time']} - {$sched['closing_time']}).";
        }
    }

    if ($isOnDuty) {
        foreach ($docSlots as $slotTime) {
            $slotTime = trim($slotTime);
            $slotMinute = slotTimeToMinute($slotTime);

            // Check if slot is occupied
            $isBooked = false;
            foreach ($activeAppointments as $apt) {
                $aptDoc = $apt['doctor_name'] ?? '';
                $aptTime = trim($apt['time_slot'] ?? $apt['appointment_time'] ?? '');

                $docMatches = ($matchedDoctor && (strcasecmp($aptDoc, $matchedDoctor['full_name'] ?? '') === 0 || strcasecmp($aptDoc, 'First Available Doctor') === 0));
                $timeMatches = (strcasecmp($aptTime, $slotTime) === 0);

                if ($docMatches && $timeMatches) {
                    $isBooked = true;
                    break;
                }
            }

            $isPastSlot = ($isToday && $slotMinute <= $currentMinuteOfDay);

            if ($isPastSlot) {
                $status = 'past';
                $statusLabel = 'Time Passed';
                $canBook = false;
            } elseif ($isBooked) {
                $status = 'booked';
                $statusLabel = 'Already Booked';
                $canBook = false;
                $bookedCount++;
            } else {
                $status = 'available';
                $statusLabel = 'Available';
                $canBook = true;
                $availableCount++;
            }

            $slotsResponse[] = [
                'time' => $slotTime,
                'status' => $status,
                'status_label' => $statusLabel,
                'available' => $canBook,
                'doctor_name' => $matchedDoctor['full_name'] ?? $doctorParam
            ];
        }
    }
} else {
    // "First Available Doctor" Mode
    // Find all doctors on duty today
    $onDutyDoctors = [];
    foreach ($doctors as $d) {
        $sched = ClinicHoursHelper::resolveDoctorSchedule($d);
        if (ClinicHoursHelper::isDayInWorkingDays($dayAbbr, $sched['working_days'])) {
            $onDutyDoctors[] = [
                'doc' => $d,
                'sched' => $sched
            ];
        }
    }

    if (empty($onDutyDoctors)) {
        $isOnDuty = false;
        $dutyMessage = "No dentists are on duty on {$dayFullName}s. Clinic operating days: {$clinicProfile['operating_days']}.";
    } else {
        $isOnDuty = true;
        $dutyMessage = count($onDutyDoctors) . " healthcare provider(s) on duty on {$dayFullName}.";

        // Aggregate unique slots from on-duty doctors
        $allSlotsSet = [];
        foreach ($onDutyDoctors as $od) {
            $sList = (!empty($od['sched']['time_slots']) && is_array($od['sched']['time_slots'])) 
                ? $od['sched']['time_slots'] 
                : $masterSlots;
            foreach ($sList as $s) {
                $sClean = trim($s);
                $allSlotsSet[$sClean] = slotTimeToMinute($sClean);
            }
        }
        asort($allSlotsSet);
        $sortedSlots = array_keys($allSlotsSet);

        foreach ($sortedSlots as $slotTime) {
            $slotMinute = slotTimeToMinute($slotTime);
            $isPastSlot = ($isToday && $slotMinute <= $currentMinuteOfDay);

            // Find how many on-duty doctors have this slot AND are free
            $availableDocsForSlot = [];
            foreach ($onDutyDoctors as $od) {
                $dName = $od['doc']['full_name'] ?? '';
                $dSlots = $od['sched']['time_slots'] ?? $masterSlots;
                
                // Is slot part of this doctor's duty?
                $hasSlot = false;
                foreach ($dSlots as $ds) {
                    if (strcasecmp(trim($ds), $slotTime) === 0) {
                        $hasSlot = true;
                        break;
                    }
                }
                if (!$hasSlot) continue;

                // Check if this doctor is already booked at this time
                $dBooked = false;
                foreach ($activeAppointments as $apt) {
                    $aptDoc = $apt['doctor_name'] ?? '';
                    $aptTime = trim($apt['time_slot'] ?? $apt['appointment_time'] ?? '');

                    if ((strcasecmp($aptDoc, $dName) === 0 || strcasecmp($aptDoc, 'First Available Doctor') === 0) && strcasecmp($aptTime, $slotTime) === 0) {
                        $dBooked = true;
                        break;
                    }
                }

                if (!$dBooked) {
                    $availableDocsForSlot[] = $dName;
                }
            }

            if ($isPastSlot) {
                $status = 'past';
                $statusLabel = 'Time Passed';
                $canBook = false;
            } elseif (count($availableDocsForSlot) > 0) {
                $status = 'available';
                $count = count($availableDocsForSlot);
                $statusLabel = $count === 1 ? '1 Doctor Available' : "{$count} Doctors Available";
                $canBook = true;
                $availableCount++;
            } else {
                $status = 'booked';
                $statusLabel = 'All Doctors Booked';
                $canBook = false;
                $bookedCount++;
            }

            $slotsResponse[] = [
                'time' => $slotTime,
                'status' => $status,
                'status_label' => $statusLabel,
                'available' => $canBook,
                'free_doctors_count' => count($availableDocsForSlot),
                'free_doctors' => $availableDocsForSlot
            ];
        }
    }
}

echo json_encode([
    "status" => "success",
    "date" => $targetDate,
    "day_name" => $dayFullName,
    "day_abbr" => $dayAbbr,
    "is_on_duty" => $isOnDuty,
    "duty_message" => $dutyMessage,
    "doctor_name" => $isSpecificDoctor ? ($matchedDoctor['full_name'] ?? $doctorParam) : 'First Available Doctor',
    "available_count" => $availableCount,
    "booked_count" => $bookedCount,
    "total_slots" => count($slotsResponse),
    "slots" => $slotsResponse,
    "server_time" => date('Y-m-d H:i:s')
]);
