# 一键启动脚本
# 用于同时启动 Meilisearch、后端和前端服务

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  吟心项目一键启动脚本" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查环境变量文件
Write-Host "检查环境变量配置..." -ForegroundColor Yellow
if (-not (Test-Path "backend\.env")) {
    Write-Host "警告: backend\.env 文件不存在，请先配置环境变量！" -ForegroundColor Red
    Write-Host "可以复制 backend\env.example 为 backend\.env 并修改配置" -ForegroundColor Yellow
    $continue = Read-Host "是否继续启动？(y/n)"
    if ($continue -ne "y" -and $continue -ne "Y") {
        exit 1
    }
}

# 读取后端环境变量配置
$meiliApiKey = ""
$meiliHost = "http://127.0.0.1:7700"
if (Test-Path "backend\.env") {
    $envContent = Get-Content "backend\.env" | Where-Object { $_ -match '^\s*[^#]' }
    foreach ($line in $envContent) {
        if ($line -match '^\s*MEILI_API_KEY\s*=\s*(.+)$') {
            $meiliApiKey = $matches[1].Trim()
        }
        if ($line -match '^\s*MEILI_HOST\s*=\s*(.+)$') {
            $meiliHost = $matches[1].Trim()
        }
    }
}

if (-not (Test-Path "frontend\.env")) {
    Write-Host "警告: frontend\.env 文件不存在，请先配置环境变量！" -ForegroundColor Red
    Write-Host "可以复制 frontend\env.example 为 frontend\.env 并修改配置" -ForegroundColor Yellow
    $continue = Read-Host "是否继续启动？(y/n)"
    if ($continue -ne "y" -and $continue -ne "Y") {
        exit 1
    }
}

# 检查依赖是否已安装
Write-Host "检查依赖..." -ForegroundColor Yellow
if (-not (Test-Path "backend\node_modules")) {
    Write-Host "后端依赖未安装，正在安装..." -ForegroundColor Yellow
    Set-Location backend
    npm install
    Set-Location ..
}

if (-not (Test-Path "frontend\node_modules")) {
    Write-Host "前端依赖未安装，正在安装..." -ForegroundColor Yellow
    Set-Location frontend
    npm install
    Set-Location ..
}

Write-Host ""
Write-Host "正在启动服务..." -ForegroundColor Green
Write-Host ""

# 获取项目根目录的绝对路径
$projectRoot = (Get-Location).Path

# 启动 Meilisearch（新窗口）
Write-Host "启动 Meilisearch..." -ForegroundColor Cyan

# 构建 Meilisearch 启动命令
$meiliArgs = ""
if ($meiliApiKey -and $meiliApiKey -ne "your_master_key_here" -and $meiliApiKey -ne "") {
    $meiliArgs = "--master-key `"$meiliApiKey`""
    Write-Host "  使用配置的 Master Key" -ForegroundColor Gray
} else {
    Write-Host "  警告: 未配置 Master Key，Meilisearch 将以无认证模式运行" -ForegroundColor Yellow
}

# 从 MEILI_HOST 提取端口和地址
$meiliPort = "7700"
$meiliAddr = "127.0.0.1"
if ($meiliHost -match '://([^:]+):(\d+)') {
    $meiliAddr = $matches[1]
    $meiliPort = $matches[2]
    $meiliArgs = "$meiliArgs --http-addr ${meiliAddr}:${meiliPort}".Trim()
}

# 构建完整的启动命令
$meiliCommand = "cd '$projectRoot'; Write-Host 'Meilisearch 服务' -ForegroundColor Cyan; Write-Host '地址: $meiliHost' -ForegroundColor Yellow; Write-Host ''; .\meilisearch.exe $meiliArgs"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $meiliCommand -WindowStyle Normal

# 等待一下，确保 Meilisearch 先启动
Start-Sleep -Seconds 2

# 启动后端服务（新窗口）
Write-Host "启动后端服务..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$projectRoot\backend'; Write-Host '后端服务' -ForegroundColor Cyan; Write-Host '端口: 3000' -ForegroundColor Yellow; Write-Host ''; npm run dev" -WindowStyle Normal

# 等待一下，确保后端先启动
Start-Sleep -Seconds 2

# 启动前端服务（新窗口）
Write-Host "启动前端服务..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$projectRoot\frontend'; Write-Host '前端服务' -ForegroundColor Cyan; Write-Host '端口: 5173' -ForegroundColor Yellow; Write-Host ''; npm run dev" -WindowStyle Normal

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  所有服务已启动！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "服务地址：" -ForegroundColor Yellow
Write-Host "  - 前端: http://localhost:5173" -ForegroundColor White
Write-Host "  - 后端: http://127.0.0.1:3000/api" -ForegroundColor White
Write-Host "  - Meilisearch: $meiliHost" -ForegroundColor White
Write-Host ""
Write-Host "提示: 每个服务都在独立的窗口中运行" -ForegroundColor Gray
Write-Host "      关闭对应的窗口即可停止对应的服务" -ForegroundColor Gray
Write-Host ""

