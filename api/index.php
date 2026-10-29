<?php
/**
 * COPG-VD Android Device Info Generator API
 * 主入口（Vercel 函数目录内自包含；根目录 api.php 转发到这里）
 *
 * GET /api.php              -> Generate new device info (COPG-VD JSON)
 * GET /api.php?validate=1   -> Generate + validate, return validation results
 * GET /api.php?debug=1      -> Debug mode with detailed logs
 */

// Error reporting
error_reporting(E_ALL);
ini_set('display_errors', '0'); // Don't show errors in output, log them instead

// Load configuration
$config = require __DIR__ . '/config.php';

// Load libraries
require_once __DIR__ . '/lib/PhoneDatabase.php';
require_once __DIR__ . '/lib/DataGenerator.php';
require_once __DIR__ . '/lib/JsonValidator.php';

// CORS headers
if (!empty($config['cors']['enabled'])) {
    $origin = $config['cors']['origin'] ?? '*';
    header("Access-Control-Allow-Origin: {$origin}");
    header('Access-Control-Allow-Methods: GET, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-API-Key');
}

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Only allow GET
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    respond(['error' => 'Method not allowed. Use GET.'], 405);
}

// API Key authentication
$apiKey = $config['api_key'] ?? '';
if (!empty($apiKey)) {
    $providedKey = $_GET['key'] ?? ($_SERVER['HTTP_X_API_KEY'] ?? '');
    if ($providedKey !== $apiKey) {
        respond(['error' => 'Invalid or missing API key. Use ?key=YOUR_KEY or X-API-Key header.'], 401);
    }
}

// Parse query parameters
$validate = isset($_GET['validate']) && $_GET['validate'] === '1';
$debug = isset($_GET['debug']) && $_GET['debug'] === '1';

try {
    // Initialize phone database
    $dataDir = $config['data_dir'] ?? __DIR__ . '/data';
    $scraperConfig = $config['scraper'] ?? [];
    $phoneDb = new PhoneDatabase($dataDir, $scraperConfig);

    // Get random phone
    $phone = $phoneDb->getRandomPhone();

    // Select random Android version (13/14/15)
    $apiLevels = $config['android_versions'] ?? [33, 34, 35];
    $apiLevel = $apiLevels[array_rand($apiLevels)];

    // Generate device data
    $generator = new DataGenerator($phone, $apiLevel, $config['ip_geolocation'] ?? []);

    // Resolve visitor IP for country-based phone number
    $visitorIp = getVisitorIp();
    if (!empty($visitorIp) && !empty($config['ip_geolocation']['enabled'])) {
        $generator->setVisitorIp($visitorIp);
    }

    $result = $generator->generate();

    // Optional validation
    if ($validate) {
        $validation = JsonValidator::validate($result);
        $jsonString = json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
        $syntaxValidation = JsonValidator::validateJsonSyntax($jsonString);

        $response = [
            'success' => $validation['valid'] && $syntaxValidation['valid'],
            'data' => $result,
            'validation' => [
                'structure' => $validation,
                'syntax' => $syntaxValidation,
            ],
        ];

        if ($debug) {
            $response['debug'] = [
                'phone_used' => $phone,
                'api_level' => $apiLevel,
                'generated_at' => date('c'),
            ];
        }

        respond($response, 200);
    }

    // Return the COPG-VD JSON directly
    $jsonString = json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);

    if ($debug) {
        $response = [
            'success' => true,
            'data' => $result,
            'debug' => [
                'phone_used' => $phone,
                'api_level' => $apiLevel,
                'generated_at' => date('c'),
            ],
        ];
        respond($response, 200);
    }

    // Return raw COPG-VD JSON
    header('Content-Type: application/json; charset=utf-8');
    echo $jsonString;
    exit;

} catch (Exception $e) {
    $error = [
        'success' => false,
        'error' => $e->getMessage(),
    ];
    if ($debug) {
        $error['trace'] = $e->getTraceAsString();
    }
    respond($error, 500);
}

/**
 * Send JSON response and exit
 */
function respond(array $data, int $httpCode = 200): void
{
    http_response_code($httpCode);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * Get visitor's real IP address (handles proxies/load balancers)
 */
function getVisitorIp(): string
{
    // Check common proxy headers
    $headers = [
        'HTTP_X_FORWARDED_FOR',
        'HTTP_X_REAL_IP',
        'HTTP_CF_CONNECTING_IP',    // Cloudflare
        'HTTP_X_CLIENT_IP',
        'REMOTE_ADDR',
    ];

    foreach ($headers as $header) {
        if (!empty($_SERVER[$header])) {
            $ip = $_SERVER[$header];
            // X-Forwarded-For may contain multiple IPs, take the first
            if (strpos($ip, ',') !== false) {
                $ip = trim(explode(',', $ip)[0]);
            }
            // Validate IP
            if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
                return $ip;
            }
        }
    }

    return $_SERVER['REMOTE_ADDR'] ?? '';
}
