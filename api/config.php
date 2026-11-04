<?php
/**
 * COPG-VD Android Device Info Generator API - Configuration
 * Deploy on BT Panel (宝塔面板)
 */

return [
    // API authentication key (empty string = no auth required)
    'api_key' => 'mecg-so-2026',

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

    // IP GeoLocation API（已由 ipgeolocation.io 切换为 ip.yowao.xyz）
    // 注意：新接口返回 country_code2 / latitude / longitude，但不返回 calling_code，
    // PHP 版无法从中解析区号，会退回默认区号；线上以 Cloudflare Worker（cloudflare/worker.js）为准。
    'ip_geolocation' => [
        'enabled' => false,
        'api_key' => '',
        'api_url' => 'https://ip.yowao.xyz/ipgeo',
        'timeout' => 5,           // seconds
        'fallback_country_code' => '+1',  // fallback if API fails
        'fallback_national_len' => 10,
    ],
];
