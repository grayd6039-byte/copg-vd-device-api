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
const ANDROID_VERSIONS = [33, 34, 35];        // config.php => android_versions
const CORS_ENABLED = true;                    // config.php => cors.enabled
const CORS_ORIGIN = '*';                      // config.php => cors.origin
const GEO_FALLBACK_COUNTRY_CODE = '+1';       // config.php => ip_geolocation.fallback_country_code
const GEO_FALLBACK_NATIONAL_LEN = 10;         // config.php => ip_geolocation.fallback_national_len

/* ============================================================
 * 手机数据库（内联自 api/data/phones.json，70 条，原样保留）
 * ============================================================ */

const PHONES = [
  {"brand":"google","manufacturer":"Google","model":"Pixel 9a","device_code":"bramble","soc":"Tensor G4","screen_density":2.7,"screen_width":1080,"screen_height":2400},
  {"brand":"google","manufacturer":"Google","model":"Pixel 9","device_code":"caiman","soc":"Tensor G4","screen_density":2.75,"screen_width":1080,"screen_height":2400},
  {"brand":"google","manufacturer":"Google","model":"Pixel 9 Pro","device_code":"shiba","soc":"Tensor G4","screen_density":2.75,"screen_width":1440,"screen_height":3120},
  {"brand":"google","manufacturer":"Google","model":"Pixel 9 Pro XL","device_code":"husky","soc":"Tensor G4","screen_density":2.75,"screen_width":1440,"screen_height":3120},
  {"brand":"google","manufacturer":"Google","model":"Pixel 8","device_code":"shiba","soc":"Tensor G3","screen_density":2.75,"screen_width":1080,"screen_height":2400},
  {"brand":"google","manufacturer":"Google","model":"Pixel 8 Pro","device_code":"husky","soc":"Tensor G3","screen_density":2.75,"screen_width":1440,"screen_height":3120},
  {"brand":"google","manufacturer":"Google","model":"Pixel 7a","device_code":"lynx","soc":"Tensor G2","screen_density":2.5,"screen_width":1080,"screen_height":2400},
  {"brand":"google","manufacturer":"Google","model":"Pixel 7","device_code":"panther","soc":"Tensor G2","screen_density":2.5,"screen_width":1080,"screen_height":2400},
  {"brand":"google","manufacturer":"Google","model":"Pixel 7 Pro","device_code":"cheetah","soc":"Tensor G2","screen_density":2.5,"screen_width":1440,"screen_height":3120},
  {"brand":"google","manufacturer":"Google","model":"Pixel 6a","device_code":"marble","soc":"Tensor G2","screen_density":2.5,"screen_width":1080,"screen_height":2400},
  {"brand":"google","manufacturer":"Google","model":"Pixel 6","device_code":"ramsay","soc":"Tensor G1","screen_density":2.5,"screen_width":1080,"screen_height":2400},
  {"brand":"google","manufacturer":"Google","model":"Pixel 6 Pro","device_code":"redfin","soc":"Tensor G1","screen_density":2.5,"screen_width":1440,"screen_height":3120},
  {"brand":"samsung","manufacturer":"Samsung Electronics","model":"Galaxy S25 Ultra","device_code":"e3q","soc":"Snapdragon 8 Elite","screen_density":2.6,"screen_width":1440,"screen_height":3120},
  {"brand":"samsung","manufacturer":"Samsung Electronics","model":"Galaxy S25+","device_code":"e3s","soc":"Snapdragon 8 Elite","screen_density":2.6,"screen_width":1440,"screen_height":3120},
  {"brand":"samsung","manufacturer":"Samsung Electronics","model":"Galaxy S25","device_code":"e3q","soc":"Snapdragon 8 Elite","screen_density":2.6,"screen_width":1080,"screen_height":2340},
  {"brand":"samsung","manufacturer":"Samsung Electronics","model":"Galaxy S24 Ultra","device_code":"e5q","soc":"Snapdragon 8 Gen 3","screen_density":2.6,"screen_width":1440,"screen_height":3120},
  {"brand":"samsung","manufacturer":"Samsung Electronics","model":"Galaxy S24+","device_code":"e5s","soc":"Exynos 2400","screen_density":2.6,"screen_width":1440,"screen_height":3120},
  {"brand":"samsung","manufacturer":"Samsung Electronics","model":"Galaxy S24","device_code":"e5q","soc":"Exynos 2400","screen_density":2.6,"screen_width":1080,"screen_height":2340},
  {"brand":"samsung","manufacturer":"Samsung Electronics","model":"Galaxy S23 Ultra","device_code":"dm3q","soc":"Snapdragon 8 Gen 2","screen_density":2.6,"screen_width":1440,"screen_height":3088},
  {"brand":"samsung","manufacturer":"Samsung Electronics","model":"Galaxy S23+","device_code":"dm3s","soc":"Snapdragon 8 Gen 2","screen_density":2.6,"screen_width":1440,"screen_height":3088},
  {"brand":"samsung","manufacturer":"Samsung Electronics","model":"Galaxy S23","device_code":"dm3q","soc":"Snapdragon 8 Gen 2","screen_density":2.6,"screen_width":1080,"screen_height":2340},
  {"brand":"samsung","manufacturer":"Samsung Electronics","model":"Galaxy A56","device_code":"a56","soc":"Exynos 1480","screen_density":2.25,"screen_width":1080,"screen_height":2340},
  {"brand":"samsung","manufacturer":"Samsung Electronics","model":"Galaxy A36","device_code":"a36","soc":"Exynos 1380","screen_density":2.25,"screen_width":1080,"screen_height":2340},
  {"brand":"samsung","manufacturer":"Samsung Electronics","model":"Galaxy A26","device_code":"a26","soc":"Exynos 1380","screen_density":2.25,"screen_width":720,"screen_height":1600},
  {"brand":"samsung","manufacturer":"Samsung Electronics","model":"Galaxy Z Fold7","device_code":"fold7","soc":"Snapdragon 8 Elite","screen_density":2.6,"screen_width":1080,"screen_height":2340},
  {"brand":"samsung","manufacturer":"Samsung Electronics","model":"Galaxy Z Flip7","device_code":"flip7","soc":"Snapdragon 8 Elite","screen_density":2.6,"screen_width":1080,"screen_height":2640},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Xiaomi 15 Ultra","device_code":"cassian","soc":"Snapdragon 8 Elite","screen_density":2.75,"screen_width":1440,"screen_height":3200},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Xiaomi 15 Pro","device_code":"dada","soc":"Snapdragon 8 Elite","screen_density":2.75,"screen_width":1440,"screen_height":3200},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Xiaomi 15","device_code":"dada","soc":"Snapdragon 8 Elite","screen_density":2.75,"screen_width":1200,"screen_height":2670},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Xiaomi 14 Ultra","device_code":"aurora","soc":"Snapdragon 8 Gen 3","screen_density":2.75,"screen_width":1440,"screen_height":3200},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Xiaomi 14 Pro","device_code":"titi","soc":"Snapdragon 8 Gen 3","screen_density":2.75,"screen_width":1440,"screen_height":3200},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Xiaomi 14","device_code":"titi","soc":"Snapdragon 8 Gen 3","screen_density":2.75,"screen_width":1200,"screen_height":2670},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Redmi Note 14 Pro","device_code":"ruby","soc":"Dimensity 7300 Ultra","screen_density":2.25,"screen_width":1220,"screen_height":2712},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Redmi Note 14","device_code":"ruby","soc":"Dimensity 7300 Ultra","screen_density":2.25,"screen_width":1220,"screen_height":2712},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Redmi K80 Pro","device_code":"inui","soc":"Snapdragon 8 Elite","screen_density":2.75,"screen_width":1440,"screen_height":3200},
  {"brand":"xiaomi","manufacturer":"Xiaomi Corporation","model":"Redmi K80","device_code":"inui","soc":"Snapdragon 8 Elite","screen_density":2.75,"screen_width":1440,"screen_height":3200},
  {"brand":"oneplus","manufacturer":"OnePlus","model":"OnePlus 13","device_code":"CPH2581","soc":"Snapdragon 8 Elite","screen_density":2.75,"screen_width":1440,"screen_height":3168},
  {"brand":"oneplus","manufacturer":"OnePlus","model":"OnePlus 12","device_code":"CPH2483","soc":"Snapdragon 8 Gen 3","screen_density":2.75,"screen_width":1440,"screen_height":3168},
  {"brand":"oneplus","manufacturer":"OnePlus","model":"OnePlus 12R","device_code":"CPH2561","soc":"Snapdragon 8 Gen 3","screen_density":2.75,"screen_width":1264,"screen_height":2780},
  {"brand":"oneplus","manufacturer":"OnePlus","model":"OnePlus Nord 4","device_code":"CPH2589","soc":"Snapdragon 7+ Gen 3","screen_density":2.25,"screen_width":1216,"screen_height":2704},
  {"brand":"oneplus","manufacturer":"OnePlus","model":"OnePlus Nord CE4","device_code":"CPH2631","soc":"Snapdragon 7+ Gen 3","screen_density":2.25,"screen_width":1080,"screen_height":2400},
  {"brand":"oppo","manufacturer":"OPPO","model":"OPPO Find X8 Pro","device_code":"OP5A39L1","soc":"Dimensity 9400","screen_density":2.75,"screen_width":1264,"screen_height":2780},
  {"brand":"oppo","manufacturer":"OPPO","model":"OPPO Find X8","device_code":"OP5A39L1","soc":"Dimensity 9400","screen_density":2.75,"screen_width":1264,"screen_height":2780},
  {"brand":"oppo","manufacturer":"OPPO","model":"OPPO Reno 13 Pro","device_code":"OP5E1FL1","soc":"Dimensity 8350","screen_density":2.25,"screen_width":1264,"screen_height":2780},
  {"brand":"oppo","manufacturer":"OPPO","model":"OPPO A3 Pro","device_code":"OP5D41L1","soc":"Dimensity 7300","screen_density":2.25,"screen_width":1080,"screen_height":2412},
  {"brand":"vivo","manufacturer":"Vivo","model":"Vivo X200 Pro","device_code":"PD2341","soc":"Dimensity 9400","screen_density":2.75,"screen_width":1260,"screen_height":2800},
  {"brand":"vivo","manufacturer":"Vivo","model":"Vivo X200","device_code":"PD2341","soc":"Dimensity 9400","screen_density":2.75,"screen_width":1260,"screen_height":2800},
  {"brand":"vivo","manufacturer":"Vivo","model":"Vivo S20 Pro","device_code":"V2367A","soc":"Dimensity 9300","screen_density":2.25,"screen_width":1260,"screen_height":2800},
  {"brand":"vivo","manufacturer":"Vivo","model":"Vivo Y300","device_code":"V2354","soc":"Dimensity 7300","screen_density":2.25,"screen_width":1080,"screen_height":2376},
  {"brand":"motorola","manufacturer":"Motorola Mobility","model":"Moto X50 Ultra","device_code":"xt2417-3","soc":"Snapdragon 8 Gen 3","screen_density":2.25,"screen_width":1220,"screen_height":2712},
  {"brand":"motorola","manufacturer":"Motorola Mobility","model":"Moto Edge 60 Pro","device_code":"xt2445-4","soc":"Dimensity 8300 Extreme","screen_density":2.25,"screen_width":1220,"screen_height":2712},
  {"brand":"motorola","manufacturer":"Motorola Mobility","model":"Moto G85","device_code":"xt2397-5","soc":"Dimensity 8200","screen_density":2.25,"screen_width":1080,"screen_height":2400},
  {"brand":"motorola","manufacturer":"Motorola Mobility","model":"Moto G84","device_code":"xt2383-6","soc":"Dimensity 7200","screen_density":2.25,"screen_width":1080,"screen_height":2400},
  {"brand":"sony","manufacturer":"Sony Corporation","model":"Xperia 1 VI","device_code":"a5","soc":"Snapdragon 8 Gen 3","screen_density":2.75,"screen_width":1440,"screen_height":3440},
  {"brand":"sony","manufacturer":"Sony Corporation","model":"Xperia 5 VI","device_code":"a4","soc":"Snapdragon 8 Gen 3","screen_density":2.75,"screen_width":1440,"screen_height":3440},
  {"brand":"sony","manufacturer":"Sony Corporation","model":"Xperia 10 VII","device_code":"a3","soc":"Snapdragon 6 Gen 3","screen_density":2.25,"screen_width":1080,"screen_height":2340},
  {"brand":"huawei","manufacturer":"Huawei Device Co.","model":"Huawei Pura 70 Ultra","device_code":"ALN-AL10","soc":"Kirin 9020","screen_density":2.75,"screen_width":1260,"screen_height":2844},
  {"brand":"huawei","manufacturer":"Huawei Device Co.","model":"Huawei Pura 70 Pro","device_code":"ALN-AL00","soc":"Kirin 9010","screen_density":2.75,"screen_width":1260,"screen_height":2844},
  {"brand":"huawei","manufacturer":"Huawei Device Co.","model":"Huawei Mate 60 Pro","device_code":"MLN-AL00","soc":"Kirin 9000S","screen_density":2.75,"screen_width":1260,"screen_height":2720},
  {"brand":"honor","manufacturer":"Honor Device Co.","model":"Honor Magic7 Pro","device_code":"MGI-AN00","soc":"Snapdragon 8 Elite","screen_density":2.75,"screen_width":1264,"screen_height":2800},
  {"brand":"honor","manufacturer":"Honor Device Co.","model":"Honor Magic7","device_code":"MGI-AN00","soc":"Snapdragon 8 Elite","screen_density":2.75,"screen_width":1264,"screen_height":2800},
  {"brand":"honor","manufacturer":"Honor Device Co.","model":"Honor X60 Pro","device_code":"HRY-LX9","soc":"Dimensity 7200X","screen_density":2.25,"screen_width":1200,"screen_height":2652},
  {"brand":"nothing","manufacturer":"Nothing Technology","model":"Nothing Phone (3)","device_code":"nova","soc":"Snapdragon 8 Elite","screen_density":2.75,"screen_width":1260,"screen_height":2740},
  {"brand":"nothing","manufacturer":"Nothing Technology","model":"Nothing Phone (2a)","device_code":"nova","soc":"Dimensity 7200","screen_density":2.25,"screen_width":1084,"screen_height":2412},
  {"brand":"asus","manufacturer":"ASUSTeK Computer","model":"ROG Phone 9 Pro","device_code":"ZS760KL","soc":"Snapdragon 8 Elite","screen_density":2.75,"screen_width":1080,"screen_height":2400},
  {"brand":"asus","manufacturer":"ASUSTeK Computer","model":"Zenfone 11 Ultra","device_code":"ZS790KS","soc":"Snapdragon 8 Elite","screen_density":2.75,"screen_width":1080,"screen_height":2400},
  {"brand":"realme","manufacturer":"Realme","model":"Realme GT 6","device_code":"RMX3858","soc":"Snapdragon 8 Gen 3","screen_density":2.25,"screen_width":1264,"screen_height":2780},
  {"brand":"realme","manufacturer":"Realme","model":"Realme 13 Pro+","device_code":"RMX3932","soc":"Dimensity 7050","screen_density":2.25,"screen_width":1080,"screen_height":2412},
  {"brand":"realme","manufacturer":"Realme","model":"Realme C67","device_code":"RMX3810","soc":"Snapdragon 685","screen_density":2.25,"screen_width":1080,"screen_height":2400},
  {"brand":"lg","manufacturer":"LG Electronics","model":"LG Velvet","device_code":"velvet","soc":"Snapdragon 765G","screen_density":2.25,"screen_width":1080,"screen_height":2460}
];

