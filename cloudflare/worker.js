/**
 * COPG-VD Android Device Info Generator API — Cloudflare Workers 单文件实现
 *
 * 移植自：
 *   api/index.php（路由 / 鉴权 / 响应包装 / IP 定位入口）
 *   api/config.php（api_key、android_versions、ip_geolocation 回退值）
 *   api/lib/DataGenerator.php（核心生成逻辑）
 *   api/lib/JsonValidator.php（validate=1 的校验规则）
 *   api/lib/PhoneDatabase.php + api/data/phones.json（手机库与随机抽样）
 *
 * 约束：无 npm 依赖、无 Node API（无 fs/path/Buffer/process），仅标准 JS + Web 标准。
 * 随机数全部来自 crypto.getRandomValues（均匀分布，等价 PHP random_int）。
 */

/* ============================================================
 * 配置（对应 api/config.php）
 * ============================================================ */

const DEFAULT_API_KEY = 'mecg-so-2026';       // config.php => api_key
const ANDROID_VERSIONS = [33, 34, 35, 36];      // 只生成 Android 13/14/15/16
const CORS_ENABLED = true;                    // config.php => cors.enabled
const CORS_ORIGIN = '*';                      // config.php => cors.origin
const GEO_FALLBACK_COUNTRY_CODE = '+1';       // config.php => ip_geolocation.fallback_country_code
const GEO_FALLBACK_NATIONAL_LEN = 10;         // config.php => ip_geolocation.fallback_national_len

/* IP 地理定位接口（替代原 ipgeolocation.io；返回 ipgeolocation.io 兼容结构，但无 calling_code 字段） */
const GEO_API_URL = 'https://ip.yowao.xyz/ipgeo-dbip/ipgeo';
const GEO_API_TIMEOUT_MS = 3000;
const GEO_CACHE_TTL_MS = 60 * 60 * 1000;      // 同一 IP 的地理结果缓存 1 小时
const GEO_CACHE_MAX = 500;

/* 内核版本：一律使用 Android System WebView 真实稳定构建号（不再随机编造 build/patch）
 * 数据源 chromiumdash 的 Webview 频道，只采集官方实际发布过的版本 */
const WEBVIEW_VERSION_SOURCE =
  'https://chromiumdash.appspot.com/fetch_releases?channel=Stable&platform=Webview&num=100';
const WEBVIEW_KEEP_MILESTONES = 4;             // 始终保留最新 4 个主版本（采到新的就丢掉最低的）
const WEBVIEW_MAX_PATCHES = 12;                // 每个主版本最多保留 12 个真实补丁号
const WEBVIEW_VERSION_TTL_MS = 6 * 60 * 60 * 1000;   // 每 6 小时检查一次是否有新版本
const WEBVIEW_CACHE_KEY = 'https://mecg-so-webview-cache.internal/versions.json';

/* 兜底种子：当前官方稳定版 M154-M157（与 chromiumdash 一致）。
 * 采集失败时直接用它，保证出参永远是真实内核版本号。 */
const WEBVIEW_VERSION_SEED = {
  154: ['154.0.8037.22', '154.0.8037.49', '154.0.8037.57', '154.0.8037.58',
        '154.0.8037.59', '154.0.8037.101', '154.0.8037.106', '154.0.8037.107'],
  155: ['155.0.8059.16', '155.0.8059.30', '155.0.8059.43', '155.0.8059.44',
        '155.0.8059.45', '155.0.8059.46'],
  156: ['156.0.8078.25', '156.0.8078.39', '156.0.8078.47', '156.0.8078.48',
        '156.0.8078.49', '156.0.8078.50'],
  157: ['157.0.8103.14', '157.0.8103.30', '157.0.8103.38']
};

/* ============================================================
 * 手机数据库（内联自 api/data/phones.json，70 条，原样保留）
 * ============================================================ */

