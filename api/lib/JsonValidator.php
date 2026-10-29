<?php
/**
 * COPG-VD JSON Validator
 * Validates the generated JSON structure and format compliance.
 */

class JsonValidator
{
    /** @var array Required fields in COPG-VD object */
    private static $requiredFields = [
        'BRAND', 'DEVICE', 'MANUFACTURER', 'MODEL', 'FINGERPRINT',
        'PRODUCT', 'BOOTLOADER', 'BOARD', 'HARDWARE', 'DISPLAY',
        'ID', 'HOST', 'INCREMENTAL', 'TIMESTAMP', 'USER',
        'SDK_FINGERPRINT', 'UUID', 'SECURITY_PATCH',
        'FIRST_API_LEVEL', 'DRM_SECURITY_LEVEL',
    ];

    /** @var array New device attribute fields */
    private static $newFields = [
        'IMEI', 'IMSI', 'ICCID', 'MAC_ADDRESS', 'ANDROID_ID',
        'SERIAL_NUMBER', 'BASEBAND_VERSION', 'BLUETOOTH_MAC',
        'PHONE_NUMBER', 'BATTERY',
    ];

    /** @var array COPG-VD extended fields */
    private static $extendedFields = [
        'SERIAL', 'RADIO', 'SOC_MODEL', 'SOC_MANUFACTURER', 'BOARD_PLATFORM', 'VERSION',
    ];

    /** @var array Required phone object fields */
    private static $phoneFields = [
        'DeviceId', 'DeviceSoftwareVersion', 'SubscriberId', 'LineNumber',
        'Imei', 'Imsi', 'Meid', 'SimSerialNumber', 'NetworkOperator',
        'NetworkOperatorName', 'SimOperator', 'SimOperatorName',
        'NetworkCountryIso', 'SimCountryIso', 'NetworkType', 'PhoneType',
        'PhoneCount', 'SimState', 'BluetoothMac', 'WifiMAC', 'WifiIP',
        'WifiName', 'latitude', 'longitude', 'Calibration', 'BaseLocation',
        'BSSID', 'CallState', 'NetStrand', 'NetSubtypeName', 'MultiMedia',
        'MultiMediaProfile', 'VoiceMailAlphaTag', 'VoiceMailNumber',
        'sdsdkid', 'near_cell', 'SSIDBook', 'SSIDName', 'BSSIDBook',
    ];

    /** @var array Required hardware object fields */
    private static $hardwareFields = [
        'dpi', 'density', 'width', 'height', 'xdpi', 'ydpi', 'screenDensity',
        'UserAgent', 'GpuRender', 'GpuVendor', 'GpuVersion', 'GPUExtensions', 'cpuinfo',
    ];