/* ============================================================
 * SoC → GPU / Vulkan / 频率 对照表（DataGenerator::$socGpuMap）
 * ============================================================ */

const SOC_GPU_MAP = {
  'Snapdragon 8 Elite': { gpu: 'Adreno 830', vendor: 'Qualcomm', gl: '3.2', gl_version: 'v32.0.0', vulkan: '1.3', frequency: [300000, 600000, 900000, 1200000, 1500000, 1800000, 2100000, 2400000, 2700000, 3000000, 3300000, 3600000, 3900000, 4200000, 4470000] },
  'Snapdragon 8 Gen 3': { gpu: 'Adreno 751', vendor: 'Qualcomm', gl: '3.2', gl_version: 'v30.2.4', vulkan: '1.3', frequency: [300000, 500000, 700000, 900000, 1100000, 1300000, 1500000, 1700000, 1900000, 2100000, 2300000, 2500000, 2700000, 2900000, 3100000, 3300000] },
  'Snapdragon 8 Gen 2': { gpu: 'Adreno 740', vendor: 'Qualcomm', gl: '3.2', gl_version: 'v28.0.0', vulkan: '1.3', frequency: [300000, 500000, 700000, 900000, 1100000, 1300000, 1500000, 1700000, 1900000, 2100000, 2300000, 2500000, 2700000, 2900000, 3100000, 3300000, 3360000] },
  'Snapdragon 8+ Gen 1': { gpu: 'Adreno 730', vendor: 'Qualcomm', gl: '3.2', gl_version: 'v26.0.0', vulkan: '1.2', frequency: [300000, 500000, 700000, 900000, 1100000, 1300000, 1500000, 1700000, 1900000, 2100000, 2300000, 2500000, 2700000, 2900000, 3000000] },
  'Snapdragon 7+ Gen 3': { gpu: 'Adreno 732', vendor: 'Qualcomm', gl: '3.2', gl_version: 'v30.2.4', vulkan: '1.3', frequency: [300000, 600000, 900000, 1200000, 1500000, 1800000, 2100000, 2400000, 2610000] },
  'Snapdragon 765G': { gpu: 'Adreno 620', vendor: 'Qualcomm', gl: '3.2', gl_version: 'v20.0.0', vulkan: '1.1', frequency: [300000, 600000, 900000, 1200000, 1500000, 1800000, 2100000, 2400000] },
  'Snapdragon 685': { gpu: 'Adreno 610', vendor: 'Qualcomm', gl: '3.2', gl_version: 'v20.0.0', vulkan: '1.1', frequency: [300000, 600000, 900000, 1200000, 1500000, 1800000, 2100000, 2400000] },
  'Snapdragon 6 Gen 3': { gpu: 'Adreno 710', vendor: 'Qualcomm', gl: '3.2', gl_version: 'v30.2.4', vulkan: '1.3', frequency: [300000, 600000, 900000, 1200000, 1500000, 1800000, 2100000, 2400000] },
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
  'Kirin 9000S': { gpu: 'Maleoon 910', vendor: 'Huawei', gl: '3.2', gl_version: 'v100.0.0', vulkan: '1.1', frequency: [400000, 600000, 800000, 1000000, 1200000, 1400000, 1600000, 1800000, 2000000, 2200000, 2400000] }
};

