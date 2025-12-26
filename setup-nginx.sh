#!/bin/bash
# Nginx 配置脚本 - 前端静态文件 + 后端 API 反向代理
# 用法: ./setup-nginx.sh [域名] [前端目录] [后端端口]

set -e

echo "========================================"
echo "  Nginx 配置脚本"
echo "========================================"
echo ""

# 检查是否为 root 用户
if [ "$EUID" -ne 0 ]; then
    echo "⚠️  此脚本需要 root 权限来配置 Nginx"
    echo "   请使用: sudo ./setup-nginx.sh"
    exit 1
fi

# 参数设置
DOMAIN="${1:-_}"
FRONTEND_DIR="${2:-/var/www/yinxin/frontend/dist}"
BACKEND_PORT="${3:-3000}"

echo "配置参数："
echo "  域名/Server Name: $DOMAIN"
echo "  前端目录: $FRONTEND_DIR"
echo "  后端端口: $BACKEND_PORT"
echo ""

# 检查 Nginx 是否安装
if ! command -v nginx &> /dev/null; then
    echo "📦 安装 Nginx..."
    if command -v apt-get &> /dev/null; then
        apt-get update
        apt-get install -y nginx
    elif command -v yum &> /dev/null; then
        yum install -y nginx
    else
        echo "❌ 无法自动安装 Nginx，请手动安装"
        exit 1
    fi
    echo "✅ Nginx 已安装"
else
    echo "✅ Nginx 已安装"
fi

echo ""

# 检查前端目录是否存在
if [ ! -d "$FRONTEND_DIR" ]; then
    echo "⚠️  前端目录不存在: $FRONTEND_DIR"
    echo "   请先构建前端: cd frontend && npm run build"
    read -p "是否继续创建配置？(y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# 创建 Nginx 配置
CONFIG_FILE="/etc/nginx/sites-available/yinxin"
echo "📝 创建 Nginx 配置文件: $CONFIG_FILE"

cat > "$CONFIG_FILE" <<EOF
# 吟心项目 Nginx 配置
# 生成时间: $(date)

# HTTP 服务器（可升级到 HTTPS）
server {
    listen 80;
    server_name $DOMAIN;

    # 日志文件
    access_log /var/log/nginx/yinxin-access.log;
    error_log /var/log/nginx/yinxin-error.log;

    # 前端静态文件目录
    root $FRONTEND_DIR;
    index index.html;

    # 客户端最大上传大小
    client_max_body_size 10M;

    # Gzip 压缩
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml text/javascript 
               application/x-javascript application/xml+rss 
               application/json application/javascript 
               application/font-woff application/font-woff2;

    # 静态资源缓存（CSS、JS、图片等）
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2|ttf|eot|map)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # 头像文件
    location /avatar/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files \$uri =404;
    }

    # 后端 API 代理
    location /api {
        proxy_pass http://127.0.0.1:$BACKEND_PORT;
        proxy_http_version 1.1;
        
        # 请求头
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        
        # WebSocket 支持
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        
        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        
        # 缓冲设置
        proxy_buffering off;
    }

    # WebSocket 支持（Socket.IO）
    location /socket.io {
        proxy_pass http://127.0.0.1:$BACKEND_PORT;
        proxy_http_version 1.1;
        
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        
        # WebSocket 超时设置
        proxy_connect_timeout 7d;
        proxy_send_timeout 7d;
        proxy_read_timeout 7d;
    }

    # 前端路由（SPA - 单页应用）
    location / {
        try_files \$uri \$uri/ /index.html;
        
        # 禁用 HTML 文件缓存
        location ~* \.html$ {
            expires -1;
            add_header Cache-Control "no-store, no-cache, must-revalidate";
        }
    }

    # 健康检查
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }

    # 禁止访问隐藏文件
    location ~ /\. {
        deny all;
        access_log off;
        log_not_found off;
    }
}

# HTTPS 配置（可选，需要 SSL 证书）
# server {
#     listen 443 ssl http2;
#     server_name $DOMAIN;
# 
#     ssl_certificate /path/to/cert.pem;
#     ssl_certificate_key /path/to/key.pem;
# 
#     # SSL 配置
#     ssl_protocols TLSv1.2 TLSv1.3;
#     ssl_ciphers HIGH:!aNULL:!MD5;
#     ssl_prefer_server_ciphers on;
# 
#     # 其他配置与 HTTP 相同...
#     # （复制上面的 location 块）
# }
EOF

echo "✅ 配置文件已创建"
echo ""

# 启用配置
echo "🔗 启用 Nginx 配置..."
if [ -L "/etc/nginx/sites-enabled/yinxin" ]; then
    echo "ℹ️  配置已存在，将更新"
    rm /etc/nginx/sites-enabled/yinxin
fi

ln -s /etc/nginx/sites-available/yinxin /etc/nginx/sites-enabled/yinxin
echo "✅ 配置已启用"
echo ""

# 测试配置
echo "🧪 测试 Nginx 配置..."
if nginx -t; then
    echo "✅ Nginx 配置测试通过"
else
    echo "❌ Nginx 配置测试失败"
    exit 1
fi

echo ""

# 重新加载 Nginx
echo "🔄 重新加载 Nginx..."
systemctl reload nginx
echo "✅ Nginx 已重新加载"
echo ""

# 检查 Nginx 状态
if systemctl is-active --quiet nginx; then
    echo "✅ Nginx 服务运行正常"
else
    echo "⚠️  Nginx 服务未运行，正在启动..."
    systemctl start nginx
    systemctl enable nginx
fi

echo ""
echo "========================================"
echo "  配置完成！"
echo "========================================"
echo ""
echo "📋 配置信息："
echo "   配置文件: $CONFIG_FILE"
echo "   前端目录: $FRONTEND_DIR"
echo "   后端代理: http://127.0.0.1:$BACKEND_PORT"
echo ""
echo "🔧 常用命令："
echo "   查看状态: sudo systemctl status nginx"
echo "   查看日志: sudo tail -f /var/log/nginx/yinxin-error.log"
echo "   重新加载: sudo systemctl reload nginx"
echo "   测试配置: sudo nginx -t"
echo ""
echo "🌐 访问测试："
echo "   http://$DOMAIN"
echo "   http://localhost"
echo ""
echo "========================================"

