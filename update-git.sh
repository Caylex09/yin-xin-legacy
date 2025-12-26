#!/bin/bash
# 吟心项目 Git 更新脚本（不使用 Docker）

set -e

echo "========================================"
echo "  吟心项目 Git 更新脚本"
echo "========================================"
echo ""

# 检查是否在项目根目录
if [ ! -f "backend/package.json" ]; then
    echo "错误: 请在项目根目录运行此脚本"
    exit 1
fi

# 备份数据库
if [ -f "backend/data/app.db" ]; then
    echo "备份数据库..."
    mkdir -p backend/data/backups
    cp backend/data/app.db "backend/data/backups/app.db.backup.$(date +%Y%m%d_%H%M%S)"
    echo "数据库已备份"
fi

# 拉取最新代码
echo "拉取最新代码..."
if ! git pull; then
    echo "错误: Git 拉取失败"
    exit 1
fi

# 更新后端
echo ""
echo "更新后端..."
cd backend

# 检查环境变量
if [ ! -f ".env" ]; then
    echo "警告: backend/.env 不存在，从 env.example 创建..."
    if [ -f "env.example" ]; then
        cp env.example .env
        echo "请编辑 backend/.env 并配置必要的环境变量"
        read -p "按 Enter 继续..."
    fi
fi

# 安装依赖
echo "安装后端依赖..."
npm install

# 构建
echo "构建后端..."
npm run build

# 重启服务（使用 PM2）
if command -v pm2 &> /dev/null; then
    echo "重启后端服务（PM2）..."
    pm2 restart yinxin-backend || pm2 start dist/index.js --name yinxin-backend
    pm2 save
else
    echo "警告: PM2 未安装，请手动重启后端服务"
    echo "可以使用: pm2 start dist/index.js --name yinxin-backend"
fi

cd ..

# 更新前端
echo ""
echo "更新前端..."
cd frontend

# 检查环境变量
if [ ! -f ".env" ]; then
    echo "警告: frontend/.env 不存在，从 env.example 创建..."
    if [ -f "env.example" ]; then
        cp env.example .env
        echo "请编辑 frontend/.env 并配置 VITE_API_BASE"
        read -p "按 Enter 继续..."
    fi
fi

# 安装依赖
echo "安装前端依赖..."
npm install

# 构建
echo "构建前端..."
npm run build

# 复制到 Nginx 目录（如果存在）
if [ -d "/var/www/yinxin" ]; then
    echo "复制前端文件到 /var/www/yinxin..."
    sudo cp -r dist/* /var/www/yinxin/
    echo "前端文件已更新"
else
    echo "提示: /var/www/yinxin 不存在，请手动复制 dist 目录内容到 Web 服务器目录"
fi

cd ..

echo ""
echo "========================================"
echo "  更新完成！"
echo "========================================"
echo ""
echo "服务状态："
if command -v pm2 &> /dev/null; then
    pm2 status
fi
echo ""
echo "查看后端日志："
echo "  pm2 logs yinxin-backend"
echo ""
echo "测试 API："
echo "  curl http://localhost:3000/api/health"
echo ""