    /**
     * Validate the complete COPG-VD JSON structure
     * @param array $data The decoded JSON data
     * @return array ['valid' => bool, 'errors' => string[]]
     */
    public static function validate(array $data): array
    {
        $errors = [];

        // Check top-level structure
        if (!isset($data['COPG-VD']) || !is_array($data['COPG-VD'])) {
            $errors[] = 'Missing or invalid "COPG-VD" object';
            return ['valid' => false, 'errors' => $errors];
        }

        if (!isset($data['scope_mode'])) {
            $errors[] = 'Missing "scope_mode" field';
        }

        if (!isset($data['motor_drm']) || !is_bool($data['motor_drm'])) {
            $errors[] = 'Missing or invalid "motor_drm" field (must be boolean)';
        }

        if (!isset($data['global_fields']) || !is_array($data['global_fields'])) {
            $errors[] = 'Missing or invalid "global_fields" array';
        }

        $copgVd = $data['COPG-VD'];

        // Check required fields
        foreach (self::$requiredFields as $field) {
            if (!isset($copgVd[$field])) {
                $errors[] = "Missing required field: {$field}";
            } elseif (!is_string($copgVd[$field])) {
                $errors[] = "Field {$field} must be a string, got " . gettype($copgVd[$field]);
            }
        }

        // Check new device attribute fields
        foreach (self::$newFields as $field) {
            if (!isset($copgVd[$field])) {
                $errors[] = "Missing new field: {$field}";
            }
        }

        // Validate specific formats
        $errors = array_merge($errors, self::validateFormats($copgVd));

        // Check COPG-VD extended fields
        foreach (self::$extendedFields as $field) {
            if (!isset($copgVd[$field])) {
                $errors[] = "Missing COPG-VD extended field: {$field}";
            }
        }

        // Validate VERSION sub-object
        if (isset($copgVd['VERSION']) && is_array($copgVd['VERSION'])) {
            foreach (['INCREMENTAL', 'RELEASE', 'SDK', 'CODENAME', 'SECURITY_PATCH', 'BASE_OS'] as $vf) {
                if (!isset($copgVd['VERSION'][$vf])) {
                    $errors[] = "VERSION missing field: {$vf}";
                }
            }
        } elseif (isset($copgVd['VERSION'])) {
            $errors[] = 'VERSION must be an object';
        }

        // Validate phone object
        if (!isset($data['phone']) || !is_array($data['phone'])) {
            $errors[] = 'Missing or invalid "phone" object';
        } else {
            foreach (self::$phoneFields as $field) {
                if (!isset($data['phone'][$field])) {
                    $errors[] = "phone missing field: {$field}";
                }
            }
            // Validate phone MAC formats (dots for phone object)
            if (isset($data['phone']['BluetoothMac']) && !preg_match('/^[0-9a-f]{2}\.[0-9a-f]{2}\.[0-9a-f]{2}\.[0-9a-f]{2}\.[0-9a-f]{2}\.[0-9a-f]{2}$/', $data['phone']['BluetoothMac'])) {
                $errors[] = 'phone.BluetoothMac format invalid: ' . $data['phone']['BluetoothMac'];
            }
            if (isset($data['phone']['WifiMAC']) && !preg_match('/^[0-9A-F]{2}\.[0-9A-F]{2}\.[0-9A-F]{2}\.[0-9A-F]{2}\.[0-9A-F]{2}\.[0-9A-F]{2}$/', $data['phone']['WifiMAC'])) {
                $errors[] = 'phone.WifiMAC format invalid: ' . $data['phone']['WifiMAC'];
            }
            if (isset($data['phone']['BSSID']) && !preg_match('/^[0-9a-f]{2}\.[0-9a-f]{2}\.[0-9a-f]{2}\.[0-9a-f]{2}\.[0-9a-f]{2}:[0-9a-f]{2}$/', $data['phone']['BSSID'])) {
                $errors[] = 'phone.BSSID format invalid: ' . $data['phone']['BSSID'];
            }
            if (isset($data['phone']['Imei']) && !preg_match('/^\d{15}$/', $data['phone']['Imei'])) {
                $errors[] = 'phone.Imei format invalid: ' . $data['phone']['Imei'];
            }
            if (isset($data['phone']['WifiIP']) && !preg_match('/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/', $data['phone']['WifiIP'])) {
                $errors[] = 'phone.WifiIP format invalid: ' . $data['phone']['WifiIP'];
            }
        }

        // Validate hardware object
        if (!isset($data['hardware']) || !is_array($data['hardware'])) {
            $errors[] = 'Missing or invalid "hardware" object';
        } else {
            foreach (self::$hardwareFields as $field) {
                if (!isset($data['hardware'][$field])) {
                    $errors[] = "hardware missing field: {$field}";
                }
            }
            // Validate hardware numeric fields
            if (isset($data['hardware']['width']) && (!is_numeric($data['hardware']['width']) || $data['hardware']['width'] < 100)) {
                $errors[] = 'hardware.width must be numeric and > 100';
            }
            if (isset($data['hardware']['height']) && (!is_numeric($data['hardware']['height']) || $data['hardware']['height'] < 100)) {
                $errors[] = 'hardware.height must be numeric and > 100';
            }
            if (isset($data['hardware']['density']) && (!is_numeric($data['hardware']['density']) || $data['hardware']['density'] < 1)) {
                $errors[] = 'hardware.density must be numeric and >= 1';
            }
            if (isset($data['hardware']['dpi']) && (!is_numeric($data['hardware']['dpi']) || $data['hardware']['dpi'] < 100)) {
                $errors[] = 'hardware.dpi must be numeric and > 100';
            }
        }

        return ['valid' => empty($errors), 'errors' => $errors];
    }

