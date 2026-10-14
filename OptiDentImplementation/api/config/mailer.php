<?php
/**
 * OptiDent System - Mailer Helper using PHPMailer
 */

require_once __DIR__ . '/PHPMailer/Exception.php';
require_once __DIR__ . '/PHPMailer/PHPMailer.php';
require_once __DIR__ . '/PHPMailer/SMTP.php';
require_once __DIR__ . '/email_config.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

function sendStaffInvitationEmail($toEmail, $toName, $role, $inviteLink, $customUser = '', $customPass = '') {
    $user = !empty($customUser) ? $customUser : (defined('SMTP_USER') ? SMTP_USER : '');
    $pass = !empty($customPass) ? $customPass : (defined('SMTP_PASS') ? SMTP_PASS : '');

    // If SMTP credentials not provided yet, report info
    if (empty($user) || empty($pass)) {
        return [
            "sent" => false,
            "reason" => "SMTP credentials not configured. Please enter your Gmail and App Password in the Configure Gmail Delivery modal."
        ];
    }

    $mail = new PHPMailer(true);

    try {
        // Server settings
        $mail->isSMTP();
        $mail->Host       = SMTP_HOST;
        $mail->SMTPAuth   = true;
        $mail->Username   = $user;
        $mail->Password   = $pass;
        $mail->SMTPSecure = SMTP_SECURE === 'ssl' ? PHPMailer::ENCRYPTION_SMTPS : PHPMailer::ENCRYPTION_STARTTLS;
        $mail->Port       = SMTP_PORT;

        // Recipients
        $mail->setFrom($user, SMTP_FROM_NAME);
        $mail->addAddress($toEmail, $toName ?: $toEmail);

        // Content
        $mail->isHTML(true);
        $roleTitle = $role === 'doctor' ? 'Doctor (Dental Surgeon)' : 'Clinic Receptionist';
        $mail->Subject = "Invitation to Join OptiDent Clinic as a {$roleTitle}";

        $displayName = htmlspecialchars($toName ?: 'Colleague');
        
        $body = "
        <div style='font-family: Arial, sans-serif; background-color: #f8fafc; padding: 30px 15px; color: #1e293b;'>
            <div style='max-width: 550px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 30px; box-shadow: 0 4px 12px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;'>
                <div style='text-align: center; margin-bottom: 25px;'>
                    <h2 style='color: #0EB1B1; margin: 0; font-size: 24px;'>OptiDent Dental Clinic</h2>
                    <p style='color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin-top: 4px;'>Dental Clinic Management System</p>
                </div>
                
                <h3 style='color: #0f172a; margin-top: 0;'>Hello {$displayName},</h3>
                
                <p style='line-height: 1.6; color: #334155;'>
                    You have been officially invited by the Super Admin to join <strong>OptiDent</strong> as a 
                    <span style='background: #e0f2fe; color: #0369a1; padding: 2px 8px; border-radius: 4px; font-weight: bold;'>{$roleTitle}</span>.
                </p>
                
                <p style='line-height: 1.6; color: #334155;'>
                    Please click the button below to complete your staff registration and set up your secure password:
                </p>
                
                <div style='text-align: center; margin: 30px 0;'>
                    <a href='{$inviteLink}' style='background-color: #0EB1B1; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: bold; display: inline-block; box-shadow: 0 4px 10px rgba(14, 177, 177, 0.3);'>
                        Accept Invitation & Set Up Account
                    </a>
                </div>
                
                <p style='font-size: 12px; color: #94a3b8; line-height: 1.5;'>
                    * This invitation link is valid for <strong>48 hours</strong>. If you cannot click the button, copy and paste this link into your browser:<br>
                    <a href='{$inviteLink}' style='color: #0EB1B1; word-break: break-all;'>{$inviteLink}</a>
                </p>
                
                <hr style='border: none; border-top: 1px solid #e2e8f0; margin: 25px 0 15px;'>
                
                <p style='font-size: 11px; color: #94a3b8; text-align: center; margin: 0;'>
                    OptiDent Dental Clinic Management &bull; Automated System Dispatch
                </p>
            </div>
        </div>";

        $mail->Body = $body;
        $mail->AltBody = "Hello {$displayName},\n\nYou have been invited to join OptiDent as a {$roleTitle}.\nClick this link to activate your account: {$inviteLink}\n\n(Valid for 48 hours)";

        $mail->send();
        return ["sent" => true];
    } catch (Exception $e) {
        return [
            "sent" => false,
            "reason" => $mail->ErrorInfo
        ];
    }
}

