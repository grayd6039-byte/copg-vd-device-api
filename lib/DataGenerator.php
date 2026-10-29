<?php
/**
 * COPG-VD Data Generator Engine
 * Generates self-consistent Android device data with format-compliant random values.
 */

class DataGenerator
{
    /** @var array Phone record from database */
    private $phone;
    /** @var int Selected API level (33/34/35) */
    private $apiLevel;
    /** @var string Android version name */
    private $androidVersion;
    /** @var string Build ID (e.g. "UP1A.231005.007") */
    private $buildId;
    /** @var string Incremental build number */
    private $incremental;
    /** @var string Security patch level */
    private $securityPatch;
    /** @var int Timestamp (seconds since epoch) */
    private $timestamp;
    /** @var array Selected network info [mcc, mnc, name, country] */
    private $selectedNetwork;
    /** @var string|null Visitor's country calling code (from IP geolocation) */
    private $visitorCallingCode = null;
    /** @var int|null Visitor's national number length */
    private $visitorNationalLen = null;
    /** @var array IP geolocation config */
    private $ipGeoConfig;

    /** @var array SoC hardware data (GPU + Vulkan + Frequency) */
    private static $socGpuMap = [
        'Snapdragon 8 Elite'       => ['gpu' => 'Adreno 830',         'vendor' => 'Qualcomm', 'gl' => '3.2', 'gl_version' => 'v32.0.0',      'vulkan' => '1.3', 'frequency' => [300000, 600000, 900000, 1200000, 1500000, 1800000, 2100000, 2400000, 2700000, 3000000, 3300000, 3600000, 3900000, 4200000, 4470000]],
        'Snapdragon 8 Gen 3'       => ['gpu' => 'Adreno 751',         'vendor' => 'Qualcomm', 'gl' => '3.2', 'gl_version' => 'v30.2.4',      'vulkan' => '1.3', 'frequency' => [300000, 500000, 700000, 900000, 1100000, 1300000, 1500000, 1700000, 1900000, 2100000, 2300000, 2500000, 2700000, 2900000, 3100000, 3300000]],
        'Snapdragon 8 Gen 2'       => ['gpu' => 'Adreno 740',         'vendor' => 'Qualcomm', 'gl' => '3.2', 'gl_version' => 'v28.0.0',      'vulkan' => '1.3', 'frequency' => [300000, 500000, 700000, 900000, 1100000, 1300000, 1500000, 1700000, 1900000, 2100000, 2300000, 2500000, 2700000, 2900000, 3100000, 3300000, 3360000]],
        'Snapdragon 8+ Gen 1'      => ['gpu' => 'Adreno 730',         'vendor' => 'Qualcomm', 'gl' => '3.2', 'gl_version' => 'v26.0.0',      'vulkan' => '1.2', 'frequency' => [300000, 500000, 700000, 900000, 1100000, 1300000, 1500000, 1700000, 1900000, 2100000, 2300000, 2500000, 2700000, 2900000, 3000000]],
        'Snapdragon 7+ Gen 3'      => ['gpu' => 'Adreno 732',         'vendor' => 'Qualcomm', 'gl' => '3.2', 'gl_version' => 'v30.2.4',      'vulkan' => '1.3', 'frequency' => [300000, 600000, 900000, 1200000, 1500000, 1800000, 2100000, 2400000, 2610000]],
        'Snapdragon 765G'          => ['gpu' => 'Adreno 620',         'vendor' => 'Qualcomm', 'gl' => '3.2', 'gl_version' => 'v20.0.0',      'vulkan' => '1.1', 'frequency' => [300000, 600000, 900000, 1200000, 1500000, 1800000, 2100000, 2400000]],
        'Snapdragon 685'           => ['gpu' => 'Adreno 610',         'vendor' => 'Qualcomm', 'gl' => '3.2', 'gl_version' => 'v20.0.0',      'vulkan' => '1.1', 'frequency' => [300000, 600000, 900000, 1200000, 1500000, 1800000, 2100000, 2400000]],
        'Snapdragon 6 Gen 3'       => ['gpu' => 'Adreno 710',         'vendor' => 'Qualcomm', 'gl' => '3.2', 'gl_version' => 'v30.2.4',      'vulkan' => '1.3', 'frequency' => [300000, 600000, 900000, 1200000, 1500000, 1800000, 2100000, 2400000]],
        'Dimensity 9400'           => ['gpu' => 'Immortalis-G925',    'vendor' => 'ARM',      'gl' => '3.2', 'gl_version' => 'v1.r4p0-00eac0.b0c21d07f7398f87a84f678063111a2e', 'vulkan' => '1.3', 'frequency' => [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000, 2400000, 2600000, 2800000, 3000000, 3200000, 3400000, 3600000, 3800000, 4000000, 4210000]],
        'Dimensity 9300'           => ['gpu' => 'Immortalis-G720',    'vendor' => 'ARM',      'gl' => '3.2', 'gl_version' => 'v1.r0p0-00eac0.843348195f462f29a4f9b602973186d8', 'vulkan' => '1.2', 'frequency' => [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000, 2400000, 2600000, 2800000, 3000000, 3250000]],
        'Dimensity 8350'           => ['gpu' => 'Mali-G615 MC6',      'vendor' => 'ARM',      'gl' => '3.2', 'gl_version' => 'v1.r4p0-00eac0.f3381954750a208830d63118a1835f09', 'vulkan' => '1.3', 'frequency' => [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000, 2400000, 2630000]],
        'Dimensity 8300 Extreme'   => ['gpu' => 'Mali-G615 MC6',      'vendor' => 'ARM',      'gl' => '3.2', 'gl_version' => 'v1.r4p0-00eac0.f3381954750a208830d63118a1835f09', 'vulkan' => '1.3', 'frequency' => [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000, 2400000, 2630000]],
        'Dimensity 8200'           => ['gpu' => 'Mali-G610 MC6',      'vendor' => 'ARM',      'gl' => '3.2', 'gl_version' => 'v1.r0p0-00eac0.73a461649f2e45580f51577000675708', 'vulkan' => '1.3', 'frequency' => [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000, 2400000, 2600000, 2800000, 3000000, 3100000]],
        'Dimensity 7300 Ultra'     => ['gpu' => 'Mali-G615 MC2',      'vendor' => 'ARM',      'gl' => '3.2', 'gl_version' => 'v1.r4p0-00eac0.f3381954750a208830d63118a1835f09', 'vulkan' => '1.3', 'frequency' => [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000, 2400000, 2500000]],
        'Dimensity 7300'           => ['gpu' => 'Mali-G615 MC2',      'vendor' => 'ARM',      'gl' => '3.2', 'gl_version' => 'v1.r4p0-00eac0.f3381954750a208830d63118a1835f09', 'vulkan' => '1.3', 'frequency' => [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000, 2400000, 2500000]],
        'Dimensity 7200X'          => ['gpu' => 'Mali-G610 MC4',      'vendor' => 'ARM',      'gl' => '3.2', 'gl_version' => 'v1.r0p0-00eac0.73a461649f2e45580f51577000675708', 'vulkan' => '1.3', 'frequency' => [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000, 2400000]],
        'Dimensity 7200'           => ['gpu' => 'Mali-G610 MC4',      'vendor' => 'ARM',      'gl' => '3.2', 'gl_version' => 'v1.r0p0-00eac0.73a461649f2e45580f51577000675708', 'vulkan' => '1.3', 'frequency' => [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000, 2400000]],
        'Dimensity 7050'           => ['gpu' => 'Mali-G605 MC4',      'vendor' => 'ARM',      'gl' => '3.2', 'gl_version' => 'v1.r0p0-00eac0.50c2137f39b414720660e9353405090b', 'vulkan' => '1.2', 'frequency' => [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000, 2400000]],
        'Exynos 2400'              => ['gpu' => 'Xclipse 920',        'vendor' => 'Samsung',  'gl' => '3.2', 'gl_version' => 'v1.r20p0-01e10.d39c8ba901a552ad', 'vulkan' => '1.3', 'frequency' => [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000, 2400000, 2600000, 2800000, 3000000, 3200000]],
        'Exynos 1480'              => ['gpu' => 'Mali-G68',           'vendor' => 'ARM',      'gl' => '3.2', 'gl_version' => 'v1.r0p0-00eac0.601d1222d4b4e7c2f398d919e35328b2', 'vulkan' => '1.3', 'frequency' => [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000, 2400000, 2500000]],
        'Exynos 1380'              => ['gpu' => 'Mali-G68',           'vendor' => 'ARM',      'gl' => '3.2', 'gl_version' => 'v1.r0p0-00eac0.601d1222d4b4e7c2f398d919e35328b2', 'vulkan' => '1.2', 'frequency' => [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000, 2400000]],
        'Tensor G4'                => ['gpu' => 'Mali-G715',          'vendor' => 'ARM',      'gl' => '3.2', 'gl_version' => 'v1.r38p0-01eac0.824407f2d180930970b0438f95b04710', 'vulkan' => '1.3', 'frequency' => [500000, 600000, 750000, 900000, 1050000, 1200000, 1350000, 1500000, 1650000, 1800000, 1950000, 2100000, 2250000, 2400000, 2550000, 2700000, 2850000, 3000000, 3150000, 3300000, 3450000, 3600000, 3700000]],
        'Tensor G3'                => ['gpu' => 'Mali-G715',          'vendor' => 'ARM',      'gl' => '3.2', 'gl_version' => 'v1.r38p0-01eac0.824407f2d180930970b0438f95b04710', 'vulkan' => '1.2', 'frequency' => [500000, 600000, 750000, 900000, 1050000, 1200000, 1350000, 1500000, 1650000, 1800000, 1950000, 2100000, 2250000, 2400000, 2550000, 2700000, 2850000, 3000000, 3150000, 3300000]],
        'Tensor G2'                => ['gpu' => 'Mali-G715',          'vendor' => 'ARM',      'gl' => '3.2', 'gl_version' => 'v1.r34p0-01eac0.47289421189595692824397854050472', 'vulkan' => '1.1', 'frequency' => [500000, 600000, 750000, 900000, 1050000, 1200000, 1350000, 1500000, 1650000, 1800000, 1950000, 2100000, 2250000, 2400000, 2550000, 2700000, 2850000, 3000000]],
        'Tensor G1'                => ['gpu' => 'Mali-G78',           'vendor' => 'ARM',      'gl' => '3.2', 'gl_version' => 'v1.r32p0-00eac0.71182211698962859752873973789917', 'vulkan' => '1.1', 'frequency' => [500000, 600000, 750000, 900000, 1050000, 1200000, 1350000, 1500000, 1650000, 1800000, 1950000, 2100000, 2250000, 2400000, 2550000, 2700000, 2850000]],
        'Kirin 9020'               => ['gpu' => 'Maleoon 910',        'vendor' => 'Huawei',   'gl' => '3.2', 'gl_version' => 'v100.0.0',     'vulkan' => '1.3', 'frequency' => [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000, 2400000, 2610000]],
        'Kirin 9010'               => ['gpu' => 'Maleoon 910',        'vendor' => 'Huawei',   'gl' => '3.2', 'gl_version' => 'v100.0.0',     'vulkan' => '1.2', 'frequency' => [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000, 2400000, 2500000]],
        'Kirin 9000S'              => ['gpu' => 'Maleoon 910',        'vendor' => 'Huawei',   'gl' => '3.2', 'gl_version' => 'v100.0.0',     'vulkan' => '1.1', 'frequency' => [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000, 2400000]],
    ];