const PHONES = [
  {"brand":"google","manufacturer":"Google","model":"Pixel 9a","device_code":"tegu","soc":"Tensor G4","launch":34,"max":36,"screen_density":2.7,"screen_width":1080,"screen_height":2424},
  {"brand":"google","manufacturer":"Google","model":"Pixel 9","device_code":"tokay","soc":"Tensor G4","launch":34,"max":36,"screen_density":2.75,"screen_width":1080,"screen_height":2424},
  {"brand":"google","manufacturer":"Google","model":"Pixel 9 Pro","device_code":"caiman","soc":"Tensor G4","launch":34,"max":36,"screen_density":2.75,"screen_width":1280,"screen_height":2856},
  {"brand":"google","manufacturer":"Google","model":"Pixel 9 Pro XL","device_code":"komodo","soc":"Tensor G4","launch":34,"max":36,"screen_density":2.75,"screen_width":1344,"screen_height":2992},
  {"brand":"google","manufacturer":"Google","model":"Pixel 8","device_code":"shiba","soc":"Tensor G3","launch":34,"max":35,"screen_density":2.75,"screen_width":1080,"screen_height":2400},
  {"brand":"google","manufacturer":"Google","model":"Pixel 8 Pro","device_code":"husky","soc":"Tensor G3","launch":34,"max":35,"screen_density":2.75,"screen_width":1344,"screen_height":2992},
  {"brand":"google","manufacturer":"Google","model":"Pixel 7a","device_code":"lynx","soc":"Tensor G2","launch":33,"max":35,"screen_density":2.5,"screen_width":1080,"screen_height":2400},
  {"brand":"google","manufacturer":"Google","model":"Pixel 7","device_code":"panther","soc":"Tensor G2","launch":33,"max":35,"screen_density":2.5,"screen_width":1080,"screen_height":2400},
  {"brand":"google","manufacturer":"Google","model":"Pixel 7 Pro","device_code":"cheetah","soc":"Tensor G2","launch":33,"max":35,"screen_density":2.5,"screen_width":1440,"screen_height":3120},
  {"brand":"samsung","manufacturer":"Samsung Electronics","model":"Galaxy S25 Ultra","device_code":"e3q","soc":"Snapdragon 8 Elite","launch":35,"max":36,"screen_density":2.6,"screen_width":1440,"screen_height":3120},
  {"brand":"samsung","manufacturer":"Samsung Electronics","model":"Galaxy S25+","device_code":"e3s","soc":"Snapdragon 8 Elite","launch":35,"max":36,"screen_density":2.6,"screen_width":1440,"screen_height":3120},
  {"brand":"samsung","manufacturer":"Samsung Electronics","model":"Galaxy S25","device_code":"e3q","soc":"Snapdragon 8 Elite","launch":35,"max":36,"screen_density":2.6,"screen_width":1080,"screen_height":2340},
  {"brand":"samsung","manufacturer":"Samsung Electronics","model":"Galaxy S24 Ultra","device_code":"e5q","soc":"Snapdragon 8 Gen 3","launch":34,"max":36,"screen_density":2.6,"screen_width":1440,"screen_height":3120},
  {"brand":"samsung","manufacturer":"Samsung Electronics","model":"Galaxy S24+","device_code":"e5s","soc":"Exynos 2400","launch":34,"max":36,"screen_density":2.6,"screen_width":1440,"screen_height":3120},
  {"brand":"samsung","manufacturer":"Samsung Electronics","model":"Galaxy S24","device_code":"e5q","soc":"Exynos 2400","launch":34,"max":36,"screen_density":2.6,"screen_width":1080,"screen_height":2340},
  {"brand":"samsung","manufacturer":"Samsung Electronics","model":"Galaxy S23 Ultra","device_code":"dm3q","soc":"Snapdragon 8 Gen 2","launch":33,"max":36,"screen_density":2.6,"screen_width":1440,"screen_height":3088},
  {"brand":"samsung","manufacturer":"Samsung Electronics","model":"Galaxy S23+","device_code":"dm3s","soc":"Snapdragon 8 Gen 2","launch":33,"max":36,"screen_density":2.6,"screen_width":1080,"screen_height":2340},
  {"brand":"samsung","manufacturer":"Samsung Electronics","model":"Galaxy S23","device_code":"dm3q","soc":"Snapdragon 8 Gen 2","launch":33,"max":36,"screen_density":2.6,"screen_width":1080,"screen_height":2340},
  {"brand":"samsung","manufacturer":"Samsung Electronics","model":"Galaxy A56","device_code":"a56","soc":"Exynos 1580","launch":35,"max":36,"screen_density":2.25,"screen_width":1080,"screen_height":2340},
  {"brand":"samsung","manufacturer":"Samsung Electronics","model":"Galaxy A36","device_code":"a36","soc":"Exynos 1380","launch":35,"max":36,"screen_density":2.25,"screen_width":1080,"screen_height":2340},
  {"brand":"samsung","manufacturer":"Samsung Electronics","model":"Galaxy A26","device_code":"a26","soc":"Exynos 1380","launch":35,"max":36,"screen_density":2.25,"screen_width":1080,"screen_height":2340},
  {"brand":"samsung","manufacturer":"Samsung Electronics","model":"Galaxy Z Fold7","device_code":"fold7","soc":"Snapdragon 8 Elite","launch":35,"max":36,"screen_density":2.6,"screen_width":1080,"screen_height":2520},
  {"brand":"samsung","manufacturer":"Samsung Electronics","model":"Galaxy Z Flip7","device_code":"flip7","soc":"Exynos 2500","launch":35,"max":36,"screen_density":2.6,"screen_width":1080,"screen_height":2520},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Xiaomi 15 Ultra","device_code":"cassian","soc":"Snapdragon 8 Elite","launch":35,"max":36,"screen_density":2.75,"screen_width":1440,"screen_height":3200},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Xiaomi 15 Pro","device_code":"dada","soc":"Snapdragon 8 Elite","launch":35,"max":36,"screen_density":2.75,"screen_width":1440,"screen_height":3200},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Xiaomi 15","device_code":"dada","soc":"Snapdragon 8 Elite","launch":35,"max":36,"screen_density":2.75,"screen_width":1200,"screen_height":2670},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Xiaomi 14 Ultra","device_code":"aurora","soc":"Snapdragon 8 Gen 3","launch":34,"max":36,"screen_density":2.75,"screen_width":1440,"screen_height":3200},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Xiaomi 14 Pro","device_code":"titi","soc":"Snapdragon 8 Gen 3","launch":34,"max":36,"screen_density":2.75,"screen_width":1440,"screen_height":3200},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Xiaomi 14","device_code":"titi","soc":"Snapdragon 8 Gen 3","launch":34,"max":36,"screen_density":2.75,"screen_width":1200,"screen_height":2670},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Redmi Note 14 Pro","device_code":"ruby","soc":"Dimensity 7300 Ultra","launch":34,"max":36,"screen_density":2.25,"screen_width":1220,"screen_height":2712},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Redmi Note 14","device_code":"ruby","soc":"Dimensity 7025 Ultra","launch":34,"max":35,"screen_density":2.25,"screen_width":1080,"screen_height":2400},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Redmi K80 Pro","device_code":"inui","soc":"Snapdragon 8 Elite","launch":35,"max":36,"screen_density":2.75,"screen_width":1440,"screen_height":3200},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Redmi K80","device_code":"inui","soc":"Snapdragon 8 Gen 3","launch":35,"max":36,"screen_density":2.75,"screen_width":1440,"screen_height":3200},
  {"brand":"oneplus","manufacturer":"OnePlus","model":"OnePlus 13","device_code":"CPH2581","soc":"Snapdragon 8 Elite","launch":35,"max":36,"screen_density":2.75,"screen_width":1440,"screen_height":3168},
  {"brand":"oneplus","manufacturer":"OnePlus","model":"OnePlus 12","device_code":"CPH2483","soc":"Snapdragon 8 Gen 3","launch":34,"max":36,"screen_density":2.75,"screen_width":1440,"screen_height":3168},
  {"brand":"oneplus","manufacturer":"OnePlus","model":"OnePlus 12R","device_code":"CPH2561","soc":"Snapdragon 8 Gen 2","launch":34,"max":36,"screen_density":2.75,"screen_width":1264,"screen_height":2780},
  {"brand":"oneplus","manufacturer":"OnePlus","model":"OnePlus Nord 4","device_code":"CPH2589","soc":"Snapdragon 7+ Gen 3","launch":34,"max":36,"screen_density":2.25,"screen_width":1240,"screen_height":2772},
  {"brand":"oneplus","manufacturer":"OnePlus","model":"OnePlus Nord CE4","device_code":"CPH2631","soc":"Snapdragon 7 Gen 3","launch":34,"max":35,"screen_density":2.25,"screen_width":1080,"screen_height":2400},
  {"brand":"oppo","manufacturer":"OPPO","model":"OPPO Find X8 Pro","device_code":"OP5A39L1","soc":"Dimensity 9400","launch":35,"max":36,"screen_density":2.75,"screen_width":1264,"screen_height":2780},
  {"brand":"oppo","manufacturer":"OPPO","model":"OPPO Find X8","device_code":"OP5A39L1","soc":"Dimensity 9400","launch":35,"max":36,"screen_density":2.75,"screen_width":1256,"screen_height":2760},
  {"brand":"oppo","manufacturer":"OPPO","model":"OPPO Reno 13 Pro","device_code":"OP5E1FL1","soc":"Dimensity 8350","launch":35,"max":36,"screen_density":2.25,"screen_width":1272,"screen_height":2800},
  {"brand":"oppo","manufacturer":"OPPO","model":"OPPO A3 Pro","device_code":"OP5D41L1","soc":"Dimensity 7050","launch":34,"max":35,"screen_density":2.25,"screen_width":1080,"screen_height":2412},
  {"brand":"vivo","manufacturer":"Vivo","model":"Vivo X200 Pro","device_code":"PD2341","soc":"Dimensity 9400","launch":35,"max":36,"screen_density":2.75,"screen_width":1260,"screen_height":2800},
  {"brand":"vivo","manufacturer":"Vivo","model":"Vivo X200","device_code":"PD2341","soc":"Dimensity 9400","launch":35,"max":36,"screen_density":2.75,"screen_width":1260,"screen_height":2800},
  {"brand":"vivo","manufacturer":"Vivo","model":"Vivo S20 Pro","device_code":"V2367A","soc":"Dimensity 9300+","launch":34,"max":35,"screen_density":2.25,"screen_width":1260,"screen_height":2800},
  {"brand":"vivo","manufacturer":"Vivo","model":"Vivo Y300","device_code":"V2354","soc":"Dimensity 7300","launch":34,"max":35,"screen_density":2.25,"screen_width":1080,"screen_height":2392},
  {"brand":"motorola","manufacturer":"Motorola Mobility","model":"Moto X50 Ultra","device_code":"xt2417-3","soc":"Snapdragon 8s Gen 3","launch":34,"max":35,"screen_density":2.25,"screen_width":1220,"screen_height":2712},
  {"brand":"motorola","manufacturer":"Motorola Mobility","model":"Moto Edge 60 Pro","device_code":"xt2445-4","soc":"Dimensity 8350","launch":35,"max":36,"screen_density":2.25,"screen_width":1220,"screen_height":2712},
  {"brand":"motorola","manufacturer":"Motorola Mobility","model":"Moto G85","device_code":"xt2397-5","soc":"Snapdragon 6s Gen 3","launch":34,"max":35,"screen_density":2.25,"screen_width":1080,"screen_height":2400},
  {"brand":"motorola","manufacturer":"Motorola Mobility","model":"Moto G84","device_code":"xt2383-6","soc":"Snapdragon 695","launch":33,"max":34,"screen_density":2.25,"screen_width":1080,"screen_height":2400},
  {"brand":"sony","manufacturer":"Sony Corporation","model":"Xperia 1 VI","device_code":"a5","soc":"Snapdragon 8 Gen 3","launch":34,"max":36,"screen_density":2.75,"screen_width":1080,"screen_height":2340},
  {"brand":"sony","manufacturer":"Sony Corporation","model":"Xperia 5 V","device_code":"a4","soc":"Snapdragon 8 Gen 2","launch":33,"max":35,"screen_density":2.75,"screen_width":1080,"screen_height":2520},
  {"brand":"sony","manufacturer":"Sony Corporation","model":"Xperia 10 VII","device_code":"a3","soc":"Snapdragon 6 Gen 3","launch":35,"max":36,"screen_density":2.25,"screen_width":1080,"screen_height":2340},
  {"brand":"honor","manufacturer":"Honor Device Co.","model":"Honor Magic7 Pro","device_code":"MGI-AN00","soc":"Snapdragon 8 Elite","launch":35,"max":36,"screen_density":2.75,"screen_width":1280,"screen_height":2800},
  {"brand":"honor","manufacturer":"Honor Device Co.","model":"Honor Magic7","device_code":"MGI-AN00","soc":"Snapdragon 8 Elite","launch":35,"max":36,"screen_density":2.75,"screen_width":1264,"screen_height":2800},
  {"brand":"honor","manufacturer":"Honor Device Co.","model":"Honor X60 Pro","device_code":"HRY-LX9","soc":"Dimensity 7025","launch":34,"max":35,"screen_density":2.25,"screen_width":1224,"screen_height":2700},
  {"brand":"nothing","manufacturer":"Nothing Technology","model":"Nothing Phone (3)","device_code":"nova","soc":"Snapdragon 8s Gen 3","launch":35,"max":36,"screen_density":2.75,"screen_width":1260,"screen_height":2800},
  {"brand":"nothing","manufacturer":"Nothing Technology","model":"Nothing Phone (2a)","device_code":"nova","soc":"Dimensity 7200 Pro","launch":34,"max":35,"screen_density":2.25,"screen_width":1084,"screen_height":2412},
  {"brand":"asus","manufacturer":"ASUSTeK Computer","model":"ROG Phone 9 Pro","device_code":"ZS760KL","soc":"Snapdragon 8 Elite","launch":35,"max":36,"screen_density":2.75,"screen_width":1080,"screen_height":2400},
  {"brand":"asus","manufacturer":"ASUSTeK Computer","model":"Zenfone 11 Ultra","device_code":"ZS790KS","soc":"Snapdragon 8 Gen 3","launch":34,"max":35,"screen_density":2.75,"screen_width":1080,"screen_height":2400},
  {"brand":"realme","manufacturer":"Realme","model":"Realme GT 6","device_code":"RMX3858","soc":"Snapdragon 8s Gen 3","launch":34,"max":35,"screen_density":2.25,"screen_width":1264,"screen_height":2780},
  {"brand":"realme","manufacturer":"Realme","model":"Realme 13 Pro+","device_code":"RMX3932","soc":"Snapdragon 7s Gen 2","launch":34,"max":35,"screen_density":2.25,"screen_width":1080,"screen_height":2412},
  {"brand":"realme","manufacturer":"Realme","model":"Realme C67","device_code":"RMX3810","soc":"Snapdragon 685","launch":34,"max":34,"screen_density":2.25,"screen_width":1080,"screen_height":2400},
  {"brand":"google","manufacturer":"Google","model":"Pixel 8a","device_code":"akita","soc":"Tensor G3","launch":34,"max":35,"screen_density":2.75,"screen_width":1080,"screen_height":2400},
  {"brand":"samsung","manufacturer":"Samsung Electronics","model":"Galaxy S24 FE","device_code":"r12s","soc":"Exynos 2400e","launch":34,"max":36,"screen_density":2.6,"screen_width":1080,"screen_height":2340},
  {"brand":"samsung","manufacturer":"Samsung Electronics","model":"Galaxy S23 FE","device_code":"r11s","soc":"Exynos 2200","launch":33,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2340},
  {"brand":"samsung","manufacturer":"Samsung Electronics","model":"Galaxy A55","device_code":"a55","soc":"Exynos 1480","launch":34,"max":36,"screen_density":2.6,"screen_width":1080,"screen_height":2340},
  {"brand":"samsung","manufacturer":"Samsung Electronics","model":"Galaxy A35","device_code":"a35","soc":"Exynos 1380","launch":34,"max":36,"screen_density":2.6,"screen_width":1080,"screen_height":2340},
  {"brand":"samsung","manufacturer":"Samsung Electronics","model":"Galaxy A25","device_code":"a25","soc":"Exynos 1280","launch":34,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2340},
  {"brand":"samsung","manufacturer":"Samsung Electronics","model":"Galaxy A16 5G","device_code":"a16","soc":"Dimensity 6300","launch":34,"max":36,"screen_density":2.6,"screen_width":1080,"screen_height":2340},
  {"brand":"samsung","manufacturer":"Samsung Electronics","model":"Galaxy Z Fold6","device_code":"fold6","soc":"Snapdragon 8 Gen 3","launch":34,"max":36,"screen_density":2.6,"screen_width":968,"screen_height":2376},
  {"brand":"samsung","manufacturer":"Samsung Electronics","model":"Galaxy Z Flip6","device_code":"flip6","soc":"Snapdragon 8 Gen 3","launch":34,"max":36,"screen_density":2.6,"screen_width":1080,"screen_height":2640},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Xiaomi 13","device_code":"fuxi","soc":"Snapdragon 8 Gen 2","launch":33,"max":35,"screen_density":2.75,"screen_width":1080,"screen_height":2400},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Xiaomi 13 Pro","device_code":"nuwa","soc":"Snapdragon 8 Gen 2","launch":33,"max":35,"screen_density":2.75,"screen_width":1440,"screen_height":3200},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Xiaomi 13 Ultra","device_code":"ishtar","soc":"Snapdragon 8 Gen 2","launch":33,"max":35,"screen_density":2.75,"screen_width":1440,"screen_height":3200},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Xiaomi 14T","device_code":"degas","soc":"Dimensity 7300 Ultra","launch":34,"max":35,"screen_density":2.75,"screen_width":1220,"screen_height":2712},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Xiaomi 14T Pro","device_code":"rotko","soc":"Dimensity 9300+","launch":34,"max":35,"screen_density":2.75,"screen_width":1220,"screen_height":2712},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Redmi Note 13 Pro","device_code":"garnet","soc":"Dimensity 7200 Ultra","launch":33,"max":35,"screen_density":2.75,"screen_width":1220,"screen_height":2712},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Redmi K70","device_code":"vermeer","soc":"Snapdragon 8 Gen 2","launch":34,"max":35,"screen_density":2.75,"screen_width":1440,"screen_height":3200},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Redmi K70 Pro","device_code":"manet","soc":"Snapdragon 8 Gen 3","launch":34,"max":35,"screen_density":2.75,"screen_width":1440,"screen_height":3200},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Poco F6","device_code":"peridot","soc":"Snapdragon 8s Gen 3","launch":34,"max":35,"screen_density":2.75,"screen_width":1220,"screen_height":2712},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Poco X6 Pro","device_code":"duchamp","soc":"Dimensity 8300 Ultra","launch":34,"max":35,"screen_density":2.75,"screen_width":1220,"screen_height":2712},
  {"brand":"oneplus","manufacturer":"OnePlus","model":"OnePlus 11","device_code":"CPH2449","soc":"Snapdragon 8 Gen 2","launch":33,"max":35,"screen_density":2.75,"screen_width":1440,"screen_height":3216},
  {"brand":"oneplus","manufacturer":"OnePlus","model":"OnePlus 13R","device_code":"CPH2649","soc":"Snapdragon 8 Gen 3","launch":35,"max":36,"screen_density":2.75,"screen_width":1264,"screen_height":2780},
  {"brand":"oneplus","manufacturer":"OnePlus","model":"OnePlus Nord 3","device_code":"CPH2493","soc":"Dimensity 9000","launch":33,"max":35,"screen_density":2.75,"screen_width":1240,"screen_height":2772},
  {"brand":"oneplus","manufacturer":"OnePlus","model":"OnePlus Nord CE4 Lite","device_code":"CPH2623","soc":"Snapdragon 695","launch":34,"max":35,"screen_density":2.75,"screen_width":1080,"screen_height":2400},
  {"brand":"oppo","manufacturer":"OPPO","model":"OPPO Find X7","device_code":"PHZ110","soc":"Dimensity 9300","launch":34,"max":35,"screen_density":2.75,"screen_width":1264,"screen_height":2780},
  {"brand":"oppo","manufacturer":"OPPO","model":"OPPO Find X7 Ultra","device_code":"PHY110","soc":"Dimensity 9300","launch":34,"max":35,"screen_density":2.75,"screen_width":1440,"screen_height":3168},
  {"brand":"oppo","manufacturer":"OPPO","model":"OPPO Reno 12","device_code":"CPH2625","soc":"Dimensity 7300","launch":34,"max":35,"screen_density":2.25,"screen_width":1080,"screen_height":2412},
  {"brand":"oppo","manufacturer":"OPPO","model":"OPPO Reno 11","device_code":"CPH2599","soc":"Dimensity 7050","launch":33,"max":35,"screen_density":2.25,"screen_width":1080,"screen_height":2412},
  {"brand":"oppo","manufacturer":"OPPO","model":"OPPO Find N3 Flip","device_code":"PHT110","soc":"Dimensity 9200","launch":33,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2520},
  {"brand":"vivo","manufacturer":"Vivo","model":"Vivo X100","device_code":"V2309A","soc":"Dimensity 9300","launch":34,"max":35,"screen_density":2.75,"screen_width":1260,"screen_height":2800},
  {"brand":"vivo","manufacturer":"Vivo","model":"Vivo X100 Pro","device_code":"V2324A","soc":"Dimensity 9300","launch":34,"max":35,"screen_density":2.75,"screen_width":1260,"screen_height":2800},
  {"brand":"vivo","manufacturer":"Vivo","model":"Vivo X90","device_code":"V2218A","soc":"Dimensity 9200","launch":33,"max":35,"screen_density":2.75,"screen_width":1260,"screen_height":2800},
  {"brand":"vivo","manufacturer":"Vivo","model":"Vivo S20","device_code":"V2429A","soc":"Dimensity 9200","launch":34,"max":35,"screen_density":2.75,"screen_width":1260,"screen_height":2800},
  {"brand":"vivo","manufacturer":"Vivo","model":"Vivo V30","device_code":"V2318","soc":"Dimensity 8200","launch":34,"max":35,"screen_density":2.75,"screen_width":1260,"screen_height":2800},
  {"brand":"vivo","manufacturer":"Vivo","model":"iQOO 12","device_code":"V2307A","soc":"Snapdragon 8 Gen 3","launch":34,"max":35,"screen_density":2.75,"screen_width":1260,"screen_height":2800},
  {"brand":"motorola","manufacturer":"Motorola Mobility","model":"Moto Edge 50 Ultra","device_code":"xt2401-1","soc":"Snapdragon 8s Gen 3","launch":34,"max":35,"screen_density":2.75,"screen_width":1220,"screen_height":2712},
  {"brand":"motorola","manufacturer":"Motorola Mobility","model":"Moto Edge 50 Pro","device_code":"xt2403-2","soc":"Snapdragon 7 Gen 3","launch":34,"max":35,"screen_density":2.75,"screen_width":1220,"screen_height":2712},
  {"brand":"motorola","manufacturer":"Motorola Mobility","model":"Moto Razr 50 Ultra","device_code":"xt2451-1","soc":"Snapdragon 8s Gen 3","launch":34,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2640},
  {"brand":"motorola","manufacturer":"Motorola Mobility","model":"Moto G Power 5G (2024)","device_code":"xt2415-3","soc":"Dimensity 7025","launch":34,"max":35,"screen_density":2.25,"screen_width":1080,"screen_height":2400},
  {"brand":"sony","manufacturer":"Sony Corporation","model":"Xperia 1 V","device_code":"a2","soc":"Snapdragon 8 Gen 2","launch":33,"max":34,"screen_density":4.0,"screen_width":1644,"screen_height":3840},
  {"brand":"sony","manufacturer":"Sony Corporation","model":"Xperia 10 VI","device_code":"a1","soc":"Snapdragon 6 Gen 1","launch":34,"max":35,"screen_density":2.75,"screen_width":1080,"screen_height":2520},
  {"brand":"sony","manufacturer":"Sony Corporation","model":"Xperia 1 VII","device_code":"a6","soc":"Snapdragon 8 Elite","launch":35,"max":36,"screen_density":2.75,"screen_width":1080,"screen_height":2340},
  {"brand":"honor","manufacturer":"Honor Device Co.","model":"Honor Magic6","device_code":"BVL-AN00","soc":"Snapdragon 8 Gen 3","launch":34,"max":35,"screen_density":2.75,"screen_width":1264,"screen_height":2800},
  {"brand":"honor","manufacturer":"Honor Device Co.","model":"Honor Magic6 Pro","device_code":"BVL-AN16","soc":"Snapdragon 8 Gen 3","launch":34,"max":35,"screen_density":2.75,"screen_width":1280,"screen_height":2800},
  {"brand":"honor","manufacturer":"Honor Device Co.","model":"Honor Magic V3","device_code":"FCP-AN10","soc":"Snapdragon 8 Gen 3","launch":34,"max":35,"screen_density":2.6,"screen_width":1060,"screen_height":2376},
  {"brand":"honor","manufacturer":"Honor Device Co.","model":"Honor 200","device_code":"ELI-AN00","soc":"Snapdragon 7 Gen 3","launch":34,"max":35,"screen_density":2.75,"screen_width":1200,"screen_height":2664},
  {"brand":"honor","manufacturer":"Honor Device Co.","model":"Honor X9b","device_code":"ALI-NX1","soc":"Snapdragon 6 Gen 1","launch":34,"max":35,"screen_density":2.6,"screen_width":1200,"screen_height":2652},
  {"brand":"nothing","manufacturer":"Nothing Technology","model":"Nothing Phone (2)","device_code":"spacewar","soc":"Snapdragon 8+ Gen 1","launch":33,"max":35,"screen_density":2.75,"screen_width":1080,"screen_height":2412},
  {"brand":"nothing","manufacturer":"Nothing Technology","model":"Nothing Phone (2a) Plus","device_code":"pacman","soc":"Dimensity 7350","launch":34,"max":35,"screen_density":2.25,"screen_width":1084,"screen_height":2412},
  {"brand":"asus","manufacturer":"ASUSTeK Computer","model":"ROG Phone 8","device_code":"AI2401","soc":"Snapdragon 8 Gen 3","launch":34,"max":35,"screen_density":2.75,"screen_width":1080,"screen_height":2400},
  {"brand":"asus","manufacturer":"ASUSTeK Computer","model":"Zenfone 10","device_code":"AI2302","soc":"Snapdragon 8 Gen 2","launch":33,"max":34,"screen_density":2.75,"screen_width":1080,"screen_height":2400},
  {"brand":"realme","manufacturer":"Realme","model":"Realme GT 5 Pro","device_code":"RMX3888","soc":"Snapdragon 8 Gen 3","launch":34,"max":35,"screen_density":2.75,"screen_width":1264,"screen_height":2780},
  {"brand":"realme","manufacturer":"Realme","model":"Realme GT 6T","device_code":"RMX3853","soc":"Snapdragon 7+ Gen 3","launch":34,"max":35,"screen_density":2.75,"screen_width":1264,"screen_height":2780},
  {"brand":"realme","manufacturer":"Realme","model":"Realme 12 Pro+","device_code":"RMX3840","soc":"Snapdragon 7s Gen 2","launch":34,"max":35,"screen_density":2.25,"screen_width":1080,"screen_height":2412},
  {"brand":"realme","manufacturer":"Realme","model":"Realme 12 Pro","device_code":"RMX3841","soc":"Dimensity 7300","launch":34,"max":35,"screen_density":2.25,"screen_width":1080,"screen_height":2412},
  {"brand":"realme","manufacturer":"Realme","model":"Realme Narzo 70 Pro","device_code":"RMX3868","soc":"Dimensity 7050","launch":34,"max":35,"screen_density":2.25,"screen_width":1080,"screen_height":2412},
  {"brand":"realme","manufacturer":"Realme","model":"Realme C65","device_code":"RMX3910","soc":"Dimensity 6300","launch":34,"max":35,"screen_density":2.0,"screen_width":720,"screen_height":1600},
  {"brand":"nubia","manufacturer":"Nubia Technology","model":"Nubia Z60 Ultra","device_code":"NX721J","soc":"Snapdragon 8 Gen 3","launch":34,"max":35,"screen_density":2.75,"screen_width":1116,"screen_height":2480},
  {"brand":"nubia","manufacturer":"Nubia Technology","model":"RedMagic 9 Pro","device_code":"NX769J","soc":"Snapdragon 8 Gen 3","launch":34,"max":35,"screen_density":2.75,"screen_width":1116,"screen_height":2480},
  {"brand":"meizu","manufacturer":"Meizu Technology","model":"Meizu 21","device_code":"M461Q","soc":"Snapdragon 8 Gen 3","launch":33,"max":35,"screen_density":2.75,"screen_width":1080,"screen_height":2340},
  {"brand":"htc","manufacturer":"HTC Corporation","model":"HTC U24 Pro","device_code":"U24","soc":"Snapdragon 7 Gen 3","launch":34,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2436},
  {"brand":"sharp","manufacturer":"Sharp Corporation","model":"Sharp Aquos R8","device_code":"SH-52D","soc":"Snapdragon 8 Gen 2","launch":33,"max":34,"screen_density":2.75,"screen_width":1080,"screen_height":2340},
  {"brand":"fairphone","manufacturer":"Fairphone","model":"Fairphone 5","device_code":"FP5","soc":"Snapdragon 6490","launch":33,"max":35,"screen_density":2.75,"screen_width":1224,"screen_height":2700},
  {"brand":"infinix","manufacturer":"Infinix Mobility","model":"Infinix Note 40 Pro","device_code":"X6850","soc":"Dimensity 7020","launch":34,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2436},
  {"brand":"tecno","manufacturer":"Tecno Mobile","model":"Tecno Camon 30 Pro","device_code":"CL8","soc":"Dimensity 8200","launch":34,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2436},
  {"brand":"samsung","manufacturer":"Samsung Electronics","model":"Galaxy A06","device_code":"a06","soc":"Helio G85","launch":34,"max":35,"screen_density":2.0,"screen_width":720,"screen_height":1600},
  {"brand":"samsung","manufacturer":"Samsung Electronics","model":"Galaxy A05s","device_code":"a05s","soc":"Snapdragon 680","launch":34,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2400},
  {"brand":"samsung","manufacturer":"Samsung Electronics","model":"Galaxy A14","device_code":"a14","soc":"Exynos 850","launch":33,"max":34,"screen_density":2.6,"screen_width":1080,"screen_height":2408},
  {"brand":"samsung","manufacturer":"Samsung Electronics","model":"Galaxy A15","device_code":"a15","soc":"Helio G99","launch":34,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2340},
  {"brand":"samsung","manufacturer":"Samsung Electronics","model":"Galaxy A17","device_code":"a17","soc":"Dimensity 6300","launch":35,"max":36,"screen_density":2.6,"screen_width":1080,"screen_height":2340},
  {"brand":"samsung","manufacturer":"Samsung Electronics","model":"Galaxy A24","device_code":"a24","soc":"Exynos 1280","launch":33,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2340},
  {"brand":"samsung","manufacturer":"Samsung Electronics","model":"Galaxy A34","device_code":"a34","soc":"Dimensity 1080","launch":33,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2340},
  {"brand":"samsung","manufacturer":"Samsung Electronics","model":"Galaxy A54","device_code":"a54","soc":"Exynos 1380","launch":33,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2340},
  {"brand":"samsung","manufacturer":"Samsung Electronics","model":"Galaxy M14","device_code":"m14","soc":"Exynos 1330","launch":33,"max":34,"screen_density":2.6,"screen_width":1080,"screen_height":2408},
  {"brand":"samsung","manufacturer":"Samsung Electronics","model":"Galaxy M15","device_code":"m15","soc":"Dimensity 6100+","launch":34,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2340},
  {"brand":"samsung","manufacturer":"Samsung Electronics","model":"Galaxy M34","device_code":"m34","soc":"Exynos 1280","launch":33,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2340},
  {"brand":"samsung","manufacturer":"Samsung Electronics","model":"Galaxy M35","device_code":"m35","soc":"Exynos 1380","launch":34,"max":36,"screen_density":2.6,"screen_width":1080,"screen_height":2340},
  {"brand":"samsung","manufacturer":"Samsung Electronics","model":"Galaxy M54","device_code":"m54","soc":"Snapdragon 888","launch":33,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2400},
  {"brand":"samsung","manufacturer":"Samsung Electronics","model":"Galaxy M55","device_code":"m55","soc":"Exynos 1480","launch":34,"max":36,"screen_density":2.6,"screen_width":1080,"screen_height":2340},
  {"brand":"samsung","manufacturer":"Samsung Electronics","model":"Galaxy F14","device_code":"f14","soc":"Exynos 1330","launch":33,"max":34,"screen_density":2.6,"screen_width":1080,"screen_height":2408},
  {"brand":"samsung","manufacturer":"Samsung Electronics","model":"Galaxy F15","device_code":"f15","soc":"Dimensity 6100+","launch":34,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2340},
  {"brand":"samsung","manufacturer":"Samsung Electronics","model":"Galaxy F34","device_code":"f34","soc":"Exynos 1280","launch":33,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2340},
  {"brand":"samsung","manufacturer":"Samsung Electronics","model":"Galaxy F54","device_code":"f54","soc":"Exynos 1380","launch":33,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2340},
  {"brand":"samsung","manufacturer":"Samsung Electronics","model":"Galaxy Z Fold5","device_code":"fold5","soc":"Snapdragon 8 Gen 2","launch":33,"max":36,"screen_density":2.6,"screen_width":904,"screen_height":2316},
  {"brand":"samsung","manufacturer":"Samsung Electronics","model":"Galaxy Z Flip5","device_code":"flip5","soc":"Snapdragon 8 Gen 2","launch":33,"max":36,"screen_density":2.6,"screen_width":1080,"screen_height":2640},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Redmi Note 12","device_code":"tapas","soc":"Snapdragon 685","launch":33,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2400},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Redmi Note 12 Pro","device_code":"rubens","soc":"Dimensity 1080","launch":33,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2400},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Redmi Note 12 Pro+","device_code":"rubens","soc":"Dimensity 1080","launch":33,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2400},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Redmi 12","device_code":"fire","soc":"Helio G88","launch":33,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2460},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Redmi 13","device_code":"tides","soc":"Helio G91","launch":34,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2460},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Redmi 13C","device_code":"gale","soc":"Helio G85","launch":33,"max":35,"screen_density":2.0,"screen_width":720,"screen_height":1600},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Redmi 14C","device_code":"rubens","soc":"Helio G81","launch":34,"max":35,"screen_density":2.0,"screen_width":720,"screen_height":1640},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Redmi A3","device_code":"blue","soc":"Helio G85","launch":34,"max":35,"screen_density":2.0,"screen_width":720,"screen_height":1650},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Poco F5","device_code":"marble","soc":"Snapdragon 7+ Gen 2","launch":33,"max":35,"screen_density":2.75,"screen_width":1080,"screen_height":2400},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Poco F5 Pro","device_code":"mondrian","soc":"Snapdragon 8+ Gen 1","launch":33,"max":35,"screen_density":2.75,"screen_width":1440,"screen_height":3200},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Poco X5 Pro","device_code":"redwood","soc":"Snapdragon 778G","launch":33,"max":35,"screen_density":2.75,"screen_width":1080,"screen_height":2400},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Poco X6","device_code":"gold","soc":"Snapdragon 7s Gen 2","launch":34,"max":35,"screen_density":2.75,"screen_width":1220,"screen_height":2712},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Poco M6 Pro","device_code":"sky","soc":"Snapdragon 4 Gen 2","launch":34,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2460},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Poco M6","device_code":"air","soc":"Dimensity 6100+","launch":34,"max":35,"screen_density":2.0,"screen_width":720,"screen_height":1650},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Redmi Note 13","device_code":"sapphire","soc":"Dimensity 6080","launch":34,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2400},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Redmi Note 13 Pro+","device_code":"zircon","soc":"Dimensity 7200 Ultra","launch":33,"max":35,"screen_density":2.75,"screen_width":1220,"screen_height":2712},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Redmi K60","device_code":"mondrian","soc":"Snapdragon 8+ Gen 1","launch":33,"max":35,"screen_density":2.75,"screen_width":1440,"screen_height":3200},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Redmi K60 Pro","device_code":"socrates","soc":"Snapdragon 8 Gen 2","launch":33,"max":35,"screen_density":2.75,"screen_width":1440,"screen_height":3200},
  {"brand":"oneplus","manufacturer":"OnePlus","model":"OnePlus Nord CE3","device_code":"CPH2569","soc":"Snapdragon 782G","launch":33,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2412},
  {"brand":"oneplus","manufacturer":"OnePlus","model":"OnePlus Nord CE3 Lite","device_code":"CPH2469","soc":"Snapdragon 695","launch":33,"max":35,"screen_density":2.0,"screen_width":1080,"screen_height":2400},
  {"brand":"oneplus","manufacturer":"OnePlus","model":"OnePlus Nord 2T","device_code":"CPH2401","soc":"Dimensity 1300","launch":33,"max":34,"screen_density":2.6,"screen_width":1080,"screen_height":2400},
  {"brand":"oneplus","manufacturer":"OnePlus","model":"OnePlus Ace 2 Pro","device_code":"PJA110","soc":"Snapdragon 8 Gen 2","launch":33,"max":35,"screen_density":2.75,"screen_width":1240,"screen_height":2772},
  {"brand":"oneplus","manufacturer":"OnePlus","model":"OnePlus Ace 3","device_code":"PJE110","soc":"Snapdragon 8 Gen 2","launch":34,"max":35,"screen_density":2.75,"screen_width":1264,"screen_height":2780},
  {"brand":"oneplus","manufacturer":"OnePlus","model":"OnePlus Ace 3V","device_code":"PJF110","soc":"Snapdragon 7+ Gen 3","launch":34,"max":35,"screen_density":2.75,"screen_width":1264,"screen_height":2780},
  {"brand":"oppo","manufacturer":"OPPO","model":"OPPO A17","device_code":"CPH2477","soc":"Dimensity 6300","launch":33,"max":34,"screen_density":2.0,"screen_width":720,"screen_height":1600},
  {"brand":"oppo","manufacturer":"OPPO","model":"OPPO A18","device_code":"CPH2591","soc":"Dimensity 6300","launch":34,"max":35,"screen_density":2.0,"screen_width":720,"screen_height":1600},
  {"brand":"oppo","manufacturer":"OPPO","model":"OPPO A38","device_code":"CPH2579","soc":"Dimensity 6300","launch":33,"max":34,"screen_density":2.0,"screen_width":720,"screen_height":1600},
  {"brand":"oppo","manufacturer":"OPPO","model":"OPPO A58","device_code":"CPH2577","soc":"Dimensity 6020","launch":33,"max":34,"screen_density":2.6,"screen_width":1080,"screen_height":2400},
  {"brand":"oppo","manufacturer":"OPPO","model":"OPPO A78","device_code":"CPH2565","soc":"Dimensity 7020","launch":33,"max":34,"screen_density":2.6,"screen_width":1080,"screen_height":2400},
  {"brand":"oppo","manufacturer":"OPPO","model":"OPPO A79","device_code":"CPH2585","soc":"Dimensity 6300","launch":34,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2400},
  {"brand":"oppo","manufacturer":"OPPO","model":"OPPO A98","device_code":"CPH2529","soc":"Dimensity 7050","launch":34,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2400},
  {"brand":"oppo","manufacturer":"OPPO","model":"OPPO K11","device_code":"PJC110","soc":"Snapdragon 782G","launch":33,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2412},
  {"brand":"oppo","manufacturer":"OPPO","model":"OPPO K12","device_code":"PJT110","soc":"Snapdragon 7 Gen 3","launch":34,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2412},
  {"brand":"oppo","manufacturer":"OPPO","model":"OPPO Reno 10","device_code":"CPH2531","soc":"Dimensity 7050","launch":33,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2412},
  {"brand":"oppo","manufacturer":"OPPO","model":"OPPO Reno 9","device_code":"CPH2577","soc":"Dimensity 7200","launch":33,"max":34,"screen_density":2.6,"screen_width":1080,"screen_height":2412},
  {"brand":"vivo","manufacturer":"Vivo","model":"Vivo Y17s","device_code":"V2310","soc":"Helio G85","launch":34,"max":35,"screen_density":2.0,"screen_width":720,"screen_height":1612},
  {"brand":"vivo","manufacturer":"Vivo","model":"Vivo Y18","device_code":"V2333","soc":"Dimensity 6300","launch":34,"max":35,"screen_density":2.0,"screen_width":720,"screen_height":1612},
  {"brand":"vivo","manufacturer":"Vivo","model":"Vivo Y27","device_code":"V2244","soc":"Snapdragon 680","launch":33,"max":34,"screen_density":2.6,"screen_width":1080,"screen_height":2388},
  {"brand":"vivo","manufacturer":"Vivo","model":"Vivo Y28","device_code":"V2334","soc":"Dimensity 6020","launch":34,"max":35,"screen_density":2.0,"screen_width":720,"screen_height":1608},
  {"brand":"vivo","manufacturer":"Vivo","model":"Vivo Y36","device_code":"V2247","soc":"Dimensity 6300","launch":34,"max":35,"screen_density":2.0,"screen_width":720,"screen_height":1612},
  {"brand":"vivo","manufacturer":"Vivo","model":"Vivo Y100","device_code":"V2222","soc":"Dimensity 7200","launch":33,"max":34,"screen_density":2.6,"screen_width":1080,"screen_height":2400},
  {"brand":"vivo","manufacturer":"Vivo","model":"Vivo V25","device_code":"V2202","soc":"Dimensity 900","launch":33,"max":34,"screen_density":2.6,"screen_width":1080,"screen_height":2404},
  {"brand":"vivo","manufacturer":"Vivo","model":"Vivo V27","device_code":"V2231","soc":"Dimensity 7200","launch":33,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2400},
  {"brand":"vivo","manufacturer":"Vivo","model":"Vivo V29","device_code":"V2250","soc":"Snapdragon 778G","launch":33,"max":35,"screen_density":2.75,"screen_width":1260,"screen_height":2800},
  {"brand":"vivo","manufacturer":"Vivo","model":"iQOO Neo 9","device_code":"V2338A","soc":"Snapdragon 8 Gen 2","launch":34,"max":35,"screen_density":2.75,"screen_width":1260,"screen_height":2800},
  {"brand":"vivo","manufacturer":"Vivo","model":"iQOO Z9","device_code":"V2361A","soc":"Dimensity 7200","launch":34,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2400},
  {"brand":"motorola","manufacturer":"Motorola Mobility","model":"Moto G34","device_code":"xt2363-1","soc":"Snapdragon 695","launch":34,"max":35,"screen_density":2.0,"screen_width":720,"screen_height":1600},
  {"brand":"motorola","manufacturer":"Motorola Mobility","model":"Moto G54","device_code":"xt2343-1","soc":"Dimensity 7020","launch":33,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2400},
  {"brand":"motorola","manufacturer":"Motorola Mobility","model":"Moto G64","device_code":"xt2431-1","soc":"Dimensity 7025","launch":34,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2400},
  {"brand":"motorola","manufacturer":"Motorola Mobility","model":"Moto G Stylus 5G (2024)","device_code":"xt2417-2","soc":"Snapdragon 6 Gen 1","launch":34,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2400},
  {"brand":"motorola","manufacturer":"Motorola Mobility","model":"Moto Edge 40","device_code":"xt2303-1","soc":"Dimensity 8020","launch":33,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2400},
  {"brand":"motorola","manufacturer":"Motorola Mobility","model":"Moto Edge 40 Neo","device_code":"xt2307-1","soc":"Dimensity 7030","launch":33,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2400},
  {"brand":"motorola","manufacturer":"Motorola Mobility","model":"Moto Razr 40","device_code":"xt2323-1","soc":"Snapdragon 7 Gen 1","launch":33,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2640},
  {"brand":"sony","manufacturer":"Sony Corporation","model":"Xperia 10 V","device_code":"a0","soc":"Snapdragon 695","launch":33,"max":34,"screen_density":2.75,"screen_width":1080,"screen_height":2520},
  {"brand":"honor","manufacturer":"Honor Device Co.","model":"Honor 90","device_code":"REA-AN00","soc":"Snapdragon 7 Gen 1","launch":33,"max":35,"screen_density":2.75,"screen_width":1200,"screen_height":2664},
  {"brand":"honor","manufacturer":"Honor Device Co.","model":"Honor 100","device_code":"MAA-AN00","soc":"Snapdragon 7 Gen 3","launch":33,"max":35,"screen_density":2.75,"screen_width":1200,"screen_height":2664},
  {"brand":"honor","manufacturer":"Honor Device Co.","model":"Honor X7b","device_code":"CLK-LX1","soc":"Snapdragon 680","launch":33,"max":34,"screen_density":2.0,"screen_width":720,"screen_height":1600},
  {"brand":"honor","manufacturer":"Honor Device Co.","model":"Honor X8b","device_code":"LLY-LX1","soc":"Snapdragon 680","launch":33,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2412},
  {"brand":"honor","manufacturer":"Honor Device Co.","model":"Honor X8c","device_code":"LLY-LX2","soc":"Snapdragon 685","launch":35,"max":36,"screen_density":2.6,"screen_width":1080,"screen_height":2412},
  {"brand":"honor","manufacturer":"Honor Device Co.","model":"Honor X7c","device_code":"ALT-LX2","soc":"Snapdragon 4 Gen 2","launch":34,"max":35,"screen_density":2.0,"screen_width":720,"screen_height":1610},
  {"brand":"asus","manufacturer":"ASUSTeK Computer","model":"ROG Phone 7","device_code":"AI2205","soc":"Snapdragon 8 Gen 2","launch":33,"max":35,"screen_density":2.75,"screen_width":1080,"screen_height":2448},
  {"brand":"realme","manufacturer":"Realme","model":"Realme 11","device_code":"RMX3750","soc":"Dimensity 6020","launch":33,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2400},
  {"brand":"realme","manufacturer":"Realme","model":"Realme 11 Pro","device_code":"RMX3771","soc":"Dimensity 7050","launch":33,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2412},
  {"brand":"realme","manufacturer":"Realme","model":"Realme 11 Pro+","device_code":"RMX3741","soc":"Dimensity 7050","launch":33,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2412},
  {"brand":"realme","manufacturer":"Realme","model":"Realme 12","device_code":"RMX3870","soc":"Dimensity 6100+","launch":34,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2400},
  {"brand":"realme","manufacturer":"Realme","model":"Realme 13","device_code":"RMX3953","soc":"Dimensity 6300","launch":34,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2400},
  {"brand":"realme","manufacturer":"Realme","model":"Realme 13+","device_code":"RMX3951","soc":"Snapdragon 685","launch":34,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2400},
  {"brand":"realme","manufacturer":"Realme","model":"Realme C63","device_code":"RMX3933","soc":"Dimensity 6300","launch":34,"max":35,"screen_density":2.0,"screen_width":720,"screen_height":1600},
  {"brand":"realme","manufacturer":"Realme","model":"Realme C61","device_code":"RMX3939","soc":"Unisoc T612","launch":34,"max":35,"screen_density":2.0,"screen_width":720,"screen_height":1600},
  {"brand":"realme","manufacturer":"Realme","model":"Realme Narzo 60","device_code":"RMX3782","soc":"Dimensity 6020","launch":33,"max":34,"screen_density":2.6,"screen_width":1080,"screen_height":2400},
  {"brand":"realme","manufacturer":"Realme","model":"Realme GT Neo 5","device_code":"RMX3706","soc":"Snapdragon 8+ Gen 1","launch":33,"max":35,"screen_density":2.75,"screen_width":1240,"screen_height":2772},
  {"brand":"infinix","manufacturer":"Infinix Mobility","model":"Infinix Note 30","device_code":"X6833","soc":"Helio G99","launch":33,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2460},
  {"brand":"infinix","manufacturer":"Infinix Mobility","model":"Infinix Hot 40","device_code":"X6836","soc":"Helio G88","launch":33,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2460},
  {"brand":"tecno","manufacturer":"Tecno Mobile","model":"Tecno Camon 20","device_code":"CK6","soc":"Helio G85","launch":33,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2400},
  {"brand":"tecno","manufacturer":"Tecno Mobile","model":"Tecno Spark 20","device_code":"KI5","soc":"Helio G85","launch":33,"max":35,"screen_density":2.0,"screen_width":720,"screen_height":1612},
  {"brand":"itel","manufacturer":"itel Mobile","model":"itel P55","device_code":"P665L","soc":"Dimensity 6080","launch":34,"max":35,"screen_density":2.0,"screen_width":720,"screen_height":1612},
  {"brand":"lava","manufacturer":"Lava International","model":"Lava Blaze 2","device_code":"Blaze2","soc":"Dimensity 6020","launch":33,"max":34,"screen_density":2.0,"screen_width":720,"screen_height":1600},
  {"brand":"blackview","manufacturer":"Blackview","model":"Blackview A200 Pro","device_code":"A200Pro","soc":"Helio G99","launch":33,"max":34,"screen_density":2.6,"screen_width":1080,"screen_height":2400},
  {"brand":"ulefone","manufacturer":"Ulefone","model":"Ulefone Note 17 Pro","device_code":"Note17Pro","soc":"Helio G99","launch":34,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2400},
  {"brand":"samsung","manufacturer":"Samsung Electronics","model":"Galaxy A05","device_code":"a05","soc":"Helio G85","launch":33,"max":35,"screen_density":2.0,"screen_width":720,"screen_height":1600},
  {"brand":"samsung","manufacturer":"Samsung Electronics","model":"Galaxy Xcover 7","device_code":"xcover7","soc":"Dimensity 6300","launch":34,"max":36,"screen_density":2.6,"screen_width":1080,"screen_height":2408},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Redmi 12C","device_code":"earth","soc":"Helio G85","launch":33,"max":34,"screen_density":2.0,"screen_width":720,"screen_height":1650},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Redmi 13R","device_code":"tides","soc":"Dimensity 6100+","launch":34,"max":35,"screen_density":2.0,"screen_width":720,"screen_height":1600},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Redmi Note 12 4G","device_code":"tapas","soc":"Snapdragon 685","launch":33,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2400},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Poco C55","device_code":"earth","soc":"Helio G85","launch":33,"max":34,"screen_density":2.0,"screen_width":720,"screen_height":1650},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Poco C65","device_code":"gale","soc":"Helio G85","launch":33,"max":35,"screen_density":2.0,"screen_width":720,"screen_height":1600},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Poco C75","device_code":"rubens","soc":"Helio G81","launch":34,"max":35,"screen_density":2.0,"screen_width":720,"screen_height":1640},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Poco M5","device_code":"rock","soc":"Helio G99","launch":33,"max":34,"screen_density":2.6,"screen_width":1080,"screen_height":2408},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Poco M6 5G","device_code":"air","soc":"Dimensity 6100+","launch":34,"max":35,"screen_density":2.0,"screen_width":720,"screen_height":1600},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Poco X5","device_code":"redwood","soc":"Snapdragon 695","launch":33,"max":34,"screen_density":2.6,"screen_width":1080,"screen_height":2400},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Xiaomi 13 Lite","device_code":"ziyi","soc":"Snapdragon 7 Gen 1","launch":33,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2400},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Xiaomi Civi 3","device_code":"yuechu","soc":"Dimensity 8200 Ultra","launch":33,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2400},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Redmi Turbo 3","device_code":"peridot","soc":"Snapdragon 8s Gen 3","launch":34,"max":35,"screen_density":2.75,"screen_width":1220,"screen_height":2712},
  {"brand":"oneplus","manufacturer":"OnePlus","model":"OnePlus Open","device_code":"CPH2551","soc":"Snapdragon 8 Gen 2","launch":33,"max":35,"screen_density":2.6,"screen_width":1116,"screen_height":2484},
  {"brand":"oneplus","manufacturer":"OnePlus","model":"OnePlus 11R","device_code":"CPH2487","soc":"Snapdragon 8+ Gen 1","launch":33,"max":35,"screen_density":2.75,"screen_width":1240,"screen_height":2772},
  {"brand":"oneplus","manufacturer":"OnePlus","model":"OnePlus Ace 2V","device_code":"PHP110","soc":"Dimensity 9000","launch":33,"max":34,"screen_density":2.75,"screen_width":1240,"screen_height":2772},
  {"brand":"oneplus","manufacturer":"OnePlus","model":"OnePlus Ace 3 Pro","device_code":"PJX110","soc":"Snapdragon 8 Gen 3","launch":34,"max":35,"screen_density":2.75,"screen_width":1264,"screen_height":2780},
  {"brand":"oppo","manufacturer":"OPPO","model":"OPPO Find X6","device_code":"PGFM10","soc":"Dimensity 9200","launch":33,"max":35,"screen_density":2.75,"screen_width":1240,"screen_height":2772},
  {"brand":"oppo","manufacturer":"OPPO","model":"OPPO Find X6 Pro","device_code":"PGEM10","soc":"Snapdragon 8 Gen 2","launch":33,"max":35,"screen_density":2.75,"screen_width":1440,"screen_height":3168},
  {"brand":"oppo","manufacturer":"OPPO","model":"OPPO Find N2 Flip","device_code":"PGT110","soc":"Dimensity 9000+","launch":33,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2520},
  {"brand":"oppo","manufacturer":"OPPO","model":"OPPO Reno 8","device_code":"CPH2359","soc":"Dimensity 1300","launch":33,"max":34,"screen_density":2.6,"screen_width":1080,"screen_height":2400},
  {"brand":"oppo","manufacturer":"OPPO","model":"OPPO Reno 8 Pro","device_code":"CPH2357","soc":"Dimensity 8100","launch":33,"max":34,"screen_density":2.6,"screen_width":1080,"screen_height":2412},
  {"brand":"oppo","manufacturer":"OPPO","model":"OPPO A2 Pro","device_code":"PHT110","soc":"Dimensity 7050","launch":33,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2412},
  {"brand":"oppo","manufacturer":"OPPO","model":"OPPO A1x","device_code":"CPH2593","soc":"Dimensity 6020","launch":34,"max":35,"screen_density":2.0,"screen_width":720,"screen_height":1612},
  {"brand":"oppo","manufacturer":"OPPO","model":"OPPO K10","device_code":"PGJM10","soc":"Dimensity 8000","launch":33,"max":34,"screen_density":2.6,"screen_width":1080,"screen_height":2412},
  {"brand":"vivo","manufacturer":"Vivo","model":"Vivo X Fold2","device_code":"V2266A","soc":"Snapdragon 8 Gen 2","launch":33,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2520},
  {"brand":"vivo","manufacturer":"Vivo","model":"Vivo X Flip","device_code":"V2256A","soc":"Snapdragon 8+ Gen 1","launch":33,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2520},
  {"brand":"vivo","manufacturer":"Vivo","model":"Vivo S17","device_code":"V2285A","soc":"Dimensity 7200","launch":33,"max":35,"screen_density":2.75,"screen_width":1260,"screen_height":2800},
  {"brand":"vivo","manufacturer":"Vivo","model":"Vivo S18","device_code":"V2323A","soc":"Dimensity 9200+","launch":34,"max":35,"screen_density":2.75,"screen_width":1260,"screen_height":2800},
  {"brand":"vivo","manufacturer":"Vivo","model":"Vivo Y35","device_code":"V2230","soc":"Dimensity 700","launch":33,"max":34,"screen_density":2.6,"screen_width":1080,"screen_height":2388},
  {"brand":"vivo","manufacturer":"Vivo","model":"Vivo Y55","device_code":"V2154","soc":"Snapdragon 680","launch":33,"max":34,"screen_density":2.6,"screen_width":1080,"screen_height":2408},
  {"brand":"vivo","manufacturer":"Vivo","model":"Vivo Y78","device_code":"V2245","soc":"Dimensity 7020","launch":33,"max":34,"screen_density":2.6,"screen_width":1080,"screen_height":2388},
  {"brand":"vivo","manufacturer":"Vivo","model":"iQOO 11","device_code":"V2243A","soc":"Snapdragon 8 Gen 2","launch":33,"max":35,"screen_density":2.75,"screen_width":1440,"screen_height":3200},
  {"brand":"vivo","manufacturer":"Vivo","model":"iQOO 13","device_code":"V2405A","soc":"Snapdragon 8 Elite","launch":35,"max":36,"screen_density":2.75,"screen_width":1260,"screen_height":2800},
  {"brand":"motorola","manufacturer":"Motorola Mobility","model":"Moto Edge 40 Pro","device_code":"xt2301-1","soc":"Snapdragon 8 Gen 2","launch":33,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2400},
  {"brand":"motorola","manufacturer":"Motorola Mobility","model":"Moto Edge 50 Fusion","device_code":"xt2429-1","soc":"Snapdragon 6 Gen 1","launch":34,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2400},
  {"brand":"motorola","manufacturer":"Motorola Mobility","model":"Moto G73","device_code":"xt2333-1","soc":"Dimensity 930","launch":33,"max":34,"screen_density":2.6,"screen_width":1080,"screen_height":2400},
  {"brand":"motorola","manufacturer":"Motorola Mobility","model":"Moto G45","device_code":"xt2437-2","soc":"Snapdragon 6s Gen 3","launch":34,"max":35,"screen_density":2.0,"screen_width":720,"screen_height":1600},
  {"brand":"motorola","manufacturer":"Motorola Mobility","model":"Moto G35","device_code":"xt2435-1","soc":"Unisoc T760","launch":34,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2400},
  {"brand":"motorola","manufacturer":"Motorola Mobility","model":"Moto Razr 40 Ultra","device_code":"xt2321-1","soc":"Snapdragon 8+ Gen 1","launch":33,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2640},
  {"brand":"honor","manufacturer":"Honor Device Co.","model":"Honor Magic5","device_code":"PGT-AN00","soc":"Snapdragon 8 Gen 2","launch":33,"max":35,"screen_density":2.75,"screen_width":1224,"screen_height":2688},
  {"brand":"honor","manufacturer":"Honor Device Co.","model":"Honor Magic5 Pro","device_code":"PGT-AN10","soc":"Snapdragon 8 Gen 2","launch":33,"max":35,"screen_density":2.75,"screen_width":1312,"screen_height":2848},
  {"brand":"honor","manufacturer":"Honor Device Co.","model":"Honor Magic V2","device_code":"VER-AN10","soc":"Snapdragon 8 Gen 2","launch":33,"max":35,"screen_density":2.6,"screen_width":1060,"screen_height":2376},
  {"brand":"honor","manufacturer":"Honor Device Co.","model":"Honor 80","device_code":"ANN-AN00","soc":"Snapdragon 782G","launch":33,"max":34,"screen_density":2.6,"screen_width":1080,"screen_height":2400},
  {"brand":"honor","manufacturer":"Honor Device Co.","model":"Honor X50","device_code":"ALI-AN00","soc":"Snapdragon 6 Gen 1","launch":33,"max":35,"screen_density":2.6,"screen_width":1224,"screen_height":2652},
  {"brand":"honor","manufacturer":"Honor Device Co.","model":"Honor Play 8T","device_code":"CRT-AN00","soc":"Dimensity 6080","launch":33,"max":34,"screen_density":2.6,"screen_width":1080,"screen_height":2412},
  {"brand":"honor","manufacturer":"Honor Device Co.","model":"Honor 90 GT","device_code":"MAG-AN00","soc":"Snapdragon 8 Gen 2","launch":33,"max":35,"screen_density":2.75,"screen_width":1200,"screen_height":2664},
  {"brand":"nothing","manufacturer":"Nothing Technology","model":"Nothing Phone (3a)","device_code":"asteroids","soc":"Snapdragon 7s Gen 3","launch":35,"max":36,"screen_density":2.6,"screen_width":1080,"screen_height":2392},
  {"brand":"nothing","manufacturer":"Nothing Technology","model":"Nothing Phone (3a) Pro","device_code":"asteroids","soc":"Snapdragon 7s Gen 3","launch":35,"max":36,"screen_density":2.6,"screen_width":1080,"screen_height":2392},
  {"brand":"asus","manufacturer":"ASUSTeK Computer","model":"ROG Phone 9","device_code":"AI2501","soc":"Snapdragon 8 Elite","launch":35,"max":36,"screen_density":2.75,"screen_width":1080,"screen_height":2400},
  {"brand":"asus","manufacturer":"ASUSTeK Computer","model":"ROG Phone 8 Pro","device_code":"AI2401","soc":"Snapdragon 8 Gen 3","launch":34,"max":35,"screen_density":2.75,"screen_width":1080,"screen_height":2400},
  {"brand":"realme","manufacturer":"Realme","model":"Realme GT 3","device_code":"RMX3709","soc":"Snapdragon 8+ Gen 1","launch":33,"max":35,"screen_density":2.75,"screen_width":1240,"screen_height":2772},
  {"brand":"realme","manufacturer":"Realme","model":"Realme 10 Pro","device_code":"RMX3660","soc":"Dimensity 1080","launch":33,"max":34,"screen_density":2.6,"screen_width":1080,"screen_height":2412},
  {"brand":"realme","manufacturer":"Realme","model":"Realme 10 Pro+","device_code":"RMX3686","soc":"Dimensity 1080","launch":33,"max":34,"screen_density":2.6,"screen_width":1080,"screen_height":2412},
  {"brand":"realme","manufacturer":"Realme","model":"Realme 11x","device_code":"RMX3785","soc":"Dimensity 6100+","launch":34,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2400},
  {"brand":"realme","manufacturer":"Realme","model":"Realme 12x","device_code":"RMX3997","soc":"Dimensity 6300","launch":34,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2400},
  {"brand":"realme","manufacturer":"Realme","model":"Realme Narzo 70","device_code":"RMX3869","soc":"Dimensity 7050","launch":34,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2400},
  {"brand":"realme","manufacturer":"Realme","model":"Realme C75","device_code":"RMX3941","soc":"Dimensity 6300","launch":34,"max":35,"screen_density":2.0,"screen_width":720,"screen_height":1600},
  {"brand":"realme","manufacturer":"Realme","model":"Realme GT 7 Pro","device_code":"RMX5011","soc":"Snapdragon 8 Elite","launch":35,"max":36,"screen_density":2.75,"screen_width":1264,"screen_height":2780},
  {"brand":"realme","manufacturer":"Realme","model":"Realme 13 Pro","device_code":"RMX3921","soc":"Snapdragon 7s Gen 2","launch":34,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2412},
  {"brand":"nubia","manufacturer":"Nubia Technology","model":"RedMagic 8 Pro","device_code":"NX729J","soc":"Snapdragon 8 Gen 2","launch":33,"max":35,"screen_density":2.75,"screen_width":1116,"screen_height":2480},
  {"brand":"nubia","manufacturer":"Nubia Technology","model":"RedMagic 10 Pro","device_code":"NX789J","soc":"Snapdragon 8 Elite","launch":35,"max":36,"screen_density":2.75,"screen_width":1216,"screen_height":2688},
  {"brand":"nubia","manufacturer":"Nubia Technology","model":"Nubia Z50","device_code":"NX711J","soc":"Snapdragon 8 Gen 2","launch":33,"max":35,"screen_density":2.75,"screen_width":1080,"screen_height":2400},
  {"brand":"nubia","manufacturer":"Nubia Technology","model":"Nubia Flip","device_code":"NX724J","soc":"Snapdragon 7 Gen 1","launch":34,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2640},
  {"brand":"meizu","manufacturer":"Meizu Technology","model":"Meizu 20","device_code":"M381Q","soc":"Snapdragon 8 Gen 2","launch":33,"max":35,"screen_density":2.75,"screen_width":1080,"screen_height":2400},
  {"brand":"htc","manufacturer":"HTC Corporation","model":"HTC U23 Pro","device_code":"U23Pro","soc":"Snapdragon 7 Gen 1","launch":33,"max":34,"screen_density":2.6,"screen_width":1080,"screen_height":2400},
  {"brand":"sharp","manufacturer":"Sharp Corporation","model":"Sharp Aquos R9","device_code":"SH-51E","soc":"Snapdragon 7+ Gen 3","launch":34,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2340},
  {"brand":"infinix","manufacturer":"Infinix Mobility","model":"Infinix Note 40","device_code":"X6853","soc":"Dimensity 7020","launch":34,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2436},
  {"brand":"infinix","manufacturer":"Infinix Mobility","model":"Infinix Note 50 Pro","device_code":"X6855","soc":"Dimensity 8350","launch":35,"max":36,"screen_density":2.6,"screen_width":1080,"screen_height":2436},
  {"brand":"infinix","manufacturer":"Infinix Mobility","model":"Infinix Zero 30","device_code":"X6731","soc":"Dimensity 8020","launch":33,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2400},
  {"brand":"infinix","manufacturer":"Infinix Mobility","model":"Infinix Hot 50","device_code":"X6880","soc":"Dimensity 6300","launch":34,"max":35,"screen_density":2.0,"screen_width":720,"screen_height":1640},
  {"brand":"tecno","manufacturer":"Tecno Mobile","model":"Tecno Camon 30","device_code":"CL7","soc":"Dimensity 7020","launch":34,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2436},
  {"brand":"tecno","manufacturer":"Tecno Mobile","model":"Tecno Spark 30","device_code":"KL8","soc":"Dimensity 6300","launch":34,"max":35,"screen_density":2.0,"screen_width":720,"screen_height":1640},
  {"brand":"tecno","manufacturer":"Tecno Mobile","model":"Tecno Pova 6 Pro","device_code":"LI9","soc":"Dimensity 6080","launch":34,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2436},
  {"brand":"tecno","manufacturer":"Tecno Mobile","model":"Tecno Camon 40 Pro","device_code":"CM8","soc":"Dimensity 7300","launch":35,"max":36,"screen_density":2.6,"screen_width":1080,"screen_height":2436},
  {"brand":"itel","manufacturer":"itel Mobile","model":"itel S24","device_code":"S665L","soc":"Dimensity 6080","launch":34,"max":35,"screen_density":2.0,"screen_width":720,"screen_height":1640},
  {"brand":"itel","manufacturer":"itel Mobile","model":"itel A70","device_code":"A665L","soc":"Unisoc T606","launch":33,"max":34,"screen_density":2.0,"screen_width":720,"screen_height":1612},
  {"brand":"lava","manufacturer":"Lava International","model":"Lava Blaze Curve","device_code":"BlazeCurve","soc":"Dimensity 7050","launch":34,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2400},
  {"brand":"lava","manufacturer":"Lava International","model":"Lava Agni 2","device_code":"Agni2","soc":"Dimensity 7050","launch":33,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2400},
  {"brand":"doogee","manufacturer":"Doogee","model":"Doogee N50","device_code":"N50","soc":"Unisoc T606","launch":33,"max":34,"screen_density":2.0,"screen_width":720,"screen_height":1600},
  {"brand":"doogee","manufacturer":"Doogee","model":"Doogee V30 Pro","device_code":"V30Pro","soc":"Dimensity 8020","launch":34,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2400},
  {"brand":"oukitel","manufacturer":"Oukitel","model":"Oukitel WP28","device_code":"WP28","soc":"Unisoc T606","launch":34,"max":35,"screen_density":2.0,"screen_width":720,"screen_height":1600},
  {"brand":"agm","manufacturer":"AGM","model":"AGM H6","device_code":"H6","soc":"Helio G99","launch":33,"max":34,"screen_density":2.6,"screen_width":1080,"screen_height":2408},
  {"brand":"zte","manufacturer":"ZTE Corporation","model":"ZTE Axon 50 Ultra","device_code":"A2023","soc":"Snapdragon 8 Gen 2","launch":33,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2400},
  {"brand":"zte","manufacturer":"ZTE Corporation","model":"ZTE Axon 60 Ultra","device_code":"A2024","soc":"Snapdragon 8 Gen 3","launch":34,"max":35,"screen_density":2.75,"screen_width":1260,"screen_height":2800},
  {"brand":"zte","manufacturer":"ZTE Corporation","model":"ZTE Blade V50","device_code":"V50","soc":"Dimensity 6080","launch":33,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2400},
  {"brand":"zte","manufacturer":"ZTE Corporation","model":"ZTE Blade A73","device_code":"A73","soc":"Unisoc T606","launch":33,"max":34,"screen_density":2.0,"screen_width":720,"screen_height":1612},
  {"brand":"nokia","manufacturer":"HMD Global","model":"Nokia G42 5G","device_code":"G42","soc":"Snapdragon 480+","launch":33,"max":35,"screen_density":2.0,"screen_width":720,"screen_height":1612},
  {"brand":"nokia","manufacturer":"HMD Global","model":"Nokia XR21","device_code":"XR21","soc":"Snapdragon 695","launch":33,"max":34,"screen_density":2.6,"screen_width":1080,"screen_height":2400},
  {"brand":"tcl","manufacturer":"TCL Technology","model":"TCL 40 NxtPaper","device_code":"T40NP","soc":"Dimensity 6020","launch":33,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2460},
  {"brand":"tcl","manufacturer":"TCL Technology","model":"TCL 50 Pro NxtPaper","device_code":"T50NP","soc":"Dimensity 6300","launch":34,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2460},
  {"brand":"coolpad","manufacturer":"Coolpad Group","model":"Coolpad Cool 30","device_code":"Cool30","soc":"Dimensity 6300","launch":34,"max":35,"screen_density":2.0,"screen_width":720,"screen_height":1612},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Xiaomi 13T","device_code":"aristotle","soc":"Dimensity 8200 Ultra","launch":33,"max":35,"screen_density":2.75,"screen_width":1220,"screen_height":2712},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Xiaomi 13T Pro","device_code":"corot","soc":"Dimensity 9200+","launch":33,"max":35,"screen_density":2.75,"screen_width":1220,"screen_height":2712},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Redmi Note 12 Turbo","device_code":"marble","soc":"Snapdragon 7+ Gen 2","launch":33,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2400},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Redmi Note 12T Pro","device_code":"pearl","soc":"Dimensity 8200 Ultra","launch":33,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2460},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Poco X6 Neo","device_code":"gold","soc":"Dimensity 6080","launch":34,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2400},
  {"brand":"oppo","manufacturer":"OPPO","model":"OPPO Reno 11F","device_code":"CPH2607","soc":"Dimensity 7050","launch":34,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2412},
  {"brand":"oppo","manufacturer":"OPPO","model":"OPPO A59 5G","device_code":"CPH2617","soc":"Dimensity 6020","launch":33,"max":34,"screen_density":2.0,"screen_width":720,"screen_height":1612},
  {"brand":"vivo","manufacturer":"Vivo","model":"Vivo T3","device_code":"V2333T","soc":"Dimensity 7200","launch":34,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2400},
  {"brand":"vivo","manufacturer":"Vivo","model":"Vivo T2x","device_code":"V2312","soc":"Dimensity 6020","launch":33,"max":34,"screen_density":2.6,"screen_width":1080,"screen_height":2408},
  {"brand":"vivo","manufacturer":"Vivo","model":"iQOO Z9x","device_code":"V2350A","soc":"Snapdragon 6 Gen 1","launch":34,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2408},
  {"brand":"honor","manufacturer":"Honor Device Co.","model":"Honor X6b","device_code":"JDY-LX1","soc":"Dimensity 6300","launch":34,"max":35,"screen_density":2.0,"screen_width":720,"screen_height":1612},
  {"brand":"honor","manufacturer":"Honor Device Co.","model":"Honor Play 9T","device_code":"PLAY9T","soc":"Dimensity 6080","launch":34,"max":35,"screen_density":2.0,"screen_width":720,"screen_height":1612},
  {"brand":"infinix","manufacturer":"Infinix Mobility","model":"Infinix GT 10 Pro","device_code":"X6739","soc":"Dimensity 8050","launch":33,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2400},
  {"brand":"infinix","manufacturer":"Infinix Mobility","model":"Infinix Zero 40","device_code":"X6860","soc":"Dimensity 8200","launch":34,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2436},
  {"brand":"tecno","manufacturer":"Tecno Mobile","model":"Tecno Pova 5","device_code":"LH7","soc":"Helio G99","launch":33,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2460},
  {"brand":"tecno","manufacturer":"Tecno Mobile","model":"Tecno Camon 20 Pro","device_code":"CK7","soc":"Helio G99","launch":33,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2400},
  {"brand":"itel","manufacturer":"itel Mobile","model":"itel RS4","device_code":"RS4","soc":"Helio G99","launch":34,"max":35,"screen_density":2.6,"screen_width":1080,"screen_height":2400},
  {"brand":"lava","manufacturer":"Lava International","model":"Lava Blaze 3 5G","device_code":"Blaze3","soc":"Dimensity 6300","launch":34,"max":35,"screen_density":2.0,"screen_width":720,"screen_height":1612},
  {"brand":"ulefone","manufacturer":"Ulefone","model":"Ulefone Armor 24","device_code":"Armor24","soc":"Helio G96","launch":33,"max":34,"screen_density":2.6,"screen_width":1080,"screen_height":2460}
];

