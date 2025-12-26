# 代码更新和同步指南

本文档说明如何在更新代码后同步到服务器。

## 更新流程概览

```
本地开发 → Git 提交 → 服务器拉取 → 重新构建 → 重启服务
```

## 方式一：使用 Docker Compose（推荐）

### 1. 本地提交代码

```bash
# 在本地项目目录
git add .
git commit -m "更新说明"
git push origin main  # 或你的分支名
```

### 2. 在服务器上更新

#### 方法 A：使用更新脚本（推荐）

```bash
# 在服务器项目目录
./update.sh
```

#### 方法 B：手动更新

```bash
# 1. 进入项目目录
cd /path/to/yinxin

# 2. 拉取最新代码
git pull origin main  # 或你的分支名

# 3. 检查环境变量（如有新增）
# 对比 backend/env.example 和 backend/.env
# 对比 frontend/env.example 和 frontend/.env

# 4. 重新构建并重启服务
docker compose up -d --build

# 5. 查看日志确认服务正常
docker compose logs -f
```

### 3. 验证更新

```bash
# 检查服务状态
docker compose ps

# 查看服务日志
docker compose logs -f backend
docker compose logs -f frontend

# 测试 API
curl http://localhost:3000/api/health
```

## 方式二：使用 Git 更新（不使用 Docker）

详细的 Git 更新指南请参考 [GIT_DEPLOY.md](./GIT_DEPLOY.md) 文档。

### 快速更新（使用脚本）

```bash
# 在服务器项目目录
./update-git.sh  # Linux/Mac
# 或
.\update-git.ps1  # Windows
```

### 快速更新（手动命令）

```bash
git pull
cd backend && npm install && npm run build && pm2 restart yinxin-backend
cd ../frontend && npm install && npm run build && sudo cp -r dist/* /var/www/html/
```

## 方式三：手动部署更新

### 1. 更新后端

```bash
cd backend

# 拉取代码
git pull

# 安装新依赖（如果有）
npm install

# 重新构建
npm run build

# 重启服务（使用 PM2）
pm2 restart yinxin-backend

# 或使用 systemd
sudo systemctl restart yinxin-backend
```

### 2. 更新前端

```bash
cd frontend

# 拉取代码
git pull

# 检查环境变量
# 对比 env.example 和 .env

# 安装新依赖（如果有）
npm install

# 重新构建
npm run build

# 复制到 Nginx 目录
sudo cp -r dist/* /var/www/html/

# 重启 Nginx（如果需要）
sudo systemctl reload nginx
```

### 3. 更新 MeiliSearch（如需要）

```bash
# 如果 MeiliSearch 版本更新，需要：
# 1. 停止服务
sudo systemctl stop meilisearch

# 2. 备份数据
# 参考 DEPLOY.md 中的数据迁移部分

# 3. 更新 MeiliSearch
# 下载新版本并替换

# 4. 启动服务
sudo systemctl start meilisearch
```

## 自动化更新脚本

### Linux/Mac 更新脚本

创建 `update.sh`：

```bash
#!/bin/bash
# 吟心项目更新脚本

set -e

echo "========================================"
echo "  吟心项目更新脚本"
echo "========================================"
echo ""

# 检查是否在项目根目录
if [ ! -f "docker-compose.yml" ]; then
    echo "错误: 请在项目根目录运行此脚本"
    exit 1
fi

# 备份数据库（可选）
if [ -f "backend/data/app.db" ]; then
    echo "备份数据库..."
    cp backend/data/app.db "backend/data/app.db.backup.$(date +%Y%m%d_%H%M%S)"
fi

# 拉取最新代码
echo "拉取最新代码..."
git pull

# 检查环境变量文件
echo "检查环境变量..."
if [ ! -f "backend/.env" ]; then
    echo "警告: backend/.env 不存在，从 env.example 创建..."
    cp backend/env.example backend/.env
    echo "请编辑 backend/.env 并配置必要的环境变量"
    read -p "按 Enter 继续..."
fi

if [ ! -f "frontend/.env" ]; then
    echo "警告: frontend/.env 不存在，从 env.example 创建..."
    cp frontend/env.example frontend/.env
    echo "请编辑 frontend/.env 并配置 VITE_API_BASE"
    read -p "按 Enter 继续..."
fi

# 重新构建并重启服务
echo "重新构建并重启服务..."
docker compose up -d --build

# 等待服务启动
echo "等待服务启动..."
sleep 5

# 检查服务状态
echo ""
echo "服务状态："
docker compose ps

echo ""
echo "========================================"
echo "  更新完成！"
echo "========================================"
echo ""
echo "查看日志："
echo "  docker compose logs -f"
echo ""
```

