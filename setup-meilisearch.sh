#!/bin/bash
# MeiliSearch 安装和配置脚本
# 用法: ./setup-meilisearch.sh [master-key]

set -e

echo "========================================"
echo "  MeiliSearch 安装和配置脚本"
echo "========================================"
echo ""

# 检查是否为 root 用户
if [ "$EUID" -ne 0 ]; then
    echo "⚠️  此脚本需要 root 权限来安装系统服务"
    echo "   请使用: sudo ./setup-meilisearch.sh"
    exit 1
fi

# 获取 master key（从参数或环境变量）
MASTER_KEY="${1:-${MEILI_MASTER_KEY}}"
if [ -z "$MASTER_KEY" ]; then
    # 生成随机 master key
    MASTER_KEY=$(openssl rand -hex 32)
    echo "ℹ️  未提供 master key，已自动生成随机密钥"
    echo "   请保存此密钥: $MASTER_KEY"
    echo ""
fi

# 检测系统类型
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
else
    echo "❌ 无法检测操作系统类型"
    exit 1
fi

echo "检测到操作系统: $OS"
echo ""

# 安装 MeiliSearch
echo "📦 安装 MeiliSearch..."
if command -v meilisearch &> /dev/null; then
    echo "✅ MeiliSearch 已安装"
    MEILISEARCH_PATH=$(which meilisearch)
else
    echo "正在下载 MeiliSearch..."
    curl -L https://install.meilisearch.com | sh
    
    if [ -f "./meilisearch" ]; then
        MEILISEARCH_PATH="$(pwd)/meilisearch"
        # 移动到系统路径
        sudo mv ./meilisearch /usr/local/bin/meilisearch
        sudo chmod +x /usr/local/bin/meilisearch
        MEILISEARCH_PATH="/usr/local/bin/meilisearch"
        echo "✅ MeiliSearch 已安装到 $MEILISEARCH_PATH"
    else
        echo "❌ MeiliSearch 安装失败"
        exit 1
    fi
fi

echo ""

# 创建数据目录
DATA_DIR="/var/lib/meilisearch"
echo "📁 创建数据目录: $DATA_DIR"
mkdir -p "$DATA_DIR"
chown -R $SUDO_USER:$SUDO_USER "$DATA_DIR" 2>/dev/null || true
echo "✅ 数据目录已创建"
echo ""

# 创建 systemd 服务
echo "🔧 配置 systemd 服务..."
SERVICE_FILE="/etc/systemd/system/meilisearch.service"

# 获取当前用户（如果通过 sudo 运行）
SERVICE_USER=${SUDO_USER:-$USER}
if [ -z "$SERVICE_USER" ] || [ "$SERVICE_USER" = "root" ]; then
    SERVICE_USER="ubuntu"
fi

cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=MeiliSearch
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$DATA_DIR
ExecStart=$MEILISEARCH_PATH \\
    --http-addr 127.0.0.1:7700 \\
    --master-key $MASTER_KEY \\
    --env production \\
    --db-path $DATA_DIR
Restart=always
RestartSec=3
StandardOutput=journal
StandardError=journal

# 安全设置
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

echo "✅ systemd 服务文件已创建: $SERVICE_FILE"
echo ""

# 重新加载 systemd
echo "🔄 重新加载 systemd..."
systemctl daemon-reload
echo "✅ systemd 已重新加载"
echo ""

# 启动并启用服务
echo "🚀 启动 MeiliSearch 服务..."
systemctl enable meilisearch
systemctl start meilisearch

# 等待服务启动
sleep 2

# 检查服务状态
if systemctl is-active --quiet meilisearch; then
    echo "✅ MeiliSearch 服务已启动"
else
    echo "❌ MeiliSearch 服务启动失败"
    echo "   查看日志: sudo journalctl -u meilisearch -n 50"
    exit 1
fi

echo ""

# 测试连接
echo "🧪 测试 MeiliSearch 连接..."
sleep 1
if curl -s -H "Authorization: Bearer $MASTER_KEY" http://127.0.0.1:7700/health > /dev/null; then
    echo "✅ MeiliSearch 连接成功"
else
    echo "⚠️  MeiliSearch 连接测试失败，但服务可能正在启动中"
    echo "   请稍后手动测试: curl http://127.0.0.1:7700/health"
fi

echo ""
echo "========================================"
echo "  安装完成！"
echo "========================================"
echo ""
echo "📋 重要信息："
echo "   Master Key: $MASTER_KEY"
echo "   数据目录: $DATA_DIR"
echo "   服务端口: 127.0.0.1:7700"
echo ""
echo "📝 请将此 Master Key 配置到后端 .env 文件："
echo "   MEILI_API_KEY=$MASTER_KEY"
echo ""
echo "🔧 常用命令："
echo "   查看状态: sudo systemctl status meilisearch"
echo "   查看日志: sudo journalctl -u meilisearch -f"
echo "   重启服务: sudo systemctl restart meilisearch"
echo "   停止服务: sudo systemctl stop meilisearch"
echo ""
echo "========================================"

