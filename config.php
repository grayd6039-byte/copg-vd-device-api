<?php
/**
 * COPG-VD Android Device Info Generator API - Configuration
 * Deploy on BT Panel (宝塔面板)
 */

return [
    // API authentication key (empty string = no auth required)
    'api_key' => 'copg-vd-2026',

    // Data directory (absolute path, must be writable by PHP)
    'data_dir' => __DIR__ . '/data',

    // GSMArena scraper settings
    'scraper' => [
        'enabled' => false,
        'timeout' => 15,          // seconds per request
        'cache_ttl' => 86400,     // cache lifetime in seconds (24h)
        'user_agent' => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    ],

    // Android versions to generate (API levels)
    'android_versions' => [33, 34, 35],  // Android 13, 14, 15

    // CORS settings
    'cors' => [
        'enabled' => true,
        'origin' => '*',
    ],

    // IP GeoLocation API (ipgeolocation.io)
    'ip_geolocation' => [
        'enabled' => true,
        'api_key' => '14fecfcafbdb42728cf10c9d24ec0c4e',
        'api_url' => 'https://api.ipgeolocation.io/ipgeo',
        'timeout' => 5,           // seconds
        'fallback_country_code' => '+1',  // fallback if API fails
        'fallback_national_len' => 10,
    ],
];