### Windows 更新脚本

创建 `update.ps1`：

```powershell
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
}

# 拉取最新代码
Write-Host "拉取最新代码..." -ForegroundColor Yellow
git pull

# 检查环境变量文件
Write-Host "检查环境变量..." -ForegroundColor Yellow
if (-not (Test-Path "backend\.env")) {
    Write-Host "警告: backend\.env 不存在，从 env.example 创建..." -ForegroundColor Yellow
    Copy-Item "backend\env.example" "backend\.env"
    Write-Host "请编辑 backend\.env 并配置必要的环境变量" -ForegroundColor Yellow
    Read-Host "按 Enter 继续"
}

if (-not (Test-Path "frontend\.env")) {
    Write-Host "警告: frontend\.env 不存在，从 env.example 创建..." -ForegroundColor Yellow
    Copy-Item "frontend\env.example" "frontend\.env"
    Write-Host "请编辑 frontend\.env 并配置 VITE_API_BASE" -ForegroundColor Yellow
    Read-Host "按 Enter 继续"
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
```

## 使用 Git Hooks 自动化（高级）

### 服务器端 Git Hook

在服务器上设置 Git Hook，实现自动部署：

```bash
# 在服务器项目目录
cd /path/to/yinxin
cd .git/hooks

# 创建 post-receive hook
cat > post-receive << 'EOF'
#!/bin/bash
cd /path/to/yinxin
git pull
docker compose up -d --build
EOF

chmod +x post-receive
```

然后在本地配置 Git remote：

```bash
# 添加服务器作为 remote
git remote add production user@server:/path/to/yinxin.git

# 推送时自动部署
git push production main
```

## 零停机更新（高级）

### 使用 Docker Compose 的滚动更新

```bash
# 1. 先更新一个服务
docker compose up -d --build --no-deps frontend

# 2. 等待前端更新完成
sleep 10

# 3. 更新后端
docker compose up -d --build --no-deps backend

# 4. 最后更新 MeiliSearch（如果需要）
docker compose up -d --no-deps meilisearch
```

### 使用蓝绿部署

1. 运行两套环境（蓝色和绿色）
2. 更新绿色环境
3. 切换流量到绿色环境
4. 验证无误后关闭蓝色环境

## 回滚操作

### Docker Compose 回滚

```bash
# 1. 回滚到之前的 Git 提交
git checkout <previous-commit-hash>

# 2. 重新构建
docker compose up -d --build

# 或使用 Git 标签
git checkout v1.0.0
docker compose up -d --build
```

### 数据库回滚

```bash
# 恢复数据库备份
cp backend/data/app.db.backup.20250101_120000 backend/data/app.db

# 重启后端服务
docker compose restart backend
```

## 更新检查清单

更新前：
- [ ] 备份数据库
- [ ] 检查是否有数据库迁移
- [ ] 检查是否有新的环境变量
- [ ] 检查依赖是否有重大更新

更新中：
- [ ] 拉取最新代码
- [ ] 更新环境变量（如有新增）
- [ ] 重新构建镜像
- [ ] 重启服务

更新后：
- [ ] 检查服务状态
- [ ] 查看日志确认无错误
- [ ] 测试主要功能
- [ ] 监控资源使用情况

## 常见问题

### Q: 更新后服务无法启动怎么办？
A: 
1. 查看日志：`docker compose logs`
2. 检查环境变量是否正确
3. 检查端口是否被占用
4. 回滚到之前的版本

### Q: 更新时数据库会丢失吗？
A: 不会。数据库文件通过 volume 挂载，更新不会影响数据。但建议更新前备份。

### Q: 如何只更新前端或后端？
A: 使用 `--no-deps` 参数：
```bash
docker compose up -d --build --no-deps frontend
```

### Q: 更新需要多长时间？
A: 通常 2-5 分钟，取决于：
- 代码变更量
- 网络速度（拉取代码）
- 构建时间
- 服务器性能

## 最佳实践

1. **使用版本标签**：为重要版本打 Git 标签
2. **定期备份**：更新前备份数据库
3. **测试环境**：先在测试环境验证更新
4. **监控日志**：更新后持续监控日志
5. **渐进式更新**：先更新一个服务，验证后再更新其他服务
6. **文档记录**：记录每次更新的内容和遇到的问题

