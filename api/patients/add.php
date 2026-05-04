<?php
// api/patients/add.php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST");
header("Access-Control-Max-Age: 3600");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

include_once '../config/database.php';

// Get posted data form JSON body
$data = json_decode(file_get_contents("php://input"));

// Check if data is not empty
if (
    !empty($data->full_name) &&
    !empty($data->phone)
) {
    // Sanitize and prepare
    $full_name = htmlspecialchars(strip_tags($data->full_name));
    $phone = htmlspecialchars(strip_tags($data->phone));
    // Default email to fake one for quick add
    $email = strtolower(str_replace(' ', '', $full_name)) . rand(100, 999) . "@temp.com";
    $password_hash = password_hash("123456", PASSWORD_DEFAULT);
    $role = 'patient';

    // Insert query to base users table
    $query = "INSERT INTO users (full_name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)";
    $stmt = $conn->prepare($query);
    $stmt->bind_param("sssss", $full_name, $email, $phone, $password_hash, $role);

    if ($stmt->execute()) {
        $last_id = $conn->insert_id;


        http_response_code(201);
        echo json_encode(["status" => "success", "message" => "Patient added successfully", "id" => $last_id]);
    } else {
        http_response_code(503);
        echo json_encode(["status" => "error", "message" => "Unable to add patient: " . $conn->error]);
    }
} else {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Incomplete data. Full name and phone are required."]);
}

$conn->close();
?>