const DEFAULT_SOC = 'Snapdragon 8 Gen 3';

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

/* GPU 扩展（generateGpuExtensions，顺序与原数组一致，含原有重复项） */
const GPU_EXTENSIONS = [
  'GL_EXT_debug_marker', 'GL_EXT_robustness', 'GL_EXT_texture_format_BGRA8888',
  'GL_OES_depth24', 'GL_OES_element_index_uint', 'GL_OES_fbo_render_mipmap',
  'GL_OES_texture_3D', 'GL_OES_texture_float', 'GL_OES_texture_half_float',
  'GL_OES_vertex_array_object', 'GL_OES_vertex_half_float', 'GL_EXT_blend_minmax',
  'GL_EXT_color_buffer_float', 'GL_EXT_color_buffer_half_float', 'GL_EXT_discard_framebuffer',
  'GL_EXT_multi_draw_arrays', 'GL_EXT_multisampled_render_to_texture',
  'GL_EXT_read_format_bgra', 'GL_EXT_shader_texture_lod', 'GL_EXT_texture_filter_anisotropic',
  'GL_EXT_texture_format_BGRA8888', 'GL_EXT_texture_storage', 'GL_KHR_blend_equation_advanced',
  'GL_OES_blend_func_separate', 'GL_OES_blend_subtract', 'GL_OES_byte_codes',
  'GL_OES_compressed_ETC1_RGB8_texture', 'GL_OES_depth_texture', 'GL_OES_EGL_image'
];

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
  return '14';
}

