# 吟心项目 Git 更新脚本（不使用 Docker，Windows PowerShell）

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  吟心项目 Git 更新脚本" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查是否在项目根目录
if (-not (Test-Path "backend\package.json")) {
    Write-Host "错误: 请在项目根目录运行此脚本" -ForegroundColor Red
    exit 1
}

# 备份数据库
if (Test-Path "backend\data\app.db") {
    Write-Host "备份数据库..." -ForegroundColor Yellow
    $backupDir = "backend\data\backups"
    if (-not (Test-Path $backupDir)) {
        New-Item -ItemType Directory -Path $backupDir | Out-Null
    }
    $backupName = "app.db.backup.$(Get-Date -Format 'yyyyMMdd_HHmmss')"
    Copy-Item "backend\data\app.db" "$backupDir\$backupName"
    Write-Host "数据库已备份: $backupName" -ForegroundColor Green
}

# 拉取最新代码
Write-Host "拉取最新代码..." -ForegroundColor Yellow
try {
    git pull
} catch {
    Write-Host "错误: Git 拉取失败" -ForegroundColor Red
    exit 1
}

# 更新后端
Write-Host ""
Write-Host "更新后端..." -ForegroundColor Cyan
Set-Location backend

# 检查环境变量
if (-not (Test-Path ".env")) {
    Write-Host "警告: backend\.env 不存在，从 env.example 创建..." -ForegroundColor Yellow
    if (Test-Path "env.example") {
        Copy-Item "env.example" ".env"
        Write-Host "请编辑 backend\.env 并配置必要的环境变量" -ForegroundColor Yellow
        Read-Host "按 Enter 继续"
    }
}

# 安装依赖
Write-Host "安装后端依赖..." -ForegroundColor Yellow
npm install

# 构建
Write-Host "构建后端..." -ForegroundColor Yellow
npm run build

# 重启服务提示
Write-Host "提示: 请手动重启后端服务" -ForegroundColor Yellow
Write-Host "可以使用: node dist/index.js" -ForegroundColor White
Write-Host "或使用 PM2: pm2 restart yinxin-backend" -ForegroundColor White

Set-Location ..

# 更新前端
Write-Host ""
Write-Host "更新前端..." -ForegroundColor Cyan
Set-Location frontend

# 检查环境变量
if (-not (Test-Path ".env")) {
    Write-Host "警告: frontend\.env 不存在，从 env.example 创建..." -ForegroundColor Yellow
    if (Test-Path "env.example") {
        Copy-Item "env.example" ".env"
        Write-Host "请编辑 frontend\.env 并配置 VITE_API_BASE" -ForegroundColor Yellow
        Read-Host "按 Enter 继续"
    }
}

# 安装依赖
Write-Host "安装前端依赖..." -ForegroundColor Yellow
npm install

# 构建
Write-Host "构建前端..." -ForegroundColor Yellow
npm run build

Write-Host "前端构建完成，文件在 dist 目录" -ForegroundColor Green
Write-Host "请手动部署 dist 目录内容到 Web 服务器" -ForegroundColor Yellow

Set-Location ..

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  更新完成！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

