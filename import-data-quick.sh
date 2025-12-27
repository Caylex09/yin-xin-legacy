#!/bin/bash
# 快速数据导入脚本（简化版）
# 用法: ./import-data-quick.sh

set -e

PROJECT_DIR="/var/www/yinxin"
DATA_DIR="$PROJECT_DIR/data"
BACKEND_ENV="$PROJECT_DIR/backend/.env"

echo "=========================================="
echo "  快速数据导入"
echo "=========================================="
echo ""

# 读取环境变量
if [ -f "$BACKEND_ENV" ]; then
    export $(grep -v '^#' "$BACKEND_ENV" | grep -E 'MEILI_HOST|MEILI_API_KEY' | xargs)
fi

MEILI_HOST="${MEILI_HOST:-http://127.0.0.1:7700}"
MEILI_API_KEY="${MEILI_API_KEY:-}"

if [ -z "$MEILI_API_KEY" ]; then
    echo "❌ 错误: MEILI_API_KEY 未设置"
    exit 1
fi

echo "🔑 MeiliSearch: $MEILI_HOST"
echo "📁 数据目录: $DATA_DIR"
echo ""

# 检查连接
echo "🔌 测试连接..."
if curl -s "$MEILI_HOST/health" | grep -q "available"; then
    echo "✅ 连接成功"
else
    echo "❌ 连接失败"
    exit 1
fi

echo ""

# 运行导入脚本
cd "$PROJECT_DIR"
MEILI_HOST="$MEILI_HOST" \
MEILI_API_KEY="$MEILI_API_KEY" \
DATA_DIR="$DATA_DIR" \
node import-data-simple.js

echo ""
echo "=========================================="
echo "  导入完成！"
echo "=========================================="