/* 机型 → 屏幕对角线英寸：用于由分辨率反推物理 xdpi/ydpi，
 * 保证 width/xdpi ≈ 真实屏幕尺寸，避免被识别为大屏 / 平板 */
const SCREEN_SIZE_BY_MODEL = {
  'Pixel 9a': 6.3, 'Pixel 9': 6.3, 'Pixel 9 Pro': 6.3, 'Pixel 9 Pro XL': 6.8,
  'Pixel 8': 6.2, 'Pixel 8 Pro': 6.7, 'Pixel 7a': 6.1, 'Pixel 7': 6.3,
  'Pixel 7 Pro': 6.7,
  'Galaxy S25 Ultra': 6.9, 'Galaxy S25+': 6.7, 'Galaxy S25': 6.2,
  'Galaxy S24 Ultra': 6.8, 'Galaxy S24+': 6.7, 'Galaxy S24': 6.2,
  'Galaxy S23 Ultra': 6.8, 'Galaxy S23+': 6.6, 'Galaxy S23': 6.1,
  'Galaxy A56': 6.7, 'Galaxy A36': 6.7, 'Galaxy A26': 6.7,
  'Galaxy Z Fold7': 6.5, 'Galaxy Z Flip7': 6.9,
  'Xiaomi 15 Ultra': 6.73, 'Xiaomi 15 Pro': 6.73, 'Xiaomi 15': 6.36,
  'Xiaomi 14 Ultra': 6.73, 'Xiaomi 14 Pro': 6.73, 'Xiaomi 14': 6.36,
  'Redmi Note 14 Pro': 6.67, 'Redmi Note 14': 6.67,
  'Redmi K80 Pro': 6.67, 'Redmi K80': 6.67,
  'OnePlus 13': 6.82, 'OnePlus 12': 6.7, 'OnePlus 12R': 6.78,
  'OnePlus Nord 4': 6.74, 'OnePlus Nord CE4': 6.7,
  'OPPO Find X8 Pro': 6.78, 'OPPO Find X8': 6.59,
  'OPPO Reno 13 Pro': 6.83, 'OPPO A3 Pro': 6.7,
  'Vivo X200 Pro': 6.78, 'Vivo X200': 6.67, 'Vivo S20 Pro': 6.78, 'Vivo Y300': 6.77,
  'Moto X50 Ultra': 6.7, 'Moto Edge 60 Pro': 6.7, 'Moto G85': 6.67, 'Moto G84': 6.55,
  'Xperia 1 VI': 6.5, 'Xperia 5 V': 6.1, 'Xperia 10 VII': 6.1,
  'Honor Magic7 Pro': 6.8, 'Honor Magic7': 6.78, 'Honor X60 Pro': 6.78,
  'Nothing Phone (3)': 6.67, 'Nothing Phone (2a)': 6.7,
  'ROG Phone 9 Pro': 6.78, 'Zenfone 11 Ultra': 6.78,
  'Realme GT 6': 6.78, 'Realme 13 Pro+': 6.7, 'Realme C67': 6.72,
  'Pixel 8a': 6.1,
  'Galaxy S24 FE': 6.7, 'Galaxy S23 FE': 6.4, 'Galaxy A55': 6.6, 'Galaxy A35': 6.6,
  'Galaxy A25': 6.5, 'Galaxy A16 5G': 6.7, 'Galaxy Z Fold6': 6.3, 'Galaxy Z Flip6': 6.7,
  'Xiaomi 13': 6.36, 'Xiaomi 13 Pro': 6.73, 'Xiaomi 13 Ultra': 6.73,
  'Xiaomi 14T': 6.67, 'Xiaomi 14T Pro': 6.67, 'Redmi Note 13 Pro': 6.67,
  'Redmi K70': 6.67, 'Redmi K70 Pro': 6.67, 'Poco F6': 6.67, 'Poco X6 Pro': 6.67,
  'OnePlus 11': 6.7, 'OnePlus 13R': 6.78, 'OnePlus Nord 3': 6.74, 'OnePlus Nord CE4 Lite': 6.67,
  'OPPO Find X7': 6.74, 'OPPO Find X7 Ultra': 6.82, 'OPPO Reno 12': 6.7,
  'OPPO Reno 11': 6.7, 'OPPO Find N3 Flip': 6.8,
  'Vivo X100': 6.78, 'Vivo X100 Pro': 6.78, 'Vivo X90': 6.78,
  'Vivo S20': 6.67, 'Vivo V30': 6.78, 'iQOO 12': 6.78,
  'Moto Edge 50 Ultra': 6.7, 'Moto Edge 50 Pro': 6.7, 'Moto Razr 50 Ultra': 6.9,
  'Moto G Power 5G (2024)': 6.7,
  'Xperia 1 V': 6.5, 'Xperia 10 VI': 6.1, 'Xperia 1 VII': 6.5,
  'Honor Magic6': 6.78, 'Honor Magic6 Pro': 6.8, 'Honor Magic V3': 6.43,
  'Honor 200': 6.7, 'Honor X9b': 6.78,
  'Nothing Phone (2)': 6.7, 'Nothing Phone (2a) Plus': 6.7,
  'ROG Phone 8': 6.78, 'Zenfone 10': 5.9,
  'Realme GT 5 Pro': 6.78, 'Realme GT 6T': 6.78, 'Realme 12 Pro+': 6.7,
  'Realme 12 Pro': 6.7, 'Realme Narzo 70 Pro': 6.7, 'Realme C65': 6.67,
  'Nubia Z60 Ultra': 6.8, 'RedMagic 9 Pro': 6.8, 'Meizu 21': 6.55,
  'HTC U24 Pro': 6.8, 'Sharp Aquos R8': 6.4, 'Fairphone 5': 6.46,
  'Infinix Note 40 Pro': 6.78, 'Tecno Camon 30 Pro': 6.78,
  'Galaxy A06': 6.7, 'Galaxy A05s': 6.7, 'Galaxy A14': 6.6, 'Galaxy A15': 6.5,
  'Galaxy A17': 6.7, 'Galaxy A24': 6.5, 'Galaxy A34': 6.6, 'Galaxy A54': 6.4,
  'Galaxy M14': 6.6, 'Galaxy M15': 6.5, 'Galaxy M34': 6.5, 'Galaxy M35': 6.6,
  'Galaxy M54': 6.7, 'Galaxy M55': 6.7, 'Galaxy F14': 6.6, 'Galaxy F15': 6.5,
  'Galaxy F34': 6.5, 'Galaxy F54': 6.7, 'Galaxy Z Fold5': 6.2, 'Galaxy Z Flip5': 6.7,
  'Redmi Note 12': 6.67, 'Redmi Note 12 Pro': 6.67, 'Redmi Note 12 Pro+': 6.67,
  'Redmi 12': 6.79, 'Redmi 13': 6.79, 'Redmi 13C': 6.74, 'Redmi 14C': 6.88,
  'Redmi A3': 6.71, 'Poco F5': 6.67, 'Poco F5 Pro': 6.67, 'Poco X5 Pro': 6.67,
  'Poco X6': 6.67, 'Poco M6 Pro': 6.79, 'Poco M6': 6.79, 'Redmi Note 13': 6.67,
  'Redmi Note 13 Pro+': 6.67, 'Redmi K60': 6.67, 'Redmi K60 Pro': 6.67,
  'OnePlus Nord CE3': 6.7, 'OnePlus Nord CE3 Lite': 6.72, 'OnePlus Nord 2T': 6.43,
  'OnePlus Ace 2 Pro': 6.74, 'OnePlus Ace 3': 6.78, 'OnePlus Ace 3V': 6.74,
  'OPPO A17': 6.56, 'OPPO A18': 6.56, 'OPPO A38': 6.56, 'OPPO A58': 6.72,
  'OPPO A78': 6.72, 'OPPO A79': 6.72, 'OPPO A98': 6.72, 'OPPO K11': 6.7,
  'OPPO K12': 6.7, 'OPPO Reno 10': 6.7, 'OPPO Reno 9': 6.7,
  'Vivo Y17s': 6.56, 'Vivo Y18': 6.56, 'Vivo Y27': 6.64, 'Vivo Y28': 6.68,
  'Vivo Y36': 6.56, 'Vivo Y100': 6.78, 'Vivo V25': 6.44, 'Vivo V27': 6.78,
  'Vivo V29': 6.78, 'iQOO Neo 9': 6.78, 'iQOO Z9': 6.78,
  'Moto G34': 6.5, 'Moto G54': 6.5, 'Moto G64': 6.5,
  'Moto G Stylus 5G (2024)': 6.7, 'Moto Edge 40': 6.55, 'Moto Edge 40 Neo': 6.55,
  'Moto Razr 40': 6.9, 'Xperia 10 V': 6.1,
  'Honor 90': 6.7, 'Honor 100': 6.7, 'Honor X7b': 6.8, 'Honor X8b': 6.7,
  'Honor X8c': 6.7, 'Honor X7c': 6.77, 'ROG Phone 7': 6.78,
  'Realme 11': 6.72, 'Realme 11 Pro': 6.7, 'Realme 11 Pro+': 6.7, 'Realme 12': 6.72,
  'Realme 13': 6.72, 'Realme 13+': 6.72, 'Realme C63': 6.74, 'Realme C61': 6.74,
  'Realme Narzo 60': 6.43, 'Realme GT Neo 5': 6.74,
  'Infinix Note 30': 6.78, 'Infinix Hot 40': 6.78, 'Tecno Camon 20': 6.67,
  'Tecno Spark 20': 6.6, 'itel P55': 6.6, 'Lava Blaze 2': 6.5,
  'Blackview A200 Pro': 6.67, 'Ulefone Note 17 Pro': 6.78,
  'Galaxy A05': 6.7, 'Galaxy Xcover 7': 6.6,
  'Redmi 12C': 6.71, 'Redmi 13R': 6.74, 'Redmi Note 12 4G': 6.67, 'Poco C55': 6.71,
  'Poco C65': 6.74, 'Poco C75': 6.88, 'Poco M5': 6.58, 'Poco M6 5G': 6.74,
  'Poco X5': 6.67, 'Xiaomi 13 Lite': 6.55, 'Xiaomi Civi 3': 6.55, 'Redmi Turbo 3': 6.67,
  'OnePlus Open': 6.31, 'OnePlus 11R': 6.74, 'OnePlus Ace 2V': 6.74, 'OnePlus Ace 3 Pro': 6.78,
  'OPPO Find X6': 6.74, 'OPPO Find X6 Pro': 6.82, 'OPPO Find N2 Flip': 6.8,
  'OPPO Reno 8': 6.4, 'OPPO Reno 8 Pro': 6.7, 'OPPO A2 Pro': 6.7,
  'OPPO A1x': 6.56, 'OPPO K10': 6.59,
  'Vivo X Fold2': 6.53, 'Vivo X Flip': 6.74, 'Vivo S17': 6.78, 'Vivo S18': 6.78,
  'Vivo Y35': 6.64, 'Vivo Y55': 6.58, 'Vivo Y78': 6.64, 'iQOO 11': 6.78, 'iQOO 13': 6.82,
  'Moto Edge 40 Pro': 6.67, 'Moto Edge 50 Fusion': 6.7, 'Moto G73': 6.5,
  'Moto G45': 6.5, 'Moto G35': 6.72, 'Moto Razr 40 Ultra': 6.9,
  'Honor Magic5': 6.73, 'Honor Magic5 Pro': 6.81, 'Honor Magic V2': 6.43,
  'Honor 80': 6.67, 'Honor X50': 6.78, 'Honor Play 8T': 6.8, 'Honor 90 GT': 6.7,
  'Nothing Phone (3a)': 6.77, 'Nothing Phone (3a) Pro': 6.77,
  'ROG Phone 9': 6.78, 'ROG Phone 8 Pro': 6.78,
  'Realme GT 3': 6.74, 'Realme 10 Pro': 6.7, 'Realme 10 Pro+': 6.7, 'Realme 11x': 6.72,
  'Realme 12x': 6.72, 'Realme Narzo 70': 6.67, 'Realme C75': 6.72,
  'Realme GT 7 Pro': 6.78, 'Realme 13 Pro': 6.7,
  'RedMagic 8 Pro': 6.8, 'RedMagic 10 Pro': 6.85, 'Nubia Z50': 6.67, 'Nubia Flip': 6.9,
  'Meizu 20': 6.55, 'HTC U23 Pro': 6.4, 'Sharp Aquos R9': 6.5,
  'Infinix Note 40': 6.78, 'Infinix Note 50 Pro': 6.78, 'Infinix Zero 30': 6.78,
  'Infinix Hot 50': 6.78, 'Tecno Camon 30': 6.78, 'Tecno Spark 30': 6.78,
  'Tecno Pova 6 Pro': 6.78, 'Tecno Camon 40 Pro': 6.78,
  'itel S24': 6.78, 'itel A70': 6.6, 'Lava Blaze Curve': 6.67, 'Lava Agni 2': 6.78,
  'Doogee N50': 6.52, 'Doogee V30 Pro': 6.78, 'Oukitel WP28': 6.52, 'AGM H6': 6.58,
  'ZTE Axon 50 Ultra': 6.8, 'ZTE Axon 60 Ultra': 6.8, 'ZTE Blade V50': 6.6, 'ZTE Blade A73': 6.6,
  'Nokia G42 5G': 6.56, 'Nokia XR21': 6.49,
  'TCL 40 NxtPaper': 6.78, 'TCL 50 Pro NxtPaper': 6.8, 'Coolpad Cool 30': 6.56,
  'Xiaomi 13T': 6.67, 'Xiaomi 13T Pro': 6.67, 'Redmi Note 12 Turbo': 6.67,
  'Redmi Note 12T Pro': 6.6, 'Poco X6 Neo': 6.67,
  'OPPO Reno 11F': 6.7, 'OPPO A59 5G': 6.56,
  'Vivo T3': 6.67, 'Vivo T2x': 6.58, 'iQOO Z9x': 6.72,
  'Honor X6b': 6.56, 'Honor Play 9T': 6.77,
  'Infinix GT 10 Pro': 6.67, 'Infinix Zero 40': 6.78,
  'Tecno Pova 5': 6.78, 'Tecno Camon 20 Pro': 6.67,
  'itel RS4': 6.6, 'Lava Blaze 3 5G': 6.56, 'Ulefone Armor 24': 6.78
};
const DEFAULT_SCREEN_SIZE = 6.6;

