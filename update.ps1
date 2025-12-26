# 吟心项目更新脚本（Windows PowerShell）

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  吟心项目更新脚本" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查是否在项目根目录
if (-not (Test-Path "docker-compose.yml")) {
    Write-Host "错误: 请在项目根目录运行此脚本" -ForegroundColor Red
    exit 1
}

# 备份数据库（可选）
if (Test-Path "backend\data\app.db") {
    Write-Host "备份数据库..." -ForegroundColor Yellow
    $backupName = "app.db.backup.$(Get-Date -Format 'yyyyMMdd_HHmmss')"
    Copy-Item "backend\data\app.db" "backend\data\$backupName"
    Write-Host "数据库已备份: $backupName" -ForegroundColor Green
}

# 拉取最新代码
Write-Host "拉取最新代码..." -ForegroundColor Yellow
try {
    git pull
} catch {
    Write-Host "警告: Git 拉取失败，继续使用当前代码..." -ForegroundColor Yellow
}

# 检查环境变量文件
Write-Host "检查环境变量..." -ForegroundColor Yellow
if (-not (Test-Path "backend\.env")) {
    Write-Host "警告: backend\.env 不存在，从 env.example 创建..." -ForegroundColor Yellow
    if (Test-Path "backend\env.example") {
        Copy-Item "backend\env.example" "backend\.env"
        Write-Host "请编辑 backend\.env 并配置必要的环境变量" -ForegroundColor Yellow
        Read-Host "按 Enter 继续"
    }
}

if (-not (Test-Path "frontend\.env")) {
    Write-Host "警告: frontend\.env 不存在，从 env.example 创建..." -ForegroundColor Yellow
    if (Test-Path "frontend\env.example") {
        Copy-Item "frontend\env.example" "frontend\.env"
        Write-Host "请编辑 frontend\.env 并配置 VITE_API_BASE" -ForegroundColor Yellow
        Read-Host "按 Enter 继续"
    }
}

# 重新构建并重启服务
Write-Host "重新构建并重启服务..." -ForegroundColor Green
docker compose up -d --build

# 等待服务启动
Write-Host "等待服务启动..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# 检查服务状态
Write-Host ""
Write-Host "服务状态：" -ForegroundColor Yellow
docker compose ps

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  更新完成！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "查看日志：" -ForegroundColor Yellow
Write-Host "  docker compose logs -f" -ForegroundColor White
Write-Host ""
Write-Host "查看特定服务日志：" -ForegroundColor Yellow
Write-Host "  docker compose logs -f backend" -ForegroundColor White
Write-Host "  docker compose logs -f frontend" -ForegroundColor White
Write-Host "  docker compose logs -f meilisearch" -ForegroundColor White
Write-Host ""

