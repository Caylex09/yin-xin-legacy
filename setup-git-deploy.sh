#!/bin/bash
# 设置 Git 自动部署（服务器端）

set -e

echo "========================================"
echo "  设置 Git 自动部署"
echo "========================================"
echo ""

# 检查参数
if [ -z "$1" ]; then
    echo "用法: $0 <项目路径>"
    echo "示例: $0 /var/www/yinxin"
    exit 1
fi

PROJECT_PATH="$1"
GIT_DIR="$PROJECT_PATH/.git"
HOOKS_DIR="$GIT_DIR/hooks"

# 检查项目目录
if [ ! -d "$PROJECT_PATH" ]; then
    echo "错误: 项目目录不存在: $PROJECT_PATH"
    exit 1
fi

if [ ! -d "$GIT_DIR" ]; then
    echo "错误: 不是 Git 仓库: $GIT_DIR"
    exit 1
fi

# 创建 post-receive hook
echo "创建 Git post-receive hook..."
cat > "$HOOKS_DIR/post-receive" << 'HOOK_EOF'
#!/bin/bash
# Git post-receive hook - 自动部署

set -e

PROJECT_PATH="$(pwd)"
cd "$PROJECT_PATH"

echo "========================================"
echo "  开始自动部署"
echo "========================================"
echo ""

# 备份数据库
if [ -f "backend/data/app.db" ]; then
    echo "备份数据库..."
    mkdir -p backend/data/backups
    cp backend/data/app.db "backend/data/backups/app.db.backup.$(date +%Y%m%d_%H%M%S)"
fi

# 拉取最新代码（如果是从远程推送）
git reset --hard HEAD
git clean -fd

# 更新后端
echo "更新后端..."
cd backend
npm install
npm run build

# 重启后端服务（使用 PM2）
if command -v pm2 &> /dev/null; then
    pm2 restart yinxin-backend || pm2 start dist/index.js --name yinxin-backend
    pm2 save
fi

cd ..

# 更新前端
echo "更新前端..."
cd frontend
npm install
npm run build

# 复制到 Nginx（如果存在）
if [ -d "/var/www/html" ]; then
    sudo cp -r dist/* /var/www/html/
fi

cd ..

echo ""
echo "========================================"
echo "  部署完成！"
echo "========================================"
HOOK_EOF

chmod +x "$HOOKS_DIR/post-receive"

echo "Git hook 已创建: $HOOKS_DIR/post-receive"
echo ""
echo "现在可以在本地配置 Git remote："
echo ""
echo "  git remote add production user@server:$PROJECT_PATH"
echo ""
echo "然后推送代码："
echo ""
echo "  git push production main"
echo ""
echo "推送后会自动触发部署！"

