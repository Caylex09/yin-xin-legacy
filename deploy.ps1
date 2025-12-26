# 吟心项目快速部署脚本（Windows PowerShell）

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  吟心项目 Docker Compose 部署脚本" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查 Docker 和 Docker Compose
try {
    $dockerVersion = docker --version
    Write-Host "Docker: $dockerVersion" -ForegroundColor Green
} catch {
    Write-Host "错误: 未安装 Docker，请先安装 Docker Desktop" -ForegroundColor Red
    exit 1
}

try {
    $composeVersion = docker compose version
    Write-Host "Docker Compose: $composeVersion" -ForegroundColor Green
} catch {
    Write-Host "错误: Docker Compose 不可用" -ForegroundColor Red
    exit 1
}

# 检查环境变量文件
Write-Host "检查环境变量配置..." -ForegroundColor Yellow

if (-not (Test-Path "backend\.env")) {
    Write-Host "警告: backend\.env 文件不存在" -ForegroundColor Yellow
    if (Test-Path "backend\env.example") {
        Write-Host "正在从 env.example 创建 .env 文件..." -ForegroundColor Yellow
        Copy-Item "backend\env.example" "backend\.env"
        Write-Host "请编辑 backend\.env 文件并配置必要的环境变量" -ForegroundColor Yellow
        Read-Host "配置完成后按 Enter 继续"
    } else {
        Write-Host "错误: backend\env.example 文件不存在" -ForegroundColor Red
        exit 1
    }
}

if (-not (Test-Path "frontend\.env")) {
    Write-Host "警告: frontend\.env 文件不存在" -ForegroundColor Yellow
    if (Test-Path "frontend\env.example") {
        Write-Host "正在从 env.example 创建 .env 文件..." -ForegroundColor Yellow
        Copy-Item "frontend\env.example" "frontend\.env"
        Write-Host "请编辑 frontend\.env 文件并配置 VITE_API_BASE" -ForegroundColor Yellow
        Read-Host "配置完成后按 Enter 继续"
    } else {
        Write-Host "错误: frontend\env.example 文件不存在" -ForegroundColor Red
        exit 1
    }
}

# 检查根目录 .env 文件
if (-not (Test-Path ".env")) {
    Write-Host "创建根目录 .env 文件..." -ForegroundColor Yellow
    @"
# MeiliSearch 配置
MEILI_API_KEY=your_secure_master_key_here

# JWT 密钥
JWT_SECRET=your_long_random_jwt_secret_here

# SMTP 配置
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_USER=your_qq_email@example.com
SMTP_PASS=your_smtp_auth_code
MAIL_FROM=吟心 <your_qq_email@example.com>

# 前端 API 地址（构建时使用）
VITE_API_BASE=http://localhost:3000/api

# 端口配置（可选）
BACKEND_PORT=3000
FRONTEND_PORT=80
"@ | Out-File -FilePath ".env" -Encoding UTF8
    Write-Host "请编辑根目录 .env 文件并配置必要的环境变量" -ForegroundColor Yellow
    Read-Host "配置完成后按 Enter 继续"
}

# 构建并启动服务
Write-Host ""
Write-Host "正在构建并启动服务..." -ForegroundColor Green
Write-Host ""

docker compose up -d --build

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  部署完成！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "服务状态：" -ForegroundColor Yellow
docker compose ps
Write-Host ""
Write-Host "查看日志：" -ForegroundColor Yellow
Write-Host "  docker compose logs -f" -ForegroundColor White
Write-Host ""
Write-Host "停止服务：" -ForegroundColor Yellow
Write-Host "  docker compose down" -ForegroundColor White
Write-Host ""

