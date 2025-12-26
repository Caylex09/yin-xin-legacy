# 吟心项目部署指南

本指南将帮助您将吟心项目部署到服务器上。

## 目录

- [部署方式](#部署方式)
- [前置要求](#前置要求)
- [方式一：Docker Compose 部署（推荐）](#方式一docker-compose-部署推荐)
- [方式二：手动部署](#方式二手动部署)
- [环境变量配置](#环境变量配置)
- [数据迁移](#数据迁移)
- [维护和更新](#维护和更新)
- [常见问题](#常见问题)

## 相关文档

- [DOCKER_NOTES.md](./DOCKER_NOTES.md) - Docker 部署注意事项和副作用说明
- [UPDATE.md](./UPDATE.md) - 代码更新和同步指南
- [GIT_DEPLOY.md](./GIT_DEPLOY.md) - 使用 Git 更新代码（不使用 Docker）

## 部署方式

项目支持两种部署方式：
1. **Docker Compose 部署**（推荐）：使用容器化部署，简单快捷
2. **手动部署**：直接在服务器上安装依赖并运行

## 前置要求

### Docker Compose 部署
- Docker 20.10+
- Docker Compose 2.0+
- 至少 2GB 可用内存
- 至少 10GB 可用磁盘空间

### 手动部署
- Node.js 20+
- npm 或 yarn
- MeiliSearch（需要单独安装）
- Nginx（用于前端静态文件服务，可选）

## 方式一：Docker Compose 部署（推荐）

### 1. 准备服务器

确保服务器已安装 Docker 和 Docker Compose：

```bash
# 检查 Docker 版本
docker --version
docker compose version
```

### 2. 上传项目文件

将项目文件上传到服务器（可以使用 git clone 或直接上传）：

```bash
# 使用 git
git clone <your-repo-url> yinxin
cd yinxin

# 或使用 scp 上传
scp -r /path/to/yinxin user@server:/path/to/destination
```

### 3. 配置环境变量

在项目根目录创建 `.env` 文件：

```bash
cd yinxin
cp backend/env.example backend/.env
cp frontend/env.example frontend/.env
```

编辑 `backend/.env`：

```env
PORT=3000
MEILI_HOST=http://meilisearch:7700
MEILI_API_KEY=your_secure_master_key_here
JWT_SECRET=your_long_random_jwt_secret_here
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_USER=your_qq_email@example.com
SMTP_PASS=your_smtp_auth_code
MAIL_FROM=吟心 <your_qq_email@example.com>
```

编辑 `frontend/.env`：

```env
VITE_API_BASE=http://your-domain.com/api
# 或使用 IP
# VITE_API_BASE=http://your-server-ip:3000/api
```

在项目根目录创建 `.env` 文件（用于 docker-compose）：

```env
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
VITE_API_BASE=http://your-domain.com/api

# 端口配置（可选）
BACKEND_PORT=3000
FRONTEND_PORT=80
```

### 4. 构建和启动服务

```bash
# 构建并启动所有服务
docker compose up -d

# 查看服务状态
docker compose ps

# 查看日志
docker compose logs -f
```

### 5. 验证部署

- 前端：访问 `http://your-server-ip` 或 `http://your-domain.com`
- 后端 API：访问 `http://your-server-ip:3000/api` 或 `http://your-domain.com/api`
- MeiliSearch：访问 `http://your-server-ip:7700`（需要 API Key）

### 6. 常用命令

```bash
# 停止所有服务
docker compose down

# 停止并删除数据卷（谨慎使用）
docker compose down -v

# 重启服务
docker compose restart

# 查看日志
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f meilisearch

# 更新代码后重新构建
docker compose up -d --build
```

## 方式二：手动部署

### 1. 安装 MeiliSearch

#### Linux

```bash
# 下载 MeiliSearch
curl -L https://install.meilisearch.com | sh

# 启动 MeiliSearch（后台运行）
./meilisearch --http-addr 127.0.0.1:7700 --master-key your_master_key_here &

# 或使用 systemd 服务（推荐）
sudo tee /etc/systemd/system/meilisearch.service > /dev/null <<EOF
[Unit]
Description=MeiliSearch
After=network.target

[Service]
Type=simple
User=your_user
WorkingDirectory=/path/to/meilisearch
ExecStart=/path/to/meilisearch --http-addr 127.0.0.1:7700 --master-key your_master_key_here
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable meilisearch
sudo systemctl start meilisearch
```

#### Windows

直接运行 `meilisearch.exe`：

```powershell
.\meilisearch.exe --http-addr 127.0.0.1:7700 --master-key your_master_key_here
```

### 2. 部署后端

```bash
cd backend

# 安装依赖
npm install

# 配置环境变量
cp env.example .env
# 编辑 .env 文件

# 构建
npm run build

# 启动（生产环境建议使用 PM2）
npm install -g pm2
pm2 start dist/index.js --name yinxin-backend
pm2 save
pm2 startup
```

### 3. 部署前端

```bash
cd frontend

# 安装依赖
npm install

# 配置环境变量
cp env.example .env
# 编辑 .env 文件，设置 VITE_API_BASE

# 构建
npm run build

# 使用 Nginx 服务静态文件
sudo cp -r dist/* /var/www/html/
```

### 4. 配置 Nginx（可选但推荐）

创建 Nginx 配置文件 `/etc/nginx/sites-available/yinxin`：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 前端静态文件
    root /var/www/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # 后端 API 代理
    location /api {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket 支持
    location /socket.io {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

启用配置：

```bash
sudo ln -s /etc/nginx/sites-available/yinxin /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## 环境变量配置

### 后端环境变量（backend/.env）

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `PORT` | 后端服务端口 | `3000` |
| `MEILI_HOST` | MeiliSearch 地址 | `http://127.0.0.1:7700` 或 `http://meilisearch:7700` |
| `MEILI_API_KEY` | MeiliSearch Master Key | `your_master_key_here` |
| `JWT_SECRET` | JWT 签名密钥（必须足够长且随机） | `your_long_random_secret` |
| `SMTP_HOST` | SMTP 服务器地址 | `smtp.qq.com` |
| `SMTP_PORT` | SMTP 端口 | `465` |
| `SMTP_USER` | SMTP 用户名（邮箱） | `your_email@qq.com` |
| `SMTP_PASS` | SMTP 密码（授权码） | `your_auth_code` |
| `MAIL_FROM` | 发件人信息 | `吟心 <your_email@qq.com>` |

### 前端环境变量（frontend/.env）

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `VITE_API_BASE` | 后端 API 地址 | `http://your-domain.com/api` |

## 数据迁移

### 数据库文件

SQLite 数据库文件位于 `backend/data/app.db`，直接复制即可：

```bash
# 从旧服务器复制
scp backend/data/app.db user@new-server:/path/to/yinxin/backend/data/
```

### MeiliSearch 数据

MeiliSearch 数据需要重新导入：

1. 导出数据（在旧服务器）：
```bash
# 使用 MeiliSearch 的 dump 功能
curl -X POST 'http://localhost:7700/dumps' \
  -H 'Authorization: Bearer your_master_key'
```

2. 导入数据（在新服务器）：
```bash
# 上传 dump 文件并恢复
# 参考 MeiliSearch 文档
```

### 用户头像

复制 `data/avatar` 目录：

```bash
scp -r data/avatar user@new-server:/path/to/yinxin/data/
```

## 维护和更新

详细的更新流程请参考 [UPDATE.md](./UPDATE.md) 文档。

### 快速更新（Docker Compose）

```bash
# 使用更新脚本（推荐）
./update.sh  # Linux/Mac
# 或
.\update.ps1  # Windows

# 或手动更新
git pull
docker compose up -d --build
```

### 快速更新（手动部署）

```bash
# 后端
cd backend
git pull
npm install
npm run build
pm2 restart yinxin-backend

# 前端
cd frontend
git pull
npm install
npm run build
sudo cp -r dist/* /var/www/html/
```

### 备份数据

定期备份以下内容：

1. **数据库文件**：
```bash
cp backend/data/app.db backups/app_$(date +%Y%m%d).db
```

2. **MeiliSearch 数据**：
```bash
# 使用 MeiliSearch dump 功能
```

3. **用户头像**：
```bash
tar -czf backups/avatar_$(date +%Y%m%d).tar.gz data/avatar
```

### 监控和日志

#### Docker Compose

```bash
# 查看所有服务日志
docker compose logs -f

# 查看特定服务日志
docker compose logs -f backend
```

#### 手动部署

```bash
# PM2 日志
pm2 logs yinxin-backend

# Nginx 日志
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

## 常见问题

### 1. 端口被占用

如果端口被占用，可以修改：
- Docker Compose：修改 `.env` 文件中的端口配置
- 手动部署：修改 `backend/.env` 中的 `PORT` 变量

### 2. MeiliSearch 连接失败

检查：
- MeiliSearch 是否正在运行
- `MEILI_HOST` 和 `MEILI_API_KEY` 是否正确
- 防火墙是否开放了 7700 端口

### 3. 前端无法连接后端

检查：
- `VITE_API_BASE` 是否正确配置
- 后端服务是否正常运行
- CORS 配置是否正确

### 4. 邮件发送失败

检查：
- SMTP 配置是否正确
- 邮箱是否开启了 SMTP 服务
- 授权码是否正确

## 安全建议

1. **使用 HTTPS**：配置 SSL 证书，使用 Nginx 反向代理
2. **防火墙**：只开放必要的端口（80, 443）
3. **密钥安全**：使用强随机密钥，不要提交到代码仓库
4. **定期更新**：保持依赖包和系统更新
5. **备份**：定期备份数据库和重要数据

## 技术支持

如有问题，请查看：
- 项目 README.md
- GitHub Issues
- QQ 群：211902065

