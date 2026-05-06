<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST");
header("Access-Control-Allow-Headers: Content-Type");

include_once '../config/database.php';
include_once 'recaptcha_verify.php';

$data = json_decode(file_get_contents("php://input"));

if (!empty($data->full_name) && !empty($data->email) && !empty($data->password) && !empty($data->phone) && !empty($data->recaptcha_token)) {
    // Verify reCAPTCHA
    if (!verifyRecaptcha($data->recaptcha_token)) {
        http_response_code(403);
        echo json_encode(["status" => "error", "message" => "reCAPTCHA verification failed. Please try again."]);
        exit;
    }

    $full_name = htmlspecialchars(strip_tags($data->full_name));
    $email = htmlspecialchars(strip_tags($data->email));
    $phone = htmlspecialchars(strip_tags($data->phone));
    $password_hash = $data->password; // Stored as plain text for prototype
    $role = !empty($data->role) ? htmlspecialchars(strip_tags($data->role)) : 'patient';
    $status = ($role === 'admin' || $role === 'dentist') ? 'pending' : 'active';

    // Check if email already exists
    $check_query = "SELECT id FROM users WHERE email = ? LIMIT 1";
    $stmt_check = $conn->prepare($check_query);
    $stmt_check->bind_param("s", $email);
    $stmt_check->execute();
    $stmt_check->store_result();

    if ($stmt_check->num_rows > 0) {
        http_response_code(400);
        echo json_encode(["status" => "error", "message" => "Email already registered."]);
    } else {
        $professional_id = !empty($data->professional_id) ? htmlspecialchars(strip_tags($data->professional_id)) : null;
        $position = !empty($data->position) ? htmlspecialchars(strip_tags($data->position)) : null;

        // Insert into users table
        $query = "INSERT INTO users (full_name, email, phone, professional_id, position, password_hash, role, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
        $stmt = $conn->prepare($query);
        $stmt->bind_param("ssssssss", $full_name, $email, $phone, $professional_id, $position, $password_hash, $role, $status);

        if ($stmt->execute()) {
            $new_id = $conn->insert_id;

            http_response_code(201);
            echo json_encode([
                "status" => "success",
                "message" => "Account created successfully.",
                "user" => [
                    "id" => $new_id,
                    "name" => $full_name,
                    "email" => $email,
                    "phone" => $phone,
                    "role" => $role,
                    "status" => $status,
                    "reward_points" => 0,
                    "created_at" => date('Y-m-d H:i:s')
                ],
                "appointments" => [] // New user has no appointments
            ]);
        } else {
            http_response_code(503);
            echo json_encode(["status" => "error", "message" => "Unable to create account."]);
        }
    }
} else {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Provide full name, email, phone, and password."]);
}

$conn->close();
?>
