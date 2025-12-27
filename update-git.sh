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

# 检查构建结果
if [ ! -d "dist" ] || [ ! -f "dist/index.html" ]; then
    echo "错误: 前端构建失败，dist 目录不存在或为空"
    exit 1
fi

echo "✅ 前端构建完成"
echo "   构建目录: $(pwd)/dist"
echo ""

# 注意：Nginx 配置的 root 目录应该指向 frontend/dist
# 如果 Nginx 配置正确，不需要复制文件，因为构建就在正确的位置
# 如果需要复制到其他位置，可以取消下面的注释并修改路径

# 检查 Nginx 配置的 root 目录
NGINX_ROOT="/var/www/yinxin/frontend/dist"
if [ -d "$NGINX_ROOT" ]; then
    # 如果 Nginx root 目录存在且不同，则复制
    CURRENT_DIST="$(pwd)/dist"
    if [ "$CURRENT_DIST" != "$NGINX_ROOT" ]; then
        echo "复制前端文件到 Nginx 目录: $NGINX_ROOT"
        sudo rm -rf "$NGINX_ROOT"/*
        sudo cp -r dist/* "$NGINX_ROOT/"
        sudo chown -R www-data:www-data "$NGINX_ROOT" 2>/dev/null || true
        echo "✅ 前端文件已更新到 Nginx 目录"
    else
        echo "ℹ️  构建目录与 Nginx root 目录相同，无需复制"
    fi
else
    echo "⚠️  Nginx root 目录不存在: $NGINX_ROOT"
    echo "   请检查 Nginx 配置，确保 root 指向正确的目录"
    echo "   当前构建目录: $(pwd)/dist"
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

