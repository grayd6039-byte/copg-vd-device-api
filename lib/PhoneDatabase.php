<?php
/**
 * Phone Database Manager
 * - Loads built-in phone database from JSON
 * - Optionally scrapes GSMArena for additional phones
 * - Filters out tablets, non-Android devices
 */

class PhoneDatabase
{
    /** @var array Cached phone list */
    private $phones = [];
    /** @var string Data directory */
    private $dataDir;
    /** @var array Scraper config */
    private $scraperConfig;

    public function __construct(string $dataDir, array $scraperConfig = [])
    {
        $this->dataDir = $dataDir;
        $this->scraperConfig = $scraperConfig;
    }

    /**
     * Get a random phone from the database
     * @return array Phone record
     */
    public function getRandomPhone(): array
    {
        $phones = $this->getPhones();
        if (empty($phones)) {
            throw new RuntimeException('No phones in database');
        }
        return $phones[array_rand($phones)];
    }

    /**
     * Get all phones, loading from cache or scraping if needed
     * @return array
     */
    public function getPhones(): array
    {
        if (!empty($this->phones)) {
            return $this->phones;
        }

        // Try loading from cached file first
        $cached = $this->loadCached();
        if ($cached !== null) {
            $this->phones = $cached;
            return $this->phones;
        }

        // Try scraping GSMArena
        if (!empty($this->scraperConfig['enabled'])) {
            $scraped = $this->scrapeGsmArena();
            if (!empty($scraped)) {
                $this->phones = array_merge($this->loadBuiltIn(), $scraped);
                $this->saveCache($this->phones);
                return $this->phones;
            }
        }

        // Fallback to built-in database
        $this->phones = $this->loadBuiltIn();
        return $this->phones;
    }

    /**
     * Load built-in phone database
     * @return array
     */
    private function loadBuiltIn(): array
    {
        $file = $this->dataDir . '/phones.json';
        if (!file_exists($file)) {
            return [];
        }
        $content = file_get_contents($file);
        $data = json_decode($content, true);
        return is_array($data) ? $data : [];
    }

    /**
     * Load cached phones from data directory
     * @return array|null
     */
    private function loadCached(): ?array
    {
        $file = $this->dataDir . '/phones_cache.json';
        if (!file_exists($file)) {
            return null;
        }

        $content = file_get_contents($file);
        $data = json_decode($content, true);

        if (!is_array($data) || !isset($data['phones'])) {
            return null;
        }

        // Check TTL
        $ttl = $this->scraperConfig['cache_ttl'] ?? 86400;
        if (isset($data['timestamp']) && (time() - $data['timestamp']) > $ttl) {
            return null;
        }

        return $data['phones'];
    }

