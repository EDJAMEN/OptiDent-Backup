<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST");
header("Access-Control-Allow-Headers: Content-Type");

include_once '../config/database.php';

$data = json_decode(file_get_contents("php://input"));

if (!empty($data->email) && !empty($data->password)) {
    $email = htmlspecialchars(strip_tags($data->email));

    // Fetch user with full details
    $query = "SELECT u.id, u.full_name, u.email, u.phone, u.password_hash, u.role, u.status, u.is_master, u.created_at, u.is_active, u.professional_id, u.position,
                     u.dob, u.emergency_contact_name, u.emergency_contact_phone, 
                     u.allergies, u.medications, u.reward_points
              FROM users u
              WHERE u.email = ? LIMIT 1";
    $stmt = $conn->prepare($query);
    $stmt->bind_param("s", $email);
    $stmt->execute();

    $result = $stmt->get_result();

    if ($result->num_rows > 0) {
        $user = $result->fetch_assoc();

        // 1. Check Status
        if ($user['status'] === 'pending') {
            http_response_code(403);
            echo json_encode(["status" => "error", "message" => "Your account is pending approval by Dr. Reyes."]);
            exit;
        }

        if ($data->password === $user['password_hash']) {

            // Build user response object
            $userResponse = [
                "id" => $user['id'],
                "name" => $user['full_name'],
                "email" => $user['email'],
                "phone" => $user['phone'],
                "role" => $user['role'],
                "is_active" => (bool) $user['is_active'],
                "is_master" => (bool) $user['is_master'],
                "professional_id" => $user['professional_id'],
                "position" => $user['position'],
                "created_at" => $user['created_at'],
                "reward_points" => (int) ($user['reward_points'] ?? 0),
                "dob" => $user['dob'],
                "emergency_contact_name" => $user['emergency_contact_name'],
                "emergency_contact_phone" => $user['emergency_contact_phone'],
                "allergies" => $user['allergies'],
                "medications" => $user['medications']
            ];

            // Fetch this user's appointments (upcoming + past)
            $appt_query = "SELECT a.id, a.appointment_date, a.start_time, a.end_time, a.status, a.cancellation_reason,
                                  s.name as service_name, s.duration_minutes, s.price,
                                  doc.full_name as dentist_name
                           FROM appointments a
                           JOIN services s ON a.service_id = s.id
                           LEFT JOIN users doc ON a.dentist_id = doc.id
                           WHERE a.patient_id = ?
                           ORDER BY a.appointment_date DESC, a.start_time DESC";
            $appt_stmt = $conn->prepare($appt_query);
            $appt_stmt->bind_param("i", $user['id']);
            $appt_stmt->execute();
            $appt_result = $appt_stmt->get_result();

            $appointments = [];
            while ($row = $appt_result->fetch_assoc()) {
                $appointments[] = $row;
            }

            http_response_code(200);
            echo json_encode([
                "status" => "success",
                "message" => "Login successful",
                "user" => $userResponse,
                "appointments" => $appointments
            ]);
        } else {
            http_response_code(401);
            echo json_encode(["status" => "error", "message" => "Invalid password."]);
        }
    } else {
        http_response_code(404);
        echo json_encode(["status" => "error", "message" => "User not found."]);
    }
} else {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Provide email and password."]);
}

$conn->close();
?>