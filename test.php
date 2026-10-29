<?php
/**
 * Quick test script - run via CLI: php test.php
 * Or via web: https://your-domain.com/test.php
 */

error_reporting(E_ALL);
ini_set('display_errors', '1');

require_once __DIR__ . '/api/lib/PhoneDatabase.php';
require_once __DIR__ . '/api/lib/DataGenerator.php';
require_once __DIR__ . '/api/lib/JsonValidator.php';

$config = require __DIR__ . '/api/config.php';
$dataDir = $config['data_dir'];
$scraperConfig = $config['scraper'];
$apiLevels = $config['android_versions'];

echo "=== COPG-VD API Test ===\n\n";

// Test 1: Load phone database
$phoneDb = new PhoneDatabase($dataDir, $scraperConfig);
$phones = $phoneDb->getPhones();
echo "[PASS] Phone database loaded: " . count($phones) . " phones\n";

// Test 2: Generate 5 different device records
for ($i = 1; $i <= 5; $i++) {
    $phone = $phoneDb->getRandomPhone();
    $apiLevel = $apiLevels[array_rand($apiLevels)];
    $generator = new DataGenerator($phone, $apiLevel, $config['ip_geolocation'] ?? []);
    $result = $generator->generate();

    // Validate
    $validation = JsonValidator::validate($result);
    $jsonString = json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    $syntaxValidation = JsonValidator::validateJsonSyntax($jsonString);

    $status = ($validation['valid'] && $syntaxValidation['valid']) ? 'PASS' : 'FAIL';
    echo "[{$status}] Generation #{$i}: {$phone['brand']} {$phone['model']} (API {$apiLevel})\n";

    if (!$validation['valid']) {
        echo "  Structure errors: " . implode(', ', $validation['errors']) . "\n";
    }
    if (!$syntaxValidation['valid']) {
        echo "  Syntax errors: " . implode(', ', $syntaxValidation['errors']) . "\n";
    }

    // Print key fields for verification
    $copgVd = $result['COPG-VD'];
    echo "  IMEI: {$copgVd['IMEI']} (Luhn: " . (JsonValidator::luhnCheck($copgVd['IMEI']) ? 'OK' : 'FAIL') . ")\n";
    echo "  IMSI: {$copgVd['IMSI']}\n";
    echo "  ICCID: {$copgVd['ICCID']}\n";
    echo "  MAC: {$copgVd['MAC_ADDRESS']}\n";
    echo "  ANDROID_ID: {$copgVd['ANDROID_ID']}\n";
    echo "  SERIAL: {$copgVd['SERIAL']}\n";
    echo "  SOC: {$copgVd['SOC_MODEL']} ({$copgVd['SOC_MANUFACTURER']})\n";
    echo "  FINGERPRINT: {$copgVd['FINGERPRINT']}\n";
    echo "  SECURITY_PATCH: {$copgVd['SECURITY_PATCH']}\n";
    echo "  FIRST_API_LEVEL: {$copgVd['FIRST_API_LEVEL']}\n";
    $phone = $result['phone'] ?? [];
    $hw = $result['hardware'] ?? [];
    echo "  phone.DeviceId: {$phone['DeviceId']}\n";
    echo "  phone.WifiMAC: {$phone['WifiMAC']}\n";
    echo "  phone.WifiIP: {$phone['WifiIP']}\n";
    echo "  phone.NetworkOperator: {$phone['NetworkOperator']} ({$phone['NetworkOperatorName']})\n";
    echo "  hardware: {$hw['width']}x{$hw['height']} density={$hw['density']} GPU={$hw['GpuRender']}\n";
    echo "  hardware.cpuinfo: " . substr(str_replace("\n", ' ', $hw['cpuinfo']), 0, 80) . "...\n\n";
}

echo "=== Test Complete ===\n";
