#!/bin/bash
# 服务器初始化部署脚本
# 用法: ./setup-server.sh [部署路径]

set -e

# 默认部署路径
DEFAULT_PATH="/opt/yinxin"
DEPLOY_PATH="${1:-$DEFAULT_PATH}"

echo "========================================"
echo "  吟心项目服务器部署脚本"
echo "========================================"
echo ""
echo "部署路径: $DEPLOY_PATH"
echo ""

# 检查是否为 root 用户
if [ "$EUID" -eq 0 ]; then
    echo "⚠️  检测到 root 用户，建议使用普通用户运行此脚本"
    echo "   脚本会自动处理权限问题"
    echo ""
fi

# 检查 Git 是否安装
if ! command -v git &> /dev/null; then
    echo "❌ 错误: 未安装 Git"
    echo "   请先安装: sudo apt-get install git (Ubuntu/Debian)"
    echo "   或: sudo yum install git (CentOS/RHEL)"
    exit 1
fi

# 检查 Node.js 是否安装
if ! command -v node &> /dev/null; then
    echo "⚠️  警告: 未检测到 Node.js"
    echo "   请安装 Node.js 20+: https://nodejs.org/"
    echo ""
fi

# 创建部署目录
echo "📁 创建部署目录..."
if [ ! -d "$DEPLOY_PATH" ]; then
    if [ "$EUID" -eq 0 ]; then
        mkdir -p "$DEPLOY_PATH"
        # 如果使用 root，尝试获取当前用户
        if [ -n "$SUDO_USER" ]; then
            chown -R "$SUDO_USER:$SUDO_USER" "$DEPLOY_PATH"
        fi
    else
        # 普通用户尝试创建，如果失败则提示
        mkdir -p "$DEPLOY_PATH" 2>/dev/null || {
            echo "❌ 无法创建目录 $DEPLOY_PATH"
            echo "   请使用 sudo 运行，或选择用户目录（如 ~/yinxin）"
            exit 1
        }
    fi
    echo "✅ 目录已创建: $DEPLOY_PATH"
else
    echo "ℹ️  目录已存在: $DEPLOY_PATH"
fi

# 检查目录是否为空
if [ "$(ls -A $DEPLOY_PATH 2>/dev/null)" ]; then
    echo "⚠️  警告: 目录不为空"
    read -p "是否继续？(y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo ""
echo "========================================"
echo "  下一步操作"
echo "========================================"
echo ""
echo "1. 克隆项目到服务器:"
echo "   cd $(dirname $DEPLOY_PATH)"
echo "   git clone <your-repo-url> $(basename $DEPLOY_PATH)"
echo ""
echo "2. 或者如果项目已在服务器上，移动到部署目录:"
echo "   mv /path/to/yinxin/* $DEPLOY_PATH/"
echo ""
echo "3. 进入项目目录:"
echo "   cd $DEPLOY_PATH"
echo ""
echo "4. 配置环境变量:"
echo "   cp backend/env.example backend/.env"
echo "   cp frontend/env.example frontend/.env"
echo "   # 编辑 .env 文件配置"
echo ""
echo "5. 安装依赖并启动:"
echo "   # 后端"
echo "   cd backend && npm install && npm run build"
echo "   # 前端"
echo "   cd ../frontend && npm install && npm run build"
echo ""
echo "6. 启动服务:"
echo "   # 使用 PM2 管理后端"
echo "   pm2 start backend/dist/index.js --name yinxin-backend"
echo "   # 配置 Nginx 服务前端"
echo ""
echo "========================================"
echo "  推荐目录说明"
echo "========================================"
echo ""
echo "生产环境推荐:"
echo "  /opt/yinxin        - 第三方应用标准位置（推荐）"
echo "  /srv/yinxin        - 服务数据目录"
echo "  /var/www/yinxin    - 传统 Web 应用位置"
echo ""
echo "开发/测试环境:"
echo "  ~/yinxin           - 用户主目录"
echo "  ~/projects/yinxin  - 项目目录"
echo ""
echo "========================================"