/* 只保留手机机型：过滤 iPad / iPhone / 平板（Tab/Pad/Tablet）等非手机条目 */
const PHONE_MODEL_BLOCKLIST = /(ipad|iphone|ipod|tablet|matepad|mediapad|\btab\b|\bpad\b)/i;
const PHONE_DB = PHONES.filter(function (p) {
  const text = String(p.model) + ' ' + String(p.device_code);
  return !PHONE_MODEL_BLOCKLIST.test(text);
});

/* ============================================================
 * SoC → GPU / Vulkan / 频率 对照表（DataGenerator::$socGpuMap）
 * ============================================================ */

const SOC_GPU_MAP = {
  'Snapdragon 8 Elite': { gpu: 'Adreno 830', vendor: 'Qualcomm', gl: '3.2', gl_version: 'V@0630.0', vulkan: '1.3', frequency: [300000, 600000, 900000, 1200000, 1500000, 1800000, 2100000, 2400000, 2700000, 3000000, 3300000, 3600000, 3900000, 4200000, 4470000] },
  'Snapdragon 8 Gen 3': { gpu: 'Adreno 750', vendor: 'Qualcomm', gl: '3.2', gl_version: 'V@0530.0', vulkan: '1.3', frequency: [300000, 500000, 700000, 900000, 1100000, 1300000, 1500000, 1700000, 1900000, 2100000, 2300000, 2500000, 2700000, 2900000, 3100000, 3300000] },
  'Snapdragon 8 Gen 2': { gpu: 'Adreno 740', vendor: 'Qualcomm', gl: '3.2', gl_version: 'V@0486.0', vulkan: '1.3', frequency: [300000, 500000, 700000, 900000, 1100000, 1300000, 1500000, 1700000, 1900000, 2100000, 2300000, 2500000, 2700000, 2900000, 3100000, 3300000, 3360000] },
  'Snapdragon 8+ Gen 1': { gpu: 'Adreno 730', vendor: 'Qualcomm', gl: '3.2', gl_version: 'V@0462.0', vulkan: '1.2', frequency: [300000, 500000, 700000, 900000, 1100000, 1300000, 1500000, 1700000, 1900000, 2100000, 2300000, 2500000, 2700000, 2900000, 3000000] },
  'Snapdragon 7+ Gen 3': { gpu: 'Adreno 732', vendor: 'Qualcomm', gl: '3.2', gl_version: 'V@0530.0', vulkan: '1.3', frequency: [300000, 600000, 900000, 1200000, 1500000, 1800000, 2100000, 2400000, 2610000] },
  'Snapdragon 765G': { gpu: 'Adreno 620', vendor: 'Qualcomm', gl: '3.2', gl_version: 'V@0400.0', vulkan: '1.1', frequency: [300000, 600000, 900000, 1200000, 1500000, 1800000, 2100000, 2400000] },
  'Snapdragon 685': { gpu: 'Adreno 610', vendor: 'Qualcomm', gl: '3.2', gl_version: 'V@0400.0', vulkan: '1.1', frequency: [300000, 600000, 900000, 1200000, 1500000, 1800000, 2100000, 2400000] },
  'Snapdragon 6 Gen 3': { gpu: 'Adreno 710', vendor: 'Qualcomm', gl: '3.2', gl_version: 'V@0530.0', vulkan: '1.3', frequency: [300000, 600000, 900000, 1200000, 1500000, 1800000, 2100000, 2400000] },
  'Dimensity 9400': { gpu: 'Immortalis-G925', vendor: 'ARM', gl: '3.2', gl_version: 'v1.r4p0-00eac0.b0c21d07f7398f87a84f678063111a2e', vulkan: '1.3', frequency: [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000, 2400000, 2600000, 2800000, 3000000, 3200000, 3400000, 3600000, 3800000, 4000000, 4210000] },
  'Dimensity 9300': { gpu: 'Immortalis-G720', vendor: 'ARM', gl: '3.2', gl_version: 'v1.r0p0-00eac0.843348195f462f29a4f9b602973186d8', vulkan: '1.2', frequency: [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000, 2400000, 2600000, 2800000, 3000000, 3250000] },
  'Dimensity 8350': { gpu: 'Mali-G615 MC6', vendor: 'ARM', gl: '3.2', gl_version: 'v1.r4p0-00eac0.f3381954750a208830d63118a1835f09', vulkan: '1.3', frequency: [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000, 2400000, 2630000] },
  'Dimensity 8300 Extreme': { gpu: 'Mali-G615 MC6', vendor: 'ARM', gl: '3.2', gl_version: 'v1.r4p0-00eac0.f3381954750a208830d63118a1835f09', vulkan: '1.3', frequency: [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000, 2400000, 2630000] },
  'Dimensity 8200': { gpu: 'Mali-G610 MC6', vendor: 'ARM', gl: '3.2', gl_version: 'v1.r0p0-00eac0.73a461649f2e45580f51577000675708', vulkan: '1.3', frequency: [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000, 2400000, 2600000, 2800000, 3000000, 3100000] },
  'Dimensity 7300 Ultra': { gpu: 'Mali-G615 MC2', vendor: 'ARM', gl: '3.2', gl_version: 'v1.r4p0-00eac0.f3381954750a208830d63118a1835f09', vulkan: '1.3', frequency: [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000, 2400000, 2500000] },
  'Dimensity 7300': { gpu: 'Mali-G615 MC2', vendor: 'ARM', gl: '3.2', gl_version: 'v1.r4p0-00eac0.f3381954750a208830d63118a1835f09', vulkan: '1.3', frequency: [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000, 2400000, 2500000] },
  'Dimensity 7200X': { gpu: 'Mali-G610 MC4', vendor: 'ARM', gl: '3.2', gl_version: 'v1.r0p0-00eac0.73a461649f2e45580f51577000675708', vulkan: '1.3', frequency: [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000, 2400000] },
  'Dimensity 7200': { gpu: 'Mali-G610 MC4', vendor: 'ARM', gl: '3.2', gl_version: 'v1.r0p0-00eac0.73a461649f2e45580f51577000675708', vulkan: '1.3', frequency: [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000, 2400000] },
  'Dimensity 7050': { gpu: 'Mali-G605 MC4', vendor: 'ARM', gl: '3.2', gl_version: 'v1.r0p0-00eac0.50c2137f39b414720660e9353405090b', vulkan: '1.2', frequency: [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000, 2400000] },
  'Exynos 2400': { gpu: 'Xclipse 920', vendor: 'Samsung', gl: '3.2', gl_version: 'v1.r20p0-01e10.d39c8ba901a552ad', vulkan: '1.3', frequency: [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000, 2400000, 2600000, 2800000, 3000000, 3200000] },
  'Exynos 1480': { gpu: 'Mali-G68', vendor: 'ARM', gl: '3.2', gl_version: 'v1.r0p0-00eac0.601d1222d4b4e7c2f398d919e35328b2', vulkan: '1.3', frequency: [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000, 2400000, 2500000] },
  'Exynos 1380': { gpu: 'Mali-G68', vendor: 'ARM', gl: '3.2', gl_version: 'v1.r0p0-00eac0.601d1222d4b4e7c2f398d919e35328b2', vulkan: '1.2', frequency: [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000, 2400000] },
  'Tensor G4': { gpu: 'Mali-G715', vendor: 'ARM', gl: '3.2', gl_version: 'v1.r38p0-01eac0.824407f2d180930970b0438f95b04710', vulkan: '1.3', frequency: [500000, 600000, 750000, 900000, 1050000, 1200000, 1350000, 1500000, 1650000, 1800000, 1950000, 2100000, 2250000, 2400000, 2550000, 2700000, 2850000, 3000000, 3150000, 3300000, 3450000, 3600000, 3700000] },
  'Tensor G3': { gpu: 'Mali-G715', vendor: 'ARM', gl: '3.2', gl_version: 'v1.r38p0-01eac0.824407f2d180930970b0438f95b04710', vulkan: '1.2', frequency: [500000, 600000, 750000, 900000, 1050000, 1200000, 1350000, 1500000, 1650000, 1800000, 1950000, 2100000, 2250000, 2400000, 2550000, 2700000, 2850000, 3000000, 3150000, 3300000] },
  'Tensor G2': { gpu: 'Mali-G715', vendor: 'ARM', gl: '3.2', gl_version: 'v1.r34p0-01eac0.47289421189595692824397854050472', vulkan: '1.1', frequency: [500000, 600000, 750000, 900000, 1050000, 1200000, 1350000, 1500000, 1650000, 1800000, 1950000, 2100000, 2250000, 2400000, 2550000, 2700000, 2850000, 3000000] },
  'Tensor G1': { gpu: 'Mali-G78', vendor: 'ARM', gl: '3.2', gl_version: 'v1.r32p0-00eac0.71182211698962859752873973789917', vulkan: '1.1', frequency: [500000, 600000, 750000, 900000, 1050000, 1200000, 1350000, 1500000, 1650000, 1800000, 1950000, 2100000, 2250000, 2400000, 2550000, 2700000, 2850000] },
  'Kirin 9020': { gpu: 'Maleoon 910', vendor: 'Huawei', gl: '3.2', gl_version: 'v100.0.0', vulkan: '1.3', frequency: [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000, 2400000, 2610000] },
  'Kirin 9010': { gpu: 'Maleoon 910', vendor: 'Huawei', gl: '3.2', gl_version: 'v100.0.0', vulkan: '1.2', frequency: [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000, 2400000, 2500000] },
  'Kirin 9000S': { gpu: 'Maleoon 910', vendor: 'Huawei', gl: '3.2', gl_version: 'v100.0.0', vulkan: '1.1', frequency: [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000, 2400000] },
  'Snapdragon 8s Gen 3': { gpu: 'Adreno 735', vendor: 'Qualcomm', gl: '3.2', gl_version: 'V@0530.0', vulkan: '1.3', frequency: [300000, 600000, 900000, 1200000, 1500000, 1800000, 2100000, 2400000, 2700000, 3000000, 3300000] },
  'Snapdragon 7 Gen 3': { gpu: 'Adreno 720', vendor: 'Qualcomm', gl: '3.2', gl_version: 'V@0530.0', vulkan: '1.3', frequency: [300000, 600000, 900000, 1200000, 1500000, 1800000, 2100000, 2400000, 2610000] },
  'Snapdragon 7s Gen 2': { gpu: 'Adreno 710', vendor: 'Qualcomm', gl: '3.2', gl_version: 'V@0530.0', vulkan: '1.3', frequency: [300000, 600000, 900000, 1200000, 1500000, 1800000, 2100000, 2400000] },
  'Snapdragon 6s Gen 3': { gpu: 'Adreno 619', vendor: 'Qualcomm', gl: '3.2', gl_version: 'V@0400.0', vulkan: '1.1', frequency: [300000, 600000, 900000, 1200000, 1500000, 1800000, 2100000, 2200000] },
  'Snapdragon 695': { gpu: 'Adreno 619', vendor: 'Qualcomm', gl: '3.2', gl_version: 'V@0400.0', vulkan: '1.1', frequency: [300000, 600000, 900000, 1200000, 1500000, 1800000, 2100000, 2200000] },
  'Dimensity 9300+': { gpu: 'Immortalis-G720', vendor: 'ARM', gl: '3.2', gl_version: 'v1.r0p0-00eac0.843348195f462f29a4f9b602973186d8', vulkan: '1.2', frequency: [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000, 2400000, 2600000, 2800000, 3000000, 3250000] },
  'Dimensity 7200 Pro': { gpu: 'Mali-G610 MC4', vendor: 'ARM', gl: '3.2', gl_version: 'v1.r0p0-00eac0.73a461649f2e45580f51577000675708', vulkan: '1.3', frequency: [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000, 2400000] },
  'Dimensity 7025 Ultra': { gpu: 'Mali-G57 MC2', vendor: 'ARM', gl: '3.2', gl_version: 'v1.r0p0-00eac0.50c2137f39b414720660e9353405090b', vulkan: '1.2', frequency: [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000, 2400000] },
  'Dimensity 7025': { gpu: 'Mali-G57 MC2', vendor: 'ARM', gl: '3.2', gl_version: 'v1.r0p0-00eac0.50c2137f39b414720660e9353405090b', vulkan: '1.2', frequency: [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000, 2400000] },
  'Exynos 1580': { gpu: 'Xclipse 540', vendor: 'Samsung', gl: '3.2', gl_version: 'v1.r20p0-01e10.d39c8ba901a552ad', vulkan: '1.3', frequency: [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000, 2400000, 2500000] },
  'Exynos 2500': { gpu: 'Xclipse 950', vendor: 'Samsung', gl: '3.2', gl_version: 'v1.r20p0-01e10.d39c8ba901a552ad', vulkan: '1.3', frequency: [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000, 2400000, 2600000, 2800000, 3000000, 3200000] },
  'Exynos 2400e': { gpu: 'Xclipse 940', vendor: 'Samsung', gl: '3.2', gl_version: 'v1.r20p0-01e10.d39c8ba901a552ad', vulkan: '1.3', frequency: [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000, 2400000, 2600000, 2800000, 3000000] },
  'Exynos 2200': { gpu: 'Xclipse 920', vendor: 'Samsung', gl: '3.2', gl_version: 'v1.r20p0-01e10.d39c8ba901a552ad', vulkan: '1.3', frequency: [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000, 2400000, 2600000, 2800000] },
  'Exynos 1280': { gpu: 'Mali-G68', vendor: 'ARM', gl: '3.2', gl_version: 'v1.r0p0-00eac0.601d1222d4b4e7c2f398d919e35328b2', vulkan: '1.2', frequency: [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000] },
  'Dimensity 6300': { gpu: 'Mali-G57 MC2', vendor: 'ARM', gl: '3.2', gl_version: 'v1.r0p0-00eac0.50c2137f39b414720660e9353405090b', vulkan: '1.2', frequency: [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000, 2400000] },
  'Dimensity 7200 Ultra': { gpu: 'Mali-G610 MC4', vendor: 'ARM', gl: '3.2', gl_version: 'v1.r0p0-00eac0.73a461649f2e45580f51577000675708', vulkan: '1.3', frequency: [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000, 2400000] },
  'Dimensity 8300 Ultra': { gpu: 'Mali-G615 MC6', vendor: 'ARM', gl: '3.2', gl_version: 'v1.r4p0-00eac0.f3381954750a208830d63118a1835f09', vulkan: '1.3', frequency: [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000, 2400000, 2630000] },
  'Dimensity 9000': { gpu: 'Mali-G710 MC10', vendor: 'ARM', gl: '3.2', gl_version: 'v1.r0p0-00eac0.73a461649f2e45580f51577000675708', vulkan: '1.3', frequency: [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000, 2400000, 2600000, 2800000] },
  'Dimensity 9200': { gpu: 'Immortalis-G715', vendor: 'ARM', gl: '3.2', gl_version: 'v1.r0p0-00eac0.843348195f462f29a4f9b602973186d8', vulkan: '1.3', frequency: [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000, 2400000, 2600000, 2800000, 3000000] },
  'Dimensity 7350': { gpu: 'Mali-G615 MC2', vendor: 'ARM', gl: '3.2', gl_version: 'v1.r4p0-00eac0.f3381954750a208830d63118a1835f09', vulkan: '1.3', frequency: [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000, 2400000] },
  'Dimensity 7020': { gpu: 'Mali-G57 MC2', vendor: 'ARM', gl: '3.2', gl_version: 'v1.r0p0-00eac0.50c2137f39b414720660e9353405090b', vulkan: '1.2', frequency: [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000, 2400000] },
  'Snapdragon 6490': { gpu: 'Adreno 642L', vendor: 'Qualcomm', gl: '3.2', gl_version: 'V@0512.0', vulkan: '1.1', frequency: [300000, 600000, 900000, 1200000, 1500000, 1800000, 2100000, 2200000] },
  'Snapdragon 6 Gen 1': { gpu: 'Adreno 710', vendor: 'Qualcomm', gl: '3.2', gl_version: 'V@0530.0', vulkan: '1.3', frequency: [300000, 600000, 900000, 1200000, 1500000, 1800000, 2100000, 2200000] },
  'Helio G99': { gpu: 'Mali-G57 MC2', vendor: 'ARM', gl: '3.2', gl_version: 'v1.r0p0-00eac0.50c2137f39b414720660e9353405090b', vulkan: '1.2', frequency: [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000] },
  'Helio G91': { gpu: 'Mali-G52 MC2', vendor: 'ARM', gl: '3.2', gl_version: 'v1.r0p0-00eac0.601d1222d4b4e7c2f398d919e35328b2', vulkan: '1.1', frequency: [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000] },
  'Helio G88': { gpu: 'Mali-G52 MC2', vendor: 'ARM', gl: '3.2', gl_version: 'v1.r0p0-00eac0.601d1222d4b4e7c2f398d919e35328b2', vulkan: '1.1', frequency: [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000] },
  'Helio G85': { gpu: 'Mali-G52 MC2', vendor: 'ARM', gl: '3.2', gl_version: 'v1.r0p0-00eac0.601d1222d4b4e7c2f398d919e35328b2', vulkan: '1.1', frequency: [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000] },
  'Helio G81': { gpu: 'Mali-G52 MC2', vendor: 'ARM', gl: '3.2', gl_version: 'v1.r0p0-00eac0.601d1222d4b4e7c2f398d919e35328b2', vulkan: '1.1', frequency: [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000] },
  'Exynos 850': { gpu: 'Mali-G52', vendor: 'ARM', gl: '3.2', gl_version: 'v1.r0p0-00eac0.601d1222d4b4e7c2f398d919e35328b2', vulkan: '1.1', frequency: [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000] },
  'Exynos 1330': { gpu: 'Mali-G68', vendor: 'ARM', gl: '3.2', gl_version: 'v1.r0p0-00eac0.601d1222d4b4e7c2f398d919e35328b2', vulkan: '1.2', frequency: [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000] },
  'Dimensity 900': { gpu: 'Mali-G68 MC4', vendor: 'ARM', gl: '3.2', gl_version: 'v1.r0p0-00eac0.73a461649f2e45580f51577000675708', vulkan: '1.2', frequency: [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000, 2400000] },
  'Dimensity 1080': { gpu: 'Mali-G68 MC4', vendor: 'ARM', gl: '3.2', gl_version: 'v1.r0p0-00eac0.73a461649f2e45580f51577000675708', vulkan: '1.2', frequency: [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000, 2400000] },
  'Dimensity 1300': { gpu: 'Mali-G77 MC9', vendor: 'ARM', gl: '3.2', gl_version: 'v1.r0p0-00eac0.73a461649f2e45580f51577000675708', vulkan: '1.2', frequency: [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000, 2400000, 2600000] },
  'Dimensity 6020': { gpu: 'Mali-G57 MC2', vendor: 'ARM', gl: '3.2', gl_version: 'v1.r0p0-00eac0.50c2137f39b414720660e9353405090b', vulkan: '1.2', frequency: [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000, 2400000] },
  'Dimensity 6080': { gpu: 'Mali-G57 MC2', vendor: 'ARM', gl: '3.2', gl_version: 'v1.r0p0-00eac0.50c2137f39b414720660e9353405090b', vulkan: '1.2', frequency: [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000, 2400000] },
  'Dimensity 6100+': { gpu: 'Mali-G57 MC2', vendor: 'ARM', gl: '3.2', gl_version: 'v1.r0p0-00eac0.50c2137f39b414720660e9353405090b', vulkan: '1.2', frequency: [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000, 2400000] },
  'Dimensity 7030': { gpu: 'Mali-G57 MC2', vendor: 'ARM', gl: '3.2', gl_version: 'v1.r0p0-00eac0.50c2137f39b414720660e9353405090b', vulkan: '1.2', frequency: [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000, 2400000] },
  'Dimensity 8020': { gpu: 'Mali-G610 MC6', vendor: 'ARM', gl: '3.2', gl_version: 'v1.r0p0-00eac0.73a461649f2e45580f51577000675708', vulkan: '1.3', frequency: [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000, 2400000, 2600000] },
  'Snapdragon 680': { gpu: 'Adreno 610', vendor: 'Qualcomm', gl: '3.2', gl_version: 'V@0400.0', vulkan: '1.1', frequency: [300000, 600000, 900000, 1200000, 1500000, 1800000, 2100000, 2200000] },
  'Snapdragon 4 Gen 2': { gpu: 'Adreno 613', vendor: 'Qualcomm', gl: '3.2', gl_version: 'V@0530.0', vulkan: '1.1', frequency: [300000, 600000, 900000, 1200000, 1500000, 1800000, 2100000, 2200000] },
  'Snapdragon 7 Gen 1': { gpu: 'Adreno 644', vendor: 'Qualcomm', gl: '3.2', gl_version: 'V@0486.0', vulkan: '1.2', frequency: [300000, 600000, 900000, 1200000, 1500000, 1800000, 2100000, 2400000] },
  'Snapdragon 7 Gen 2': { gpu: 'Adreno 725', vendor: 'Qualcomm', gl: '3.2', gl_version: 'V@0530.0', vulkan: '1.3', frequency: [300000, 600000, 900000, 1200000, 1500000, 1800000, 2100000, 2400000, 2610000] },
  'Snapdragon 778G': { gpu: 'Adreno 642L', vendor: 'Qualcomm', gl: '3.2', gl_version: 'V@0512.0', vulkan: '1.1', frequency: [300000, 600000, 900000, 1200000, 1500000, 1800000, 2100000, 2400000] },
  'Snapdragon 782G': { gpu: 'Adreno 642L', vendor: 'Qualcomm', gl: '3.2', gl_version: 'V@0512.0', vulkan: '1.1', frequency: [300000, 600000, 900000, 1200000, 1500000, 1800000, 2100000, 2400000] },
  'Snapdragon 888': { gpu: 'Adreno 660', vendor: 'Qualcomm', gl: '3.2', gl_version: 'V@0502.0', vulkan: '1.1', frequency: [300000, 500000, 700000, 900000, 1100000, 1300000, 1500000, 1700000, 1900000, 2100000, 2300000, 2500000, 2700000, 2900000, 3100000] },
  'Unisoc T612': { gpu: 'Mali-G57', vendor: 'ARM', gl: '3.2', gl_version: 'v1.r0p0-00eac0.50c2137f39b414720660e9353405090b', vulkan: '1.1', frequency: [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000] },
  'Dimensity 930': { gpu: 'Mali-G68 MC4', vendor: 'ARM', gl: '3.2', gl_version: 'v1.r0p0-00eac0.73a461649f2e45580f51577000675708', vulkan: '1.2', frequency: [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000, 2400000] },
  'Dimensity 8100': { gpu: 'Mali-G610 MC6', vendor: 'ARM', gl: '3.2', gl_version: 'v1.r0p0-00eac0.73a461649f2e45580f51577000675708', vulkan: '1.3', frequency: [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000, 2400000, 2600000] },
  'Dimensity 8000': { gpu: 'Mali-G610 MC6', vendor: 'ARM', gl: '3.2', gl_version: 'v1.r0p0-00eac0.73a461649f2e45580f51577000675708', vulkan: '1.3', frequency: [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000, 2400000, 2600000] },
  'Dimensity 700': { gpu: 'Mali-G57 MC2', vendor: 'ARM', gl: '3.2', gl_version: 'v1.r0p0-00eac0.50c2137f39b414720660e9353405090b', vulkan: '1.2', frequency: [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000] },
  'Dimensity 9000+': { gpu: 'Mali-G710 MC10', vendor: 'ARM', gl: '3.2', gl_version: 'v1.r0p0-00eac0.73a461649f2e45580f51577000675708', vulkan: '1.3', frequency: [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000, 2400000, 2600000, 2800000, 3000000] },
  'Dimensity 8200 Ultra': { gpu: 'Mali-G610 MC6', vendor: 'ARM', gl: '3.2', gl_version: 'v1.r0p0-00eac0.73a461649f2e45580f51577000675708', vulkan: '1.3', frequency: [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000, 2400000, 2600000, 2800000, 3000000] },
  'Snapdragon 7s Gen 3': { gpu: 'Adreno 810', vendor: 'Qualcomm', gl: '3.2', gl_version: 'V@0530.0', vulkan: '1.3', frequency: [300000, 600000, 900000, 1200000, 1500000, 1800000, 2100000, 2400000, 2600000] },
  'Unisoc T760': { gpu: 'Mali-G57', vendor: 'ARM', gl: '3.2', gl_version: 'v1.r0p0-00eac0.50c2137f39b414720660e9353405090b', vulkan: '1.1', frequency: [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000] },
  'Unisoc T606': { gpu: 'Mali-G57', vendor: 'ARM', gl: '3.2', gl_version: 'v1.r0p0-00eac0.50c2137f39b414720660e9353405090b', vulkan: '1.1', frequency: [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000] },
  'Helio G96': { gpu: 'Mali-G57 MC2', vendor: 'ARM', gl: '3.2', gl_version: 'v1.r0p0-00eac0.50c2137f39b414720660e9353405090b', vulkan: '1.2', frequency: [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000] },
  'Snapdragon 480+': { gpu: 'Adreno 619', vendor: 'Qualcomm', gl: '3.2', gl_version: 'V@0400.0', vulkan: '1.1', frequency: [300000, 600000, 900000, 1200000, 1500000, 1800000, 2100000, 2200000] },
  'Dimensity 8050': { gpu: 'Mali-G77 MC9', vendor: 'ARM', gl: '3.2', gl_version: 'v1.r0p0-00eac0.73a461649f2e45580f51577000675708', vulkan: '1.3', frequency: [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000, 2400000, 2600000, 2800000, 3000000] }
};