/**
 * Sends a 6-digit verification code to a patient's Gmail to verify authentic email ownership.
 */
function sendPatientVerificationEmail($toEmail, $toName, $code) {
    $user = defined('SMTP_USER') ? SMTP_USER : '';
    $pass = defined('SMTP_PASS') ? SMTP_PASS : '';

    if (empty($user) || empty($pass)) {
        return [
            "sent" => false,
            "reason" => "SMTP credentials not configured."
        ];
    }

    $mail = new PHPMailer(true);

    try {
        $mail->isSMTP();
        $mail->Host       = SMTP_HOST;
        $mail->SMTPAuth   = true;
        $mail->Username   = $user;
        $mail->Password   = $pass;
        $mail->SMTPSecure = SMTP_SECURE === 'ssl' ? PHPMailer::ENCRYPTION_SMTPS : PHPMailer::ENCRYPTION_STARTTLS;
        $mail->Port       = SMTP_PORT;

        $mail->setFrom($user, SMTP_FROM_NAME);
        $mail->addAddress($toEmail, $toName ?: $toEmail);

        $mail->isHTML(true);
        $mail->Subject = "OptiDent Patient Verification Code: {$code}";

        $displayName = htmlspecialchars($toName ?: 'Valued Patient');

        $body = "
        <div style='font-family: Arial, sans-serif; background-color: #f8fafc; padding: 30px 15px; color: #1e293b;'>
            <div style='max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 14px; padding: 32px; box-shadow: 0 4px 14px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;'>
                <div style='text-align: center; margin-bottom: 24px;'>
                    <h2 style='color: #0EB1B1; margin: 0; font-size: 26px; font-weight: 800;'>OptiDent</h2>
                    <p style='color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; margin-top: 4px;'>Patient Account Verification</p>
                </div>
                
                <h3 style='color: #0f172a; margin-top: 0; font-size: 18px;'>Hello {$displayName},</h3>
                
                <p style='line-height: 1.6; color: #334155; font-size: 14px;'>
                    Thank you for registering with <strong>OptiDent Clinical Management System</strong>. To verify that this is your real Gmail account, please use the 6-digit verification code below:
                </p>
                
                <div style='text-align: center; margin: 28px 0;'>
                    <div style='display: inline-block; background-color: #F0FBFA; border: 2px dashed #0EB1B1; border-radius: 12px; padding: 14px 28px;'>
                        <span style='font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #0a8f8f; font-family: monospace;'>{$code}</span>
                    </div>
                    <p style='margin: 10px 0 0 0; font-size: 12px; color: #64748b;'>
                        This code will expire in <strong>10 minutes</strong>.
                    </p>
                </div>
                
                <p style='line-height: 1.5; color: #64748b; font-size: 13px;'>
                    If you did not request this registration, please disregard this email. Your email address will remain safe and unregistered.
                </p>
                
                <hr style='border: none; border-top: 1px solid #e2e8f0; margin: 24px 0 16px;'>
                
                <p style='font-size: 11px; color: #94a3b8; text-align: center; margin: 0;'>
                    OptiDent Dental Clinic &bull; Secure Patient Self-Service Portal
                </p>
            </div>
        </div>";

        $mail->Body = $body;
        $mail->AltBody = "Hello {$displayName},\n\nYour OptiDent patient verification code is: {$code}\n\nThis code expires in 10 minutes.\nIf you did not request this, please ignore this email.";

        $mail->send();
        return ["sent" => true];
    } catch (Exception $e) {
        return [
            "sent" => false,
            "reason" => $mail->ErrorInfo
        ];
    }
}

/**
 * Sends an official online portal activation invitation to a registered walk-in patient.
 * Allows patient to set a password and access client_dashboard.html to book appointments online.
 */
