#!/bin/bash
# 吟心项目快速部署脚本（Linux/Mac）

set -e

echo "========================================"
echo "  吟心项目 Docker Compose 部署脚本"
echo "========================================"
echo ""

# 检查 Docker 和 Docker Compose
if ! command -v docker &> /dev/null; then
    echo "错误: 未安装 Docker，请先安装 Docker"
    exit 1
fi

if ! command -v docker compose &> /dev/null && ! command -v docker-compose &> /dev/null; then
    echo "错误: 未安装 Docker Compose，请先安装 Docker Compose"
    exit 1
fi

# 检查环境变量文件
echo "检查环境变量配置..."
if [ ! -f "backend/.env" ]; then
    echo "警告: backend/.env 文件不存在"
    if [ -f "backend/env.example" ]; then
        echo "正在从 env.example 创建 .env 文件..."
        cp backend/env.example backend/.env
        echo "请编辑 backend/.env 文件并配置必要的环境变量"
        read -p "配置完成后按 Enter 继续..."
    else
        echo "错误: backend/env.example 文件不存在"
        exit 1
    fi
fi

if [ ! -f "frontend/.env" ]; then
    echo "警告: frontend/.env 文件不存在"
    if [ -f "frontend/env.example" ]; then
        echo "正在从 env.example 创建 .env 文件..."
        cp frontend/env.example frontend/.env
        echo "请编辑 frontend/.env 文件并配置 VITE_API_BASE"
        read -p "配置完成后按 Enter 继续..."
    else
        echo "错误: frontend/env.example 文件不存在"
        exit 1
    fi
fi

# 检查根目录 .env 文件
if [ ! -f ".env" ]; then
    echo "创建根目录 .env 文件..."
    cat > .env << EOF
# MeiliSearch 配置
MEILI_API_KEY=your_secure_master_key_here

# JWT 密钥
JWT_SECRET=your_long_random_jwt_secret_here

# SMTP 配置
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_USER=your_qq_email@example.com
SMTP_PASS=your_smtp_auth_code
MAIL_FROM=吟心 <your_qq_email@example.com>

# 前端 API 地址（构建时使用）
VITE_API_BASE=http://localhost:3000/api

# 端口配置（可选）
BACKEND_PORT=3000
FRONTEND_PORT=80
EOF
    echo "请编辑根目录 .env 文件并配置必要的环境变量"
    read -p "配置完成后按 Enter 继续..."
fi

# 构建并启动服务
echo ""
echo "正在构建并启动服务..."
echo ""

docker compose up -d --build

echo ""
echo "========================================"
echo "  部署完成！"
echo "========================================"
echo ""
echo "服务状态："
docker compose ps
echo ""
echo "查看日志："
echo "  docker compose logs -f"
echo ""
echo "停止服务："
echo "  docker compose down"
echo ""

