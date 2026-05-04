<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");

include_once '../config/database.php';

if (!empty($_GET['id'])) {
    $patient_id = (int)$_GET['id'];

    // 1. Get user and meta
    $user_query = "SELECT u.id, u.full_name, u.email, u.phone, u.created_at, 
                          u.dob, u.emergency_contact_name, u.emergency_contact_phone, u.allergies, u.medications, u.reward_points
                   FROM users u
                   WHERE u.id = ? LIMIT 1";
    
    $stmt = $conn->prepare($user_query);
    $stmt->bind_param("i", $patient_id);
    $stmt->execute();
    $user_result = $stmt->get_result();

    if ($user_result->num_rows > 0) {
        $patient = $user_result->fetch_assoc();

        // 2. Get appointments
        $appt_query = "SELECT a.id, a.appointment_date, a.start_time, a.status, s.name as service_name
                       FROM appointments a
                       JOIN services s ON a.service_id = s.id
                       WHERE a.patient_id = ?
                       ORDER BY a.appointment_date DESC";
        $appt_stmt = $conn->prepare($appt_query);
        $appt_stmt->bind_param("i", $patient_id);
        $appt_stmt->execute();
        $appt_result = $appt_stmt->get_result();
        
        $appointments = [];
        while ($row = $appt_result->fetch_assoc()) {
            $appointments[] = $row;
        }

        echo json_encode([
            "status" => "success",
            "patient" => $patient,
            "appointments" => $appointments
        ]);
    } else {
        echo json_encode(["status" => "error", "message" => "Patient not found."]);
    }
} else {
    echo json_encode(["status" => "error", "message" => "Patient ID required."]);
}

$conn->close();
?>
