import nodemailer from 'nodemailer';
import dbClient from './db.js';

const DEFAULT_SMTP_USER = 'jamgamer1014@gmail.com';
const DEFAULT_SMTP_PASS = 'emuvfyqhuyyafpku';
const SMTP_HOST = 'smtp.gmail.com';
const SMTP_PORT = 587;
const SMTP_FROM_NAME = 'OptiDent Dental Clinic';

function createTransport(user, pass) {
    return nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: false, // STARTTLS
        auth: {
            user,
            pass
        }
    });
}

/**
 * Sends mail with automatic fallback to verified system credentials
 * if custom credentials fail authentication (535 BadCredentials).
 */
async function sendMailWithFallback(mailOptionsBuilder, customUser = '', customPass = '') {
    let triedCustom = false;
    let customErr = null;

    // 1. Try custom credentials if provided
    if (customUser && customPass) {
        triedCustom = true;
        const cleanUser = customUser.trim();
        const cleanPass = customPass.trim().replace(/\s+/g, '');
        try {
            const transporter = createTransport(cleanUser, cleanPass);
            const mailOptions = mailOptionsBuilder(cleanUser);
            await transporter.sendMail(mailOptions);
            return { sent: true, provider: cleanUser };
        } catch (err) {
            customErr = err.message;
            console.warn(`[SMTP Warning] Custom credentials (${cleanUser}) failed: ${err.message}. Retrying with verified system credentials...`);
        }
    }

    // 2. Try stored system settings credentials if available and different from custom
    let storedUser = null;
    let storedPass = null;
    try {
        const configDoc = await dbClient.findOne('system_settings', { setting_type: 'email_config' });
        if (configDoc && configDoc.smtp_user && configDoc.smtp_pass) {
            storedUser = configDoc.smtp_user.trim();
            storedPass = configDoc.smtp_pass.trim().replace(/\s+/g, '');
        }
    } catch (e) {}

    if (storedUser && storedPass && storedUser !== customUser) {
        try {
            const transporter = createTransport(storedUser, storedPass);
            const mailOptions = mailOptionsBuilder(storedUser);
            await transporter.sendMail(mailOptions);
            return { sent: true, provider: storedUser };
        } catch (err) {
            console.warn(`[SMTP Warning] Stored settings credentials (${storedUser}) failed: ${err.message}.`);
        }
    }

    // 3. Fallback to default verified clinic credentials
    try {
        const transporter = createTransport(DEFAULT_SMTP_USER, DEFAULT_SMTP_PASS);
        const mailOptions = mailOptionsBuilder(DEFAULT_SMTP_USER);
        await transporter.sendMail(mailOptions);
        return {
            sent: true,
            provider: DEFAULT_SMTP_USER,
            fallbackUsed: triedCustom,
            fallbackReason: customErr
        };
    } catch (err) {
        console.error('[SMTP Fatal Error] System fallback also failed:', err.message);
        return {
            sent: false,
            reason: customErr || err.message
        };
    }
}

/**
 * Sends a 6-digit verification code to a patient's Gmail
 */
export async function sendPatientVerificationEmail(toEmail, toName, code, customUser = '', customPass = '') {
    const displayName = toName || 'Valued Patient';

    const mailOptionsBuilder = (senderUser) => ({
        from: `"${SMTP_FROM_NAME}" <${senderUser}>`,
        to: toName ? `"${toName}" <${toEmail}>` : toEmail,
        subject: `OptiDent Patient Verification Code: ${code}`,
        text: `Hello ${displayName},\n\nYour OptiDent patient verification code is: ${code}\n\nThis code expires in 10 minutes.\nIf you did not request this, please ignore this email.`,
        html: `
        <div style="font-family: Arial, sans-serif; background-color: #f8fafc; padding: 30px 15px; color: #1e293b;">
            <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 14px; padding: 32px; box-shadow: 0 4px 14px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
                <div style="text-align: center; margin-bottom: 24px;">
                    <h2 style="color: #0EB1B1; margin: 0; font-size: 26px; font-weight: 800;">OptiDent</h2>
                    <p style="color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; margin-top: 4px;">Patient Account Verification</p>
                </div>
                
                <h3 style="color: #0f172a; margin-top: 0; font-size: 18px;">Hello ${displayName},</h3>
                
                <p style="line-height: 1.6; color: #334155; font-size: 14px;">
                    Thank you for registering with <strong>OptiDent Clinical Management System</strong>. To verify that this is your real Gmail account, please use the 6-digit verification code below:
                </p>
                
                <div style="text-align: center; margin: 28px 0;">
                    <div style="display: inline-block; background-color: #F0FBFA; border: 2px dashed #0EB1B1; border-radius: 12px; padding: 14px 28px;">
                        <span style="font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #0a8f8f; font-family: monospace;">${code}</span>
                    </div>
                    <p style="margin: 10px 0 0 0; font-size: 12px; color: #64748b;">
                        This code will expire in <strong>10 minutes</strong>.
                    </p>
                </div>
                
                <p style="line-height: 1.5; color: #64748b; font-size: 13px;">
                    If you did not request this registration, please disregard this email. Your email address will remain safe and unregistered.
                </p>
                
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0 16px;">
                
                <p style="font-size: 11px; color: #94a3b8; text-align: center; margin: 0;">
                    OptiDent Dental Clinic &bull; Secure Patient Self-Service Portal
                </p>
            </div>
        </div>`
    });

    return await sendMailWithFallback(mailOptionsBuilder, customUser, customPass);
}