/* SoC → 逻辑核心数 / 内存档位 / 传感器档位（与 SOC_GPU_MAP 一一对应，保证硬件信息自洽） */
const SOC_SPEC_MAP = {
  'Snapdragon 8 Elite':    { cores: 8,  ram: [12, 16], tier: 'flagship' },
  'Snapdragon 8 Gen 3':    { cores: 8,  ram: [12, 16], tier: 'flagship' },
  'Snapdragon 8 Gen 2':    { cores: 8,  ram: [8, 12],  tier: 'flagship' },
  'Snapdragon 8+ Gen 1':   { cores: 8,  ram: [8, 12],  tier: 'mid' },
  'Snapdragon 7+ Gen 3':   { cores: 8,  ram: [8, 12],  tier: 'mid' },
  'Snapdragon 6 Gen 3':    { cores: 8,  ram: [8, 12],  tier: 'mid' },
  'Snapdragon 765G':       { cores: 8,  ram: [6, 8],   tier: 'entry' },
  'Snapdragon 685':        { cores: 8,  ram: [6, 8],   tier: 'entry' },
  'Dimensity 9400':        { cores: 8,  ram: [12, 16], tier: 'flagship' },
  'Dimensity 9300':        { cores: 8,  ram: [12, 16], tier: 'flagship' },
  'Dimensity 8350':        { cores: 8,  ram: [8, 12],  tier: 'mid' },
  'Dimensity 8300 Extreme':{ cores: 8,  ram: [8, 12],  tier: 'mid' },
  'Dimensity 8200':        { cores: 8,  ram: [8, 12],  tier: 'mid' },
  'Dimensity 7300 Ultra':  { cores: 8,  ram: [8, 12],  tier: 'mid' },
  'Dimensity 7300':        { cores: 8,  ram: [8, 12],  tier: 'mid' },
  'Dimensity 7200X':       { cores: 8,  ram: [8, 12],  tier: 'mid' },
  'Dimensity 7200':        { cores: 8,  ram: [8, 12],  tier: 'mid' },
  'Dimensity 7050':        { cores: 8,  ram: [8, 12],  tier: 'mid' },
  'Exynos 2400':           { cores: 10, ram: [8, 12],  tier: 'flagship' },
  'Exynos 1480':           { cores: 8,  ram: [8, 12],  tier: 'mid' },
  'Exynos 1380':           { cores: 8,  ram: [6, 8],   tier: 'mid' },
  'Tensor G4':             { cores: 8,  ram: [8, 12, 16], tier: 'flagship' },
  'Tensor G3':             { cores: 9,  ram: [8, 12],  tier: 'flagship' },
  'Tensor G2':             { cores: 8,  ram: [8, 12],  tier: 'mid' },
  'Tensor G1':             { cores: 8,  ram: [8, 12],  tier: 'flagship' },
  'Kirin 9020':            { cores: 12, ram: [12, 16], tier: 'flagship' },
  'Kirin 9010':            { cores: 12, ram: [8, 12],  tier: 'flagship' },
  'Kirin 9000S':           { cores: 12, ram: [8, 12],  tier: 'flagship' },
  'Snapdragon 8s Gen 3':   { cores: 8,  ram: [12, 16], tier: 'flagship' },
  'Snapdragon 7 Gen 3':    { cores: 8,  ram: [8, 12],  tier: 'mid' },
  'Snapdragon 7s Gen 2':   { cores: 8,  ram: [8, 12],  tier: 'mid' },
  'Snapdragon 6s Gen 3':   { cores: 8,  ram: [6, 8],   tier: 'entry' },
  'Snapdragon 695':        { cores: 8,  ram: [6, 8],   tier: 'entry' },
  'Dimensity 9300+':       { cores: 8,  ram: [12, 16], tier: 'flagship' },
  'Dimensity 7200 Pro':    { cores: 8,  ram: [8, 12],  tier: 'mid' },
  'Dimensity 7025 Ultra':  { cores: 8,  ram: [8, 12],  tier: 'mid' },
  'Dimensity 7025':        { cores: 8,  ram: [8, 12],  tier: 'mid' },
  'Exynos 1580':           { cores: 8,  ram: [8, 12],  tier: 'mid' },
  'Exynos 2500':           { cores: 10, ram: [12],     tier: 'flagship' },
  'Exynos 2400e':          { cores: 10, ram: [8, 12],  tier: 'flagship' },
  'Exynos 2200':           { cores: 8,  ram: [8, 12],  tier: 'flagship' },
  'Exynos 1280':           { cores: 8,  ram: [6, 8],   tier: 'mid' },
  'Dimensity 6300':        { cores: 8,  ram: [6, 8],   tier: 'mid' },
  'Dimensity 7200 Ultra':  { cores: 8,  ram: [8, 12],  tier: 'mid' },
  'Dimensity 8300 Ultra':  { cores: 8,  ram: [8, 12],  tier: 'mid' },
  'Dimensity 9000':        { cores: 8,  ram: [8, 12],  tier: 'flagship' },
  'Dimensity 9200':        { cores: 8,  ram: [8, 12],  tier: 'flagship' },
  'Dimensity 7350':        { cores: 8,  ram: [8, 12],  tier: 'mid' },
  'Dimensity 7020':        { cores: 8,  ram: [6, 8],   tier: 'mid' },
  'Snapdragon 6490':       { cores: 8,  ram: [6, 8],   tier: 'mid' },
  'Snapdragon 6 Gen 1':    { cores: 8,  ram: [6, 8],   tier: 'mid' },
  'Helio G99':             { cores: 8,  ram: [4, 6],   tier: 'entry' },
  'Helio G91':             { cores: 8,  ram: [4, 6],   tier: 'entry' },
  'Helio G88':             { cores: 8,  ram: [4, 6],   tier: 'entry' },
  'Helio G85':             { cores: 8,  ram: [4, 6],   tier: 'entry' },
  'Helio G81':             { cores: 8,  ram: [4, 6],   tier: 'entry' },
  'Exynos 850':            { cores: 8,  ram: [4, 6],   tier: 'entry' },
  'Exynos 1330':           { cores: 8,  ram: [4, 6],   tier: 'entry' },
  'Dimensity 900':         { cores: 8,  ram: [8, 12],  tier: 'mid' },
  'Dimensity 1080':        { cores: 8,  ram: [6, 8],   tier: 'mid' },
  'Dimensity 1300':        { cores: 8,  ram: [8, 12],  tier: 'mid' },
  'Dimensity 6020':        { cores: 8,  ram: [4, 6],   tier: 'entry' },
  'Dimensity 6080':        { cores: 8,  ram: [6, 8],   tier: 'mid' },
  'Dimensity 6100+':       { cores: 8,  ram: [4, 6],   tier: 'entry' },
  'Dimensity 7030':        { cores: 8,  ram: [8, 12],  tier: 'mid' },
  'Dimensity 8020':        { cores: 8,  ram: [8, 12],  tier: 'mid' },
  'Snapdragon 680':        { cores: 8,  ram: [4, 6],   tier: 'entry' },
  'Snapdragon 4 Gen 2':    { cores: 8,  ram: [4, 8],   tier: 'entry' },
  'Snapdragon 7 Gen 1':    { cores: 8,  ram: [8, 12],  tier: 'mid' },
  'Snapdragon 7 Gen 2':    { cores: 8,  ram: [8, 12],  tier: 'mid' },
  'Snapdragon 778G':       { cores: 8,  ram: [6, 8],   tier: 'mid' },
  'Snapdragon 782G':       { cores: 8,  ram: [8, 12],  tier: 'mid' },
  'Snapdragon 888':        { cores: 8,  ram: [8, 12],  tier: 'flagship' },
  'Unisoc T612':           { cores: 8,  ram: [4, 6],   tier: 'entry' },
  'Dimensity 930':         { cores: 8,  ram: [6, 8],   tier: 'mid' },
  'Dimensity 8100':        { cores: 8,  ram: [8, 12],  tier: 'flagship' },
  'Dimensity 8000':        { cores: 8,  ram: [8, 12],  tier: 'flagship' },
  'Dimensity 700':         { cores: 8,  ram: [4, 6],   tier: 'entry' },
  'Dimensity 9000+':       { cores: 8,  ram: [8, 12],  tier: 'flagship' },
  'Dimensity 8200 Ultra':  { cores: 8,  ram: [12, 16], tier: 'flagship' },
  'Snapdragon 7s Gen 3':   { cores: 8,  ram: [8, 12],  tier: 'mid' },
  'Unisoc T760':           { cores: 8,  ram: [6, 8],   tier: 'entry' },
  'Unisoc T606':           { cores: 8,  ram: [4, 6],   tier: 'entry' },
  'Helio G96':             { cores: 8,  ram: [6, 8],   tier: 'entry' },
  'Snapdragon 480+':       { cores: 8,  ram: [4, 6],   tier: 'entry' },
  'Dimensity 8050':        { cores: 8,  ram: [8, 12],  tier: 'mid' }
};

/* 传感器清单：与机型档次一致，不出现平板 / 折叠外屏等机型专属项 */
const SENSOR_SETS = {
  flagship: ['accelerometer', 'gyroscope', 'magnetometer', 'light', 'proximity',
             'pressure', 'step_counter', 'fingerprint', 'hall'],
  mid: ['accelerometer', 'gyroscope', 'magnetometer', 'light', 'proximity', 'fingerprint'],
  entry: ['accelerometer', 'light', 'proximity', 'fingerprint']
};

/* SoC → /proc/cpuinfo 的 CPU implementer / CPU part
 * 必须与 SoC 厂商、核心代际自洽：Oryon=0x51，HiSilicon=0x48，其余 ARM 架构=0x41 */