    /**
     * Validate format compliance of specific fields
     * @param array $copgVd
     * @return array
     */
    private static function validateFormats(array $copgVd): array
    {
        $errors = [];

        // IMEI: 15 digits, Luhn valid
        if (isset($copgVd['IMEI'])) {
            $imei = $copgVd['IMEI'];
            if (!preg_match('/^\d{15}$/', $imei)) {
                $errors[] = "IMEI format invalid: {$imei} (expected 15 digits)";
            } elseif (!self::luhnCheck($imei)) {
                $errors[] = "IMEI Luhn check failed: {$imei}";
            }
        }

        // IMSI: 15 digits
        if (isset($copgVd['IMSI'])) {
            if (!preg_match('/^\d{15}$/', $copgVd['IMSI'])) {
                $errors[] = "IMSI format invalid: {$copgVd['IMSI']} (expected 15 digits)";
            }
        }

        // ICCID: 19-20 digits, starts with 89
        if (isset($copgVd['ICCID'])) {
            $iccid = $copgVd['ICCID'];
            if (!preg_match('/^89\d{17,18}$/', $iccid)) {
                $errors[] = "ICCID format invalid: {$iccid} (expected 19-20 digits starting with 89)";
            }
        }

        // MAC Address: XX:XX:XX:XX:XX:XX
        if (isset($copgVd['MAC_ADDRESS'])) {
            if (!preg_match('/^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/', $copgVd['MAC_ADDRESS'])) {
                $errors[] = "MAC_ADDRESS format invalid: {$copgVd['MAC_ADDRESS']}";
            }
        }

        // BLUETOOTH_MAC: XX:XX:XX:XX:XX:XX
        if (isset($copgVd['BLUETOOTH_MAC'])) {
            if (!preg_match('/^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/', $copgVd['BLUETOOTH_MAC'])) {
                $errors[] = "BLUETOOTH_MAC format invalid: {$copgVd['BLUETOOTH_MAC']}";
            }
        }

        // ANDROID_ID: 16 hex chars
        if (isset($copgVd['ANDROID_ID'])) {
            if (!preg_match('/^[0-9a-f]{16}$/', $copgVd['ANDROID_ID'])) {
                $errors[] = "ANDROID_ID format invalid: {$copgVd['ANDROID_ID']} (expected 16 hex chars)";
            }
        }

        // FINGERPRINT: brand/product/device:codename/build_id/incremental/build_type/key_type
        if (isset($copgVd['FINGERPRINT'])) {
            $fp = $copgVd['FINGERPRINT'];
            if (!preg_match('/^[a-z0-9_]+\/[a-z0-9_]+\/[a-z0-9_]+:[A-Z0-9.]+\/[A-Z0-9.]+\/\d+:(user|userdebug|eng)\/[a-z-]+$/', $fp)) {
                $errors[] = "FINGERPRINT format invalid: {$fp}";
            }
        }

        // SECURITY_PATCH: YYYY-MM-DD
        if (isset($copgVd['SECURITY_PATCH'])) {
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $copgVd['SECURITY_PATCH'])) {
                $errors[] = "SECURITY_PATCH format invalid: {$copgVd['SECURITY_PATCH']} (expected YYYY-MM-DD)";
            }
        }

        // FIRST_API_LEVEL: 33, 34, or 35
        if (isset($copgVd['FIRST_API_LEVEL'])) {
            $apiLevel = (int)$copgVd['FIRST_API_LEVEL'];
            if (!in_array($apiLevel, [33, 34, 35])) {
                $errors[] = "FIRST_API_LEVEL must be 33, 34, or 35, got: {$copgVd['FIRST_API_LEVEL']}";
            }
        }

        // TIMESTAMP: numeric string
        if (isset($copgVd['TIMESTAMP'])) {
            if (!preg_match('/^\d{9,11}$/', $copgVd['TIMESTAMP'])) {
                $errors[] = "TIMESTAMP format invalid: {$copgVd['TIMESTAMP']} (expected Unix timestamp)";
            }
        }

        // SDK_FINGERPRINT: 32 hex chars
        if (isset($copgVd['SDK_FINGERPRINT'])) {
            if (!preg_match('/^[0-9a-f]{32}$/', $copgVd['SDK_FINGERPRINT'])) {
                $errors[] = "SDK_FINGERPRINT format invalid: {$copgVd['SDK_FINGERPRINT']} (expected 32 hex chars)";
            }
        }

        // UUID: base64url string, no padding
        if (isset($copgVd['UUID'])) {
            if (!preg_match('/^[A-Za-z0-9_-]{20,50}$/', $copgVd['UUID'])) {
                $errors[] = "UUID format invalid: {$copgVd['UUID']}";
            }
        }

        // BATTERY: valid JSON string
        if (isset($copgVd['BATTERY'])) {
            $battery = json_decode($copgVd['BATTERY'], true);
            if (!is_array($battery)) {
                $errors[] = "BATTERY is not valid JSON";
            } else {
                foreach (['capacity', 'health', 'temperature', 'voltage', 'technology'] as $field) {
                    if (!isset($battery[$field])) {
                        $errors[] = "BATTERY missing field: {$field}";
                    }
                }
            }
        }

        return $errors;
    }

    /**
     * Luhn check for IMEI/ICCID
     * @param string $number
     * @return bool
     */
    public static function luhnCheck(string $number): bool
    {
        // Standard Luhn: for the full number (N digits, including check digit),
        // double every other digit starting from the rightmost (position 1).
        // Position k (1-based from right) is doubled when k is even.
        // Digit at left index i corresponds to position k = N - i from the right.
        // Double when (N - i) % 2 === 0, i.e. (len - i) % 2 === 0.
        $sum = 0;
        $len = strlen($number);
        for ($i = 0; $i < $len; $i++) {
            $d = (int)$number[$i];
            if (($len - $i) % 2 === 0) {
                $d *= 2;
                if ($d > 9) $d -= 9;
            }
            $sum += $d;
        }
        return $sum % 10 === 0;
    }

    /**
     * Validate the JSON string syntax (no trailing commas, no single quotes, etc.)
     * @param string $jsonString
     * @return array ['valid' => bool, 'errors' => string[]]
     */
    public static function validateJsonSyntax(string $jsonString): array
    {
        $errors = [];

        // Check for single quotes (should use double quotes)
        if (preg_match("/'[^']*'/", $jsonString)) {
            $errors[] = 'JSON contains single-quoted strings (should use double quotes)';
        }

        // Check for trailing commas
        if (preg_match('/,\s*[\}\]]/', $jsonString)) {
            $errors[] = 'JSON contains trailing comma';
        }

        // Validate JSON parsing
        $decoded = json_decode($jsonString, true);
        if ($decoded === null && json_last_error() !== JSON_ERROR_NONE) {
            $errors[] = 'JSON parse error: ' . json_last_error_msg();
        }

        return ['valid' => empty($errors), 'errors' => $errors];
    }
}
