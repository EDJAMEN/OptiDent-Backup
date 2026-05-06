<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");

include_once '../config/database.php';

$dentist_id = isset($_GET['dentist_id']) ? (int) $_GET['dentist_id'] : 0;
$date = isset($_GET['date']) ? $_GET['date'] : '';
$service_id = isset($_GET['service_id']) ? (int) $_GET['service_id'] : 0;

if ($dentist_id > 0 && !empty($date)) {
    // 1. Get Service Duration
    $duration = 30; // Default
    if ($service_id > 0) {
        $s_res = $conn->query("SELECT duration_minutes FROM services WHERE id = $service_id");
        if ($s_row = $s_res->fetch_assoc()) {
            $duration = (int) $s_row['duration_minutes'];
        }
    }
    $duration_seconds = $duration * 60;

    // 2. Get Clinic Hours & Breaks
    $settings = [];
    $res = $conn->query("SELECT setting_key, setting_value FROM schedule_settings");
    while ($row = $res->fetch_assoc()) {
        $settings[$row['setting_key']] = $row['setting_value'];
    }

    $openTime = $settings['clinic_open'] ?? '08:00:00';
    $closeTime = $settings['clinic_close'] ?? '17:00:00';
    $breakStart = $settings['break_start'] ?? '12:00:00';
    $breakEnd = $settings['break_end'] ?? '13:00:00';

    // 3. Get existing appointments for this specific dentist on this date
    $booked = [];
    $stmt = $conn->prepare("SELECT start_time, end_time FROM appointments WHERE dentist_id = ? AND appointment_date = ? AND status IN ('upcoming', 'completed', 'walk-in', 'pending')");
    $stmt->bind_param("is", $dentist_id, $date);
    $stmt->execute();
    $result = $stmt->get_result();
    while ($row = $result->fetch_assoc()) {
        $booked[] = [
            'start' => strtotime($row['start_time']),
            'end' => strtotime($row['end_time'])
        ];
    }

    // 4. Generate slots
    $slots = [];
    $current = strtotime($date . ' ' . $openTime);
    $end = strtotime($date . ' ' . $closeTime);
    $breakS = strtotime($date . ' ' . $breakStart);
    $breakE = strtotime($date . ' ' . $breakEnd);

    $now = time();
    $isToday = ($date == date('Y-m-d'));

    while ($current < $end) {
        $slotEnd = $current + $duration_seconds;
        $isAvailable = true;

        // Check if exceeds clinic closing
        if ($slotEnd > $end) {
            $isAvailable = false;
        }

        // Check if in the past
        if ($isAvailable && $isToday && $current <= $now) {
            $isAvailable = false;
        }

        // Check against break time
        if ($isAvailable) {
            if (
                ($current >= $breakS && $current < $breakE) ||
                ($slotEnd > $breakS && $slotEnd <= $breakE) ||
                ($current < $breakS && $slotEnd > $breakE)
            ) {
                $isAvailable = false;
            }
        }

        // Check against booked appointments
        if ($isAvailable) {
            foreach ($booked as $apt) {
                if (
                    ($current >= $apt['start'] && $current < $apt['end']) ||
                    ($slotEnd > $apt['start'] && $slotEnd <= $apt['end']) ||
                    ($current < $apt['start'] && $slotEnd > $apt['end'])
                ) {
                    $isAvailable = false;
                    break;
                }
            }
        }

        if ($isAvailable) {
            $slots[] = date("h:i A", $current);
        }

        $current += (30 * 60); // Still 30 min increments for start times
    }

    echo json_encode(["status" => "success", "slots" => $slots]);
} else {
    echo json_encode(["status" => "error", "message" => "Invalid parameters."]);
}

$conn->close();
?>