const CPU_IDENTITY = {
  'Snapdragon 8 Elite':     { implementer: '0x51', parts: ['0x001'] },
  'Snapdragon 8 Gen 3':     { implementer: '0x41', parts: ['0xd82', '0xd81', '0xd80'] },
  'Snapdragon 8 Gen 2':     { implementer: '0x41', parts: ['0xd4e', '0xd4d', '0xd46'] },
  'Snapdragon 8+ Gen 1':    { implementer: '0x41', parts: ['0xd4e', '0xd4d', '0xd46'] },
  'Snapdragon 7+ Gen 3':    { implementer: '0x41', parts: ['0xd82', '0xd81', '0xd80'] },
  'Snapdragon 6 Gen 3':     { implementer: '0x41', parts: ['0xd41', '0xd03'] },
  'Snapdragon 765G':        { implementer: '0x41', parts: ['0xd0b', '0xd03'] },
  'Snapdragon 685':         { implementer: '0x41', parts: ['0xd09', '0xd03'] },
  'Dimensity 9400':         { implementer: '0x41', parts: ['0xd82', '0xd81', '0xd80'] },
  'Dimensity 9300':         { implementer: '0x41', parts: ['0xd4e', '0xd4d', '0xd46'] },
  'Dimensity 8350':         { implementer: '0x41', parts: ['0xd4d', '0xd46'] },
  'Dimensity 8300 Extreme': { implementer: '0x41', parts: ['0xd4d', '0xd46'] },
  'Dimensity 8200':         { implementer: '0x41', parts: ['0xd41', '0xd03'] },
  'Dimensity 7300 Ultra':   { implementer: '0x41', parts: ['0xd41', '0xd03'] },
  'Dimensity 7300':         { implementer: '0x41', parts: ['0xd41', '0xd03'] },
  'Dimensity 7200X':        { implementer: '0x41', parts: ['0xd4d', '0xd46'] },
  'Dimensity 7200':         { implementer: '0x41', parts: ['0xd4d', '0xd46'] },
  'Dimensity 7050':         { implementer: '0x41', parts: ['0xd41', '0xd03'] },
  'Exynos 2400':            { implementer: '0x41', parts: ['0xd82', '0xd81', '0xd80'] },
  'Exynos 1480':            { implementer: '0x41', parts: ['0xd41', '0xd03'] },
  'Exynos 1380':            { implementer: '0x41', parts: ['0xd41', '0xd03'] },
  'Tensor G4':              { implementer: '0x41', parts: ['0xd82', '0xd81', '0xd80'] },
  'Tensor G3':              { implementer: '0x41', parts: ['0xd4e', '0xd4d', '0xd46'] },
  'Tensor G2':              { implementer: '0x41', parts: ['0xd48', '0xd47', '0xd46'] },
  'Tensor G1':              { implementer: '0x41', parts: ['0xd44', '0xd47', '0xd46'] },
  'Kirin 9020':             { implementer: '0x48', parts: ['0xd42', '0xd43'] },
  'Kirin 9010':             { implementer: '0x48', parts: ['0xd42', '0xd43'] },
  'Kirin 9000S':            { implementer: '0x48', parts: ['0xd42', '0xd43'] },
  'Snapdragon 8s Gen 3':    { implementer: '0x41', parts: ['0xd82', '0xd81', '0xd80'] },
  'Snapdragon 7 Gen 3':     { implementer: '0x41', parts: ['0xd4e', '0xd4d', '0xd46'] },
  'Snapdragon 7s Gen 2':    { implementer: '0x41', parts: ['0xd41', '0xd03'] },
  'Snapdragon 6s Gen 3':    { implementer: '0x41', parts: ['0xd41', '0xd03'] },
  'Snapdragon 695':         { implementer: '0x41', parts: ['0xd41', '0xd03'] },
  'Dimensity 9300+':        { implementer: '0x41', parts: ['0xd4e', '0xd4d', '0xd46'] },
  'Dimensity 7200 Pro':     { implementer: '0x41', parts: ['0xd4d', '0xd46'] },
  'Dimensity 7025 Ultra':   { implementer: '0x41', parts: ['0xd41', '0xd03'] },
  'Dimensity 7025':         { implementer: '0x41', parts: ['0xd41', '0xd03'] },
  'Exynos 1580':            { implementer: '0x41', parts: ['0xd41', '0xd03'] },
  'Exynos 2500':            { implementer: '0x41', parts: ['0xd82', '0xd81', '0xd80'] },
  'Exynos 2400e':           { implementer: '0x41', parts: ['0xd82', '0xd81', '0xd80'] },
  'Exynos 2200':            { implementer: '0x41', parts: ['0xd44', '0xd47', '0xd46'] },
  'Exynos 1280':            { implementer: '0x41', parts: ['0xd41', '0xd03'] },
  'Dimensity 6300':         { implementer: '0x41', parts: ['0xd41', '0xd03'] },
  'Dimensity 7200 Ultra':   { implementer: '0x41', parts: ['0xd4d', '0xd46'] },
  'Dimensity 8300 Ultra':   { implementer: '0x41', parts: ['0xd4d', '0xd46'] },
  'Dimensity 9000':         { implementer: '0x41', parts: ['0xd46', '0xd47', '0xd48'] },
  'Dimensity 9200':         { implementer: '0x41', parts: ['0xd4e', '0xd4d', '0xd46'] },
  'Dimensity 7350':         { implementer: '0x41', parts: ['0xd41', '0xd03'] },
  'Dimensity 7020':         { implementer: '0x41', parts: ['0xd41', '0xd03'] },
  'Snapdragon 6490':        { implementer: '0x41', parts: ['0xd41', '0xd03'] },
  'Snapdragon 6 Gen 1':     { implementer: '0x41', parts: ['0xd41', '0xd03'] },
  'Helio G99':              { implementer: '0x41', parts: ['0xd41', '0xd03'] },
  'Helio G91':              { implementer: '0x41', parts: ['0xd03', '0xd04'] },
  'Helio G88':              { implementer: '0x41', parts: ['0xd03', '0xd04'] },
  'Helio G85':              { implementer: '0x41', parts: ['0xd03', '0xd04'] },
  'Helio G81':              { implementer: '0x41', parts: ['0xd03', '0xd04'] },
  'Exynos 850':             { implementer: '0x41', parts: ['0xd03'] },
  'Exynos 1330':            { implementer: '0x41', parts: ['0xd41', '0xd03'] },
  'Dimensity 900':          { implementer: '0x41', parts: ['0xd41', '0xd03'] },
  'Dimensity 1080':         { implementer: '0x41', parts: ['0xd41', '0xd03'] },
  'Dimensity 1300':         { implementer: '0x41', parts: ['0xd41', '0xd03'] },
  'Dimensity 6020':         { implementer: '0x41', parts: ['0xd41', '0xd03'] },
  'Dimensity 6080':         { implementer: '0x41', parts: ['0xd41', '0xd03'] },
  'Dimensity 6100+':        { implementer: '0x41', parts: ['0xd41', '0xd03'] },
  'Dimensity 7030':         { implementer: '0x41', parts: ['0xd41', '0xd03'] },
  'Dimensity 8020':         { implementer: '0x41', parts: ['0xd4d', '0xd46'] },
  'Snapdragon 680':         { implementer: '0x41', parts: ['0xd41', '0xd03'] },
  'Snapdragon 4 Gen 2':     { implementer: '0x41', parts: ['0xd41', '0xd03'] },
  'Snapdragon 7 Gen 1':     { implementer: '0x41', parts: ['0xd41', '0xd03'] },
  'Snapdragon 7 Gen 2':     { implementer: '0x41', parts: ['0xd41', '0xd03'] },
  'Snapdragon 778G':        { implementer: '0x41', parts: ['0xd41', '0xd03'] },
  'Snapdragon 782G':        { implementer: '0x41', parts: ['0xd41', '0xd03'] },
  'Snapdragon 888':         { implementer: '0x41', parts: ['0xd44', '0xd47', '0xd46'] },
  'Unisoc T612':            { implementer: '0x41', parts: ['0xd03'] },
  'Dimensity 930':          { implementer: '0x41', parts: ['0xd41', '0xd03'] },
  'Dimensity 8100':         { implementer: '0x41', parts: ['0xd46', '0xd47', '0xd48'] },
  'Dimensity 8000':         { implementer: '0x41', parts: ['0xd46', '0xd47', '0xd48'] },
  'Dimensity 700':          { implementer: '0x41', parts: ['0xd41', '0xd03'] },
  'Dimensity 9000+':        { implementer: '0x41', parts: ['0xd46', '0xd47', '0xd48'] },
  'Dimensity 8200 Ultra':   { implementer: '0x41', parts: ['0xd46', '0xd47', '0xd48'] },
  'Snapdragon 7s Gen 3':    { implementer: '0x41', parts: ['0xd41', '0xd03'] },
  'Unisoc T760':            { implementer: '0x41', parts: ['0xd03', '0xd04'] },
  'Unisoc T606':            { implementer: '0x41', parts: ['0xd03', '0xd04'] },
  'Helio G96':              { implementer: '0x41', parts: ['0xd41', '0xd03'] },
  'Snapdragon 480+':        { implementer: '0x41', parts: ['0xd41', '0xd03'] },
  'Dimensity 8050':         { implementer: '0x41', parts: ['0xd41', '0xd03'] }
};

const DEFAULT_SOC = 'Snapdragon 8 Gen 3';

/* Widevine CDM 大版本随 Android 版本演进（均为官方真实版本号） */
const DRM_VERSION_BY_ANDROID = { '13': '15.0.0', '14': '16.0.0', '15': '17.0.0', '16': '18.0.0' };

/* DRM 安全级别必须与机型档次一致：旗舰普遍 L1，中低端为 L3；
 * Pixel 走 Google 软件 CDM（L3），避免出现 "Google + L1" 的冲突组合 */
function drmSecurityLevelFor(p, socModel) {
  const brand = String((p && p.brand) || '').toLowerCase();
  const model = String((p && p.model) || '');
  if (brand === 'google') return 'L3';
  if (brand === 'samsung') return /^Galaxy (S|Z)/.test(model) ? 'L1' : 'L3';
  if (brand === 'sony') return /^Xperia (1|5)(\s|$)/.test(model) ? 'L1' : 'L3';
  if (brand === 'asus') return 'L1';
  if (brand === 'nothing') return /Phone \(3\)/.test(model) ? 'L1' : 'L3';
  const spec = SOC_SPEC_MAP[socModel] || SOC_SPEC_MAP[DEFAULT_SOC];
  return spec.tier === 'flagship' ? 'L1' : 'L3';
}

/* OEMCrypto 厂商必须与芯片平台一致，禁止跨平台混用 */
function drmVendorForSoc(socModel) {
  if (/^Snapdragon/.test(socModel)) return 'Qualcomm';
  if (/^Dimensity/.test(socModel)) return 'MediaTek';
  if (/^Exynos/.test(socModel)) return 'Samsung';
  if (/^Tensor/.test(socModel)) return 'Google';
  if (/^Kirin/.test(socModel)) return 'Huawei';
  return 'Qualcomm';
}

/* 合法 Widevine / OEMCrypto 组合：
 * - SystemId 8159 是 Widevine 规范固定的 System ID（OEMCrypto 与软件 CDM 相同），不能编造其他值
 * - L1 = 硬件 OEMCrypto，必须搭配 HDCP2.2；L3 = 软件 CDM，Unprotected
 * - Algorithm 只使用 Widevine 规范允许的套件 */
function buildDrmObject(p, socModel, androidVersion) {
  const level = drmSecurityLevelFor(p, socModel);
  const base = DRM_VERSION_BY_ANDROID[String(androidVersion)] || '17.0.0';
  const baseParts = base.split('.');
  /* 同分支小版本浮动（如 17.0.0 ~ 17.0.3） */
  const version = baseParts[0] + '.' + baseParts[1] + '.' + String(randInt(0, 3));
  const isL1 = level === 'L1';

  return {
    Vendor: isL1 ? drmVendorForSoc(socModel) : 'Google',
    Version: version,
    Description: isL1 ? 'OEMCrypto Widevine' : 'Widevine CDM',
    Algorithm: isL1
      ? 'AES/CBC/NoPadding,AES/CTR/NoPadding,HmacSHA256'
      : 'AES/CBC/NoPadding,HmacSHA256',
    SecurityLevel: level,
    SystemId: 8159,
    HdcpLevel: isL1 ? 'HDCP2.2' : 'Unprotected',
    MaxHdcpLevel: isL1 ? 'HDCP2.2' : 'Unprotected',
    UsageReportingSupport: true,
    MaxNumberOfSessions: randChoice([8, 12, 16]),
    NumberOfOpenSessions: 0
  };
}

/* 运营商表 [mcc, mnc, name, countryIso]（DataGenerator::$networks） */
const NETWORKS = [
  ['310', '410', 'Verizon', 'us'],
  ['310', '260', 'T-Mobile', 'us'],
  ['310', '160', 'AT&T', 'us'],
  ['310', '040', 'Vodafone', 'us'],
  ['234', '15', 'O2', 'gb'],
  ['234', '30', 'Vodafone', 'gb'],
  ['234', '20', 'EE', 'gb'],
  ['262', '01', 'Orange', 'de'],
  ['262', '02', 'SFR', 'de'],
  ['262', '07', 'Bouygues', 'de'],
  ['303', '1', 'Vodafone', 'de'],
  ['303', '2', 'Telekom', 'de'],
  ['303', '9', 'O2', 'de'],
  ['440', '11', 'NTT Docomo', 'jp'],
  ['440', '07', 'SoftBank', 'jp'],
  ['525', '01', 'KT', 'kr'],
  ['525', '03', 'SK Telecom', 'kr'],
  ['466', '92', 'China Mobile', 'tw'],
  ['466', '97', 'China Unicom', 'tw'],
  ['466', '93', 'China Telecom', 'tw']
];

/* SoC 前缀 → Build.HARDWARE 名称（DataGenerator::$socHardwareNames） */
const SOC_HARDWARE_NAMES = [
  ['Snapdragon', 'qcom'],
  ['Dimensity', 'mtk'],
  ['Exynos', 'exynos'],
  ['Tensor', 'tesla'],
  ['Kirin', 'kirin']
];

/* 品牌 → TAC 前缀（generateTac） */
const TAC_BY_BRAND = {
  google: ['356938', '359057', '354237', '355418', '358852'],
  samsung: ['357850', '356938', '354237', '355418', '358852', '359057'],
  xiaomi: ['866221', '866225', '866228', '866229', '866230'],
  oneplus: ['864410', '864411', '864412', '864413', '864414'],
  oppo: ['865790', '865791', '865792', '865793', '865794'],
  vivo: ['867300', '867301', '867302', '867303', '867304'],
  huawei: ['865300', '865301', '865302', '865303', '865304'],
  motorola: ['354595', '354596', '354597', '354598', '354599'],
  sony: ['354237', '354238', '354239', '354240', '354241'],
  lg: ['354237', '354238', '354239', '354240', '354241']
};

/* 品牌 → 基带版本（generateBasebandVersion） */
const BASEBANDS_BY_BRAND = {
  google: ['g5135b-250115-01', 'g5135b-250210-02', 'g5135b-250315-03', 'g4228b-250120-01', 'g4228b-250225-02'],
  samsung: ['S907BXXU6AYK2', 'S907BXXU6AYL3', 'S907BXXU6AZM4', 'SM-S908BXXU1AWK2', 'SM-S908BXXU1AWL3'],
  xiaomi: ['V14.0.6.0.TLKMIXM', 'V14.0.7.0.TLKMIXM', 'V14.0.8.0.TLKMIXM'],
  oneplus: ['ONEPLUS-CPH2581_14.0.0.268(CN01)', 'ONEPLUS-CPH2581_14.0.0.270(CN01)']
};

/* 品牌 → Bootloader（generateBootloader） */
const BOOTLOADERS_BY_BRAND = {
  google: ['unknown', 'fsl3.0'],
  samsung: ['ABLM9645', 'ABLM9646', 'ABLM9647'],
  xiaomi: ['unknown', 'XIAOMI_BOOT'],
  oneplus: ['unknown', 'ONEPLUS_BOOT']
};

/* 国家区号 → 本地号码长度（getNationalLength） */
const NATIONAL_LEN_BY_CODE = {
  '+1': 10, '+7': 10, '+20': 10, '+27': 9, '+30': 10, '+31': 9, '+32': 9, '+33': 10,
  '+34': 9, '+39': 10, '+40': 9, '+41': 9, '+43': 10, '+44': 10, '+45': 8, '+46': 9,
  '+47': 8, '+48': 9, '+49': 11, '+51': 9, '+52': 10, '+54': 10, '+55': 10, '+56': 8,
  '+57': 10, '+58': 7, '+60': 9, '+61': 9, '+62': 10, '+63': 10, '+64': 8, '+65': 8,
  '+66': 9, '+81': 10, '+82': 10, '+84': 10, '+86': 11, '+90': 10, '+91': 10, '+92': 10,
  '+93': 9, '+94': 9, '+95': 9, '+212': 9, '+213': 9, '+216': 8, '+218': 9, '+220': 7,
  '+234': 10, '+254': 9, '+255': 9, '+256': 9, '+260': 9, '+263': 9, '+351': 9, '+352': 9,
  '+353': 9, '+354': 7, '+358': 9, '+359': 9, '+360': 8, '+370': 8, '+371': 8, '+372': 7,
  '+380': 9, '+381': 8, '+385': 8, '+386': 8, '+389': 8, '+420': 9, '+421': 9, '+852': 8,
  '+853': 8, '+880': 10, '+886': 9, '+960': 7, '+961': 8, '+962': 8, '+963': 8, '+964': 10,
  '+965': 7, '+971': 9, '+972': 9, '+973': 8, '+974': 7, '+975': 7, '+976': 8, '+977': 10,
  '+992': 9, '+993': 8, '+994': 9, '+995': 9
};

/* ISO 3166-1 alpha-2 → 国际区号（用于 request.cf.country） */
const CALLING_CODE_BY_ISO = {
  US: '+1', CA: '+1', PR: '+1', DO: '+1',
  GB: '+44', IE: '+353', FR: '+33', DE: '+49', AT: '+43', CH: '+41',
  NL: '+31', BE: '+32', LU: '+352', ES: '+34', PT: '+351', IT: '+39', GR: '+30',
  SE: '+46', NO: '+47', DK: '+45', FI: '+358', IS: '+354', GL: '+299',
  PL: '+48', CZ: '+420', SK: '+421', HU: '+36', RO: '+40', BG: '+359',
  HR: '+385', SI: '+386', RS: '+381', MK: '+389', ME: '+382', BA: '+387', AL: '+355',
  RU: '+7', UA: '+380', BY: '+375', MD: '+373', LT: '+370', LV: '+371', EE: '+372',
  GE: '+995', AM: '+374', AZ: '+994', KZ: '+7', UZ: '+998', TJ: '+992', TM: '+993', KG: '+996',
  MN: '+976', CN: '+86', HK: '+852', MO: '+853', TW: '+886', JP: '+81', KR: '+82',
  SG: '+65', MY: '+60', ID: '+62', TH: '+66', VN: '+84', PH: '+63',
  IN: '+91', PK: '+92', BD: '+880', LK: '+94', NP: '+977', BT: '+975', MM: '+95', MV: '+960',
  AF: '+93', IR: '+98', IQ: '+964', IL: '+972', JO: '+962', LB: '+961', SY: '+963',
  SA: '+966', AE: '+971', QA: '+974', KW: '+965', BH: '+973', OM: '+968',
  TR: '+90', EG: '+20', MA: '+212', DZ: '+213', TN: '+216', LY: '+218',
  NG: '+234', KE: '+254', TZ: '+255', UG: '+256', ZA: '+27', ZM: '+260', ZW: '+263',
  GM: '+220', GH: '+233', ET: '+251',
  AU: '+61', NZ: '+64', AR: '+54', BR: '+55', CL: '+56', CO: '+57', VE: '+58', PE: '+51',
  MX: '+52', EC: '+593', BO: '+591', PY: '+595', UY: '+598'
};

/* 无地理信息时的随机国家（generatePhoneNumber 的 fallback 列表） */
const FALLBACK_COUNTRIES = [
  ['+1', 10], ['+44', 9], ['+33', 9], ['+49', 11],
  ['+81', 10], ['+82', 10], ['+86', 11], ['+91', 10]
];

/* 通用 GLES 扩展（各 GPU 厂商共有） */
const GPU_COMMON_EXTENSIONS = [
  'GL_EXT_robustness', 'GL_EXT_texture_format_BGRA8888',
  'GL_OES_depth24', 'GL_OES_element_index_uint', 'GL_OES_fbo_render_mipmap',
  'GL_OES_texture_3D', 'GL_OES_texture_float', 'GL_OES_texture_half_float',
  'GL_OES_vertex_array_object', 'GL_OES_vertex_half_float', 'GL_EXT_blend_minmax',
  'GL_EXT_color_buffer_float', 'GL_EXT_color_buffer_half_float', 'GL_EXT_discard_framebuffer',
  'GL_EXT_multi_draw_arrays', 'GL_EXT_multisampled_render_to_texture',
  'GL_EXT_read_format_bgra', 'GL_EXT_shader_texture_lod', 'GL_EXT_texture_filter_anisotropic',
  'GL_EXT_texture_storage', 'GL_KHR_blend_equation_advanced',
  'GL_OES_blend_func_separate', 'GL_OES_blend_subtract', 'GL_OES_byte_codes',
  'GL_OES_compressed_ETC1_RGB8_texture', 'GL_OES_depth_texture', 'GL_OES_EGL_image',
  'GL_EXT_sRGB', 'GL_EXT_disjoint_timer_query'
];

/* 厂商专属扩展：必须与 GpuVendor / GpuModel 同源，
 * 避免 Adreno 机型带上 Mali 专属扩展（GPU 驱动校验会判定硬件描述不自洽） */
const GPU_FAMILY_EXTENSIONS = {
  Qualcomm: ['GL_EXT_debug_marker', 'GL_QCOM_tiled_rendering', 'GL_QCOM_binning_control',
             'GL_AMD_compressed_ATC_texture', 'GL_EXT_EGL_image_storage'],
  ARM: ['GL_ARM_shader_framebuffer_fetch', 'GL_ARM_mali_shader_binary',
        'GL_ARM_mali_program_binary', 'GL_EXT_EGL_image_storage'],
  Samsung: ['GL_EXT_debug_marker', 'GL_EXT_EGL_image_storage', 'GL_AMD_compressed_ATC_texture'],
  Huawei: ['GL_EXT_EGL_image_storage']
};

/* ============================================================
 * 随机工具（全部基于 crypto.getRandomValues，均匀分布）
 * ============================================================ */

function randU32() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0];
}

function rand48() {
  const b = new Uint8Array(6);
  crypto.getRandomValues(b);
  return b[0] * 1099511627776 + b[1] * 4294967296 + b[2] * 16777216 +
    b[3] * 65536 + b[4] * 256 + b[5];
}

/* 等价 PHP random_int($min, $max)：闭区间均匀分布，拒绝采样消除模偏差 */
function randInt(min, max) {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  const range = hi - lo + 1;
  if (range <= 1) return lo;
  if (range <= 4294967296) {
    const limit = Math.floor(4294967296 / range) * range;
    let v = randU32();
    while (v >= limit) v = randU32();
    return lo + (v % range);
  }
  const limit = Math.floor(281474976710656 / range) * range;
  let v = rand48();
  while (v >= limit) v = rand48();
  return lo + (v % range);
}

function randChoice(arr) {
  return arr[randInt(0, arr.length - 1)];
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

function randBytes(n) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

/* 32/16 位小写十六进制串（替代 PHP md5(uniqid()) 的输出格式） */
function randomHex(len) {
  const chars = '0123456789abcdef';
  let s = '';
  for (let i = 0; i < len; i++) s += chars.charAt(randInt(0, 15));
  return s;
}

/* ============================================================
 * 字符串 / 日期工具
 * ============================================================ */

function padLeft(str, len, ch) {
  let s = String(str);
  while (s.length < len) s = ch + s;
  return s;
}

function pad2(n) {
  return n < 10 ? '0' + String(n) : String(n);
}

function ucfirstLower(s) {
  const t = String(s).toLowerCase();
  if (t.length === 0) return t;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/* PHP date('Ymd') / date('ym') / date('ymd')（UTC，等价 Vercel 的 UTC 时区） */
function ymdFromDate(d) {
  return String(d.getUTCFullYear()) + pad2(d.getUTCMonth() + 1) + pad2(d.getUTCDate());
}

function ymdFromSeconds(sec) {
  return ymdFromDate(new Date(sec * 1000));
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

/* ============================================================
 * Base64URL（替代 PHP base64_encode + strtr + rtrim('=')）
 * ============================================================ */

function base64UrlEncode(bytes) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const remain = bytes.length - i;
    const b0 = bytes[i];
    const b1 = remain > 1 ? bytes[i + 1] : 0;
    const b2 = remain > 2 ? bytes[i + 2] : 0;
    out += A.charAt(b0 >> 2);
    out += A.charAt(((b0 & 3) << 4) | (b1 >> 4));
    if (remain > 1) out += A.charAt(((b1 & 15) << 2) | (b2 >> 6));
    if (remain > 2) out += A.charAt(b2 & 63);
  }
  return out;
}

/* ============================================================
 * 初始化状态（对应 DataGenerator::__construct）
 * ============================================================ */

/* 按机型「出厂版本 ~ 可升级上限」取系统版本：
 * 绝不允许输出低于出厂的 Android（如 Xiaomi 15 出厂 15，不会出现 13） */
function pickApiLevel(phone) {
  const launch = Number(phone.launch) || 34;
  const max = Number(phone.max) || launch;
  const lo = Math.max(33, launch);
  const hi = Math.min(36, max);
  if (hi >= lo) {
    const candidates = [];
    for (let v = lo; v <= hi; v++) candidates.push(v);
    return randChoice(candidates);
  }
  return Math.max(33, Math.min(36, launch));
}

function createGeneratorState(phone, apiLevel, geo) {
  return {
    phone: phone,
    apiLevel: apiLevel,
    androidVersion: getAndroidVersionName(apiLevel),
    buildId: generateBuildId(apiLevel),
    incremental: generateIncremental(),
    securityPatch: generateSecurityPatch(),
    timestamp: generateTimestamp(),
    network: randChoice(NETWORKS),
    geo: geo
  };
}

function getAndroidVersionName(apiLevel) {
  if (apiLevel === 33) return '13';
  if (apiLevel === 34) return '14';
  if (apiLevel === 35) return '15';
  if (apiLevel === 36) return '16';
  return '14';
}

function getBuildCodename() {
  return 'REL';
}

function generateBuildId(apiLevel) {
  let prefixes;
  if (apiLevel === 33) prefixes = ['TQ2A', 'TP1A', 'TR1A'];
  else if (apiLevel === 35) prefixes = ['AP1A', 'BP1A', 'CP1A'];
  else if (apiLevel === 36) prefixes = ['BP2A', 'CP2A', 'DP2A'];
  else prefixes = ['UP1A', 'UQ1A', 'UR1A'];

  const prefix = randChoice(prefixes);
  const date = ymdFromDate(new Date(Date.now() - randInt(0, 180 * 86400) * 1000));
  const buildNum = padLeft(String(randInt(1, 999)), 3, '0');
  return prefix + '.' + date + '.' + buildNum;
}

function generateIncremental() {
  return String(randInt(1000000, 99999999));
}

function generateSecurityPatch() {
  const monthsAgo = randInt(0, 5);
  const now = new Date();
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1));
  const day = randInt(1, 28);
  return String(base.getUTCFullYear()) + '-' + pad2(base.getUTCMonth() + 1) + '-' + pad2(day);
}

function generateTimestamp() {
  return nowSeconds() - randInt(0, 180 * 86400);
}

/* ============================================================
 * IMEI / IMSI / ICCID / MAC / AndroidID / 序列号
 * ============================================================ */

