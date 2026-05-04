<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST");
header("Access-Control-Allow-Headers: Content-Type");

include_once '../config/database.php';

$data = json_decode(file_get_contents("php://input"));

if (!empty($data->user_id) && !empty($data->full_name) && !empty($data->email)) {
    $user_id = (int) $data->user_id;
    $full_name = htmlspecialchars(strip_tags($data->full_name));
    $email = htmlspecialchars(strip_tags($data->email));
    $phone = htmlspecialchars(strip_tags($data->phone));

    // Optional Professional Fields (for Dentists/Admins)
    $professional_id = !empty($data->professional_id) ? htmlspecialchars(strip_tags($data->professional_id)) : null;
    $position = !empty($data->position) ? htmlspecialchars(strip_tags($data->position)) : null;

    // Check if new email is already taken by someone else
    $check_query = "SELECT id FROM users WHERE email = ? AND id != ? LIMIT 1";
    $stmt_check = $conn->prepare($check_query);
    $stmt_check->bind_param("si", $email, $user_id);
    $stmt_check->execute();
    $stmt_check->store_result();

    if ($stmt_check->num_rows > 0) {
        echo json_encode(["status" => "error", "message" => "Email is already in use by another account."]);
    } else {
        $is_active = isset($data->is_active) ? (int) $data->is_active : 1;
        $query = "UPDATE users SET full_name = ?, email = ?, phone = ?, professional_id = ?, position = ?, is_active = ? WHERE id = ?";
        $stmt = $conn->prepare($query);
        $stmt->bind_param("sssssii", $full_name, $email, $phone, $professional_id, $position, $is_active, $user_id);

        if ($stmt->execute()) {
            // Update patient meta if the fields are present in the request
            if (isset($data->dob) || isset($data->emergency_contact_name) || isset($data->allergies)) {
                $dob = isset($data->dob) ? htmlspecialchars(strip_tags($data->dob)) : null;
                $e_name = isset($data->emergency_contact_name) ? htmlspecialchars(strip_tags($data->emergency_contact_name)) : null;
                $e_phone = isset($data->emergency_contact_phone) ? htmlspecialchars(strip_tags($data->emergency_contact_phone)) : null;
                $allergies = isset($data->allergies) ? htmlspecialchars(strip_tags($data->allergies)) : null;
                $medications = isset($data->medications) ? htmlspecialchars(strip_tags($data->medications)) : null;

                $upd_meta = $conn->prepare("UPDATE users SET dob = ?, emergency_contact_name = ?, emergency_contact_phone = ?, allergies = ?, medications = ? WHERE id = ?");
                $upd_meta->bind_param("sssssi", $dob, $e_name, $e_phone, $allergies, $medications, $user_id);
                $upd_meta->execute();
            }
            // Fetch updated user data to return
            $get_query = "SELECT u.id, u.full_name as name, u.email, u.phone, u.role as role, u.status, u.professional_id, u.position, u.is_active,
                                u.dob, u.emergency_contact_name, u.emergency_contact_phone, u.allergies, u.medications, u.reward_points
                        FROM users u
                        WHERE u.id = ?";
            $get_stmt = $conn->prepare($get_query);
            $get_stmt->bind_param("i", $user_id);
            $get_stmt->execute();
            $user_data = $get_stmt->get_result()->fetch_assoc();

            // Cast types
            $user_data['is_active'] = (bool) $user_data['is_active'];

            echo json_encode([
                "status" => "success",
                "message" => "Profile updated successfully.",
                "user" => $user_data
            ]);
        } else {
            echo json_encode(["status" => "error", "message" => "Database error: " . $conn->error]);
        }
    }
} else {
    echo json_encode(["status" => "error", "message" => "Required fields missing."]);
}

$conn->close();
?>