    /** @var array Network lookup with carrier info [mcc, mnc, name, country] */
    private static $networks = [
        ['310', '410', 'Verizon',       'us'],
        ['310', '260', 'T-Mobile',      'us'],
        ['310', '160', 'AT&T',          'us'],
        ['310', '040', 'Vodafone',      'us'],
        ['234', '15',  'O2',            'gb'],
        ['234', '30',  'Vodafone',      'gb'],
        ['234', '20',  'EE',            'gb'],
        ['262', '01',  'Orange',        'de'],
        ['262', '02',  'SFR',           'de'],
        ['262', '07',  'Bouygues',      'de'],
        ['303', '1',   'Vodafone',      'de'],
        ['303', '2',   'Telekom',       'de'],
        ['303', '9',   'O2',            'de'],
        ['440', '11',  'NTT Docomo',    'jp'],
        ['440', '07',  'SoftBank',      'jp'],
        ['525', '01',  'KT',            'kr'],
        ['525', '03',  'SK Telecom',    'kr'],
        ['466', '92',  'China Mobile',  'tw'],
        ['466', '97',  'China Unicom',  'tw'],
        ['466', '93',  'China Telecom', 'tw'],
    ];

    /** @var array SoC hardware names (lowercase platform names for Build.HARDWARE) */
    private static $socHardwareNames = [
        'Snapdragon' => 'qcom',
        'Dimensity'  => 'mtk',
        'Exynos'     => 'exynos',
        'Tensor'     => 'tesla',
        'Kirin'      => 'kirin',
    ];

