#!/bin/bash
# 前端部署脚本
# 用法: ./deploy-frontend.sh [API地址]

set -e

echo "========================================"
echo "  前端部署脚本"
echo "========================================"
echo ""

# 获取项目根目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"
FRONTEND_DIR="$PROJECT_DIR/frontend"

# 检查前端目录
if [ ! -d "$FRONTEND_DIR" ]; then
    echo "❌ 前端目录不存在: $FRONTEND_DIR"
    exit 1
fi

cd "$FRONTEND_DIR"

# 获取 API 地址（从参数或环境变量）
API_BASE="${1:-${VITE_API_BASE}}"
if [ -z "$API_BASE" ]; then
    # 默认值
    API_BASE="http://localhost:3000/api"
    echo "ℹ️  未指定 API 地址，使用默认值: $API_BASE"
    echo "   可以通过参数指定: ./deploy-frontend.sh http://your-domain.com/api"
fi

echo "配置 API 地址: $API_BASE"
echo ""

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 未安装 Node.js"
    echo "   请先安装 Node.js 20+: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v)
echo "✅ Node.js 版本: $NODE_VERSION"
echo ""

# 配置环境变量
echo "📝 配置环境变量..."
if [ ! -f ".env" ]; then
    if [ -f "env.example" ]; then
        cp env.example .env
        echo "✅ 已从 env.example 创建 .env 文件"
    else
        echo "⚠️  env.example 不存在，创建新的 .env 文件"
        touch .env
    fi
fi

# 更新 .env 文件中的 VITE_API_BASE
if grep -q "VITE_API_BASE" .env; then
    # 如果存在，更新它
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s|VITE_API_BASE=.*|VITE_API_BASE=$API_BASE|" .env
    else
        # Linux
        sed -i "s|VITE_API_BASE=.*|VITE_API_BASE=$API_BASE|" .env
    fi
    echo "✅ 已更新 VITE_API_BASE=$API_BASE"
else
    # 如果不存在，添加它
    echo "VITE_API_BASE=$API_BASE" >> .env
    echo "✅ 已添加 VITE_API_BASE=$API_BASE"
fi

echo ""

# 安装依赖
echo "📦 安装依赖..."
if [ ! -d "node_modules" ]; then
    npm install
    echo "✅ 依赖已安装"
else
    echo "ℹ️  node_modules 已存在，跳过安装"
    echo "   如需重新安装，请删除 node_modules 目录"
fi

echo ""

# 构建前端
echo "🔨 构建前端..."
npm run build

if [ ! -d "dist" ]; then
    echo "❌ 构建失败，dist 目录不存在"
    exit 1
fi

echo "✅ 前端构建完成"
echo "   构建目录: $FRONTEND_DIR/dist"
echo ""

# 显示构建结果
BUILD_SIZE=$(du -sh dist | cut -f1)
echo "📊 构建大小: $BUILD_SIZE"
echo ""

echo "========================================"
echo "  构建完成！"
echo "========================================"
echo ""
echo "📋 下一步："
echo "   1. 配置 Nginx（如果还没有）:"
echo "      sudo ./setup-nginx.sh your-domain.com"
echo ""
echo "   2. 或者手动复制到 Web 目录:"
echo "      sudo cp -r dist/* /var/www/html/"
echo ""
echo "   3. 确保后端服务正在运行:"
echo "      pm2 status"
echo ""
echo "========================================"

