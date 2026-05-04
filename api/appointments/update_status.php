<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST");

include_once '../config/database.php';

$data = json_decode(file_get_contents("php://input"));

if (!empty($data->appointment_id) && !empty($data->status)) {
    $id = (int) $data->appointment_id;
    $new_status = htmlspecialchars(strip_tags($data->status));
    $reason_text = !empty($data->reason) ? htmlspecialchars(strip_tags($data->reason)) : null;

    // 1. Fetch CURRENT state before update
    $get_current = $conn->prepare("SELECT a.patient_id, a.status as old_status, a.reward_id, a.appointment_date, a.start_time, a.end_time, a.dentist_id, r.points_required, r.name as reward_name, s.price 
                                   FROM appointments a 
                                   LEFT JOIN rewards r ON a.reward_id = r.id 
                                   LEFT JOIN services s ON a.service_id = s.id
                                   WHERE a.id = ?");
    $get_current->bind_param("i", $id);
    $get_current->execute();
    $current = $get_current->get_result()->fetch_assoc();

    if (!$current) {
        echo json_encode(["status" => "error", "message" => "Appointment not found."]);
        exit;
    }

    $old_status = $current['old_status'];
    $patient_id = $current['patient_id'];

    // 2. Perform the Update
    if ($new_status === 'cancelled' && $reason_text) {
        $query = "UPDATE appointments SET status = ?, cancellation_reason = ? WHERE id = ?";
        $stmt = $conn->prepare($query);
        $stmt->bind_param("ssi", $new_status, $reason_text, $id);
    } else {
        $query = "UPDATE appointments SET status = ? WHERE id = ?";
        $stmt = $conn->prepare($query);
        $stmt->bind_param("si", $new_status, $id);
    }

    if ($stmt->execute()) {

        // --- A. Logic for APPROVAL (Transition to 'upcoming') ---
        if ($new_status === 'upcoming' && $old_status === 'pending') {

            // 1. FSFS Auto-Cancellation Logic
            $auto_cancel = $conn->prepare("
                UPDATE appointments 
                SET status = 'cancelled', 
                    cancellation_reason = 'Time slot booked by another patient (FSFS principle).' 
                WHERE id != ? AND status = 'pending' AND appointment_date = ? AND dentist_id = ?
                AND ((start_time < ? AND end_time > ?) OR (start_time BETWEEN ? AND ?) OR (end_time BETWEEN ? AND ?))
            ");
            $auto_cancel->bind_param("issssssss", $id, $current['appointment_date'], $current['dentist_id'], $current['start_time'], $current['end_time'], $current['start_time'], $current['end_time'], $current['start_time'], $current['end_time']);
            $auto_cancel->execute();

            // 2. Award Booking Bonus (0.5%)
            $points_to_award = max(1, floor($current['price'] * 0.005));
            $award_reason = "Booking bonus (Approved - 0.5% of ₱" . $current['price'] . ")";
            $conn->query("UPDATE users SET reward_points = reward_points + $points_to_award WHERE id = $patient_id");
            $conn->query("INSERT INTO reward_points_logs (patient_id, points, action, reason) VALUES ($patient_id, $points_to_award, 'earned', '$award_reason')");

            // 3. Deduct Reward Points (If applied)
            if ($current['reward_id']) {
                $pts_to_deduct = $current['points_required'];
                $deduct_reason = "Redeemed for appointment: " . $current['reward_name'];
                $conn->query("UPDATE users SET reward_points = reward_points - $pts_to_deduct WHERE id = $patient_id");
                $conn->query("INSERT INTO reward_points_logs (patient_id, points, action, reason) VALUES ($patient_id, $pts_to_deduct, 'redeemed', '$deduct_reason')");
            }
        }

        // --- B. Logic for CANCELLATION (Refund) ---
        if ($new_status === 'cancelled') {
            // Refund points IF they were previously deducted (i.e., it was 'upcoming' or 'processing' before)
            if (($old_status === 'upcoming' || $old_status === 'processing') && $current['reward_id']) {
                $pts_to_refund = $current['points_required'];
                $refund_reason = "Refund: Cancelled approved appointment (" . $current['reward_name'] . ")";
                $conn->query("UPDATE users SET reward_points = reward_points + $pts_to_refund WHERE id = $patient_id");
                $conn->query("INSERT INTO reward_points_logs (patient_id, points, action, reason) VALUES ($patient_id, $pts_to_refund, 'earned', '$refund_reason')");
            }

            // Give consolation points (only if not cancelled by patient via other endpoint)
            // Note: This endpoint is admin-side.
            $points_consolation = 3;
            $cons_reason = "Clinic Cancellation Consolation (Staff-initiated)";
            $conn->query("UPDATE users SET reward_points = reward_points + $points_consolation WHERE id = $patient_id");
            $conn->query("INSERT INTO reward_points_logs (patient_id, points, action, reason) VALUES ($patient_id, $points_consolation, 'earned', '$cons_reason')");
        }

        // --- C. Logic for COMPLETION ---
        if ($new_status === 'completed' && $old_status !== 'completed') {
            $points_to_award = max(2, floor($current['price'] * 0.015));
            $comp_reason = "Visit completed (1.5% of ₱" . $current['price'] . ")";
            $conn->query("UPDATE users SET reward_points = reward_points + $points_to_award WHERE id = $patient_id");
            $conn->query("INSERT INTO reward_points_logs (patient_id, points, action, reason) VALUES ($patient_id, $points_to_award, 'earned', '$comp_reason')");

            // Generate Invoice
            $price = (float) $current['price'];
            if ($price > 0) {
                $invoice_stmt = $conn->prepare("INSERT INTO invoices (patient_id, appointment_id, total_amount, status) VALUES (?, ?, ?, 'unpaid')");
                $invoice_stmt->bind_param("iid", $patient_id, $id, $price);
                $invoice_stmt->execute();
            }
        }

        echo json_encode(["status" => "success", "message" => "Appointment updated from $old_status to $new_status"]);
    } else {
        echo json_encode(["status" => "error", "message" => "Update failed."]);
    }
} else {
    echo json_encode(["status" => "error", "message" => "Invalid data."]);
}

$conn->close();
?>