/**
 * Sends a staff invitation email (Doctor / Receptionist)
 */
export async function sendStaffInvitationEmail(toEmail, toName, role, inviteLink, customUser = '', customPass = '') {
    const roleTitle = (role || '').toLowerCase() === 'doctor' ? 'Doctor (Dental Surgeon)' : 'Clinic Receptionist';
    const displayName = toName || 'Colleague';

    const mailOptionsBuilder = (senderUser) => ({
        from: `"${SMTP_FROM_NAME}" <${senderUser}>`,
        to: toName ? `"${toName}" <${toEmail}>` : toEmail,
        subject: `Invitation to Join OptiDent Clinic as a ${roleTitle}`,
        text: `Hello ${displayName},\n\nYou have been invited by the Super Admin to join OptiDent as a ${roleTitle}.\nClick this link to activate your account: ${inviteLink}\n\n(Valid for 48 hours)`,
        html: `
        <div style="font-family: Arial, sans-serif; background-color: #f8fafc; padding: 30px 15px; color: #1e293b;">
            <div style="max-width: 550px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 30px; box-shadow: 0 4px 12px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
                <div style="text-align: center; margin-bottom: 25px;">
                    <h2 style="color: #0EB1B1; margin: 0; font-size: 24px;">OptiDent Dental Clinic</h2>
                    <p style="color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin-top: 4px;">Dental Clinic Management System</p>
                </div>
                
                <h3 style="color: #0f172a; margin-top: 0;">Hello ${displayName},</h3>
                
                <p style="line-height: 1.6; color: #334155;">
                    You have been officially invited by the Super Admin to join <strong>OptiDent</strong> as a 
                    <span style="background: #e0f2fe; color: #0369a1; padding: 2px 8px; border-radius: 4px; font-weight: bold;">${roleTitle}</span>.
                </p>
                
                <p style="line-height: 1.6; color: #334155;">
                    Please click the button below to complete your staff registration and set up your secure password:
                </p>
                
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${inviteLink}" style="background-color: #0EB1B1; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: bold; display: inline-block; box-shadow: 0 4px 10px rgba(14, 177, 177, 0.3);">
                        Accept Invitation & Set Up Account
                    </a>
                </div>
                
                <p style="font-size: 12px; color: #94a3b8; line-height: 1.5;">
                    * This invitation link is valid for <strong>48 hours</strong>. If you cannot click the button, copy and paste this link into your browser:<br>
                    <a href="${inviteLink}" style="color: #0EB1B1; word-break: break-all;">${inviteLink}</a>
                </p>
                
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 25px 0 15px;">
                
                <p style="font-size: 11px; color: #94a3b8; text-align: center; margin: 0;">
                    OptiDent Dental Clinic Management &bull; Automated System Dispatch
                </p>
            </div>
        </div>`
    });

    return await sendMailWithFallback(mailOptionsBuilder, customUser, customPass);
}

/**
 * Sends a patient invitation email
 */
