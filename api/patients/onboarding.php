<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST");
header("Access-Control-Allow-Headers: Content-Type");

include_once '../config/database.php';

$data = json_decode(file_get_contents("php://input"));

if (!empty($data->user_id)) {
    $user_id = (int)$data->user_id;
    $dob = !empty($data->dob) ? htmlspecialchars(strip_tags($data->dob)) : null;
    $emergency_name = !empty($data->emergency_contact_name) ? htmlspecialchars(strip_tags($data->emergency_contact_name)) : null;
    $emergency_phone = !empty($data->emergency_contact_phone) ? htmlspecialchars(strip_tags($data->emergency_contact_phone)) : null;
    $allergies = !empty($data->allergies) ? htmlspecialchars(strip_tags($data->allergies)) : null;
    $medications = !empty($data->medications) ? htmlspecialchars(strip_tags($data->medications)) : null;

    // Update existing user with medical info
    $query = "UPDATE users SET dob=?, emergency_contact_name=?, emergency_contact_phone=?, allergies=?, medications=? WHERE id=?";
    $stmt = $conn->prepare($query);
    $stmt->bind_param("sssssi", $dob, $emergency_name, $emergency_phone, $allergies, $medications, $user_id);

    if ($stmt->execute()) {
        http_response_code(200);
        echo json_encode([
            "status" => "success",
            "message" => "Medical history saved successfully.",
            "meta" => [
                "dob" => $dob,
                "emergency_contact_name" => $emergency_name,
                "emergency_contact_phone" => $emergency_phone,
                "allergies" => $allergies,
                "medications" => $medications
            ]
        ]);
    } else {
        http_response_code(503);
        echo json_encode(["status" => "error", "message" => "Unable to save medical history."]);
    }
} else {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "User ID is required."]);
}

$conn->close();
?>