    /**
     * Save phones to cache
     * @param array $phones
     */
    private function saveCache(array $phones): void
    {
        $file = $this->dataDir . '/phones_cache.json';
        $data = [
            'timestamp' => time(),
            'phones' => $phones,
        ];
        @file_put_contents($file, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    }

    /**
     * Scrape GSMArena for Android phone data
     * @return array
     */
    private function scrapeGsmArena(): array
    {
        $timeout = $this->scraperConfig['timeout'] ?? 15;
        $userAgent = $this->scraperConfig['user_agent'] ?? 'Mozilla/5.0';

        $phones = [];

        // Major Android brands to scrape
        $brands = [
            'samsung' => ['Samsung', 'Samsung'],
            'google' => ['Google', 'Google'],
            'xiaomi' => ['Xiaomi', 'Xiaomi'],
            'oneplus' => ['OnePlus', 'OnePlus'],
            'oppo' => ['OPPO', 'OPPO'],
            'vivo' => ['Vivo', 'Vivo'],
            'motorola' => ['Motorola', 'Motorola'],
            'sony' => ['Sony', 'Sony'],
            'huawei' => ['Huawei', 'Huawei'],
            'honor' => ['Honor', 'Honor'],
            'lg' => ['LG', 'LG Electronics'],
            'nothing' => ['Nothing', 'Nothing'],
            'asus' => ['ASUS', 'ASUS'],
            'realme' => ['Realme', 'Realme'],
            'tecno' => ['Tecno', 'Transsion'],
        ];

        foreach ($brands as $brandKey => $brandInfo) {
            $brandName = $brandInfo[0];
            $manufacturer = $brandInfo[1];
            $phones[] = $this->scrapeBrand($brandKey, $brandName, $manufacturer, $timeout, $userAgent);
        }

        // Flatten and filter
        $allPhones = array_merge(...array_filter($phones));
        return $this->filterPhones($allPhones);
    }

    /**
     * Scrape a single brand's phones from GSMArena
     * @return array
     */
    private function scrapeBrand(string $brandKey, string $brandName, string $manufacturer, int $timeout, string $userAgent): array
    {
        $url = "https://www.gsmarena.com/results.php3?sMakers=" . urlencode($brandName);
        $phones = [];

        try {
            $ch = curl_init();
            curl_setopt_array($ch, [
                CURLOPT_URL => $url,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => $timeout,
                CURLOPT_USERAGENT => $userAgent,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_SSL_VERIFYPEER => false,
                CURLOPT_SSL_VERIFYHOST => false,
                CURLOPT_HTTPHEADER => [
                    'Accept: text/html,application/xhtml+xml',
                    'Accept-Language: en-US,en;q=0.9',
                ],
            ]);

            $html = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            if ($httpCode !== 200 || empty($html)) {
                return [];
            }

            // Check for Cloudflare challenge
            if (strpos($html, 'One quick check') !== false || strpos($html, 'cf-browser-verification') !== false) {
                return [];
            }

            // Parse phone entries from HTML
            // GSMArena uses <div class="specs"> with links like /samsung_galaxy_s25-13468.php
            $pattern = '/<a[^>]*href="\/([a-z0-9_]+)-(\d+)\.php"[^>]*>(.*?)<\/a>/si';
            if (preg_match_all($pattern, $html, $matches, PREG_SET_ORDER)) {
                foreach ($matches as $match) {
                    $slug = $match[1];
                    $id = $match[2];
                    $name = trim(html_entity_decode(strip_tags($match[3])));

                    // Skip if name is empty or looks like a tablet
                    if (empty($name) || strlen($name) < 3) {
                        continue;
                    }

                    // Filter out tablets
                    if ($this->isTablet($name, $brandName)) {
                        continue;
                    }

                    // Extract device code from slug (first part before first underscore or number)
                    $deviceCode = $this->extractDeviceCode($slug, $brandKey);

                    $phones[] = [
                        'brand' => strtolower($brandName),
                        'manufacturer' => $manufacturer,
                        'model' => $name,
                        'device_code' => $deviceCode,
                        'gsmarena_id' => $id,
                        'source' => 'gsmarena',
                    ];
                }
            }
        } catch (Exception $e) {
            // Silently fail for individual brands
        }

        return $phones;
    }

    /**
     * Filter out non-phone devices (tablets, watches, etc.)
     * @param array $phones
     * @return array
     */
    private function filterPhones(array $phones): array
    {
        $filtered = [];
        foreach ($phones as $phone) {
            if ($this->isTablet($phone['model'], $phone['brand'])) {
                continue;
            }
            // Remove duplicates by model + brand
            $key = strtolower($phone['brand'] . '|' . $phone['model']);
            if (!isset($filtered[$key])) {
                $filtered[$key] = $phone;
            }
        }
        return array_values($filtered);
    }

    /**
     * Check if a device is likely a tablet
     * @param string $name
     * @param string $brand
     * @return bool
     */
    private function isTablet(string $name, string $brand): bool
    {
        $tabletKeywords = [
            'tab', 'pad', 'tablet', 'ipad', 'galaxy tab', 'pixel tablet',
            'matepad', 'magic pad', 'tab s', 'tab a', 'tab p',
            'nova tab', 'tab c', 'tab 8', 'tab 10', 'tab 11',
        ];

        $nameLower = strtolower($name);
        foreach ($tabletKeywords as $keyword) {
            if (strpos($nameLower, $keyword) !== false) {
                return true;
            }
        }

        // Brand-specific tablet patterns
        if (strpos($nameLower, 'galaxy tab') !== false) return true;
        if (strpos($nameLower, 'ipad') !== false) return true;
        if (strpos($nameLower, 'tab ') !== false && strpos($nameLower, 'tab s') === false) return true;

        return false;
    }

    /**
     * Extract device code from GSMArena slug
     * @param string $slug e.g. "samsung_galaxy_s25"
     * @param string $brandKey
     * @return string
     */
    private function extractDeviceCode(string $slug, string $brandKey): string
    {
        // Remove brand prefix from slug
        $slugLower = strtolower($slug);

        // Try to extract the model-specific part
        // e.g., "samsung_galaxy_s25" -> "s25"
        // e.g., "google_pixel_9" -> "blazer" (but we don't know this from slug alone)
        // For simplicity, use the last meaningful part

        $parts = explode('_', $slugLower);
        // Remove brand and common prefixes
        $filtered = array_filter($parts, function ($part) use ($brandKey) {
            return $part !== $brandKey && !in_array($part, ['galaxy', 'pixel', 'phone', 'smartphone']);
        });

        if (!empty($filtered)) {
            // Use the last part as device code
            return end($filtered);
        }

        // Fallback: use full slug minus brand
        $slugWithoutBrand = str_replace($brandKey . '_', '', $slugLower);
        return $slugWithoutBrand ?: 'device';
    }
}
