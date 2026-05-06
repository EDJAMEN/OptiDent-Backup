<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST");
header("Access-Control-Allow-Headers: Content-Type");

include_once '../config/database.php';

$data = json_decode(file_get_contents("php://input"));

if (!empty($data->patient_id) && !empty($data->service_id) && !empty($data->appointment_date) && !empty($data->start_time) && !empty($data->dentist_id)) {
    $patient_id = (int)$data->patient_id;
    $service_id = (int)$data->service_id;
    $dentist_id = (int)$data->dentist_id;
    $appointment_date = htmlspecialchars(strip_tags($data->appointment_date));
    $start_time = htmlspecialchars(strip_tags($data->start_time));
    
    // 0. Verify Dentist Availability (Active Status)
    $dentist_stmt = $conn->prepare("SELECT is_active FROM users WHERE id = ? AND role IN ('admin', 'dentist')");
    $dentist_stmt->bind_param("i", $dentist_id);
    $dentist_stmt->execute();
    $dentist_res = $dentist_stmt->get_result();
    if ($dentist_res->num_rows === 0 || $dentist_res->fetch_assoc()['is_active'] == 0) {
        http_response_code(400);
        echo json_encode(["status" => "error", "message" => "The selected dentist is currently not accepting bookings."]);
        exit;
    }
    
    // 1. Get service duration and price
    $service_query = "SELECT duration_minutes, price FROM services WHERE id = ? LIMIT 1";
    $stmt_service = $conn->prepare($service_query);
    $stmt_service->bind_param("i", $service_id);
    $stmt_service->execute();
    $result_service = $stmt_service->get_result();
    
    if ($result_service->num_rows > 0) {
        $service = $result_service->fetch_assoc();
        $duration = $service['duration_minutes'];
        
        // Calculate end_time
        $start_timestamp = strtotime($start_time);
        $end_timestamp = $start_timestamp + ($duration * 60);
        $end_time = date("H:i:s", $end_timestamp);

        // 2. Validate Date & Time (Cannot book in the past)
        $today = date("Y-m-d");
        if ($appointment_date < $today) {
            http_response_code(400);
            echo json_encode(["status" => "error", "message" => "Cannot book appointments for a past date."]);
            exit;
        }
        
        if ($appointment_date == $today) {
            $now = time();
            $booking_timestamp = strtotime($appointment_date . ' ' . $start_time);
            if ($booking_timestamp <= $now) {
                http_response_code(400);
                echo json_encode(["status" => "error", "message" => "This time slot has already passed for today. Please choose a future time."]);
                exit;
            }
        }

        // 3. Validate Clinic Hours (08:00 to 17:00)
        $hours = (int)date("H", $start_timestamp);
        if ($hours < 8 || $hours >= 17) {
            http_response_code(400);
            echo json_encode(["status" => "error", "message" => "Clinic is only open from 08:00 AM to 05:00 PM."]);
            exit;
        }

        // 4. Check for Overlaps/Conflicts (Specific to the selected Dentist)
        $conflict_query = "SELECT id FROM appointments 
                          WHERE appointment_date = ? 
                          AND dentist_id = ?
                          AND status IN ('upcoming', 'completed', 'walk-in')
                          AND (
                              (start_time < ? AND end_time > ?) OR
                              (start_time BETWEEN ? AND ?) OR
                              (end_time BETWEEN ? AND ?)
                          ) LIMIT 1";
        
        $stmt_conflict = $conn->prepare($conflict_query);
        $stmt_conflict->bind_param("sissssss", $appointment_date, $dentist_id, $start_time, $end_time, $start_time, $end_time, $start_time, $end_time);
        $stmt_conflict->execute();
        $result_conflict = $stmt_conflict->get_result();

        if ($result_conflict->num_rows > 0) {
            http_response_code(409);
            echo json_encode(["status" => "error", "message" => "This time slot is already booked or overlaps with another appointment."]);
            exit;
        }
        
        // 5. Check Reward Points Eligibility (Do NOT deduct yet)
        $reward_id = !empty($data->reward_id) ? (int)$data->reward_id : null;
        if ($reward_id) {
            $reward_stmt = $conn->prepare("SELECT points_required FROM rewards WHERE id = ? AND is_active = 1");
            $reward_stmt->bind_param("i", $reward_id);
            $reward_stmt->execute();
            $reward = $reward_stmt->get_result()->fetch_assoc();

            if ($reward) {
                $balance_stmt = $conn->prepare("SELECT reward_points FROM users WHERE id = ?");
                $balance_stmt->bind_param("i", $patient_id);
                $balance_stmt->execute();
                $pat_meta = $balance_stmt->get_result()->fetch_assoc();

                if (!$pat_meta || $pat_meta['reward_points'] < $reward['points_required']) {
                    http_response_code(400);
                    echo json_encode(["status" => "error", "message" => "Insufficient reward points."]);
                    exit;
                }
            }
        }

        // 6. Insert appointment as 'pending' with reward_id
        $query = "INSERT INTO appointments (patient_id, dentist_id, service_id, appointment_date, start_time, end_time, status, reward_id) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)";
        $stmt = $conn->prepare($query);
        $stmt->bind_param("iissssi", $patient_id, $dentist_id, $service_id, $appointment_date, $start_time, $end_time, $reward_id);
        
        if ($stmt->execute()) {
            $estimated_points = max(1, floor($service['price'] * 0.005));
            http_response_code(201);
            echo json_encode(["status" => "success", "message" => "Appointment booked! You will earn " . $estimated_points . " points once approved."]);
        } else {
            http_response_code(503);
            echo json_encode(["status" => "error", "message" => "Unable to book appointment."]);
        }
    } else {
        http_response_code(400);
        echo json_encode(["status" => "error", "message" => "Invalid service selected."]);
    }
} else {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Provide patient ID, service ID, date, and time."]);
}

$conn->close();
?>
