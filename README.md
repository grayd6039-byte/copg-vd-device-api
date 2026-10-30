# COPG-VD Android Device Info Generator API

适配 COPG-VD 模块的安卓真机信息生成 API。每次调用返回一套全新合规设备数据，输出严格遵循 COPG-VD.json 规范格式。

**当前线上部署：** `https://mecg-so-device-api.rul.lol/api?key=mecg-so-2026`（Cloudflare Workers + 自定义域名，见 [Cloudflare Workers 部署](#cloudflare-workers-部署)）。本项目已不再使用 Vercel。

## 功能特性

- **严格遵循 COPG-VD.json 规范**：保留模板全部字段（BRAND、DEVICE、MANUFACTURER、MODEL、FINGERPRINT、PRODUCT、BOOTLOADER、BOARD、HARDWARE、DISPLAY、ID、HOST、INCREMENTAL、TIMESTAMP、PREVIEW_SDK、USER、SDK_FINGERPRINT、UUID、SECURITY_PATCH、FIRST_API_LEVEL、DRM_SECURITY_LEVEL）
- **强制新增设备属性**：IMEI（Luhn 校验合法）、IMSI、ICCID（19-20 位，89 开头）、MAC 地址、ANDROID_ID（16 位十六进制）、SN 序列号、基带版本、电池信息、蓝牙 MAC、本机电话号码
- **数据源**：内置精选安卓手机数据库 + GSMArena 爬虫（带 Cloudflare 绕过）
- **Android 版本**：只随机生成 Android 13 (API 33) / 14 (API 34) / 15 (API 35)
- **参数自洽**：指纹、SDK 版本、安全补丁、品牌机型匹配，无矛盾冲突
- **每次调用返回全新数据**：所有随机值独立生成

## 环境依赖

- PHP >= 7.4（推荐 8.0+）
- PHP 扩展：`curl`、`json`、`mbstring`
- Web 服务器：Nginx / Apache（宝塔面板自带）

## 部署步骤（宝塔面板）

### 1. 上传文件

将整个项目目录上传到网站根目录，例如：

```
/www/wwwroot/your-domain.com/
├── api.php                 # 兼容入口，转发到 api/index.php
├── api/
│   ├── index.php           # 主入口（全部逻辑）
│   ├── config.php
│   ├── lib/
│   │   ├── DataGenerator.php
│   │   ├── JsonValidator.php
│   │   └── PhoneDatabase.php
│   └── data/
│       └── phones.json
├── cloudflare/             # Cloudflare Workers 版本（纯 JS）
│   ├── worker.js
│   └── wrangler.toml
└── README.md
```

### 2. 配置 API Key

编辑 `api/config.php`，修改 `api_key` 字段：

```php
'api_key' => 'your-secret-key',  // 设为空字符串 '' 则无需鉴权
```

### 3. 设置目录权限

确保 `api/data/` 目录可写（PHP 需要写入缓存文件）：

```bash
chmod -R 755 /www/wwwroot/your-domain.com/api/data/
chown -R www:www /www/wwwroot/your-domain.com/api/data/
```

### 4. 配置 Nginx（宝塔面板）

在宝塔面板 → 网站 → 你的域名 → 配置文件，添加：

```nginx
location /api {
    location ~ [^/]\.ph(p|tml)?(/|$) {
        fastcgi_pass unix:/tmp/php-cgi-80.sock;
        fastcgi_index index.php;
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
    }
}
```

### 5. 验证部署

访问 `https://your-domain.com/api.php`，应返回完整的 COPG-VD JSON。

## Cloudflare Workers 部署

Cloudflare Workers 不支持 PHP，因此 `cloudflare/worker.js` 是用纯 JS 重写的等价实现：**单文件 ES module**、零 npm 依赖、不使用 Node API，输出 JSON 结构与 PHP 版本完全一致（字段名、嵌套层级、大小写均不变）。手机库已内联进 worker.js，磁盘缓存与 GSMArena 爬虫不再移植（等价行为：内存常量 + 随机抽样）。

目录结构：

```
cloudflare/
├── worker.js        # 单文件 Worker（内联 70 条手机数据 + 生成器 + 校验器）
└── wrangler.toml    # name = "mecg-so-device-api", main = "worker.js"
```

### 方式一：控制台粘贴（无需安装工具）

1. 登录 Cloudflare Dashboard → **Workers & Pages** → **Create** → **Worker**
2. 起名（例如 `mecg-so-device-api`），创建后进入 **Edit code**
3. 删除模板内容，把 `cloudflare/worker.js` 全文粘贴进去 → **Deploy**
4. 在 Worker 的 **Settings → Domains & Routes** 绑定自定义域名（本项目为 `mecg-so-device-api.rul.lol`）
5. 访问 `https://mecg-so-device-api.rul.lol/api?key=mecg-so-2026`

> 注意：本账号的 `workers.dev` 子域已被 Cloudflare 禁用（访问返回 `error code: 1042`），因此**必须**绑定自定义域名，不能使用 `<worker>.workers.dev`。

### 方式二：wrangler 命令行

```bash
cd cloudflare
npx wrangler login          # 首次使用需登录
npx wrangler deploy         # 按 wrangler.toml 发布
# 可选：用 Secret 覆盖 API Key
npx wrangler secret put API_KEY
```

`wrangler.toml` 关键项：`name = "mecg-so-device-api"`、`main = "worker.js"`、`compatibility_date = "2025-06-01"`。

### 方式三：REST API 上传（CI / 脚本）

```bash
# 1) 获取账号 ID（Account ID 在 Dashboard 右侧可见）
# 2) 上传模块
curl -X PUT "https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/workers/scripts/mecg-so-device-api" \
  -H "Authorization: Bearer <API_TOKEN>" \
  -F 'metadata={"main_module":"worker.js","compatibility_date":"2025-06-01"};type=application/json' \
  -F 'worker.js=@worker.js;type=application/javascript+module'
# 3) 绑定自定义域名（workers.dev 不可用，必须走这一步）
curl -X PUT "https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/workers/domains" \
  -H "Authorization: Bearer <API_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"environment":"production","hostname":"mecg-so-device-api.rul.lol","service":"mecg-so-device-api","zone_id":"<ZONE_ID>","zone_name":"rul.lol"}'
```

### 访问路径与参数

线上地址：`https://mecg-so-device-api.rul.lol/api?key=mecg-so-2026`

| 用途 | URL |
|------|-----|
| 基础调用 | `https://mecg-so-device-api.rul.lol/api?key=mecg-so-2026` |
| 根路径（同样有效） | `https://mecg-so-device-api.rul.lol/?key=mecg-so-2026` |
| 带校验 | `https://mecg-so-device-api.rul.lol/api?key=mecg-so-2026&validate=1` |
| 调试信息 | `https://mecg-so-device-api.rul.lol/api?key=mecg-so-2026&debug=1` |
| Header 鉴权 | `X-API-Key: mecg-so-2026`（与 `?key=` 二选一） |

- `/`、`/api`、`/api/` 返回同一份 COPG-VD JSON；`validate=1` 返回 `{success, data, validation:{structure, syntax}}`；`debug=1` 额外返回 `debug` 字段。
- 鉴权失败返回 **HTTP 401**，body 为 `{"error":"Invalid or missing API key. Use ?key=YOUR_KEY or X-API-Key header."}`。
- 仅允许 `GET`（`OPTIONS` 预检返回 204），其他方法返回 405。

### API Key 覆盖方式

worker 默认使用 `api/config.php` 里的 `mecg-so-2026`。优先级：`env.API_KEY`（Secret 或普通变量）> 默认值。

```bash
npx wrangler secret put API_KEY        # 输入新 Key 后回车（推荐）
# 或在 wrangler.toml 中加：
# [vars]
# API_KEY = "your-secret-key"
# 若 API_KEY 设为空字符串 ""，则关闭鉴权（等价 PHP 中 api_key = ''）
```

控制台方式：Worker → **Settings** → **Variables and Secrets** → 添加加密变量 `API_KEY`。

### 地理定位（IP → 国家区号）

PHP 版本调用 ipgeolocation.io 获取 `calling_code` 来决定 `PHONE_NUMBER` 的国家区号。Workers 版本改为读取 Cloudflare 自带的 `request.cf`（`country` / `latitude` / `longitude` 等），**不发起任何外部请求**：

- `cf.country` → ISO 区号映射表 → 国际区号 → 号码位数 → `PHONE_NUMBER`（与 PHP 行为等价）
- `cf.latitude` / `cf.longitude` → 填充 `phone.latitude` / `phone.longitude`（PHP 版本这两个字段恒为空字符串）
- `request.cf` 缺失（如本地 `wrangler dev` 无 cf 数据）时：区号回退到 `+1`/10 位或按 PHP 的 8 国随机列表生成，经纬度回退为空字符串，不会报错

### 与 PHP 版本的行为差异

1. 不移植 GSMArena 爬虫与 `phones_cache.json` 磁盘缓存（Workers 无文件系统），始终使用内联的 70 条手机数据。
2. `phone.latitude` / `phone.longitude` 由 `request.cf` 填充（PHP 恒为空）。
3. 随机数改用 `crypto.getRandomValues` + 拒绝采样，分布与 PHP `random_int` 一致（不使用 `Math.random`）。
4. JSON 格式化：PHP 会转义 `/`（`\/`），Worker 不转义；解析结果完全相同。

## 接口调用示例

### 基础调用

```bash
curl -s "https://your-domain.com/api.php?key=your-secret-key"
```

### 带校验的调用

```bash
curl -s "https://your-domain.com/api.php?key=your-secret-key&validate=1"
```

返回：

```json
{
  "success": true,
  "data": {
    "Instructions": "Use strings on double-quotes only.",
    "scope_mode": "playstore",
    "COPG-VD": {
      "BRAND": "google",
      "DEVICE": "bramble",
      "MANUFACTURER": "Google",
      "MODEL": "Pixel 9a",
      "FINGERPRINT": "google/bramble_beta/bramble:TQ2A.230901.001/TQ2A.240101.001/16484274:user/release-keys",
      "PRODUCT": "bramble_beta",
      "BOOTLOADER": "unknown",
      "BOARD": "bramble",
      "HARDWARE": "bramble",
      "DISPLAY": "TQ2A.240101.001",
      "ID": "TQ2A.240101.001",
      "HOST": "a3f2b1c9d8e7",
      "INCREMENTAL": "16484274",
      "TIMESTAMP": "1735689600",
      "USER": "android-build",
      "SDK_FINGERPRINT": "d9ad4b00fa641d6e43c42cc969f49492",
      "UUID": "kX9mPqLrStUvWxYzAbCdEfGhIjKlMnOpQr",
      "SECURITY_PATCH": "2025-06-01",
      "FIRST_API_LEVEL": "34",
      "DRM_SECURITY_LEVEL": "L1",
      "IMEI": "356938012345678",
      "IMSI": "310260123456789",
      "ICCID": "89012345678901234567",
      "MAC_ADDRESS": "A4:5E:60:B2:C3:D4",
      "ANDROID_ID": "a1b2c3d4e5f6g7h8",
      "SERIAL_NUMBER": "GP2506123456",
      "BASEBAND_VERSION": "g5135b-250115-01",
      "BLUETOOTH_MAC": "A4:5E:60:E5:F6:G7",
      "PHONE_NUMBER": "+14155552678",
      "BATTERY": "{\"capacity\":85,\"health\":98,\"temperature\":320,\"voltage\":4100,\"technology\":\"Li-ion\",\"plugged\":0,\"status\":2}"
    },
    "motor_drm": false,
    "global_fields": ["SECURITY_PATCH"]
  },
  "validation": {
    "structure": {"valid": true, "errors": []},
    "syntax": {"valid": true, "errors": []}
  }
}
```

### 调试模式

```bash
curl -s "https://your-domain.com/api.php?key=your-secret-key&debug=1"
```

返回额外包含 `debug` 字段，显示使用的手机记录和 API 级别。

### 无鉴权调用（config.php 中 api_key 设为空字符串）

```bash
curl -s "https://your-domain.com/api.php"
```

## 输出字段说明

### COPG-VD 原有字段

| 字段 | 说明 | 示例 |
|------|------|------|
| BRAND | 品牌（小写） | `google` |
| DEVICE | 设备代号 | `bramble` |
| MANUFACTURER | 厂商名称 | `Google` |
| MODEL | 机型名称 | `Pixel 9a` |
| FINGERPRINT | 完整指纹 | `google/bramble_beta/bramble:TQ2A...:user/release-keys` |
| PRODUCT | 产品代码 | `bramble_beta` |
| BOOTLOADER | 引导加载器 | `unknown` / `fsl3.0` |
| BOARD | 主板名称 | `bramble` |
| HARDWARE | 硬件名称 | `bramble` |
| DISPLAY | 显示版本 | `TQ2A.240101.001` |
| ID | 构建 ID | `TQ2A.240101.001` |
| HOST | 构建主机标识（12 位十六进制） | `a3f2b1c9d8e7` |
| INCREMENTAL | 增量构建号 | `16484274` |
| TIMESTAMP | 构建时间戳（Unix 秒） | `1735689600` |
| PREVIEW_SDK | 预览 SDK 日期（仅 Android 15+） | `20250601` |
| USER | 构建用户 | `android-build` |
| SDK_FINGERPRINT | SDK 指纹（32 位十六进制） | `d9ad4b00fa641d6e43c42cc969f49492` |
| UUID | 设备 UUID（base64url） | `kX9mPqLrStUvWxYzAbCdEfGhIjKlMnOpQr` |
| SECURITY_PATCH | 安全补丁日期 | `2025-06-01` |
| FIRST_API_LEVEL | 首次 API 级别 | `34` |
| DRM_SECURITY_LEVEL | DRM 安全级别 | `L1` |

### 新增设备属性字段

| 字段 | 说明 | 格式规范 |
|------|------|----------|
| IMEI | 国际移动设备识别码 | 15 位数字，Luhn 校验合法 |
| IMSI | 国际移动用户识别码 | 15 位数字，有效 MCC/MNC |
| ICCID | 集成电路卡识别码 | 19-20 位数字，89 开头，Luhn 校验 |
| MAC_ADDRESS | 以太网/WiFi MAC 地址 | XX:XX:XX:XX:XX:XX |
| ANDROID_ID | Android ID | 16 位十六进制字符串 |
| SERIAL_NUMBER | 序列号 | 品牌相关格式 |
| BASEBAND_VERSION | 基带版本 | 品牌相关格式 |
| BLUETOOTH_MAC | 蓝牙 MAC 地址 | XX:XX:XX:XX:XX:XX |
| PHONE_NUMBER | 本机电话号码 | E.164 格式（+国家代码 + 号码） |
| BATTERY | 电池信息（JSON 字符串） | capacity/health/temperature/voltage/technology/plugged/status |

## 数据源说明

### 内置数据库

`api/data/phones.json` 包含精选的安卓手机列表（Google Pixel、Samsung Galaxy、Xiaomi、OnePlus、OPPO、Vivo、Motorola、Sony、Huawei、Honor、Nothing、ASUS、Realme、LG），共 60+ 款机型。平板设备已全部过滤。

### GSMArena 爬虫

`api/lib/PhoneDatabase.php` 内置 GSMArena 爬虫，尝试从 `https://www.gsmarena.com/results.php3?sMakers={brand}` 抓取各品牌手机列表。

- **Cloudflare 绕过**：检测 "One quick check" 页面，遇到挑战时静默回退到内置数据库
- **平板过滤**：通过关键词匹配（tab、pad、tablet、ipad 等）过滤平板设备
- **缓存机制**：抓取结果缓存 24 小时，避免频繁请求
- **降级策略**：爬虫失败时自动使用内置数据库，确保 API 始终可用

## 配置项说明

`api/config.php` 中的配置项：

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `api_key` | `mecg-so-2026` | API 鉴权密钥，设为 `''` 则无需鉴权 |
| `data_dir` | `__DIR__ . '/data'` | 数据目录（需可写） |
| `scraper.enabled` | `false` | 是否启用 GSMArena 爬虫（无本地磁盘的托管环境（如 Cloudflare Workers）下必须关闭） |
| `scraper.timeout` | `15` | 爬虫请求超时（秒） |
| `scraper.cache_ttl` | `86400` | 缓存有效期（秒） |
| `scraper.user_agent` | Chrome UA | 爬虫 User-Agent |
| `android_versions` | `[33, 34, 35]` | 生成的 Android API 级别 |
| `cors.enabled` | `true` | 是否启用 CORS |
| `cors.origin` | `*` | CORS 允许的来源 |

## 常见问题

### Q: 如何关闭 GSMArena 爬虫？

编辑 `api/config.php`，将 `scraper.enabled` 设为 `false`。

### Q: 如何修改 API Key？

编辑 `api/config.php`，修改 `api_key` 字段。设为空字符串 `''` 则无需鉴权。

### Q: 如何添加更多手机型号？

编辑 `api/data/phones.json`，按照现有格式添加新的手机记录。每个记录包含 `brand`、`manufacturer`、`model`、`device_code` 四个字段。

### Q: 如何验证 JSON 格式正确性？

使用 `?validate=1` 参数调用 API，返回结果中包含 `validation` 字段，显示结构和语法校验结果。