function sendPatientInvitationEmail($toEmail, $toName, $inviteLink, $customUser = '', $customPass = '') {
    $user = !empty($customUser) ? $customUser : (defined('SMTP_USER') ? SMTP_USER : '');
    $pass = !empty($customPass) ? $customPass : (defined('SMTP_PASS') ? SMTP_PASS : '');

    if (empty($user) || empty($pass)) {
        return [
            "sent" => false,
            "reason" => "SMTP credentials not configured."
        ];
    }

    $mail = new PHPMailer(true);

    try {
        $mail->isSMTP();
        $mail->Host       = SMTP_HOST;
        $mail->SMTPAuth   = true;
        $mail->Username   = $user;
        $mail->Password   = $pass;
        $mail->SMTPSecure = SMTP_SECURE === 'ssl' ? PHPMailer::ENCRYPTION_SMTPS : PHPMailer::ENCRYPTION_STARTTLS;
        $mail->Port       = SMTP_PORT;

        $mail->setFrom($user, SMTP_FROM_NAME);
        $mail->addAddress($toEmail, $toName ?: $toEmail);

        $mail->isHTML(true);
        $mail->Subject = "Welcome to OptiDent! Activate Your Online Patient Portal Account";

        $displayName = htmlspecialchars($toName ?: 'Valued Patient');

        $body = "
        <div style='font-family: Arial, sans-serif; background-color: #f8fafc; padding: 30px 15px; color: #1e293b;'>
            <div style='max-width: 550px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 30px; box-shadow: 0 4px 12px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;'>
                <div style='text-align: center; margin-bottom: 25px;'>
                    <h2 style='color: #0EB1B1; margin: 0; font-size: 24px; font-weight: 800;'>OptiDent Dental Clinic</h2>
                    <p style='color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; margin-top: 4px;'>Patient Self-Service & Appointment Portal</p>
                </div>
                
                <h3 style='color: #0f172a; margin-top: 0;'>Hello {$displayName},</h3>
                
                <p style='line-height: 1.6; color: #334155;'>
                    Thank you for visiting <strong>OptiDent Dental Clinic</strong> today! Our front desk reception team has successfully registered your patient profile.
                </p>
                
                <p style='line-height: 1.6; color: #334155;'>
                    You have been invited to activate your <strong>Personal Online Patient Portal</strong>. With your account, you can:
                </p>
                
                <ul style='color: #334155; line-height: 1.8; font-size: 13px; padding-left: 20px;'>
                    <li><strong>Schedule appointments online 24/7</strong> anytime, without calling or queuing in person</li>
                    <li><strong>View your dental treatment history</strong>, procedure progress notes, and tooth charting</li>
                    <li><strong>Review doctor prescriptions and clinical recall dates</strong></li>
                    <li><strong>Manage your profile and contact details</strong></li>
                </ul>

                <p style='line-height: 1.6; color: #334155;'>
                    Please click the button below to choose your password and activate your account:
                </p>
                
                <div style='text-align: center; margin: 30px 0;'>
                    <a href='{$inviteLink}' style='background-color: #0EB1B1; color: #ffffff; text-decoration: none; padding: 13px 30px; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block; box-shadow: 0 4px 12px rgba(14, 177, 177, 0.35);'>
                        Activate My Patient Account & Set Password
                    </a>
                </div>
                
                <p style='font-size: 12px; color: #94a3b8; line-height: 1.5;'>
                    * This invitation link is valid for your account. If you cannot click the button above, copy and paste this link into your web browser:<br>
                    <a href='{$inviteLink}' style='color: #0EB1B1; word-break: break-all;'>{$inviteLink}</a>
                </p>
                
                <hr style='border: none; border-top: 1px solid #e2e8f0; margin: 25px 0 15px;'>
                
                <p style='font-size: 11px; color: #94a3b8; text-align: center; margin: 0;'>
                    OptiDent Dental Clinic &bull; Malaybalay City, Bukidnon &bull; Automated Patient Portal Dispatch
                </p>
            </div>
        </div>";

        $mail->Body = $body;
        $mail->AltBody = "Hello {$displayName},\n\nThank you for visiting OptiDent Dental Clinic today! You have been invited to activate your Online Patient Portal to view your records and book future appointments online.\n\nClick this link to activate your account and choose your password:\n{$inviteLink}";

        $mail->send();
        return ["sent" => true];
    } catch (Exception $e) {
        return [
            "sent" => false,
            "reason" => $mail->ErrorInfo
        ];
    }
}
