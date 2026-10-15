<?php
/**
 * OptiDent System - Clinic Operating Hours & Time Slots Helper
 * Provides system-wide master time slot calculation based on admin settings
 */

class ClinicHoursHelper {
    /**
     * Generates an array of active time slot strings (e.g. ['08:00 AM', '09:00 AM', ...])
     */
    public static function generateSlots($openingTime = '08:00 AM', $closingTime = '05:00 PM', $lunchBreak = true) {
        $start = strtotime("2026-01-01 " . $openingTime);
        $end = strtotime("2026-01-01 " . $closingTime);
        if (!$start || !$end || $start >= $end) {
            $start = strtotime("2026-01-01 08:00 AM");
            $end = strtotime("2026-01-01 05:00 PM");
        }
        $slots = [];
        $curr = $start;
        while ($curr < $end) {
            $hour24 = (int)date('H', $curr);
            // Skip 12:00 PM - 01:00 PM if lunch break is enabled
            if (!($lunchBreak && $hour24 === 12)) {
                $slots[] = date('h:i A', $curr);
            }
            $curr = strtotime("+1 hour", $curr);
        }
        return $slots;
    }

    /**
     * Resolves and standardizes a doctor's schedule, ensuring working days, hours, and slots are 100% in sync
     */
    public static function resolveDoctorSchedule($userDoc) {
        $workingDays = $userDoc['working_days'] ?? 'Mon - Fri';
        $openingTime = $userDoc['opening_time'] ?? '';
        $closingTime = $userDoc['closing_time'] ?? '';
        $scheduleDays = $userDoc['schedule_days'] ?? '';

        // If opening_time or closing_time is empty, or if schedule_days has a specific format like "Mon - Fri (7:00 AM - 4:00 PM)", parse it:
        if (preg_match('/^(.*?)\s*\(\s*(.*?)\s*-\s*(.*?)\s*\)$/i', $scheduleDays, $m)) {
            $parsedDays = trim($m[1]);
            if (!empty($parsedDays)) $workingDays = $parsedDays;
            $startStr = trim($m[2]);
            $endStr   = trim($m[3]);
            $sTime = strtotime("2026-01-01 " . $startStr);
            $eTime = strtotime("2026-01-01 " . $endStr);
            if ($sTime && $eTime) {
                if (empty($openingTime)) $openingTime = date('h:i A', $sTime);
                if (empty($closingTime)) $closingTime = date('h:i A', $eTime);
            }
        }

        if (empty($openingTime)) $openingTime = '08:00 AM';
        if (empty($closingTime)) $closingTime = '05:00 PM';
        
        // Standardize format: e.g. "7:00 AM" -> "07:00 AM"
        $openingTime = date('h:i A', strtotime("2026-01-01 " . $openingTime));
        $closingTime = date('h:i A', strtotime("2026-01-01 " . $closingTime));

        $lunchBreak = true;
        if (isset($userDoc['lunch_break'])) {
            $lb = $userDoc['lunch_break'];
            $lunchBreak = ($lb === true || $lb === 'yes' || $lb === 'true' || $lb === 1 || $lb === '1');
        }

        $compiledSchedule = "{$workingDays} ({$openingTime} - {$closingTime})";

        // Generate time slots based on opening time, closing time, and lunch break
        $timeSlots = (!empty($userDoc['time_slots']) && is_array($userDoc['time_slots']) && count($userDoc['time_slots']) > 0 && ($userDoc['opening_time'] ?? '') === $openingTime && ($userDoc['closing_time'] ?? '') === $closingTime)
            ? array_values($userDoc['time_slots'])
            : self::generateSlots($openingTime, $closingTime, $lunchBreak);

        return [
            'working_days'  => $workingDays,
            'opening_time'  => $openingTime,
            'closing_time'  => $closingTime,
            'lunch_break'   => $lunchBreak,
            'schedule_days' => $compiledSchedule,
            'time_slots'    => array_values($timeSlots),
            'timezone'      => $userDoc['timezone'] ?? 'Asia/Manila'
        ];
    }

    /**
     * Formats a human-readable operating hours string for badges and reports
     */
    public static function compileHoursText($operatingDays, $openingTime, $closingTime) {
        $closedDays = '';
        if ($operatingDays === 'Mon - Sat') {
            $closedDays = 'Sun: Closed';
        } elseif ($operatingDays === 'Mon - Fri') {
            $closedDays = 'Sat - Sun: Closed';
        } elseif ($operatingDays === 'Mon - Thu') {
            $closedDays = 'Fri - Sun: Closed';
        } elseif ($operatingDays === 'Mon - Sun') {
            $closedDays = 'Open Daily';
        }
        return "{$operatingDays}: {$openingTime} - {$closingTime}" . ($closedDays ? " | {$closedDays}" : "");
    }

    /**
     * Fetches clinic profile settings with guaranteed operating hours & time slots
     */
    public static function getActiveClinicProfile($db) {
        $settings = $db->findOne('system_settings', ['setting_type' => 'clinic_profile']);
        $defaults = [
            'setting_type'            => 'clinic_profile',
            'clinic_name'             => 'OptiDent Dental Clinic',
            'tagline'                 => 'Advanced Digital Dental Care & Management',
            'contact_email'           => 'admin@optident.com',
            'contact_phone'           => '+63 (032) 412-8899',
            'address'                 => 'Suite 402, MedTech Tower, Osmeña Blvd, Cebu City, Philippines',
            'operating_days'          => 'Mon - Sat',
            'opening_time'            => '08:00 AM',
            'closing_time'            => '05:00 PM',
            'lunch_break'             => true,
            'operating_hours'         => 'Mon - Sat: 08:00 AM - 05:00 PM | Sun: Closed',
            'timezone'                => 'Asia/Manila',
            'maintenance_mode'        => false,
            'session_timeout_minutes' => 60,
            'max_login_attempts'      => 5,
            'password_min_length'     => 8,
            'system_version'          => '1.5.0-PROD',
            'time_slots'              => ['08:00 AM', '09:00 AM', '10:00 AM', '11:00 AM', '01:00 PM', '02:00 PM', '03:00 PM', '04:00 PM']
        ];

        if (!$settings) {
            return $defaults;
        }

        $operatingDays = $settings['operating_days'] ?? 'Mon - Sat';
        $openingTime   = $settings['opening_time'] ?? '08:00 AM';
        $closingTime   = $settings['closing_time'] ?? '05:00 PM';
        $lunchBreak    = isset($settings['lunch_break']) ? (bool)$settings['lunch_break'] : true;
        
        $timeSlots = (!empty($settings['time_slots']) && is_array($settings['time_slots']))
            ? (array)$settings['time_slots']
            : self::generateSlots($openingTime, $closingTime, $lunchBreak);

        $operatingHours = $settings['operating_hours'] ?? self::compileHoursText($operatingDays, $openingTime, $closingTime);

        $settings['operating_days']  = $operatingDays;
        $settings['opening_time']    = $openingTime;
        $settings['closing_time']    = $closingTime;
        $settings['lunch_break']     = $lunchBreak;
        $settings['operating_hours'] = $operatingHours;
        $settings['time_slots']      = array_values($timeSlots);

        return $settings;
    }
}
