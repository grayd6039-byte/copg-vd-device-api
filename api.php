<?php
/**
 * 兼容入口：宝塔/常规 PHP 环境可直接访问 api.php
 * 实际逻辑位于 api/index.php（Vercel 函数目录内自包含）
 */
require __DIR__ . '/api/index.php';
