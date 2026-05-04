<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST");
header("Access-Control-Allow-Headers: Content-Type");

include_once '../config/database.php';

$data = json_decode(file_get_contents("php://input"));

if (empty($data->full_name) || empty($data->phone)) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Name and contact number are required."]);
    exit;
}

$name  = htmlspecialchars(strip_tags(trim($data->full_name)));
$phone = htmlspecialchars(strip_tags(trim($data->phone)));
$email = !empty($data->email) ? htmlspecialchars(strip_tags(trim($data->email))) : '';

// Check for duplicate phone
$check = $conn->prepare("SELECT id, full_name FROM users WHERE phone = ? LIMIT 1");
$check->bind_param("s", $phone);
$check->execute();
$existing = $check->get_result();

if ($existing->num_rows > 0) {
    $row = $existing->fetch_assoc();
    // Return existing patient instead of error — helps staff
    echo json_encode([
        "status"  => "exists",
        "message" => "Patient already registered.",
        "data"    => ["id" => $row['id'], "full_name" => $row['full_name']]
    ]);
    exit;
}

// Insert new patient with minimal info
$default_pass = password_hash('walkin123', PASSWORD_DEFAULT);
$role = 'patient';
$status = 'active';

$stmt = $conn->prepare(
    "INSERT INTO users (full_name, email, phone, password_hash, role, status)
     VALUES (?, ?, ?, ?, ?, ?)"
);
$stmt->bind_param("ssssss", $name, $email, $phone, $default_pass, $role, $status);

if ($stmt->execute()) {
    $newId = $conn->insert_id;

    http_response_code(201);
    echo json_encode([
        "status"  => "success",
        "message" => "New patient registered successfully.",
        "data"    => ["id" => $newId, "full_name" => $name]
    ]);
} else {
    http_response_code(503);
    echo json_encode(["status" => "error", "message" => "Registration failed. Try again."]);
}

$conn->close();
?>
