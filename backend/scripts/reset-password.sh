#!/bin/bash
# 重置用户密码脚本
# 用法: ./scripts/reset-password.sh <username> <new-password>

if [ $# -lt 2 ]; then
    echo "❌ 错误: 参数不足"
    echo ""
    echo "用法:"
    echo "  ./scripts/reset-password.sh <username> <new-password>"
    echo ""
    echo "示例:"
    echo "  ./scripts/reset-password.sh cyx newpassword123"
    exit 1
fi

USERNAME=$1
NEW_PASSWORD=$2

# 进入 backend 目录
cd "$(dirname "$0")/.." || exit 1

# 使用 tsx 直接运行 TypeScript 文件
npx tsx scripts/reset-password.ts "$USERNAME" "$NEW_PASSWORD"

