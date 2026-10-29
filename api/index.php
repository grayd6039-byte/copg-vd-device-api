<?php
/**
 * Vercel serverless 入口（零配置：api/ 目录下的 PHP 入口自动识别为函数）
 * 本地根目录 api.php 保留直接访问，此处仅做转发。
 */
require __DIR__ . '/../api.php';
