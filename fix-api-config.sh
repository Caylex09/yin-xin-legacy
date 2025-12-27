#!/bin/bash
# 修复前端 API 配置脚本
# 用法: ./fix-api-config.sh [域名]

set -e

echo "========================================"
echo "  修复前端 API 配置"
echo "========================================"
echo ""

PROJECT_DIR="/var/www/yinxin"
FRONTEND_DIR="$PROJECT_DIR/frontend"
ENV_FILE="$FRONTEND_DIR/.env"

# 获取域名参数
DOMAIN="${1:-yin-xin.fun}"

# 检查前端目录
if [ ! -d "$FRONTEND_DIR" ]; then
    echo "❌ 前端目录不存在: $FRONTEND_DIR"
    exit 1
fi

cd "$FRONTEND_DIR"

echo "📝 配置 API 地址..."
echo "   域名: $DOMAIN"
echo "   API 地址: http://$DOMAIN/api"
echo ""

# 检查 .env 文件
if [ ! -f "$ENV_FILE" ]; then
    if [ -f "env.example" ]; then
        cp env.example .env
        echo "✅ 已从 env.example 创建 .env 文件"
    else
        echo "⚠️  env.example 不存在，创建新的 .env 文件"
        touch .env
    fi
fi

# 更新 VITE_API_BASE
if grep -q "VITE_API_BASE" "$ENV_FILE"; then
    # 如果存在，更新它
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s|VITE_API_BASE=.*|VITE_API_BASE=http://$DOMAIN/api|" "$ENV_FILE"
    else
        # Linux
        sed -i "s|VITE_API_BASE=.*|VITE_API_BASE=http://$DOMAIN/api|" "$ENV_FILE"
    fi
    echo "✅ 已更新 VITE_API_BASE=http://$DOMAIN/api"
else
    # 如果不存在，添加它
    echo "VITE_API_BASE=http://$DOMAIN/api" >> "$ENV_FILE"
    echo "✅ 已添加 VITE_API_BASE=http://$DOMAIN/api"
fi

echo ""
echo "📄 当前 .env 文件内容："
cat "$ENV_FILE"
echo ""

# 检查后端服务
echo "🔌 检查后端服务..."
if command -v pm2 &> /dev/null; then
    if pm2 list | grep -q "yinxin-backend"; then
        echo "✅ 后端服务在 PM2 中运行"
        BACKEND_STATUS=$(pm2 list | grep "yinxin-backend" | awk '{print $10}')
        echo "   状态: $BACKEND_STATUS"
    else
        echo "⚠️  后端服务未在 PM2 中运行"
        echo "   请启动后端: pm2 start backend/dist/index.js --name yinxin-backend"
    fi
else
    echo "ℹ️  PM2 未安装"
fi

# 测试后端 API
echo ""
echo "🧪 测试后端 API..."
if curl -s http://127.0.0.1:3000/api/health > /dev/null 2>&1; then
    echo "✅ 后端 API 可访问 (http://127.0.0.1:3000/api/health)"
    curl -s http://127.0.0.1:3000/api/health | head -1
else
    echo "❌ 后端 API 不可访问"
    echo "   请检查后端服务是否运行"
fi

echo ""
echo "========================================"
echo "  配置完成！"
echo "========================================"
echo ""
echo "📋 下一步："
echo ""
echo "1. 重新构建前端（重要！）："
echo "   cd $FRONTEND_DIR"
echo "   npm run build"
echo ""
echo "2. 或者使用部署脚本："
echo "   cd $PROJECT_DIR"
echo "   ./deploy-frontend.sh http://$DOMAIN/api"
echo ""
echo "3. 验证配置："
echo "   curl http://$DOMAIN/api/health"
echo ""
echo "========================================"

