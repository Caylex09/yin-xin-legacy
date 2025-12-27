#!/bin/bash
# 简化的 Meilisearch 数据导入脚本（类似 PowerShell 版本）
# 用法: ./import-meilisearch-data-simple.sh

set -e

MEILI_HOST="${MEILI_HOST:-http://127.0.0.1:7700}"
MEILI_API_KEY="${MEILI_API_KEY:-}"

# 构建 curl 认证头（如果有 API Key）
AUTH_HEADER=""
if [ -n "$MEILI_API_KEY" ]; then
    AUTH_HEADER="-H \"Authorization: Bearer $MEILI_API_KEY\""
fi

# 导入 poetry 分片文件
for file in $(ls data/poetry_part_*.ndjson 2>/dev/null | sort -V); do
    echo "Importing $(basename $file)..."
    if [ -n "$MEILI_API_KEY" ]; then
        curl -s -X POST "$MEILI_HOST/indexes/poetry/documents?primaryKey=id" \
            -H "Authorization: Bearer $MEILI_API_KEY" \
            -H "Content-Type: application/x-ndjson" \
            --data-binary "@$file"
    else
        curl -s -X POST "$MEILI_HOST/indexes/poetry/documents?primaryKey=id" \
            -H "Content-Type: application/x-ndjson" \
            --data-binary "@$file"
    fi
done

