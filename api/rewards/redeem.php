<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST");

include_once '../config/database.php';

$data = json_decode(file_get_contents("php://input"));

if (!empty($data->patient_id) && !empty($data->reward_id)) {
    $patient_id = (int)$data->patient_id;
    $reward_id = (int)$data->reward_id;

    // Start transaction
    $conn->begin_transaction();

    try {
        // 1. Get Reward Details
        $reward_stmt = $conn->prepare("SELECT name, points_required FROM rewards WHERE id = ? AND is_active = 1");
        $reward_stmt->bind_param("i", $reward_id);
        $reward_stmt->execute();
        $reward = $reward_stmt->get_result()->fetch_assoc();

        if (!$reward) {
            throw new Exception("Reward not found or inactive.");
        }

        // 2. Check Patient Balance
        $balance_stmt = $conn->prepare("SELECT reward_points FROM users WHERE id = ?");
        $balance_stmt->bind_param("i", $patient_id);
        $balance_stmt->execute();
        $patient = $balance_stmt->get_result()->fetch_assoc();

        if (!$patient || $patient['reward_points'] < $reward['points_required']) {
            throw new Exception("Insufficient points balance.");
        }

        // 3. Deduct Points
        $new_balance = $patient['reward_points'] - $reward['points_required'];
        $update_stmt = $conn->prepare("UPDATE users SET reward_points = ? WHERE id = ?");
        $update_stmt->bind_param("ii", $new_balance, $patient_id);
        $update_stmt->execute();

        // 4. Log Transaction
        $reason = "Redeemed: " . $reward['name'];
        $log_stmt = $conn->prepare("INSERT INTO reward_points_logs (patient_id, points, action, reason) VALUES (?, ?, 'redeemed', ?)");
        $log_stmt->bind_param("iis", $patient_id, $reward['points_required'], $reason);
        $log_stmt->execute();

        $conn->commit();

        echo json_encode([
            "status" => "success",
            "message" => "Reward redeemed successfully!",
            "new_balance" => $new_balance
        ]);

    } catch (Exception $e) {
        $conn->rollback();
        echo json_encode(["status" => "error", "message" => $e->getMessage()]);
    }
} else {
    echo json_encode(["status" => "error", "message" => "Missing parameters."]);
}

$conn->close();
?>