export async function sendPatientInvitationEmail(toEmail, toName, inviteLink, customUser = '', customPass = '') {
    const displayName = toName || 'Valued Patient';

    const mailOptionsBuilder = (senderUser) => ({
        from: `"${SMTP_FROM_NAME}" <${senderUser}>`,
        to: toName ? `"${toName}" <${toEmail}>` : toEmail,
        subject: 'Welcome to OptiDent! Activate Your Online Patient Portal Account',
        text: `Hello ${displayName},\n\nThank you for visiting OptiDent Dental Clinic today! Click this link to activate your Online Patient Portal: ${inviteLink}`,
        html: `
        <div style="font-family: Arial, sans-serif; background-color: #f8fafc; padding: 30px 15px; color: #1e293b;">
            <div style="max-width: 550px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 30px; box-shadow: 0 4px 12px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
                <div style="text-align: center; margin-bottom: 25px;">
                    <h2 style="color: #0EB1B1; margin: 0; font-size: 24px; font-weight: 800;">OptiDent Dental Clinic</h2>
                    <p style="color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; margin-top: 4px;">Patient Self-Service & Appointment Portal</p>
                </div>
                
                <h3 style="color: #0f172a; margin-top: 0;">Hello ${displayName},</h3>
                
                <p style="line-height: 1.6; color: #334155;">
                    Thank you for visiting <strong>OptiDent Dental Clinic</strong> today! Our front desk reception team has successfully registered your patient profile.
                </p>
                
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${inviteLink}" style="background-color: #0EB1B1; color: #ffffff; text-decoration: none; padding: 13px 30px; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block; box-shadow: 0 4px 12px rgba(14, 177, 177, 0.35);">
                        Activate My Patient Account & Set Password
                    </a>
                </div>
                
                <p style="font-size: 12px; color: #94a3b8; line-height: 1.5;">
                    * If you cannot click the button above, copy and paste this link into your web browser:<br>
                    <a href="${inviteLink}" style="color: #0EB1B1; word-break: break-all;">${inviteLink}</a>
                </p>
            </div>
        </div>`
    });

    return await sendMailWithFallback(mailOptionsBuilder, customUser, customPass);
}

/**
 * Sends a 6-digit password reset verification code
 */
export async function sendPasswordResetEmail(toEmail, toName, code, customUser = '', customPass = '') {
    const displayName = toName || 'User';

    const mailOptionsBuilder = (senderUser) => ({
        from: `"${SMTP_FROM_NAME}" <${senderUser}>`,
        to: toName ? `"${toName}" <${toEmail}>` : toEmail,
        subject: `OptiDent Password Reset Verification Code: ${code}`,
        text: `Hello ${displayName},\n\nYour OptiDent password reset verification code is: ${code}\n\nThis code expires in 15 minutes.\nIf you did not request this, please ensure your account is secure.`,
        html: `
        <div style="font-family: Arial, sans-serif; background-color: #f8fafc; padding: 30px 15px; color: #1e293b;">
            <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 14px; padding: 32px; box-shadow: 0 4px 14px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
                <div style="text-align: center; margin-bottom: 24px;">
                    <h2 style="color: #0EB1B1; margin: 0; font-size: 26px; font-weight: 800;">OptiDent</h2>
                    <p style="color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; margin-top: 4px;">Password Recovery & Security</p>
                </div>
                
                <h3 style="color: #0f172a; margin-top: 0; font-size: 18px;">Hello ${displayName},</h3>
                
                <p style="line-height: 1.6; color: #334155; font-size: 14px;">
                    We received a request to reset the password for your OptiDent account. Please use the 6-digit security code below to proceed:
                </p>
                
                <div style="text-align: center; margin: 28px 0;">
                    <div style="display: inline-block; background-color: #F0FBFA; border: 2px dashed #0EB1B1; border-radius: 12px; padding: 14px 28px;">
                        <span style="font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #0a8f8f; font-family: monospace;">${code}</span>
                    </div>
                    <p style="margin: 10px 0 0 0; font-size: 12px; color: #64748b;">
                        This code will expire in <strong>15 minutes</strong>.
                    </p>
                </div>
                
                <p style="line-height: 1.5; color: #64748b; font-size: 13px;">
                    If you did not request a password reset, you can safely ignore this email. Your current password will remain unchanged.
                </p>
                
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0 16px;">
                
                <p style="font-size: 11px; color: #94a3b8; text-align: center; margin: 0;">
                    OptiDent Dental Clinic &bull; Secure Authentication Service
                </p>
            </div>
        </div>`
    });

    return await sendMailWithFallback(mailOptionsBuilder, customUser, customPass);
}

export default {
    sendPatientVerificationEmail,
    sendStaffInvitationEmail,
    sendPatientInvitationEmail,
    sendPasswordResetEmail
};
