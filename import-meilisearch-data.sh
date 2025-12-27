#!/bin/bash
# MeiliSearch 数据导入脚本（简化版，适用于本地开发）
# 用法: ./import-meilisearch-data.sh

set -e

echo "========================================"
echo "  MeiliSearch 数据导入脚本"
echo "========================================"
echo ""

# 配置
MEILI_HOST="${MEILI_HOST:-http://127.0.0.1:7700}"
MEILI_API_KEY="${MEILI_API_KEY:-}"

# 如果有 API Key，添加到 curl 命令
CURL_AUTH=""
if [ -n "$MEILI_API_KEY" ]; then
    CURL_AUTH="-H \"Authorization: Bearer $MEILI_API_KEY\""
fi

echo "📋 配置信息："
echo "   MeiliSearch 地址: $MEILI_HOST"
if [ -n "$MEILI_API_KEY" ]; then
    echo "   API Key: ${MEILI_API_KEY:0:10}..."
else
    echo "   API Key: 未设置（无认证模式）"
fi
echo ""

# 检查 MeiliSearch 连接
echo "🔌 检查 MeiliSearch 连接..."
if curl -s "$MEILI_HOST/health" | grep -q "available"; then
    echo "✅ MeiliSearch 连接正常"
else
    echo "❌ MeiliSearch 连接失败，请确保服务已启动"
    exit 1
fi
echo ""

# 导入 poets 索引
echo "📦 导入 poets 索引..."
if [ -f "data/poets.ndjson" ]; then
    echo "   导入文件: poets.ndjson"
    if [ -n "$MEILI_API_KEY" ]; then
        curl -s -X POST "$MEILI_HOST/indexes/poets/documents?primaryKey=id" \
            -H "Authorization: Bearer $MEILI_API_KEY" \
            -H "Content-Type: application/x-ndjson" \
            --data-binary "@data/poets.ndjson" > /dev/null
    else
        curl -s -X POST "$MEILI_HOST/indexes/poets/documents?primaryKey=id" \
            -H "Content-Type: application/x-ndjson" \
            --data-binary "@data/poets.ndjson" > /dev/null
    fi
    echo "   ✅ poets 导入完成"
else
    echo "   ⚠️  poets.ndjson 不存在，跳过"
fi
echo ""

# 导入 poetry 索引
echo "📦 导入 poetry 索引..."

# 查找分片文件
POETRY_FILES=(data/poetry_part_*.ndjson)
if [ -f "${POETRY_FILES[0]}" ]; then
    # 使用分片文件
    echo "   检测到分片格式 (poetry_part_*.ndjson)"
    count=0
    for file in data/poetry_part_*.ndjson; do
        if [ -f "$file" ]; then
            count=$((count + 1))
        fi
    done
    echo "   找到 $count 个分片文件"
    
    # 按文件名排序并导入
    for file in $(ls data/poetry_part_*.ndjson | sort -V); do
        filename=$(basename "$file")
        echo "   导入: $filename"
        if [ -n "$MEILI_API_KEY" ]; then
            curl -s -X POST "$MEILI_HOST/indexes/poetry/documents?primaryKey=id" \
                -H "Authorization: Bearer $MEILI_API_KEY" \
                -H "Content-Type: application/x-ndjson" \
                --data-binary "@$file" > /dev/null
        else
            curl -s -X POST "$MEILI_HOST/indexes/poetry/documents?primaryKey=id" \
                -H "Content-Type: application/x-ndjson" \
                --data-binary "@$file" > /dev/null
        fi
    done
elif [ -f "data/poetry.ndjson" ]; then
    # 使用单文件
    echo "   检测到单文件格式 (poetry.ndjson)"
    echo "   导入: poetry.ndjson"
    if [ -n "$MEILI_API_KEY" ]; then
        curl -s -X POST "$MEILI_HOST/indexes/poetry/documents?primaryKey=id" \
            -H "Authorization: Bearer $MEILI_API_KEY" \
            -H "Content-Type: application/x-ndjson" \
            --data-binary "@data/poetry.ndjson" > /dev/null
    else
        curl -s -X POST "$MEILI_HOST/indexes/poetry/documents?primaryKey=id" \
            -H "Content-Type: application/x-ndjson" \
            --data-binary "@data/poetry.ndjson" > /dev/null
    fi
else
    echo "   ❌ 未找到 poetry 数据文件"
    echo "   期望: poetry_part_*.ndjson 或 poetry.ndjson"
    exit 1
fi

echo "   ✅ poetry 导入完成"
echo ""

# 配置索引设置
echo "🔧 配置索引设置..."

# 配置 poetry 索引
if [ -f "poetry_settings.json" ]; then
    echo "   配置 poetry 索引..."
    if [ -n "$MEILI_API_KEY" ]; then
        curl -s -X PATCH "$MEILI_HOST/indexes/poetry/settings" \
            -H "Authorization: Bearer $MEILI_API_KEY" \
            -H "Content-Type: application/json" \
            --data-binary "@poetry_settings.json" > /dev/null
    else
        curl -s -X PATCH "$MEILI_HOST/indexes/poetry/settings" \
            -H "Content-Type: application/json" \
            --data-binary "@poetry_settings.json" > /dev/null
    fi
    echo "   ✅ poetry 索引设置完成"
fi

# 配置 poets 索引
if [ -f "poets_settings.json" ]; then
    echo "   配置 poets 索引..."
    if [ -n "$MEILI_API_KEY" ]; then
        curl -s -X PATCH "$MEILI_HOST/indexes/poets/settings" \
            -H "Authorization: Bearer $MEILI_API_KEY" \
            -H "Content-Type: application/json" \
            --data-binary "@poets_settings.json" > /dev/null
    else
        curl -s -X PATCH "$MEILI_HOST/indexes/poets/settings" \
            -H "Content-Type: application/json" \
            --data-binary "@poets_settings.json" > /dev/null
    fi
    echo "   ✅ poets 索引设置完成"
fi

echo ""
echo "========================================"
echo "  导入完成！"
echo "========================================"
echo ""