    /**
     * @param array $phone Phone record from database
     * @param int $apiLevel Android API level (33, 34, or 35)
     * @param array $ipGeoConfig IP geolocation config from config.php
     */
    public function __construct(array $phone, int $apiLevel, array $ipGeoConfig = [])
    {
        $this->phone = $phone;
        $this->apiLevel = $apiLevel;
        $this->androidVersion = $this->getAndroidVersionName($apiLevel);
        $this->ipGeoConfig = $ipGeoConfig;

        // Select network for carrier info
        $this->selectedNetwork = self::$networks[array_rand(self::$networks)];

        // Generate build ID based on API level
        $this->buildId = $this->generateBuildId($apiLevel);
        $this->incremental = $this->generateIncremental();
        $this->securityPatch = $this->generateSecurityPatch($apiLevel);
        $this->timestamp = $this->generateTimestamp();
    }

    /**
     * Set visitor IP and resolve country calling code via ipgeolocation.io API
     * @param string $ip Visitor's IP address
     */
    public function setVisitorIp(string $ip): void
    {
        if (empty($this->ipGeoConfig['enabled']) || empty($this->ipGeoConfig['api_key'])) {
            return;
        }

        $apiKey = $this->ipGeoConfig['api_key'];
        $apiUrl = $this->ipGeoConfig['api_url'] . '?apiKey=' . urlencode($apiKey) . '&ip=' . urlencode($ip);
        $timeout = $this->ipGeoConfig['timeout'] ?? 5;

        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL => $apiUrl,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => $timeout,
            CURLOPT_CONNECTTIMEOUT => $timeout,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_FOLLOWLOCATION => true,
        ]);
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($response === false || $httpCode !== 200) {
            return;
        }

        $data = json_decode($response, true);
        if (!is_array($data) || empty($data['calling_code'])) {
            return;
        }

        $callingCode = $data['calling_code'];
        // Normalize: ensure it starts with +
        if ($callingCode[0] !== '+') {
            $callingCode = '+' . $callingCode;
        }
        $this->visitorCallingCode = $callingCode;

        // Estimate national number length based on calling code
        $this->visitorNationalLen = $this->getNationalLength($callingCode);
    }

    /**
     * Generate the complete COPG-VD JSON data
     * @return array
     */
    public function generate(): array
    {
        $p = $this->phone;
        $brand = $p['brand'];
        $model = $p['model'];
        $manufacturer = $p['manufacturer'] ?? $brand;
        $deviceCode = strtolower($p['device_code'] ?? $this->slugify($model));

        // Build ID and display
        $buildId = $this->buildId;
        $incremental = $this->incremental;
        $securityPatch = $this->securityPatch;
        $timestamp = $this->timestamp;
        $display = $buildId;
        $id = $buildId;

        // Generate all random values
        $imei = $this->generateImei();
        $imsi = $this->generateImsi();
        $iccid = $this->generateIccid();
        $macAddress = $this->generateMacAddress(); // colons format for COPG-VD
        $androidId = $this->generateAndroidId();
        $serialNumber = $this->generateSerialNumber($brand, $model);
        $basebandVersion = $this->generateBasebandVersion($brand);
        $bluetoothMac = $this->generateMacAddress();
        $phoneNumber = $this->generatePhoneNumber();
        $batteryInfo = $this->generateBatteryInfo();

        // Fingerprint: brand/product/device:codename/build_id/incremental/build_type/key_type
        $product = $this->generateProductCode($deviceCode);
        $fingerprint = sprintf(
            '%s/%s/%s:%s/%s/%s:user/release-keys',
            $brand,
            $product,
            $deviceCode,
            $this->getBuildCodename($this->apiLevel),
            $buildId,
            $incremental
        );

        // SDK fingerprint: 32-char hex
        $sdkFingerprint = md5(uniqid('', true));

        // UUID: 43-char base64url-like string
        $uuid = $this->generateUuid();

        // HOST: literal "build-server" (per COPG-VD spec in image)
        $host = 'build-server';

        // BOOTLOADER
        $bootloader = $this->generateBootloader($brand, $deviceCode);

        // BOARD = device_code, HARDWARE = SoC platform name (lowercase)
        $board = $deviceCode;
        $hardware = $this->getSocHardwareName();

        // PREVIEW_SDK: only for Android 15+ (API 35)
        $previewSdk = null;
        if ($this->apiLevel >= 35) {
            $previewSdk = date('Ymd', $this->timestamp);
        }

        // SoC info from phones.json
        $socModel = $p['soc'] ?? 'Snapdragon 8 Gen 3';
        $socManufacturer = $this->getSocManufacturer($socModel);
        $boardPlatform = $deviceCode;
        $serial = $this->generateShortSerial();

        // Build the COPG-VD object
        $copgVd = [
            'BRAND' => $brand,
            'DEVICE' => $deviceCode,
            'MANUFACTURER' => $manufacturer,
            'MODEL' => $model,
            'FINGERPRINT' => $fingerprint,
            'PRODUCT' => $product,
            'BOOTLOADER' => $bootloader,
            'BOARD' => $board,
            'HARDWARE' => $hardware,
            'DISPLAY' => $display,
            'ID' => $id,
            'HOST' => $host,
            'INCREMENTAL' => $incremental,
            'TIMESTAMP' => (string)$timestamp,
            'USER' => 'android-build',
            'SDK_FINGERPRINT' => $sdkFingerprint,
            'UUID' => $uuid,
            'SECURITY_PATCH' => $securityPatch,
            'FIRST_API_LEVEL' => (string)$this->apiLevel,
            'DRM_SECURITY_LEVEL' => 'L1',
            'SERIAL' => $serial,
            'RADIO' => $basebandVersion,
            'SOC_MODEL' => $socModel,
            'SOC_MANUFACTURER' => $socManufacturer,
            'BOARD_PLATFORM' => $boardPlatform,
            'ANDROID_ID' => $androidId,
            'VERSION' => [
                'INCREMENTAL' => $basebandVersion,
                'RELEASE' => $this->androidVersion,
                'SDK' => $this->apiLevel,
                'CODENAME' => 'REL',
                'SECURITY_PATCH' => $securityPatch,
                'BASE_OS' => '',
            ],
        ];

        // PREVIEW_SDK only for Android 15+
        if ($previewSdk !== null) {
            $copgVd['PREVIEW_SDK'] = $previewSdk;
        }

        // Device attributes
        $copgVd['IMEI'] = $imei;
        $copgVd['IMSI'] = $imsi;
        $copgVd['ICCID'] = $iccid;
        $copgVd['MAC_ADDRESS'] = $macAddress;
        $copgVd['SERIAL_NUMBER'] = $serialNumber;
        $copgVd['BASEBAND_VERSION'] = $basebandVersion;
        $copgVd['BLUETOOTH_MAC'] = $bluetoothMac;
        $copgVd['PHONE_NUMBER'] = $phoneNumber;
        $copgVd['BATTERY'] = json_encode($batteryInfo);

        // Build phone object
        $phoneObj = $this->buildPhoneObject($p, $imei, $imsi, $iccid, $macAddress, $bluetoothMac, $androidId, $basebandVersion);

        // Build hardware object
        $hardwareObj = $this->buildHardwareObject($p, $model, $buildId);

        // Build the full JSON structure
        $result = [
            'Instructions' => 'Use strings on double-quotes only.',
            'scope_mode' => 'playstore',
            'COPG-VD' => $copgVd,
            'phone' => $phoneObj,
            'hardware' => $hardwareObj,
            'motor_drm' => false,
            'global_fields' => ['SECURITY_PATCH'],
        ];

        return $result;
    }

    // ============================================================
    // Phone Object Builder
    // ============================================================

    private function buildPhoneObject(array $p, string $imei, string $imsi, string $iccid, string $wifiMacColons, string $btMacColons, string $androidId, string $baseband): array
    {
        $net = $this->selectedNetwork;
        $mcc = $net[0];
        $mnc = $net[1];
        $carrierName = $net[2];
        $countryIso = $net[3];

        $networkOperator = $mcc . $mnc;
        $simOperator = $mcc . $mnc;

        $wifiName = $this->generateWifiName($p['brand']);
        $wifiIp = $this->generateWifiIp();
        $meid = $this->generateMeid();
        $cellId = $this->generateCellId();
        $nearCell = $this->generateNearCell();
        $sdsdkid = $this->generateSdsdkid();

        // MAC formats for phone object: dots for Bluetooth, dots for WifiMAC, mixed for BSSID
        $btMacDots = str_replace(':', '.', $btMacColons);
        $wifiMacDots = strtoupper(str_replace(':', '.', $wifiMacColons));
        $bssidMixed = $this->generateBssidMixed();

        // Generate a separate 14-digit IMSI for phone.Imsi
        $phoneImsi = $this->generatePhoneImsi($mcc);

        $model = $p['model'];
        $multiMedia = sprintf('Android/%s (Linux; U; Android %s; %s Build/%s)', $this->androidVersion, $this->androidVersion, $model, $this->buildId);

        return [
            'DeviceId'               => $androidId,
            'DeviceSoftwareVersion'  => '01',
            'SubscriberId'           => $imsi,
            'LineNumber'             => '',
            'Imei'                   => $imei,
            'Imsi'                   => $phoneImsi,
            'Meid'                   => $meid,
            'SimSerialNumber'        => $iccid,
            'NetworkOperator'        => $networkOperator,
            'NetworkOperatorName'    => $carrierName,
            'SimOperator'            => $simOperator,
            'SimOperatorName'        => $carrierName,
            'NetworkCountryIso'      => $countryIso,
            'SimCountryIso'          => $countryIso,
            'NetworkType'            => '13',
            'PhoneType'              => '1',
            'PhoneCount'             => '2',
            'SimState'               => '5',
            'BluetoothMac'           => $btMacDots,
            'WifiMAC'                => $wifiMacDots,
            'WifiIP'                 => $wifiIp,
            'WifiName'               => $wifiName,
            'latitude'               => '',
            'longitude'              => '',
            'Calibration'            => '0',
            'BaseLocation'           => '0',
            'BSSID'                  => $bssidMixed,
            'CallState'              => '0',
            'NetStrand'              => '0',
            'NetSubtypeName'         => 'LTE',
            'MultiMedia'             => $multiMedia,
            'MultiMediaProfile'      => 'http://www.google.com/oha/cdf/us-profile-kills.xml',
            'VoiceMailAlphaTag'      => 'Voicemail',
            'VoiceMailNumber'        => '',
            'sdsdkid'                => $sdsdkid,
            'near_cell'              => $nearCell,
            'SSIDBook'               => $wifiName,
            'SSIDName'               => $wifiName,
            'BSSIDBook'              => $bssidMixed,
        ];
    }

    // ============================================================
    // Hardware Object Builder
    // ============================================================

    private function buildHardwareObject(array $p, string $model, string $buildId): array
    {
        $density = $p['screen_density'] ?? 2.75;
        $width = $p['screen_width'] ?? 1080;
        $height = $p['screen_height'] ?? 2400;

        // dpi = nominal DPI (density * 160)
        $dpi = (int)round($density * 160);
        $xdpi = round($dpi + random_int(-5, 5), 2);
        $ydpi = round($dpi + random_int(-5, 5), 2);

        // GPU/Vulkan/Frequency info from SoC lookup
        $socModel = $p['soc'] ?? 'Snapdragon 8 Gen 3';
        $socData = self::$socGpuMap[$socModel] ?? self::$socGpuMap['Snapdragon 8 Gen 3'];
        $gpuRender = $socData['gpu'];
        $gpuVendor = $socData['vendor'];
        $gpuVersion = sprintf('OpenGL ES %s %s', $socData['gl'], $socData['gl_version']);
        $vulkan = $socData['vulkan'];
        $frequency = $socData['frequency'];
        $currentFrequency = $this->generateCurrentFrequency($frequency);
        $gpuExtensions = $this->generateGpuExtensions();

        $chromeVersion = $this->generateChromeVersion();
        $hardwareUserAgent = sprintf(
            'Mozilla/5.0 (Linux; Android %s; %s Build/%s; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/%s Mobile Safari/537.36',
            $this->androidVersion, $model, $buildId, $chromeVersion
        );

        $cpuinfo = $this->generateCpuInfo();

        return [
            'dpi'              => $dpi,
            'density'          => $density,
            'width'            => $width,
            'height'           => $height,
            'xdpi'             => $xdpi,
            'ydpi'             => $ydpi,
            'screenDensity'    => $density,
            'UserAgent'        => $hardwareUserAgent,
            'GpuRender'        => $gpuRender,
            'GpuVendor'        => $gpuVendor,
            'GpuVersion'       => $gpuVersion,
            'GPUExtensions'    => $gpuExtensions,
            'cpuinfo'          => $cpuinfo,
            'vulkan'           => $vulkan,
            'frequency'        => $frequency,
            'current_frequency' => $currentFrequency,
        ];
    }

    // ============================================================
    // Android Version Mapping
    // ============================================================

    private function getAndroidVersionName(int $apiLevel): string
    {
        $map = [33 => '13', 34 => '14', 35 => '15'];
        return $map[$apiLevel] ?? '14';
    }

    private function getBuildCodename(int $apiLevel): string
    {
        return 'REL';
    }

    // ============================================================
    // Build ID Generation
    // ============================================================

    private function generateBuildId(int $apiLevel): string
    {
        $prefixes = [
            33 => ['TQ2A', 'TP1A', 'TR1A'],
            34 => ['UP1A', 'UQ1A', 'UR1A'],
            35 => ['AP1A', 'BP1A', 'CP1A'],
        ];
        $prefixes = $prefixes[$apiLevel] ?? $prefixes[34];
        $prefix = $prefixes[array_rand($prefixes)];

        $date = date('Ymd', time() - random_int(0, 180 * 86400));
        $buildNum = str_pad((string)random_int(1, 999), 3, '0', STR_PAD_LEFT);
        return sprintf('%s.%s.%s', $prefix, $date, $buildNum);
    }

    private function generateIncremental(): string
    {
        return (string)random_int(1000000, 99999999);
    }

    private function generateSecurityPatch(int $apiLevel): string
    {
        $monthsAgo = random_int(0, 5);
        $date = new DateTime();
        $date->modify("-{$monthsAgo} months");
        $day = random_int(1, 28);
        return sprintf('%s-%02d-%02d', $date->format('Y'), $date->format('m'), $day);
    }

    private function generateTimestamp(): int
    {
        return time() - random_int(0, 180 * 86400);
    }

    // ============================================================
    // IMEI (Luhn-valid)
    // ============================================================

    private function generateImei(): string
    {
        $tac = $this->generateTac();
        $serial = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);

        $imei14 = $tac . $serial;
        $checkDigit = $this->luhnCheckDigit($imei14);
        return $imei14 . $checkDigit;
    }

    private function generateTac(): string
    {
        $tacs = [
            'google' => ['356938', '359057', '354237', '355418', '358852'],
            'samsung' => ['357850', '356938', '354237', '355418', '358852', '359057'],
            'xiaomi' => ['866221', '866225', '866228', '866229', '866230'],
            'oneplus' => ['864410', '864411', '864412', '864413', '864414'],
            'oppo' => ['865790', '865791', '865792', '865793', '865794'],
            'vivo' => ['867300', '867301', '867302', '867303', '867304'],
            'huawei' => ['865300', '865301', '865302', '865303', '865304'],
            'motorola' => ['354595', '354596', '354597', '354598', '354599'],
            'sony' => ['354237', '354238', '354239', '354240', '354241'],
            'lg' => ['354237', '354238', '354239', '354240', '354241'],
        ];

        $brand = strtolower($this->phone['brand'] ?? '');
        if (isset($tacs[$brand])) {
            $tacBase = $tacs[$brand][array_rand($tacs[$brand])];
        } else {
            $tacBase = (string)random_int(350000, 399999);
        }

        return $tacBase . str_pad((string)random_int(0, 99), 2, '0', STR_PAD_LEFT);
    }

    private function luhnCheckDigit(string $digits): int
    {
        $sum = 0;
        $len = strlen($digits);
        for ($i = 0; $i < $len; $i++) {
            $d = (int)$digits[$i];
            if (($len + 1 - $i) % 2 === 0) {
                $d *= 2;
                if ($d > 9) $d -= 9;
            }
            $sum += $d;
        }
        return (10 - ($sum % 10)) % 10;
    }

    // ============================================================
    // IMSI (15 digits, valid MCC/MNC)
    // ============================================================

    private function generateImsi(): string
    {
        $net = $this->selectedNetwork;
        $mcc = $net[0];
        $mnc = $net[1];
        $msinLength = 15 - strlen($mcc) - strlen($mnc);
        $msin = str_pad((string)random_int(0, (int)(pow(10, $msinLength) - 1)), $msinLength, '0', STR_PAD_LEFT);

        return $mcc . $mnc . $msin;
    }

    // ============================================================
    // ICCID (19-20 digits, starts with 89)
    // ============================================================

    private function generateIccid(): string
    {
        $iin = (string)random_int(1, 9);
        $nationalIdLength = random_int(14, 15);
        $nationalId = '';
        for ($i = 0; $i < $nationalIdLength; $i++) {
            $nationalId .= (string)random_int(0, 9);
        }

        $iccidWithoutCheck = '89' . $iin . $nationalId;
        $checkDigit = $this->luhnCheckDigit($iccidWithoutCheck);
        return $iccidWithoutCheck . $checkDigit;
    }

    // ============================================================
    // MAC Address (colon format for COPG-VD)
    // ============================================================

    private function generateMacAddress(): string
    {
        $bytes = [];
        for ($i = 0; $i < 6; $i++) {
            $bytes[] = dechex(random_int(0, 255));
        }
        if ($bytes[0] === '00' && $bytes[1] === '00' && $bytes[2] === '00') {
            $bytes[0] = dechex(random_int(1, 254));
        }
        foreach ($bytes as &$b) {
            $b = str_pad($b, 2, '0', STR_PAD_LEFT);
        }
        return implode(':', $bytes);
    }

    // ============================================================
    // Android ID (16 hex chars)
    // ============================================================

    private function generateAndroidId(): string
    {
        return substr(md5(uniqid('', true)), 0, 16);
    }

    // ============================================================
    // Serial Number (full, for COPG-VD SERIAL_NUMBER)
    // ============================================================

    private function generateSerialNumber(string $brand, string $model): string
    {
        $serialPatterns = [
            'google' => 'GP' . date('ym') . str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT),
            'samsung' => 'RF' . date('ym') . str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT),
            'xiaomi' => 'XIAOMI' . date('ym') . str_pad((string)random_int(0, 99999), 5, '0', STR_PAD_LEFT),
            'oneplus' => 'ONEPLUS' . date('ym') . str_pad((string)random_int(0, 99999), 5, '0', STR_PAD_LEFT),
            'default' => strtoupper(substr(md5(uniqid('', true)), 0, 12)),
        ];

        $brandLower = strtolower($brand);
        if (isset($serialPatterns[$brandLower])) {
            return $serialPatterns[$brandLower];
        }
        return $serialPatterns['default'];
    }

    // ============================================================
    // Short Serial (for COPG-VD SERIAL, like "okteiqkrk8")
    // ============================================================

    private function generateShortSerial(): string
    {
        $chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        $len = random_int(8, 12);
        $serial = '';
        for ($i = 0; $i < $len; $i++) {
            $serial .= $chars[random_int(0, strlen($chars) - 1)];
        }
        return $serial;
    }

    // ============================================================
    // Baseband Version
    // ============================================================

    private function generateBasebandVersion(string $brand): string
    {
        $basebands = [
            'google' => [
                'g5135b-250115-01', 'g5135b-250210-02', 'g5135b-250315-03',
                'g4228b-250120-01', 'g4228b-250225-02',
            ],
            'samsung' => [
                'S907BXXU6AYK2', 'S907BXXU6AYL3', 'S907BXXU6AZM4',
                'SM-S908BXXU1AWK2', 'SM-S908BXXU1AWL3',
            ],
            'xiaomi' => [
                'V14.0.6.0.TLKMIXM', 'V14.0.7.0.TLKMIXM', 'V14.0.8.0.TLKMIXM',
            ],
            'oneplus' => [
                'ONEPLUS-CPH2581_14.0.0.268(CN01)', 'ONEPLUS-CPH2581_14.0.0.270(CN01)',
            ],
            'default' => [
                'BB' . date('ymd') . '-' . random_int(1, 99) . '-' . random_int(1, 99),
            ],
        ];

        $brandLower = strtolower($brand);
        if (isset($basebands[$brandLower])) {
            return $basebands[$brandLower][array_rand($basebands[$brandLower])];
        }
        return $basebands['default'][0];
    }

    // ============================================================
    // Phone Number (uses IP geolocation country calling code if available)
    // ============================================================

    private function generatePhoneNumber(): string
    {
        // Use visitor's country calling code from IP geolocation
        if ($this->visitorCallingCode !== null) {
            $callingCode = $this->visitorCallingCode;
            $nationalLen = $this->visitorNationalLen ?? 10;
        } else {
            // Fallback: random country from list
            $countries = [
                ['+1', 10], ['+44', 9], ['+33', 9], ['+49', 11],
                ['+81', 10], ['+82', 10], ['+86', 11], ['+91', 10],
            ];
            $c = $countries[array_rand($countries)];
            $callingCode = $c[0];
            $nationalLen = $c[1];
        }

        $national = '';
        for ($i = 0; $i < $nationalLen; $i++) {
            $national .= (string)random_int(0, 9);
        }
        if ($national[0] === '0') {
            $national = '1' . substr($national, 1);
        }

        return $callingCode . $national;
    }

    /**
     * Get national number length for a country calling code
     */
    private function getNationalLength(string $callingCode): int
    {
        // Common national number lengths by calling code
        $lengths = [
            '+1' => 10,    // US/CA
            '+7' => 10,    // Russia/Kazakhstan
            '+20' => 10,   // Egypt
            '+27' => 9,    // South Africa
            '+30' => 10,   // Greece
            '+31' => 9,    // Netherlands
            '+32' => 9,    // Belgium
            '+33' => 10,   // France
            '+34' => 9,    // Spain
            '+39' => 10,   // Italy
            '+40' => 9,    // Romania
            '+41' => 9,    // Switzerland
            '+43' => 10,   // Austria
            '+44' => 10,   // UK
            '+45' => 8,    // Denmark
            '+46' => 9,    // Sweden
            '+47' => 8,    // Norway
            '+48' => 9,    // Poland
            '+49' => 11,   // Germany
            '+51' => 9,    // Peru
            '+52' => 10,   // Mexico
            '+54' => 10,   // Argentina
            '+55' => 10,   // Brazil
            '+56' => 8,    // Chile
            '+57' => 10,   // Colombia
            '+58' => 7,    // Venezuela
            '+60' => 9,    // Malaysia
            '+61' => 9,    // Australia
            '+62' => 10,   // Indonesia
            '+63' => 10,   // Philippines
            '+64' => 8,    // New Zealand
            '+65' => 8,    // Singapore
            '+66' => 9,    // Thailand
            '+81' => 10,   // Japan
            '+82' => 10,   // South Korea
            '+84' => 10,   // Vietnam
            '+86' => 11,   // China
            '+90' => 10,   // Turkey
            '+91' => 10,   // India
            '+92' => 10,   // Pakistan
            '+93' => 9,    // Afghanistan
            '+94' => 9,    // Sri Lanka
            '+95' => 9,    // Myanmar
            '+212' => 9,   // Morocco
            '+213' => 9,   // Algeria
            '+216' => 8,   // Tunisia
            '+218' => 9,   // Libya
            '+220' => 7,   // Gambia
            '+234' => 10,  // Nigeria
            '+254' => 9,   // Kenya
            '+255' => 9,   // Tanzania
            '+256' => 9,   // Uganda
            '+260' => 9,   // Zambia
            '+263' => 9,   // Zimbabwe
            '+351' => 9,   // Portugal
            '+352' => 9,   // Luxembourg
            '+353' => 9,   // Ireland
            '+354' => 7,   // Iceland
            '+358' => 9,   // Finland
            '+359' => 9,   // Bulgaria
            '+360' => 8,   // Greenland
            '+370' => 8,   // Lithuania
            '+371' => 8,   // Latvia
            '+372' => 7,   // Estonia
            '+380' => 9,   // Ukraine
            '+381' => 8,   // Serbia
            '+385' => 8,   // Croatia
            '+386' => 8,   // Slovenia
            '+389' => 8,   // North Macedonia
            '+420' => 9,   // Czech Republic
            '+421' => 9,   // Slovakia
            '+852' => 8,   // Hong Kong
            '+853' => 8,   // Macau
            '+880' => 10,  // Bangladesh
            '+886' => 9,   // Taiwan
            '+960' => 7,   // Maldives
            '+961' => 8,   // Lebanon
            '+962' => 8,   // Jordan
            '+963' => 8,   // Syria
            '+964' => 10,  // Iraq
            '+965' => 7,   // Kuwait
            '+971' => 9,   // UAE
            '+972' => 9,   // Israel
            '+973' => 8,   // Bahrain
            '+974' => 7,   // Qatar
            '+975' => 7,   // Bhutan
            '+976' => 8,   // Mongolia
            '+977' => 10,  // Nepal
            '+992' => 9,   // Tajikistan
            '+993' => 8,   // Turkmenistan
            '+994' => 9,   // Azerbaijan
            '+995' => 9,   // Georgia
        ];

        return $lengths[$callingCode] ?? ($this->ipGeoConfig['fallback_national_len'] ?? 10);
    }

    // ============================================================
    // Battery Info
    // ============================================================

    private function generateBatteryInfo(): array
    {
        return [
            'capacity' => random_int(35, 100),
            'health' => random_int(85, 100),
            'temperature' => random_int(280, 420),
            'voltage' => random_int(3500, 4400),
            'technology' => 'Li-ion',
            'plugged' => random_int(0, 2),
            'status' => random_int(1, 5),
        ];
    }

    // ============================================================
    // UUID (43-char base64url-like)
    // ============================================================

    private function generateUuid(): string
    {
        $bytes = '';
        for ($i = 0; $i < 32; $i++) {
            $bytes .= chr(random_int(0, 255));
        }
        $encoded = rtrim(strtr(base64_encode($bytes), '+/', '-_'), '=');
        return $encoded;
    }

    // ============================================================
    // Product Code
    // ============================================================

    private function generateProductCode(string $deviceCode): string
    {
        $suffixes = ['', '_beta', '_release', '_dev'];
        $suffix = $suffixes[array_rand($suffixes)];
        return $deviceCode . $suffix;
    }

    // ============================================================
    // Bootloader
    // ============================================================

    private function generateBootloader(string $brand, string $deviceCode): string
    {
        $bootloaders = [
            'google' => ['unknown', 'fsl3.0'],
            'samsung' => ['ABLM9645', 'ABLM9646', 'ABLM9647'],
            'xiaomi' => ['unknown', 'XIAOMI_BOOT'],
            'oneplus' => ['unknown', 'ONEPLUS_BOOT'],
            'default' => ['unknown'],
        ];

        $brandLower = strtolower($brand);
        if (isset($bootloaders[$brandLower])) {
            return $bootloaders[$brandLower][array_rand($bootloaders[$brandLower])];
        }
        return 'unknown';
    }

    // ============================================================
    // New Generators for phone/hardware objects
    // ============================================================

    private function getSocManufacturer(string $socModel): string
    {
        if (strpos($socModel, 'Snapdragon') === 0) return 'Qualcomm';
        if (strpos($socModel, 'Dimensity') === 0) return 'MediaTek';
        if (strpos($socModel, 'Exynos') === 0) return 'Samsung';
        if (strpos($socModel, 'Tensor') === 0) return 'Google';
        if (strpos($socModel, 'Kirin') === 0) return 'Huawei';
        return 'Unknown';
    }

    private function getSocHardwareName(): string
    {
        $soc = $this->phone['soc'] ?? '';
        foreach (self::$socHardwareNames as $prefix => $name) {
            if (strpos($soc, $prefix) === 0) return $name;
        }
        return 'generic';
    }

    private function generateMeid(): string
    {
        // 12 hex chars (uppercase)
        $chars = '0123456789ABCDEF';
        $meid = '';
        for ($i = 0; $i < 12; $i++) {
            $meid .= $chars[random_int(0, 15)];
        }
        return $meid;
    }

    private function generateWifiIp(): string
    {
        return '192.168.' . random_int(0, 5) . '.' . random_int(2, 254);
    }

    private function generateWifiName(string $brand): string
    {
        $suffixes = ['_Home', '_5G', '_Office', '', '_B1C9', '_Net'];
        $suffix = $suffixes[array_rand($suffixes)];
        $rand = strtoupper(dechex(random_int(0, 4095)));
        return ucfirst(strtolower($brand)) . $suffix . $rand;
    }

    private function generateCellId(): string
    {
        $hex = function ($len) {
            $chars = '0123456789abcdef';
            $s = '';
            for ($i = 0; $i < $len; $i++) $s .= $chars[random_int(0, 15)];
            return $s;
        };
        return $hex(2) . '.' . $hex(2) . ':' . $hex(2) . ':' . $hex(2) . ':' . $hex(2) . ':' . $hex(2) . ':' . $hex(2);
    }

    private function generateNearCell(): string
    {
        $parts = [];
        $techs = ['LTE', 'UMTS', 'NR', 'LTE'];
        for ($i = 0; $i < 3; $i++) {
            $tech = $techs[array_rand($techs)];
            $cellId = random_int(10000, 99999);
            $arfcn = random_int(100, 268400000);
            $rsrp = random_int(-130, -65);
            $rsrq = random_int(-25, -3);
            $parts[] = sprintf('%s_%d_%.2f_%d,%d', $tech, $cellId, $arfcn, $rsrp, $rsrq);
        }
        return implode(',', $parts);
    }

    private function generateChromeVersion(): string
    {
        $major = random_int(120, 130);
        $build = random_int(0, 6999);
        $patch = random_int(0, 199);
        return sprintf('%d.0.%d.%d', $major, $build, $patch);
    }

    private function generateGpuDriverVersion(): string
    {
        $r = random_int(1, 25);
        $p = random_int(0, 10);
        $sub = sprintf('%02d', random_int(0, 99));
        $hash = substr(md5(uniqid('', true)), 0, 16);
        return sprintf('r%dp%d-%s%s', $r, $p, $sub, $hash);
    }

    /**
     * Generate current CPU frequency (single value from SoC available frequencies).
     * Uses lower-to-mid range frequencies to simulate idle/light load.
     */
    private function generateCurrentFrequency(array $frequencyList): int
    {
        $len = count($frequencyList);
        if ($len <= 1) return $frequencyList[0];
        // Pick from 20%-80% of the frequency list range (simulates idle to medium load)
        $startIdx = (int)floor($len * 0.15);
        $endIdx = (int)floor($len * 0.85);
        if ($endIdx < $startIdx) $endIdx = $len - 1;
        $index = random_int($startIdx, $endIdx);
        return $frequencyList[$index];
    }

    private function generateGpuExtensions(): string
    {
        $extensions = [
            'GL_EXT_debug_marker', 'GL_EXT_robustness', 'GL_EXT_texture_format_BGRA8888',
            'GL_OES_depth24', 'GL_OES_element_index_uint', 'GL_OES_fbo_render_mipmap',
            'GL_OES_texture_3D', 'GL_OES_texture_float', 'GL_OES_texture_half_float',
            'GL_OES_vertex_array_object', 'GL_OES_vertex_half_float', 'GL_EXT_blend_minmax',
            'GL_EXT_color_buffer_float', 'GL_EXT_color_buffer_half_float', 'GL_EXT_discard_framebuffer',
            'GL_EXT_multi_draw_arrays', 'GL_EXT_multisampled_render_to_texture',
            'GL_EXT_read_format_bgra', 'GL_EXT_shader_texture_lod', 'GL_EXT_texture_filter_anisotropic',
            'GL_EXT_texture_format_BGRA8888', 'GL_EXT_texture_storage', 'GL_KHR_blend_equation_advanced',
            'GL_OES_blend_func_separate', 'GL_OES_blend_subtract', 'GL_OES_byte_codes',
            'GL_OES_compressed_ETC1_RGB8_texture', 'GL_OES_depth_texture', 'GL_OES_EGL_image',
        ];
        $count = random_int(10, 20);
        shuffle($extensions);
        return implode(' ', array_slice($extensions, 0, $count));
    }

    private function generateCpuInfo(): string
    {
        $lines = [];
        $lines[] = 'Processor: Aarch64 Processor rev ' . random_int(0, 4) . ' (aarch64)';
        $lines[] = 'MPIPSV: ' . sprintf('%.2f', random_int(4000, 6000) / 100);
        $coreOptions = [4, 6, 8];
        $coreCount = $coreOptions[array_rand($coreOptions)];
        for ($i = 0; $i < $coreCount; $i++) {
            $lines[] = 'processor: ' . $i;
            $lines[] = sprintf('BogoMIPS: %.2f', random_int(3000, 5500) / 100);
        }
        $lines[] = 'Features: fp asimd evtstrm aes pmull sha1 sha2 crc32 atomics fphp asimdhp cpuid asimdrdm dcpop asimddp';
        $lines[] = 'CPU implementer: 0x41';
        $lines[] = 'CPU architecture: 8';
        $lines[] = 'CPU variant: 0x' . dechex(random_int(0, 15));
        $parts = ['0xd0b', '0xd0d', '0xd4d', '0xd4e', '0xd81', '0xd82', '0xd83'];
        $lines[] = 'CPU part: ' . $parts[array_rand($parts)];
        $lines[] = 'CPU revision: ' . random_int(0, 4);
        $lines[] = 'Hardware: ' . $this->getSocHardwareName();
        return implode("\n", $lines) . "\n";
    }

    private function generateBssidMixed(): string
    {
        // Mixed format: xx.xx.xx.xx.xx:xx (dots between first 5 pairs, colon before last)
        $hex = function () {
            return str_pad(dechex(random_int(0, 255)), 2, '0', STR_PAD_LEFT);
        };
        return $hex() . '.' . $hex() . '.' . $hex() . '.' . $hex() . '.' . $hex() . ':' . $hex();
    }

    private function generatePhoneImsi(string $mcc): string
    {
        // 14 digits: MCC (3) + MNC (3) + MSIN (8)
        $net = $this->selectedNetwork;
        $mnc = str_pad($net[1], 3, '0', STR_PAD_LEFT);
        $msin = str_pad((string)random_int(0, 99999999), 8, '0', STR_PAD_LEFT);
        return $mcc . $mnc . $msin;
    }

    private function generateSdsdkid(): string
    {
        // 32 hex chars (128-bit identifier)
        return md5(uniqid('', true));
    }

    // ============================================================
    // Utility
    // ============================================================

    private function slugify(string $text): string
    {
        $text = strtolower(trim($text));
        $text = preg_replace('/[^a-z0-9]+/', '-', $text);
        $text = trim($text, '-');
        return $text ?: 'device';
    }
}