function getBuildCodename() {
  return 'REL';
}

function generateBuildId(apiLevel) {
  let prefixes;
  if (apiLevel === 33) prefixes = ['TQ2A', 'TP1A', 'TR1A'];
  else if (apiLevel === 35) prefixes = ['AP1A', 'BP1A', 'CP1A'];
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
  const tac = generateTac(g.phone);
  const serial = padLeft(String(randInt(0, 999999)), 6, '0');
  const imei14 = tac + serial;
  return imei14 + String(luhnCheckDigit(imei14));
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

function generateBasebandVersion(brand) {
  const brandLower = String(brand).toLowerCase();
  if (Object.prototype.hasOwnProperty.call(BASEBANDS_BY_BRAND, brandLower)) {
    return randChoice(BASEBANDS_BY_BRAND[brandLower]);
  }
  const now = new Date();
  const ymd = ymdFromDate(now);
  return 'BB' + ymd + '-' + String(randInt(1, 99)) + '-' + String(randInt(1, 99));
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

function generateGpuExtensions() {
  const list = GPU_EXTENSIONS.slice();
  shuffleInPlace(list);
  const count = randInt(10, 20);
  return list.slice(0, count).join(' ');
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

function generateChromeVersion() {
  const major = randInt(120, 130);
  const build = randInt(0, 6999);
  const patch = randInt(0, 199);
  return String(major) + '.0.' + String(build) + '.' + String(patch);
}

function generateCpuInfo(phone) {
  const lines = [];
  lines.push('Processor: Aarch64 Processor rev ' + String(randInt(0, 4)) + ' (aarch64)');
  lines.push('MPIPSV: ' + (randInt(4000, 6000) / 100).toFixed(2));
  const coreOptions = [4, 6, 8];
  const coreCount = randChoice(coreOptions);
  for (let i = 0; i < coreCount; i++) {
    lines.push('processor: ' + String(i));
    lines.push('BogoMIPS: ' + (randInt(3000, 5500) / 100).toFixed(2));
  }
  lines.push('Features: fp asimd evtstrm aes pmull sha1 sha2 crc32 atomics fphp asimdhp cpuid asimdrdm dcpop asimddp');
  lines.push('CPU implementer: 0x41');
  lines.push('CPU architecture: 8');
  lines.push('CPU variant: 0x' + randInt(0, 15).toString(16));
  const parts = ['0xd0b', '0xd0d', '0xd4d', '0xd4e', '0xd81', '0xd82', '0xd83'];
  lines.push('CPU part: ' + randChoice(parts));
  lines.push('CPU revision: ' + String(randInt(0, 4)));
  lines.push('Hardware: ' + getSocHardwareName(phone));
  return lines.join('\n') + '\n';
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
  const xdpi = dpi + randInt(-5, 5);
  const ydpi = dpi + randInt(-5, 5);

  const socModel = (p.soc === undefined || p.soc === null) ? DEFAULT_SOC : p.soc;
  let socData = SOC_GPU_MAP[DEFAULT_SOC];
  if (Object.prototype.hasOwnProperty.call(SOC_GPU_MAP, socModel)) socData = SOC_GPU_MAP[socModel];

  const gpuRender = socData.gpu;
  const gpuVendor = socData.vendor;
  const gpuVersion = 'OpenGL ES ' + socData.gl + ' ' + socData.gl_version;
  const vulkan = socData.vulkan;
  const frequency = socData.frequency;
  const currentFrequency = generateCurrentFrequency(frequency);
  const gpuExtensions = generateGpuExtensions();

  const chromeVersion = generateChromeVersion();
  const userAgent = 'Mozilla/5.0 (Linux; Android ' + g.androidVersion + '; ' + model +
    ' Build/' + g.buildId + '; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/' +
    chromeVersion + ' Mobile Safari/537.36';

  const cpuinfo = generateCpuInfo(p);

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
    GpuVersion: gpuVersion,
    GPUExtensions: gpuExtensions,
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
  const basebandVersion = generateBasebandVersion(brand);
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
    FIRST_API_LEVEL: String(g.apiLevel),
    DRM_SECURITY_LEVEL: 'L1',
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
  'UserAgent', 'GpuRender', 'GpuVendor', 'GpuVersion', 'GPUExtensions', 'cpuinfo'
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
    if (apiLevel !== 33 && apiLevel !== 34 && apiLevel !== 35) {
      errors.push('FIRST_API_LEVEL must be 33, 34, or 35, got: ' + copgVd.FIRST_API_LEVEL);
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
 * 地理定位（request.cf，绝不请求外部服务）
 * ============================================================ */

function resolveGeo(request) {
  const cf = request && request.cf ? request.cf : null;
  if (!cf) return null; // 无 cf：等价 PHP 地理定位失败 -> 随机国家 + 空经纬度

  let callingCode = GEO_FALLBACK_COUNTRY_CODE;
  if (typeof cf.country === 'string' && cf.country !== '') {
    const iso = cf.country.toUpperCase();
    if (Object.prototype.hasOwnProperty.call(CALLING_CODE_BY_ISO, iso)) {
      callingCode = CALLING_CODE_BY_ISO[iso];
    }
  }

  let latitude = '';
  let longitude = '';
  if (typeof cf.latitude === 'number' && isFinite(cf.latitude)) latitude = cf.latitude.toFixed(4);
  if (typeof cf.longitude === 'number' && isFinite(cf.longitude)) longitude = cf.longitude.toFixed(4);

  return {
    callingCode: callingCode,
    nationalLen: getNationalLength(callingCode),
    latitude: latitude,
    longitude: longitude,
    country: typeof cf.country === 'string' ? cf.country : '',
    city: typeof cf.city === 'string' ? cf.city : '',
    region: typeof cf.region === 'string' ? cf.region : '',
    timezone: typeof cf.timezone === 'string' ? cf.timezone : '',
    asn: cf.asn === undefined ? '' : cf.asn,
    colo: typeof cf.colo === 'string' ? cf.colo : ''
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
    const phone = randChoice(PHONES);
    const apiLevel = randChoice(ANDROID_VERSIONS);
    const geo = resolveGeo(request);

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