/* PHP luhnCheckDigit：为 len 位数字前缀计算第 len+1 位校验位 */
function luhnCheckDigit(digits) {
  let sum = 0;
  const len = digits.length;
  for (let i = 0; i < len; i++) {
    let d = Number(digits.charAt(i));
    if ((len + 1 - i) % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return (10 - (sum % 10)) % 10;
}

/* PHP JsonValidator::luhnCheck：整串 Luhn 校验 */
function luhnCheck(number) {
  let sum = 0;
  const len = number.length;
  for (let i = 0; i < len; i++) {
    let d = Number(number.charAt(i));
    if ((len - i) % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

function generateTac(phone) {
  const brand = String((phone && phone.brand) ? phone.brand : '').toLowerCase();
  let tacBase;
  if (Object.prototype.hasOwnProperty.call(TAC_BY_BRAND, brand)) {
    tacBase = randChoice(TAC_BY_BRAND[brand]);
  } else {
    tacBase = String(randInt(350000, 399999));
  }
  return tacBase + padLeft(String(randInt(0, 99)), 2, '0');
}

function generateImei(g) {
  /* IMEI 固定 15 位数字：TAC 8 位 + 序列号 6 位 + Luhn 校验位 1 位 */
  const tac = padLeft(String(generateTac(g.phone)), 8, '0').slice(-8);
  const serial = padLeft(String(randInt(0, 999999)), 6, '0');
  const imei14 = tac + serial;
  const imei = imei14 + String(luhnCheckDigit(imei14));
  return imei.slice(-15);
}

function generateImsi(g) {
  const net = g.network;
  const mcc = net[0];
  const mnc = net[1];
  const msinLength = 15 - mcc.length - mnc.length;
  const upper = Math.pow(10, msinLength) - 1;
  const msin = padLeft(String(randInt(0, upper)), msinLength, '0');
  return mcc + mnc + msin;
}

function generateIccid() {
  const iin = String(randInt(1, 9));
  const nationalIdLength = randInt(15, 16);
  let nationalId = '';
  for (let i = 0; i < nationalIdLength; i++) nationalId += String(randInt(0, 9));
  const withoutCheck = '89' + iin + nationalId;
  return withoutCheck + String(luhnCheckDigit(withoutCheck));
}

function generateMacAddress() {
  const bytes = [];
  for (let i = 0; i < 6; i++) bytes.push((randInt(0, 255)).toString(16));
  if (bytes[0] === '00' && bytes[1] === '00' && bytes[2] === '00') {
    bytes[0] = randInt(1, 254).toString(16);
  }
  for (let i = 0; i < bytes.length; i++) bytes[i] = padLeft(bytes[i], 2, '0');
  return bytes.join(':');
}

function generateAndroidId() {
  return randomHex(16);
}

function generateSerialNumber(brand) {
  const now = new Date();
  const ym = String(now.getUTCFullYear()).slice(-2) + pad2(now.getUTCMonth() + 1);
  const brandLower = String(brand).toLowerCase();
  if (brandLower === 'google') return 'GP' + ym + padLeft(String(randInt(0, 999999)), 6, '0');
  if (brandLower === 'samsung') return 'RF' + ym + padLeft(String(randInt(0, 999999)), 6, '0');
  if (brandLower === 'xiaomi') return 'XIAOMI' + ym + padLeft(String(randInt(0, 99999)), 5, '0');
  if (brandLower === 'oneplus') return 'ONEPLUS' + ym + padLeft(String(randInt(0, 99999)), 5, '0');
  return randomHex(12).toUpperCase();
}

function generateShortSerial() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const len = randInt(8, 12);
  let serial = '';
  for (let i = 0; i < len; i++) serial += chars.charAt(randInt(0, chars.length - 1));
  return serial;
}

function generateBasebandVersion(brand, socModel) {
  const brandLower = String(brand).toLowerCase();
  const soc = String(socModel || '');
  /* 三星基带/固件串统一为 S<型号>BXXU<版本>AXK<补丁> 形式 */
  if (brandLower === 'samsung') {
    return 'S' + randInt(900, 999) + 'BXXU' + randInt(1, 9) + 'AXK' + randInt(1, 9);
  }
  if (/^Tensor/.test(soc)) {
    const d = new Date(Date.now() - randInt(0, 300 * 86400) * 1000);
    const yy = String(d.getUTCFullYear()).slice(-2);
    const mm = padLeft(String(d.getUTCMonth() + 1), 2, '0');
    const dd = padLeft(String(d.getUTCDate()), 2, '0');
    return 'g' + randChoice(['5300b', '5300c', '5400b']) + '-' + yy + mm + dd + '-' + padLeft(String(randInt(1, 12)), 2, '0');
  }
  if (/^Snapdragon/.test(soc)) {
    return randChoice(['MPSS.DE.3.1.c1-00039', 'MPSS.DE.3.1.c2-00057', 'MPSS.DE.3.2-00121']);
  }
  if (/^Dimensity/.test(soc)) {
    return 'MOLY.LR12A.R3.MP.V' + randInt(150, 220) + '.5.P' + randInt(1, 9);
  }
  if (Object.prototype.hasOwnProperty.call(BASEBANDS_BY_BRAND, brandLower)) {
    return randChoice(BASEBANDS_BY_BRAND[brandLower]);
  }
  return 'unknown';
}

function generatePhoneNumber(g) {
  let callingCode;
  let nationalLen;
  if (g.geo && typeof g.geo.callingCode === 'string' && g.geo.callingCode !== '') {
    callingCode = g.geo.callingCode;
    nationalLen = g.geo.nationalLen;
  } else {
    const c = randChoice(FALLBACK_COUNTRIES);
    callingCode = c[0];
    nationalLen = c[1];
  }

  let national = '';
  for (let i = 0; i < nationalLen; i++) national += String(randInt(0, 9));
  if (national.charAt(0) === '0') national = '1' + national.slice(1);
  return callingCode + national;
}

function getNationalLength(callingCode) {
  if (Object.prototype.hasOwnProperty.call(NATIONAL_LEN_BY_CODE, callingCode)) {
    return NATIONAL_LEN_BY_CODE[callingCode];
  }
  return GEO_FALLBACK_NATIONAL_LEN;
}

/* ============================================================
 * 电池 / UUID / 产品码 / Bootloader
 * ============================================================ */

function generateBatteryInfo() {
  return {
    capacity: randInt(35, 100),
    health: randInt(85, 100),
    temperature: randInt(280, 420),
    voltage: randInt(3500, 4400),
    technology: 'Li-ion',
    plugged: randInt(0, 2),
    status: randInt(1, 5)
  };
}

function generateUuid() {
  return base64UrlEncode(randBytes(32));
}

function generateProductCode(deviceCode) {
  const suffixes = ['', '_beta', '_release', '_dev'];
  return deviceCode + randChoice(suffixes);
}

function generateBootloader(brand) {
  const brandLower = String(brand).toLowerCase();
  if (Object.prototype.hasOwnProperty.call(BOOTLOADERS_BY_BRAND, brandLower)) {
    return randChoice(BOOTLOADERS_BY_BRAND[brandLower]);
  }
  return 'unknown';
}

/* ============================================================
 * SoC 相关
 * ============================================================ */

function getSocManufacturer(socModel) {
  const s = String(socModel);
  if (s.indexOf('Snapdragon') === 0) return 'Qualcomm';
  if (s.indexOf('Dimensity') === 0) return 'MediaTek';
  if (s.indexOf('Exynos') === 0) return 'Samsung';
  if (s.indexOf('Tensor') === 0) return 'Google';
  if (s.indexOf('Kirin') === 0) return 'Huawei';
  return 'Unknown';
}

function getSocHardwareName(phone) {
  const soc = (phone && typeof phone.soc === 'string') ? phone.soc : '';
  for (let i = 0; i < SOC_HARDWARE_NAMES.length; i++) {
    const prefix = SOC_HARDWARE_NAMES[i][0];
    if (soc.indexOf(prefix) === 0) return SOC_HARDWARE_NAMES[i][1];
  }
  return 'generic';
}

function generateCurrentFrequency(frequencyList) {
  const len = frequencyList.length;
  if (len <= 1) return frequencyList[0];
  let startIdx = Math.floor(len * 0.15);
  let endIdx = Math.floor(len * 0.85);
  if (endIdx < startIdx) endIdx = len - 1;
  return frequencyList[randInt(startIdx, endIdx)];
}

/* GPU 扩展必须与 GPU 厂商同源：Adreno / Mali / Xclipse / Maleoon 各用各的专属扩展 */
function gpuFamilyOf(socData) {
  const gpu = String(socData && socData.gpu ? socData.gpu : '');
  if (/^Adreno/.test(gpu)) return 'Qualcomm';
  if (/^Mali|^Immortalis/.test(gpu)) return 'ARM';
  if (/^Xclipse/.test(gpu)) return 'Samsung';
  if (/^Maleoon/.test(gpu)) return 'Huawei';
  return 'ARM';
}

function generateGpuExtensions(socData) {
  const family = gpuFamilyOf(socData);
  const vendorExt = GPU_FAMILY_EXTENSIONS[family] || [];
  const list = Array.from(new Set(GPU_COMMON_EXTENSIONS.concat(vendorExt)));
  shuffleInPlace(list);
  return list.join(' ');
}

/* ============================================================
 * phone 对象辅助值
 * ============================================================ */

function generateMeid() {
  const chars = '0123456789ABCDEF';
  let meid = '';
  for (let i = 0; i < 12; i++) meid += chars.charAt(randInt(0, 15));
  return meid;
}

function generateWifiIp() {
  return '192.168.' + String(randInt(0, 5)) + '.' + String(randInt(2, 254));
}

function generateWifiName(brand) {
  const suffixes = ['_Home', '_5G', '_Office', '', '_B1C9', '_Net'];
  const suffix = randChoice(suffixes);
  const randHex = randInt(0, 4095).toString(16).toUpperCase();
  return ucfirstLower(brand) + suffix + randHex;
}

function generateNearCell() {
  const parts = [];
  const techs = ['LTE', 'UMTS', 'NR', 'LTE'];
  for (let i = 0; i < 3; i++) {
    const tech = randChoice(techs);
    const cellId = randInt(10000, 99999);
    const arfcn = randInt(100, 268400000);
    const rsrp = randInt(-130, -65);
    const rsrq = randInt(-25, -3);
    parts.push(tech + '_' + String(cellId) + '_' + arfcn.toFixed(2) + '_' + String(rsrp) + ',' + String(rsrq));
  }
  return parts.join(',');
}

function generateBssidMixed() {
  const hex = function () {
    return padLeft(randInt(0, 255).toString(16), 2, '0');
  };
  return hex() + '.' + hex() + '.' + hex() + '.' + hex() + '.' + hex() + ':' + hex();
}

function generatePhoneImsi(g) {
  const net = g.network;
  const mcc = net[0];
  const mnc = padLeft(net[1], 3, '0');
  const msin = padLeft(String(randInt(0, 99999999)), 8, '0');
  return mcc + mnc + msin;
}

function generateSdsdkid() {
  return randomHex(32);
}

/* ============================================================
 * 内核版本采集：只保留最新 4 个主版本，且只保留官方真实构建号
 * ============================================================ */

let webviewState = null;        // { milestones: {154: [...], ...}, updatedAt: 0 }
let webviewCheckedAt = 0;       // 上次探测时间（isolate 级，防雪崩）

function webviewPatchOf(version) {
  const parts = String(version).split('.');
  return parts.length === 4 ? parseInt(parts[3], 10) || 0 : 0;
}

/* 归一化：按主版本升序，只留最新 4 个主版本；每个主版本去重、按补丁号升序、截断到 12 条 */
function normalizeWebViewMilestones(map) {
  const majors = Object.keys(map)
    .map(function (k) { return parseInt(k, 10); })
    .filter(isFinite)
    .sort(function (a, b) { return a - b; })
    .slice(-WEBVIEW_KEEP_MILESTONES);

  const out = {};
  majors.forEach(function (major) {
    const list = Array.from(new Set(map[String(major)] || []))
      .filter(function (v) { return String(v).indexOf(String(major) + '.') === 0; })
      .sort(function (a, b) { return webviewPatchOf(a) - webviewPatchOf(b); });
    if (list.length > 0) out[String(major)] = list.slice(-WEBVIEW_MAX_PATCHES);
  });
  return out;
}

function seedWebViewMilestones() {
  const out = {};
  Object.keys(WEBVIEW_VERSION_SEED).forEach(function (k) {
    out[k] = WEBVIEW_VERSION_SEED[k].slice();
  });
  return normalizeWebViewMilestones(out);
}

async function readWebViewCache() {
  try {
    if (typeof caches === 'undefined' || !caches.default) return null;
    const resp = await caches.default.match(new Request(WEBVIEW_CACHE_KEY));
    if (!resp) return null;
    const data = await resp.json();
    if (!data || typeof data !== 'object' || !data.milestones) return null;
    const milestones = normalizeWebViewMilestones(data.milestones);
    if (Object.keys(milestones).length === 0) return null;
    return { milestones: milestones, updatedAt: data.updated_at || 0 };
  } catch (e) {
    return null;
  }
}

/* 写入 Cache API，跨 isolate / 跨 colo 共享采集结果（TTL 6 小时） */
async function writeWebViewCache(state) {
  try {
    if (typeof caches === 'undefined' || !caches.default) return;
    const body = JSON.stringify({
      milestones: state.milestones,
      updated_at: state.updatedAt
    });
    await caches.default.put(new Request(WEBVIEW_CACHE_KEY), new Response(body, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'max-age=' + Math.floor(WEBVIEW_VERSION_TTL_MS / 1000)
      }
    }));
  } catch (e) {
    /* 缓存不可用时忽略：内存状态仍生效 */
  }
}

/* 定期采集 WebView 稳定版：有新版本才更新（采一条最新的、丢掉最低主版本），无更新不写入 */
async function refreshWebViewVersions() {
  const now = Date.now();

  if (!webviewState) {
    webviewState = (await readWebViewCache()) || { milestones: seedWebViewMilestones(), updatedAt: 0 };
  }
  if (now - webviewCheckedAt < WEBVIEW_VERSION_TTL_MS) return;
  webviewCheckedAt = now;

  let releases = null;
  try {
    const resp = await fetch(WEBVIEW_VERSION_SOURCE, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(3000),
      cf: { cacheTtl: 1800 }
    });
    if (resp.ok) releases = await resp.json();
  } catch (e) {
    releases = null;
  }
  if (!Array.isArray(releases) || releases.length === 0) return;   // 采集失败：保持现有版本

  const merged = {};
  Object.keys(webviewState.milestones).forEach(function (k) {
    merged[k] = webviewState.milestones[k].slice();
  });

  releases.forEach(function (item) {
    const version = item && typeof item.version === 'string' ? item.version : '';
    const major = parseInt(version.split('.')[0], 10);
    if (!isFinite(major) || major < 100 || version.split('.').length !== 4) return;
    const key = String(major);
    if (!merged[key]) merged[key] = [];
    if (merged[key].indexOf(version) === -1) merged[key].push(version);
  });

  /* 归一化后与现有集合完全一致 -> 说明没有更新，不写入、不改变出参 */
  const next = normalizeWebViewMilestones(merged);
  if (JSON.stringify(next) === JSON.stringify(webviewState.milestones)) return;

  webviewState = { milestones: next, updatedAt: now };
  await writeWebViewCache(webviewState);
}

/* 在已采集的真实构建号中随机（当前 M154-M157；升到 M158 后自动变为 M155-M158） */
function generateChromeVersion() {
  const milestones = webviewState ? webviewState.milestones : seedWebViewMilestones();
  const majors = Object.keys(milestones);
  if (majors.length === 0) return '157.0.8103.38';

  const major = randChoice(majors);
  const list = milestones[major] || [];
  if (list.length === 0) return '157.0.8103.38';
  return randChoice(list);
}

function generateCpuInfo(phone, coreCount) {  const lines = [];
  const cores = (typeof coreCount === 'number' && coreCount > 0) ? coreCount : 8;
  lines.push('Processor: Aarch64 Processor rev ' + String(randInt(0, 4)) + ' (aarch64)');
  lines.push('MPIPSV: ' + (randInt(4000, 6000) / 100).toFixed(2));
  for (let i = 0; i < cores; i++) {
    lines.push('processor: ' + String(i));
    lines.push('BogoMIPS: ' + (randInt(3000, 5500) / 100).toFixed(2));
  }
  lines.push('Features: fp asimd evtstrm aes pmull sha1 sha2 crc32 atomics fphp asimdhp cpuid asimdrdm dcpop asimddp');
  const socName = (phone && typeof phone.soc === 'string') ? phone.soc : DEFAULT_SOC;
  const cpuIdentity = CPU_IDENTITY[socName] || CPU_IDENTITY[DEFAULT_SOC];
  lines.push('CPU implementer: ' + cpuIdentity.implementer);
  lines.push('CPU architecture: 8');
  lines.push('CPU variant: 0x' + randInt(0, 15).toString(16));
  lines.push('CPU part: ' + randChoice(cpuIdentity.parts));
  lines.push('CPU revision: ' + String(randInt(0, 4)));
  lines.push('Hardware: ' + getSocHardwareName(phone));
  return lines.join('\n') + '\n';
}

/* 稳定哈希：同一机型的配置（如 RAM 档位）每次请求保持一致 */
function stableHash(text) {
  let h = 0;
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

/* ============================================================
 * phone / hardware 对象构建
 * ============================================================ */

function buildPhoneObject(g, p, imei, imsi, iccid, wifiMacColons, btMacColons, androidId) {
  const net = g.network;
  const mcc = net[0];
  const mnc = net[1];
  const carrierName = net[2];
  const countryIso = net[3];

  const networkOperator = mcc + mnc;
  const simOperator = mcc + mnc;

  const wifiName = generateWifiName(p.brand);
  const wifiIp = generateWifiIp();
  const meid = generateMeid();
  const nearCell = generateNearCell();
  const sdsdkid = generateSdsdkid();

  const btMacDots = btMacColons.split(':').join('.');
  const wifiMacDots = wifiMacColons.split(':').join('.').toUpperCase();
  const bssidMixed = generateBssidMixed();

  const phoneImsi = generatePhoneImsi(g);
  const model = p.model;
  const multiMedia = 'Android/' + g.androidVersion + ' (Linux; U; Android ' + g.androidVersion +
    '; ' + model + ' Build/' + g.buildId + ')';

  const geo = g.geo;

  return {
    DeviceId: androidId,
    DeviceSoftwareVersion: '01',
    SubscriberId: imsi,
    LineNumber: '',
    Imei: imei,
    Imsi: phoneImsi,
    Meid: meid,
    SimSerialNumber: iccid,
    NetworkOperator: networkOperator,
    NetworkOperatorName: carrierName,
    SimOperator: simOperator,
    SimOperatorName: carrierName,
    NetworkCountryIso: countryIso,
    SimCountryIso: countryIso,
    NetworkType: '13',
    PhoneType: '1',
    PhoneCount: '2',
    SimState: '5',
    BluetoothMac: btMacDots,
    WifiMAC: wifiMacDots,
    WifiIP: wifiIp,
    WifiName: wifiName,
    /* PHP 版本这两个字段恒为空字符串；Workers 版本优先用 request.cf 的真实经纬度填充 */
    latitude: (geo && geo.latitude !== '') ? geo.latitude : '',
    longitude: (geo && geo.longitude !== '') ? geo.longitude : '',
    Calibration: '0',
    BaseLocation: '0',
    BSSID: bssidMixed,
    CallState: '0',
    NetStrand: '0',
    NetSubtypeName: 'LTE',
    MultiMedia: multiMedia,
    MultiMediaProfile: 'http://www.google.com/oha/cdf/us-profile-kills.xml',
    VoiceMailAlphaTag: 'Voicemail',
    VoiceMailNumber: '',
    sdsdkid: sdsdkid,
    near_cell: nearCell,
    SSIDBook: wifiName,
    SSIDName: wifiName,
    BSSIDBook: bssidMixed
  };
}

function buildHardwareObject(g, p, model) {
  const density = (p.screen_density === undefined || p.screen_density === null) ? 2.75 : p.screen_density;
  const width = (p.screen_width === undefined || p.screen_width === null) ? 1080 : p.screen_width;
  const height = (p.screen_height === undefined || p.screen_height === null) ? 2400 : p.screen_height;

  const dpi = Math.round(density * 160);
  /* xdpi/ydpi 是物理像素密度，与 dpi（逻辑密度）本来就不同；
   * 由分辨率 + 真实对角线尺寸反推，保证物理尺寸与机型一致（不会被算成平板） */
  const screenSize = SCREEN_SIZE_BY_MODEL[model] || DEFAULT_SCREEN_SIZE;
  const physicalDpi = Math.round(Math.sqrt(width * width + height * height) / screenSize);
  const xdpi = physicalDpi;
  const ydpi = physicalDpi + randInt(-1, 1);

  const socModel = (p.soc === undefined || p.soc === null) ? DEFAULT_SOC : p.soc;
  let socData = SOC_GPU_MAP[DEFAULT_SOC];
  if (Object.prototype.hasOwnProperty.call(SOC_GPU_MAP, socModel)) socData = SOC_GPU_MAP[socModel];

  const gpuRender = socData.gpu;
  const gpuVendor = socData.vendor;
  const gpuVersion = 'OpenGL ES ' + socData.gl + ' ' + socData.gl_version;
  const vulkan = socData.vulkan;
  const frequency = socData.frequency;
  const currentFrequency = generateCurrentFrequency(frequency);
  const gpuExtensions = generateGpuExtensions(socData);

  const socSpec = SOC_SPEC_MAP[socModel] || SOC_SPEC_MAP[DEFAULT_SOC];
  const coreCount = socSpec.cores;
  /* 同一机型的 RAM 固定（按机型名确定性取档位），避免同一 MODEL 出现多种配置 */
  const ramSize = socSpec.ram[stableHash(model) % socSpec.ram.length];
  const sensors = SENSOR_SETS[socSpec.tier] || SENSOR_SETS.mid;

  const chromeVersion = generateChromeVersion();
  const userAgent = 'Mozilla/5.0 (Linux; Android ' + g.androidVersion + '; ' + model +
    ' Build/' + g.buildId + '; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/' +
    chromeVersion + ' Mobile Safari/537.36';

  const cpuinfo = generateCpuInfo(p, coreCount);

  return {
    dpi: dpi,
    density: density,
    width: width,
    height: height,
    xdpi: xdpi,
    ydpi: ydpi,
    screenDensity: density,
    UserAgent: userAgent,
    GpuRender: gpuRender,
    GpuVendor: gpuVendor,
    GpuModel: gpuRender,
    GpuVersion: gpuVersion,
    GPUExtensions: gpuExtensions,
    CpuCoreCount: coreCount,
    /* Web 指纹：hardwareConcurrency 必须与 CPU 核心数一致 */
    hardwareConcurrency: coreCount,
    /* Web 指纹：deviceMemory 只能取 Chrome 支持的档位，上限固定 8，不能用物理内存 12/16 */
    deviceMemory: ramSize >= 8 ? 8 : 4,
    RamSize: ramSize,
    ColorDepth: 24,
    TouchSupport: true,
    MaxTouchPoints: 10,
    Sensors: sensors.slice(),
    drm: buildDrmObject(p, socModel, g.androidVersion),
    cpuinfo: cpuinfo,
    vulkan: vulkan,
    frequency: frequency,
    current_frequency: currentFrequency
  };
}

/* ============================================================
 * 主生成逻辑（DataGenerator::generate）
 * ============================================================ */

function slugify(text) {
  let t = String(text).toLowerCase().replace(/^\s+|\s+$/g, '');
  t = t.replace(/[^a-z0-9]+/g, '-');
  t = t.replace(/^-+|-+$/g, '');
  return t !== '' ? t : 'device';
}

function generate(g) {
  const p = g.phone;
  const brand = p.brand;
  const model = p.model;
  const manufacturer = (p.manufacturer === undefined || p.manufacturer === null) ? brand : p.manufacturer;

  const dcSource = (p.device_code === undefined || p.device_code === null) ? slugify(model) : String(p.device_code);
  const deviceCode = dcSource.toLowerCase().replace(/[^a-z0-9_]/g, '_');

  const buildId = g.buildId;
  const incremental = g.incremental;
  const securityPatch = g.securityPatch;
  const timestamp = g.timestamp;
  const display = buildId;
  const id = buildId;

  const imei = generateImei(g);
  const imsi = generateImsi(g);
  const iccid = generateIccid();
  const macAddress = generateMacAddress();
  const androidId = generateAndroidId();
  const serialNumber = generateSerialNumber(brand);
  const basebandVersion = generateBasebandVersion(brand, p.soc || DEFAULT_SOC);
  const bluetoothMac = generateMacAddress();
  const phoneNumber = generatePhoneNumber(g);
  const batteryInfo = generateBatteryInfo();

  const product = generateProductCode(deviceCode);
  const fingerprint = brand + '/' + product + '/' + deviceCode + ':' + getBuildCodename() +
    '/' + buildId + '/' + incremental + ':user/release-keys';

  const sdkFingerprint = randomHex(32);
  const uuid = generateUuid();
  const host = 'build-server';
  const bootloader = generateBootloader(brand);
  const board = deviceCode;
  const hardwareName = getSocHardwareName(p);

  let previewSdk = null;
  if (g.apiLevel >= 35) previewSdk = ymdFromSeconds(timestamp);

  const socModel = (p.soc === undefined || p.soc === null) ? DEFAULT_SOC : p.soc;
  const socManufacturer = getSocManufacturer(socModel);
  const boardPlatform = deviceCode;
  const serial = generateShortSerial();
  /* 与 hardware.drm.SecurityLevel 同源，保证两处 DRM 级别一致 */
  const drmSecurityLevel = drmSecurityLevelFor(p, socModel);

  const copgVd = {
    BRAND: brand,
    DEVICE: deviceCode,
    MANUFACTURER: manufacturer,
    MODEL: model,
    FINGERPRINT: fingerprint,
    PRODUCT: product,
    BOOTLOADER: bootloader,
    BOARD: board,
    HARDWARE: hardwareName,
    DISPLAY: display,
    ID: id,
    HOST: host,
    INCREMENTAL: incremental,
    TIMESTAMP: String(timestamp),
    USER: 'android-build',
    SDK_FINGERPRINT: sdkFingerprint,
    UUID: uuid,
    SECURITY_PATCH: securityPatch,
    FIRST_API_LEVEL: String(g.phone.launch || g.apiLevel),
    DRM_SECURITY_LEVEL: drmSecurityLevel,
    SERIAL: serial,
    RADIO: basebandVersion,
    SOC_MODEL: socModel,
    SOC_MANUFACTURER: socManufacturer,
    BOARD_PLATFORM: boardPlatform,
    ANDROID_ID: androidId,
    VERSION: {
      INCREMENTAL: basebandVersion,
      RELEASE: g.androidVersion,
      SDK: g.apiLevel,
      CODENAME: 'REL',
      SECURITY_PATCH: securityPatch,
      BASE_OS: ''
    }
  };

  if (previewSdk !== null) copgVd.PREVIEW_SDK = previewSdk;

  copgVd.IMEI = imei;
  copgVd.IMSI = imsi;
  copgVd.ICCID = iccid;
  copgVd.MAC_ADDRESS = macAddress;
  copgVd.SERIAL_NUMBER = serialNumber;
  copgVd.BASEBAND_VERSION = basebandVersion;
  copgVd.BLUETOOTH_MAC = bluetoothMac;
  copgVd.PHONE_NUMBER = phoneNumber;
  copgVd.BATTERY = JSON.stringify(batteryInfo);

  const phoneObj = buildPhoneObject(g, p, imei, imsi, iccid, macAddress, bluetoothMac, androidId);
  const hardwareObj = buildHardwareObject(g, p, model);

  return {
    Instructions: 'Use strings on double-quotes only.',
    scope_mode: 'playstore',
    'COPG-VD': copgVd,
    phone: phoneObj,
    hardware: hardwareObj,
    motor_drm: false,
    global_fields: ['SECURITY_PATCH']
  };
}

/* ============================================================
 * JSON 校验（JsonValidator，逐条对齐）
 * ============================================================ */

const REQUIRED_FIELDS = [
  'BRAND', 'DEVICE', 'MANUFACTURER', 'MODEL', 'FINGERPRINT',
  'PRODUCT', 'BOOTLOADER', 'BOARD', 'HARDWARE', 'DISPLAY',
  'ID', 'HOST', 'INCREMENTAL', 'TIMESTAMP', 'USER',
  'SDK_FINGERPRINT', 'UUID', 'SECURITY_PATCH',
  'FIRST_API_LEVEL', 'DRM_SECURITY_LEVEL'
];

const NEW_FIELDS = [
  'IMEI', 'IMSI', 'ICCID', 'MAC_ADDRESS', 'ANDROID_ID',
  'SERIAL_NUMBER', 'BASEBAND_VERSION', 'BLUETOOTH_MAC',
  'PHONE_NUMBER', 'BATTERY'
];

const EXTENDED_FIELDS = [
  'SERIAL', 'RADIO', 'SOC_MODEL', 'SOC_MANUFACTURER', 'BOARD_PLATFORM', 'VERSION'
];

const PHONE_FIELDS = [
  'DeviceId', 'DeviceSoftwareVersion', 'SubscriberId', 'LineNumber',
  'Imei', 'Imsi', 'Meid', 'SimSerialNumber', 'NetworkOperator',
  'NetworkOperatorName', 'SimOperator', 'SimOperatorName',
  'NetworkCountryIso', 'SimCountryIso', 'NetworkType', 'PhoneType',
  'PhoneCount', 'SimState', 'BluetoothMac', 'WifiMAC', 'WifiIP',
  'WifiName', 'latitude', 'longitude', 'Calibration', 'BaseLocation',
  'BSSID', 'CallState', 'NetStrand', 'NetSubtypeName', 'MultiMedia',
  'MultiMediaProfile', 'VoiceMailAlphaTag', 'VoiceMailNumber',
  'sdsdkid', 'near_cell', 'SSIDBook', 'SSIDName', 'BSSIDBook'
];

const HARDWARE_FIELDS = [
  'dpi', 'density', 'width', 'height', 'xdpi', 'ydpi', 'screenDensity',
  'UserAgent', 'GpuRender', 'GpuVendor', 'GpuModel', 'GpuVersion', 'GPUExtensions',
  'CpuCoreCount', 'hardwareConcurrency', 'deviceMemory', 'RamSize',
  'ColorDepth', 'TouchSupport', 'MaxTouchPoints', 'Sensors', 'cpuinfo', 'drm'
];

/* 等价 PHP isset（存在且不为 null） */
function isSet(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key) && obj[key] !== null && obj[key] !== undefined;
}

/* 等价 PHP is_array（关联/索引数组） */
function isPhpArray(v) {
  return v !== null && typeof v === 'object';
}

function phpTypeOf(v) {
  if (v === null || v === undefined) return 'NULL';
  if (Array.isArray(v)) return 'array';
  const t = typeof v;
  if (t === 'boolean') return 'boolean';
  if (t === 'number') return Number.isInteger(v) ? 'integer' : 'double';
  if (t === 'object') return 'array';
  return 'string';
}

function isNumeric(v) {
  if (typeof v === 'number') return isFinite(v);
  if (typeof v === 'string') {
    return v.trim() !== '' && !isNaN(Number(v));
  }
  return false;
}

function validateFormats(copgVd) {
  const errors = [];

  if (isSet(copgVd, 'IMEI')) {
    const imei = String(copgVd.IMEI);
    if (!/^[0-9]{15}$/.test(imei)) {
      errors.push('IMEI format invalid: ' + imei + ' (expected 15 digits)');
    } else if (!luhnCheck(imei)) {
      errors.push('IMEI Luhn check failed: ' + imei);
    }
  }

  if (isSet(copgVd, 'IMSI')) {
    if (!/^[0-9]{15}$/.test(String(copgVd.IMSI))) {
      errors.push('IMSI format invalid: ' + copgVd.IMSI + ' (expected 15 digits)');
    }
  }

  if (isSet(copgVd, 'ICCID')) {
    const iccid = String(copgVd.ICCID);
    if (!/^89[0-9]{17,18}$/.test(iccid)) {
      errors.push('ICCID format invalid: ' + iccid + ' (expected 19-20 digits starting with 89)');
    }
  }

  if (isSet(copgVd, 'MAC_ADDRESS')) {
    if (!/^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/.test(String(copgVd.MAC_ADDRESS))) {
      errors.push('MAC_ADDRESS format invalid: ' + copgVd.MAC_ADDRESS);
    }
  }

  if (isSet(copgVd, 'BLUETOOTH_MAC')) {
    if (!/^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/.test(String(copgVd.BLUETOOTH_MAC))) {
      errors.push('BLUETOOTH_MAC format invalid: ' + copgVd.BLUETOOTH_MAC);
    }
  }

  if (isSet(copgVd, 'ANDROID_ID')) {
    if (!/^[0-9a-f]{16}$/.test(String(copgVd.ANDROID_ID))) {
      errors.push('ANDROID_ID format invalid: ' + copgVd.ANDROID_ID + ' (expected 16 hex chars)');
    }
  }

  if (isSet(copgVd, 'FINGERPRINT')) {
    const fp = String(copgVd.FINGERPRINT);
    if (!/^[a-z0-9_]+\/[a-z0-9_]+\/[a-z0-9_]+:[A-Z0-9.]+\/[A-Z0-9.]+\/[0-9]+:(user|userdebug|eng)\/[a-z-]+$/.test(fp)) {
      errors.push('FINGERPRINT format invalid: ' + fp);
    }
  }

  if (isSet(copgVd, 'SECURITY_PATCH')) {
    if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(String(copgVd.SECURITY_PATCH))) {
      errors.push('SECURITY_PATCH format invalid: ' + copgVd.SECURITY_PATCH + ' (expected YYYY-MM-DD)');
    }
  }

  if (isSet(copgVd, 'FIRST_API_LEVEL')) {
    const apiLevel = parseInt(String(copgVd.FIRST_API_LEVEL), 10);
    if (apiLevel !== 33 && apiLevel !== 34 && apiLevel !== 35 && apiLevel !== 36) {
      errors.push('FIRST_API_LEVEL must be 33, 34, 35 or 36, got: ' + copgVd.FIRST_API_LEVEL);
    }
  }

  if (isSet(copgVd, 'TIMESTAMP')) {
    if (!/^[0-9]{9,11}$/.test(String(copgVd.TIMESTAMP))) {
      errors.push('TIMESTAMP format invalid: ' + copgVd.TIMESTAMP + ' (expected Unix timestamp)');
    }
  }

  if (isSet(copgVd, 'SDK_FINGERPRINT')) {
    if (!/^[0-9a-f]{32}$/.test(String(copgVd.SDK_FINGERPRINT))) {
      errors.push('SDK_FINGERPRINT format invalid: ' + copgVd.SDK_FINGERPRINT + ' (expected 32 hex chars)');
    }
  }

  if (isSet(copgVd, 'UUID')) {
    if (!/^[A-Za-z0-9_-]{20,50}$/.test(String(copgVd.UUID))) {
      errors.push('UUID format invalid: ' + copgVd.UUID);
    }
  }

  if (isSet(copgVd, 'BATTERY')) {
    let battery = null;
    try {
      battery = JSON.parse(String(copgVd.BATTERY));
    } catch (e) {
      battery = null;
    }
    if (!isPhpArray(battery)) {
      errors.push('BATTERY is not valid JSON');
    } else {
      const batteryFields = ['capacity', 'health', 'temperature', 'voltage', 'technology'];
      for (let i = 0; i < batteryFields.length; i++) {
        if (!isSet(battery, batteryFields[i])) {
          errors.push('BATTERY missing field: ' + batteryFields[i]);
        }
      }
    }
  }

  return errors;
}

