#!/bin/bash
# MeiliSearch 数据导入脚本（简化版，适用于本地开发）
# 用法: ./import-meilisearch-data.sh

set -e

echo "========================================"
echo "  MeiliSearch 数据导入脚本"
echo "========================================"
echo ""

# 从 backend/.env 读取配置（如果存在）
if [ -f "backend/.env" ]; then
    export $(grep -v '^#' backend/.env | grep -E 'MEILI_HOST|MEILI_API_KEY' | xargs)
fi

# 配置
MEILI_HOST="${MEILI_HOST:-http://127.0.0.1:7700}"
MEILI_API_KEY="${MEILI_API_KEY:-}"

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

# 创建索引（如果不存在）
echo "🔧 创建索引（如果不存在）..."

# 创建 poets 索引
if [ -n "$MEILI_API_KEY" ]; then
    curl -s -X POST "$MEILI_HOST/indexes" \
        -H "Authorization: Bearer $MEILI_API_KEY" \
        -H "Content-Type: application/json" \
        -d '{"uid": "poets", "primaryKey": "id"}' > /dev/null || true
else
    curl -s -X POST "$MEILI_HOST/indexes" \
        -H "Content-Type: application/json" \
        -d '{"uid": "poets", "primaryKey": "id"}' > /dev/null || true
fi

# 创建 poetry 索引
if [ -n "$MEILI_API_KEY" ]; then
    curl -s -X POST "$MEILI_HOST/indexes" \
        -H "Authorization: Bearer $MEILI_API_KEY" \
        -H "Content-Type: application/json" \
        -d '{"uid": "poetry", "primaryKey": "id"}' > /dev/null || true
else
    curl -s -X POST "$MEILI_HOST/indexes" \
        -H "Content-Type: application/json" \
        -d '{"uid": "poetry", "primaryKey": "id"}' > /dev/null || true
fi

echo "✅ 索引创建完成"
echo ""

# 导入 poets 索引
echo "📦 导入 poets 索引..."
if [ -f "data/poets.ndjson" ]; then
    echo "   导入文件: poets.ndjson"
    if [ -n "$MEILI_API_KEY" ]; then
        response=$(curl -s -w "\n%{http_code}" -X POST "$MEILI_HOST/indexes/poets/documents?primaryKey=id" \
            -H "Authorization: Bearer $MEILI_API_KEY" \
            -H "Content-Type: application/x-ndjson" \
            --data-binary "@data/poets.ndjson")
        http_code=$(echo "$response" | tail -n1)
        body=$(echo "$response" | sed '$d')
        if [ "$http_code" = "202" ] || [ "$http_code" = "200" ]; then
            echo "   ✅ poets 导入请求已提交 (HTTP $http_code)"
        else
            echo "   ❌ poets 导入失败 (HTTP $http_code)"
            echo "   错误: $body"
        fi
    else
        response=$(curl -s -w "\n%{http_code}" -X POST "$MEILI_HOST/indexes/poets/documents?primaryKey=id" \
            -H "Content-Type: application/x-ndjson" \
            --data-binary "@data/poets.ndjson")
        http_code=$(echo "$response" | tail -n1)
        body=$(echo "$response" | sed '$d')
        if [ "$http_code" = "202" ] || [ "$http_code" = "200" ]; then
            echo "   ✅ poets 导入请求已提交 (HTTP $http_code)"
        else
            echo "   ❌ poets 导入失败 (HTTP $http_code)"
            echo "   错误: $body"
        fi
    fi
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
            response=$(curl -s -w "\n%{http_code}" -X POST "$MEILI_HOST/indexes/poetry/documents?primaryKey=id" \
                -H "Authorization: Bearer $MEILI_API_KEY" \
                -H "Content-Type: application/x-ndjson" \
                --data-binary "@$file")
            http_code=$(echo "$response" | tail -n1)
            if [ "$http_code" = "202" ] || [ "$http_code" = "200" ]; then
                echo "      ✅ 成功 (HTTP $http_code)"
            else
                body=$(echo "$response" | sed '$d')
                echo "      ❌ 失败 (HTTP $http_code): $body"
            fi
        else
            response=$(curl -s -w "\n%{http_code}" -X POST "$MEILI_HOST/indexes/poetry/documents?primaryKey=id" \
                -H "Content-Type: application/x-ndjson" \
                --data-binary "@$file")
            http_code=$(echo "$response" | tail -n1)
            if [ "$http_code" = "202" ] || [ "$http_code" = "200" ]; then
                echo "      ✅ 成功 (HTTP $http_code)"
            else
                body=$(echo "$response" | sed '$d')
                echo "      ❌ 失败 (HTTP $http_code): $body"
            fi
        fi
    done
elif [ -f "data/poetry.ndjson" ]; then
    # 使用单文件
    echo "   检测到单文件格式 (poetry.ndjson)"
    echo "   导入: poetry.ndjson"
    if [ -n "$MEILI_API_KEY" ]; then
        response=$(curl -s -w "\n%{http_code}" -X POST "$MEILI_HOST/indexes/poetry/documents?primaryKey=id" \
            -H "Authorization: Bearer $MEILI_API_KEY" \
            -H "Content-Type: application/x-ndjson" \
            --data-binary "@data/poetry.ndjson")
        http_code=$(echo "$response" | tail -n1)
        if [ "$http_code" != "202" ] && [ "$http_code" != "200" ]; then
            body=$(echo "$response" | sed '$d')
            echo "   ❌ 导入失败 (HTTP $http_code): $body"
        fi
    else
        response=$(curl -s -w "\n%{http_code}" -X POST "$MEILI_HOST/indexes/poetry/documents?primaryKey=id" \
            -H "Content-Type: application/x-ndjson" \
            --data-binary "@data/poetry.ndjson")
        http_code=$(echo "$response" | tail -n1)
        if [ "$http_code" != "202" ] && [ "$http_code" != "200" ]; then
            body=$(echo "$response" | sed '$d')
            echo "   ❌ 导入失败 (HTTP $http_code): $body"
        fi
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
echo "⏳ 等待索引任务完成（这可能需要几分钟）..."
sleep 5

# 检查索引统计
echo ""
echo "📊 检查索引统计..."
if [ -n "$MEILI_API_KEY" ]; then
    poetry_stats=$(curl -s "$MEILI_HOST/indexes/poetry/stats" \
        -H "Authorization: Bearer $MEILI_API_KEY")
    poets_stats=$(curl -s "$MEILI_HOST/indexes/poets/stats" \
        -H "Authorization: Bearer $MEILI_API_KEY")
else
    poetry_stats=$(curl -s "$MEILI_HOST/indexes/poetry/stats")
    poets_stats=$(curl -s "$MEILI_HOST/indexes/poets/stats")
fi

if command -v jq &> /dev/null; then
    poetry_count=$(echo "$poetry_stats" | jq -r '.numberOfDocuments // 0')
    poets_count=$(echo "$poets_stats" | jq -r '.numberOfDocuments // 0')
    echo "   poetry: $poetry_count 条文档"
    echo "   poets: $poets_count 条文档"
else
    echo "   poetry 索引: $poetry_stats"
    echo "   poets 索引: $poets_stats"
fi

echo ""
echo "========================================"
echo "  导入完成！"
echo "========================================"
echo ""
