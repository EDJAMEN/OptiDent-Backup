<?php
require_once __DIR__ . '/../api/config/db.php';

$appts = $db->find('appointments', []);
echo "Total appointments: " . count($appts) . "\n";
foreach ($appts as $a) {
    if (stripos($a['patient_name'] ?? '', 'Nathaniel') !== false || stripos($a['patient_email'] ?? '', '2401111884') !== false) {
        echo json_encode([
            'id' => (string)($a['_id'] ?? ''),
            'date' => $a['appointment_date'] ?? $a['date'] ?? '',
            'service' => $a['service_name'] ?? '',
            'status' => $a['status'] ?? '',
            'doctor' => $a['doctor_name'] ?? $a['dentist_name'] ?? '',
            'diagnosis' => $a['diagnosis'] ?? '',
            'notes' => $a['procedure_notes'] ?? $a['notes'] ?? '',
            'prescription' => $a['prescription'] ?? '',
            'teeth' => $a['teeth_selected'] ?? [],
            'anesthesia' => $a['anesthesia'] ?? '',
            'post_op' => $a['post_op_instructions'] ?? ''
        ], JSON_PRETTY_PRINT) . "\n---\n";
    }
}

$user = $db->findOne('users', ['email' => '2401111884@student.buksu.edu.ph']);
if ($user) {
    echo "USER RECORD:\n" . json_encode($user, JSON_PRETTY_PRINT) . "\n";
}