function validateStructure(data) {
  const errors = [];

  if (!isSet(data, 'COPG-VD') || !isPhpArray(data['COPG-VD'])) {
    errors.push('Missing or invalid "COPG-VD" object');
    return { valid: false, errors: errors };
  }

  if (!isSet(data, 'scope_mode')) {
    errors.push('Missing "scope_mode" field');
  }

  if (!isSet(data, 'motor_drm') || typeof data.motor_drm !== 'boolean') {
    errors.push('Missing or invalid "motor_drm" field (must be boolean)');
  }

  if (!isSet(data, 'global_fields') || !isPhpArray(data.global_fields)) {
    errors.push('Missing or invalid "global_fields" array');
  }

  const copgVd = data['COPG-VD'];

  for (let i = 0; i < REQUIRED_FIELDS.length; i++) {
    const field = REQUIRED_FIELDS[i];
    if (!isSet(copgVd, field)) {
      errors.push('Missing required field: ' + field);
    } else if (typeof copgVd[field] !== 'string') {
      errors.push('Field ' + field + ' must be a string, got ' + phpTypeOf(copgVd[field]));
    }
  }

  for (let i = 0; i < NEW_FIELDS.length; i++) {
    if (!isSet(copgVd, NEW_FIELDS[i])) {
      errors.push('Missing new field: ' + NEW_FIELDS[i]);
    }
  }

  const formatErrors = validateFormats(copgVd);
  for (let i = 0; i < formatErrors.length; i++) errors.push(formatErrors[i]);

  for (let i = 0; i < EXTENDED_FIELDS.length; i++) {
    if (!isSet(copgVd, EXTENDED_FIELDS[i])) {
      errors.push('Missing COPG-VD extended field: ' + EXTENDED_FIELDS[i]);
    }
  }

  if (isSet(copgVd, 'VERSION') && isPhpArray(copgVd.VERSION)) {
    const versionFields = ['INCREMENTAL', 'RELEASE', 'SDK', 'CODENAME', 'SECURITY_PATCH', 'BASE_OS'];
    for (let i = 0; i < versionFields.length; i++) {
      if (!isSet(copgVd.VERSION, versionFields[i])) {
        errors.push('VERSION missing field: ' + versionFields[i]);
      }
    }
  } else if (isSet(copgVd, 'VERSION')) {
    errors.push('VERSION must be an object');
  }

  if (!isSet(data, 'phone') || !isPhpArray(data.phone)) {
    errors.push('Missing or invalid "phone" object');
  } else {
    for (let i = 0; i < PHONE_FIELDS.length; i++) {
      if (!isSet(data.phone, PHONE_FIELDS[i])) {
        errors.push('phone missing field: ' + PHONE_FIELDS[i]);
      }
    }
    if (isSet(data.phone, 'BluetoothMac') && !/^[0-9a-f]{2}\.[0-9a-f]{2}\.[0-9a-f]{2}\.[0-9a-f]{2}\.[0-9a-f]{2}\.[0-9a-f]{2}$/.test(String(data.phone.BluetoothMac))) {
      errors.push('phone.BluetoothMac format invalid: ' + data.phone.BluetoothMac);
    }
    if (isSet(data.phone, 'WifiMAC') && !/^[0-9A-F]{2}\.[0-9A-F]{2}\.[0-9A-F]{2}\.[0-9A-F]{2}\.[0-9A-F]{2}\.[0-9A-F]{2}$/.test(String(data.phone.WifiMAC))) {
      errors.push('phone.WifiMAC format invalid: ' + data.phone.WifiMAC);
    }
    if (isSet(data.phone, 'BSSID') && !/^[0-9a-f]{2}\.[0-9a-f]{2}\.[0-9a-f]{2}\.[0-9a-f]{2}\.[0-9a-f]{2}:[0-9a-f]{2}$/.test(String(data.phone.BSSID))) {
      errors.push('phone.BSSID format invalid: ' + data.phone.BSSID);
    }
    if (isSet(data.phone, 'Imei') && !/^[0-9]{15}$/.test(String(data.phone.Imei))) {
      errors.push('phone.Imei format invalid: ' + data.phone.Imei);
    }
    if (isSet(data.phone, 'WifiIP') && !/^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$/.test(String(data.phone.WifiIP))) {
      errors.push('phone.WifiIP format invalid: ' + data.phone.WifiIP);
    }
  }

  if (!isSet(data, 'hardware') || !isPhpArray(data.hardware)) {
    errors.push('Missing or invalid "hardware" object');
  } else {
    for (let i = 0; i < HARDWARE_FIELDS.length; i++) {
      if (!isSet(data.hardware, HARDWARE_FIELDS[i])) {
        errors.push('hardware missing field: ' + HARDWARE_FIELDS[i]);
      }
    }
    if (isSet(data.hardware, 'width') && (!isNumeric(data.hardware.width) || Number(data.hardware.width) < 100)) {
      errors.push('hardware.width must be numeric and > 100');
    }
    if (isSet(data.hardware, 'height') && (!isNumeric(data.hardware.height) || Number(data.hardware.height) < 100)) {
      errors.push('hardware.height must be numeric and > 100');
    }
    if (isSet(data.hardware, 'density') && (!isNumeric(data.hardware.density) || Number(data.hardware.density) < 1)) {
      errors.push('hardware.density must be numeric and >= 1');
    }
    if (isSet(data.hardware, 'dpi') && (!isNumeric(data.hardware.dpi) || Number(data.hardware.dpi) < 100)) {
      errors.push('hardware.dpi must be numeric and > 100');
    }

    /* DRM 组合合法性：每一组真机信息都必须带一套自洽的 Widevine/OEMCrypto 字段 */
    const drm = data.hardware.drm;
    if (!isPhpArray(drm)) {
      errors.push('hardware.drm missing or invalid');
    } else {
      const drmFields = ['Vendor', 'Version', 'Description', 'Algorithm', 'SecurityLevel',
        'SystemId', 'HdcpLevel', 'MaxHdcpLevel', 'UsageReportingSupport',
        'MaxNumberOfSessions', 'NumberOfOpenSessions'];
      for (let i = 0; i < drmFields.length; i++) {
        if (!isSet(drm, drmFields[i])) errors.push('hardware.drm missing field: ' + drmFields[i]);
      }
      const level = String(drm.SecurityLevel || '');
      if (level !== 'L1' && level !== 'L3') {
        errors.push('hardware.drm.SecurityLevel must be L1 or L3');
      }
      if (level !== String(copgVd.DRM_SECURITY_LEVEL || '')) {
        errors.push('hardware.drm.SecurityLevel != COPG-VD.DRM_SECURITY_LEVEL');
      }
      if (String(drm.SystemId) !== '8159') {
        errors.push('hardware.drm.SystemId must be 8159');
      }
      if ([8, 12, 16].indexOf(Number(drm.MaxNumberOfSessions)) === -1) {
        errors.push('hardware.drm.MaxNumberOfSessions must be 8, 12 or 16');
      }
      if (Number(drm.NumberOfOpenSessions) !== 0) {
        errors.push('hardware.drm.NumberOfOpenSessions must be 0');
      }
      if (drm.UsageReportingSupport !== true) {
        errors.push('hardware.drm.UsageReportingSupport must be true');
      }
      if (level === 'L1') {
        if (String(drm.Vendor) === 'Google') {
          errors.push('hardware.drm L1 must not use Google vendor');
        }
        if (String(drm.HdcpLevel) !== 'HDCP2.2' || String(drm.MaxHdcpLevel) !== 'HDCP2.2') {
          errors.push('hardware.drm L1 must use HDCP2.2');
        }
        if (String(drm.Description) !== 'OEMCrypto Widevine') {
          errors.push('hardware.drm L1 Description must be OEMCrypto Widevine');
        }
        if (!/AES\/CTR\/NoPadding/.test(String(drm.Algorithm))) {
          errors.push('hardware.drm L1 Algorithm must include AES/CTR/NoPadding');
        }
        const expectedVendor = drmVendorForSoc(String(copgVd.SOC_MODEL || ''));
        if (String(drm.Vendor) !== expectedVendor) {
          errors.push('hardware.drm Vendor mismatch SoC, expected: ' + expectedVendor);
        }
      } else {
        if (String(drm.Vendor) !== 'Google') {
          errors.push('hardware.drm L3 Vendor must be Google');
        }
        if (String(drm.HdcpLevel) !== 'Unprotected' || String(drm.MaxHdcpLevel) !== 'Unprotected') {
          errors.push('hardware.drm L3 HdcpLevel must be Unprotected');
        }
        if (String(drm.Description) !== 'Widevine CDM') {
          errors.push('hardware.drm L3 Description must be Widevine CDM');
        }
      }
      const rel = String((copgVd.VERSION && copgVd.VERSION.RELEASE) || '');
      const base = DRM_VERSION_BY_ANDROID[rel];
      if (base) {
        const majorMinor = base.split('.').slice(0, 2).join('.') + '.';
        if (String(drm.Version).indexOf(majorMinor) !== 0) {
          errors.push('hardware.drm.Version does not match Android ' + rel);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors: errors };
}

function validateJsonSyntax(jsonString) {
  const errors = [];

  if (/'[^']*'/.test(jsonString)) {
    errors.push('JSON contains single-quoted strings (should use double quotes)');
  }

  if (/,\s*[}\]]/.test(jsonString)) {
    errors.push('JSON contains trailing comma');
  }

  let parsedOk = true;
  let message = '';
  try {
    JSON.parse(jsonString);
  } catch (e) {
    parsedOk = false;
    message = (e && e.message) ? e.message : 'unknown error';
  }
  if (!parsedOk) {
    errors.push('JSON parse error: ' + message);
  }

  return { valid: errors.length === 0, errors: errors };
}

/* ============================================================
 * 地理定位（ip.yowao.xyz/ipgeo-dbip/ipgeo，失败回退 Cloudflare request.cf）
 * ============================================================ */

const geoCache = new Map();

/* 请求外部地理接口（按客户端 IP），结果缓存 1 小时；失败返回 null */
async function fetchGeoApi(ip) {
  const cached = geoCache.get(ip);
  if (cached && Date.now() - cached.at < GEO_CACHE_TTL_MS) return cached.value;

  let value = null;
  try {
    const resp = await fetch(GEO_API_URL + '?ip=' + encodeURIComponent(ip), {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(GEO_API_TIMEOUT_MS),
      cf: { cacheTtl: 600 }
    });
    if (resp.ok) {
      const data = await resp.json();
      value = {
        iso: typeof data.country_code2 === 'string' ? data.country_code2.toUpperCase() : '',
        latitude: typeof data.latitude === 'number' ? data.latitude.toFixed(4) : '',
        longitude: typeof data.longitude === 'number' ? data.longitude.toFixed(4) : '',
        country: typeof data.country_name === 'string' ? data.country_name : '',
        city: typeof data.city === 'string' ? data.city : '',
        region: typeof data.state_prov === 'string' ? data.state_prov : ''
      };
    }
  } catch (e) {
    value = null;
  }

  if (geoCache.size >= GEO_CACHE_MAX) geoCache.clear();
  geoCache.set(ip, { at: Date.now(), value: value });
  return value;
}

async function resolveGeo(request) {
  const cf = request && request.cf ? request.cf : null;
  const headers = request && request.headers ? request.headers : null;
  const clientIp = headers ? (headers.get('CF-Connecting-IP') || '') : '';
  const api = clientIp !== '' ? await fetchGeoApi(clientIp) : null;

  if (!cf && !api) return null; // 两条来源都不可用：等价 PHP 地理定位失败

  const cfIso = (cf && typeof cf.country === 'string' && cf.country !== '')
    ? cf.country.toUpperCase() : '';
  const iso = (api && api.iso) ? api.iso : cfIso;

  let callingCode = GEO_FALLBACK_COUNTRY_CODE;
  if (iso !== '' && Object.prototype.hasOwnProperty.call(CALLING_CODE_BY_ISO, iso)) {
    callingCode = CALLING_CODE_BY_ISO[iso];
  }

  let latitude = (api && api.latitude) ? api.latitude : '';
  let longitude = (api && api.longitude) ? api.longitude : '';
  if (latitude === '' && cf && typeof cf.latitude === 'number' && isFinite(cf.latitude)) {
    latitude = cf.latitude.toFixed(4);
  }
  if (longitude === '' && cf && typeof cf.longitude === 'number' && isFinite(cf.longitude)) {
    longitude = cf.longitude.toFixed(4);
  }

  return {
    callingCode: callingCode,
    nationalLen: getNationalLength(callingCode),
    latitude: latitude,
    longitude: longitude,
    country: (api && api.country) ? api.country : (typeof cf.country === 'string' ? cf.country : ''),
    city: (api && api.city) ? api.city : (cf && typeof cf.city === 'string' ? cf.city : ''),
    region: (api && api.region) ? api.region : (cf && typeof cf.region === 'string' ? cf.region : ''),
    timezone: (cf && typeof cf.timezone === 'string') ? cf.timezone : '',
    asn: (cf && cf.asn !== undefined) ? cf.asn : '',
    colo: (cf && typeof cf.colo === 'string') ? cf.colo : ''
  };
}

/* ============================================================
 * HTTP 层
 * ============================================================ */

function baseHeaders() {
  const headers = { 'Content-Type': 'application/json; charset=utf-8' };
  if (CORS_ENABLED) {
    headers['Access-Control-Allow-Origin'] = CORS_ORIGIN;
    headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-API-Key';
  }
  return headers;
}

/* 等价 PHP respond()：JSON_PRETTY_PRINT(4 空格) + JSON_UNESCAPED_UNICODE */
function jsonResponse(body, status) {
  return new Response(JSON.stringify(body, null, 4), {
    status: status,
    headers: baseHeaders()
  });
}

function resolveApiKey(env) {
  if (env && typeof env.API_KEY === 'string') return env.API_KEY;
  return DEFAULT_API_KEY;
}

function isoNow() {
  return new Date().toISOString();
}

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  /* PHP：OPTIONS 预检直接 204 */
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: baseHeaders() });
  }

  /* 路由：/、/api、/api/ 及 PHP 兼容入口均返回同一份 JSON */
  const allowedPaths = ['/', '/api', '/api/', '/api.php', '/api/index.php'];
  if (allowedPaths.indexOf(path) === -1) {
    return jsonResponse({ error: 'Not found. Use /api?key=YOUR_KEY' }, 404);
  }

  /* PHP：仅允许 GET */
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed. Use GET.' }, 405);
  }

  /* 鉴权：?key= 优先，其次 X-API-Key；api_key 为空则跳过 */
  const apiKey = resolveApiKey(env);
  if (apiKey !== '') {
    let providedKey;
    if (url.searchParams.has('key')) {
      providedKey = url.searchParams.get('key');
    } else {
      providedKey = request.headers.get('X-API-Key') || '';
    }
    if (providedKey !== apiKey) {
      return jsonResponse({ error: 'Invalid or missing API key. Use ?key=YOUR_KEY or X-API-Key header.' }, 401);
    }
  }

  const validate = url.searchParams.get('validate') === '1';
  const debug = url.searchParams.get('debug') === '1';

  try {
    await refreshWebViewVersions();

    const phone = Object.assign({}, randChoice(PHONE_DB));
    /* 自检：SoC 必须在 GPU / 规格 / CPU 三张表中都有映射，否则回退到默认平台 */
    if (!SOC_GPU_MAP[phone.soc] || !SOC_SPEC_MAP[phone.soc] || !CPU_IDENTITY[phone.soc]) {
      phone.soc = DEFAULT_SOC;
    }
    const apiLevel = pickApiLevel(phone);
    const geo = await resolveGeo(request);

    const g = createGeneratorState(phone, apiLevel, geo);
    const result = generate(g);
    const jsonString = JSON.stringify(result, null, 4);

    if (validate) {
      const structureValidation = validateStructure(result);
      const syntaxValidation = validateJsonSyntax(jsonString);
      const response = {
        success: structureValidation.valid && syntaxValidation.valid,
        data: result,
        validation: {
          structure: structureValidation,
          syntax: syntaxValidation
        }
      };
      if (debug) {
        response.debug = {
          phone_used: phone,
          api_level: apiLevel,
          webview_versions: webviewState ? webviewState.milestones : seedWebViewMilestones(),
          webview_updated_at: webviewState ? webviewState.updatedAt : 0,
          gpu: {
            vendor: result.hardware.GpuVendor,
            model: result.hardware.GpuModel,
            version: result.hardware.GpuVersion,
            vulkan: result.hardware.vulkan,
            extensions: result.hardware.GPUExtensions.split(' ')
          },
          cpu: {
            implementer: (result.hardware.cpuinfo.match(/CPU implementer: (\S+)/) || [])[1] || '',
            part: (result.hardware.cpuinfo.match(/CPU part: (\S+)/) || [])[1] || '',
            hardware: (result.hardware.cpuinfo.match(/Hardware: (\S+)/) || [])[1] || ''
          },
          geo: geo,
          generated_at: isoNow()
        };
      }
      return jsonResponse(response, 200);
    }

    if (debug) {
      return jsonResponse({
        success: true,
        data: result,
        debug: {
          phone_used: phone,
          api_level: apiLevel,
          webview_versions: webviewState ? webviewState.milestones : seedWebViewMilestones(),
          webview_updated_at: webviewState ? webviewState.updatedAt : 0,
          gpu: {
            vendor: result.hardware.GpuVendor,
            model: result.hardware.GpuModel,
            version: result.hardware.GpuVersion,
            vulkan: result.hardware.vulkan,
            extensions: result.hardware.GPUExtensions.split(' ')
          },
          cpu: {
            implementer: (result.hardware.cpuinfo.match(/CPU implementer: (\S+)/) || [])[1] || '',
            part: (result.hardware.cpuinfo.match(/CPU part: (\S+)/) || [])[1] || '',
            hardware: (result.hardware.cpuinfo.match(/Hardware: (\S+)/) || [])[1] || ''
          },
          geo: geo,
          generated_at: isoNow()
        }
      }, 200);
    }

    /* 默认：直接返回 COPG-VD JSON 本体（与 PHP 完全一致，无 success 包装） */
    return new Response(jsonString, { status: 200, headers: baseHeaders() });
  } catch (e) {
    const error = {
      success: false,
      error: (e && e.message) ? e.message : String(e)
    };
    if (debug) error.trace = (e && e.stack) ? e.stack : '';
    return jsonResponse(error, 500);
  }
}

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env);
  }
};
