#!/bin/bash
# 部署诊断脚本
# 用法: ./check-deployment.sh

echo "========================================"
echo "  部署诊断脚本"
echo "========================================"
echo ""

PROJECT_DIR="/var/www/yinxin"
FRONTEND_DIR="$PROJECT_DIR/frontend"
DIST_DIR="$FRONTEND_DIR/dist"

echo "📁 检查项目目录结构..."
echo ""

# 1. 检查项目根目录
if [ -d "$PROJECT_DIR" ]; then
    echo "✅ 项目根目录存在: $PROJECT_DIR"
else
    echo "❌ 项目根目录不存在: $PROJECT_DIR"
    exit 1
fi

# 2. 检查前端目录
if [ -d "$FRONTEND_DIR" ]; then
    echo "✅ 前端目录存在: $FRONTEND_DIR"
else
    echo "❌ 前端目录不存在: $FRONTEND_DIR"
    exit 1
fi

# 3. 检查 dist 目录
if [ -d "$DIST_DIR" ]; then
    echo "✅ 前端构建目录存在: $DIST_DIR"
    
    # 检查文件
    if [ -f "$DIST_DIR/index.html" ]; then
        echo "✅ index.html 存在"
    else
        echo "❌ index.html 不存在"
    fi
    
    # 检查 assets 目录
    if [ -d "$DIST_DIR/assets" ]; then
        echo "✅ assets 目录存在"
        ASSET_COUNT=$(ls -1 "$DIST_DIR/assets" 2>/dev/null | wc -l)
        echo "   文件数量: $ASSET_COUNT"
    else
        echo "⚠️  assets 目录不存在"
    fi
    
    # 显示目录大小
    DIST_SIZE=$(du -sh "$DIST_DIR" 2>/dev/null | cut -f1)
    echo "   目录大小: $DIST_SIZE"
else
    echo "❌ 前端构建目录不存在: $DIST_DIR"
    echo ""
    echo "📋 需要先构建前端："
    echo "   cd $FRONTEND_DIR"
    echo "   npm install"
    echo "   npm run build"
    exit 1
fi

echo ""

# 4. 检查文件权限
echo "🔐 检查文件权限..."
DIST_OWNER=$(stat -c '%U:%G' "$DIST_DIR" 2>/dev/null || stat -f '%Su:%Sg' "$DIST_DIR" 2>/dev/null)
echo "   dist 目录所有者: $DIST_OWNER"

# 检查 nginx 用户是否可以访问
if [ -r "$DIST_DIR/index.html" ]; then
    echo "✅ nginx 可以读取文件"
else
    echo "❌ nginx 无法读取文件，可能需要调整权限"
    echo "   运行: sudo chown -R www-data:www-data $DIST_DIR"
fi

echo ""

# 5. 检查 Nginx 配置
echo "🌐 检查 Nginx 配置..."
if [ -f "/etc/nginx/sites-available/yinxin" ]; then
    echo "✅ Nginx 配置文件存在"
    
    # 检查配置中的路径
    CONFIG_ROOT=$(grep -E "^\s*root\s+" /etc/nginx/sites-available/yinxin | awk '{print $2}' | tr -d ';')
    if [ -n "$CONFIG_ROOT" ]; then
        echo "   配置中的 root: $CONFIG_ROOT"
        if [ "$CONFIG_ROOT" = "$DIST_DIR" ]; then
            echo "✅ 路径匹配"
        else
            echo "⚠️  路径不匹配！"
            echo "   实际路径: $DIST_DIR"
            echo "   配置路径: $CONFIG_ROOT"
        fi
    fi
else
    echo "❌ Nginx 配置文件不存在"
fi

# 检查是否启用
if [ -L "/etc/nginx/sites-enabled/yinxin" ]; then
    echo "✅ Nginx 配置已启用"
else
    echo "❌ Nginx 配置未启用"
    echo "   运行: sudo ln -s /etc/nginx/sites-available/yinxin /etc/nginx/sites-enabled/yinxin"
fi

# 检查默认配置
if [ -L "/etc/nginx/sites-enabled/default" ] || [ -f "/etc/nginx/sites-enabled/default" ]; then
    echo "⚠️  默认 Nginx 配置仍在使用，可能会覆盖你的配置"
    echo "   运行: sudo rm -f /etc/nginx/sites-enabled/default"
else
    echo "✅ 默认配置已禁用"
fi

echo ""

# 6. 检查 Nginx 服务状态
echo "🔄 检查 Nginx 服务..."
if systemctl is-active --quiet nginx; then
    echo "✅ Nginx 服务正在运行"
else
    echo "❌ Nginx 服务未运行"
    echo "   运行: sudo systemctl start nginx"
fi

# 测试配置
if sudo nginx -t 2>&1 | grep -q "successful"; then
    echo "✅ Nginx 配置测试通过"
else
    echo "❌ Nginx 配置测试失败"
    echo "   运行: sudo nginx -t 查看错误"
fi

echo ""

# 7. 检查后端服务
echo "🔌 检查后端服务..."
if command -v pm2 &> /dev/null; then
    if pm2 list | grep -q "yinxin-backend"; then
        echo "✅ 后端服务在 PM2 中运行"
        pm2 list | grep "yinxin-backend"
    else
        echo "⚠️  后端服务未在 PM2 中运行"
    fi
else
    echo "ℹ️  PM2 未安装，无法检查后端服务"
fi

# 测试后端 API
if curl -s http://127.0.0.1:3000/api/health > /dev/null 2>&1; then
    echo "✅ 后端 API 可访问"
else
    echo "⚠️  后端 API 不可访问 (http://127.0.0.1:3000/api/health)"
fi

echo ""

# 8. 总结和建议
echo "========================================"
echo "  诊断完成"
echo "========================================"
echo ""
echo "📋 快速修复命令："
echo ""
echo "1. 如果前端未构建："
echo "   cd $FRONTEND_DIR"
echo "   npm install"
echo "   npm run build"
echo ""
echo "2. 如果权限有问题："
echo "   sudo chown -R www-data:www-data $DIST_DIR"
echo "   sudo chmod -R 755 $DIST_DIR"
echo ""
echo "3. 如果默认配置还在："
echo "   sudo rm -f /etc/nginx/sites-enabled/default"
echo "   sudo systemctl reload nginx"
echo ""
echo "4. 如果配置路径不匹配："
echo "   sudo ./setup-nginx.sh yin-xin.fun $DIST_DIR 3000"
echo ""
echo "========================================"

