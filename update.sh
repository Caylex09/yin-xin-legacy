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
    echo "数据库已备份"
fi

# 拉取最新代码
echo "拉取最新代码..."
if ! git pull; then
    echo "警告: Git 拉取失败，继续使用当前代码..."
fi

# 检查环境变量文件
echo "检查环境变量..."
if [ ! -f "backend/.env" ]; then
    echo "警告: backend/.env 不存在，从 env.example 创建..."
    if [ -f "backend/env.example" ]; then
        cp backend/env.example backend/.env
        echo "请编辑 backend/.env 并配置必要的环境变量"
        read -p "按 Enter 继续..."
    fi
fi

if [ ! -f "frontend/.env" ]; then
    echo "警告: frontend/.env 不存在，从 env.example 创建..."
    if [ -f "frontend/env.example" ]; then
        cp frontend/env.example frontend/.env
        echo "请编辑 frontend/.env 并配置 VITE_API_BASE"
        read -p "按 Enter 继续..."
    fi
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
echo "查看特定服务日志："
echo "  docker compose logs -f backend"
echo "  docker compose logs -f frontend"
echo "  docker compose logs -f meilisearch"
echo ""

