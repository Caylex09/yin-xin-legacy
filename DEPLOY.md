# 吟心项目完整部署教程

本教程将指导您从零开始在服务器上部署吟心项目。所有步骤都经过验证，可以直接在服务器上执行。

## 📋 目录

1. [前置要求](#前置要求)
2. [第一步：准备服务器环境](#第一步准备服务器环境)
3. [第二步：从 Git 仓库拉取代码](#第二步从-git-仓库拉取代码)
4. [第三步：安装 Meilisearch](#第三步安装-meilisearch)
5. [第四步：配置环境变量](#第四步配置环境变量)
6. [第五步：导入 Meilisearch 数据](#第五步导入-meilisearch-数据)
7. [第六步：配置索引设置](#第六步配置索引设置)
8. [第七步：部署后端服务](#第七步部署后端服务)
9. [第八步：部署前端服务](#第八步部署前端服务)
10. [第九步：配置 Nginx（可选）](#第九步配置-nginx可选)
11. [第十步：验证部署](#第十步验证部署)
12. [常见问题排查](#常见问题排查)
13. [更新代码](#更新代码)

---

## 前置要求

### 服务器要求
- **操作系统**：Ubuntu 20.04+ / CentOS 7+ / Debian 10+（推荐 Ubuntu 22.04）
- **内存**：至少 2GB（推荐 4GB+）
- **磁盘空间**：至少 10GB 可用空间
- **网络**：可以访问互联网

### 需要安装的软件
- Git
- Node.js 20+ 和 npm
- Nginx（可选，用于反向代理）
- curl（通常系统自带）

---

## 第一步：准备服务器环境

### 1.1 更新系统

```bash
# Ubuntu/Debian
sudo apt update && sudo apt upgrade -y

# CentOS
sudo yum update -y
```

### 1.2 安装 Node.js 20

```bash
# 使用 NodeSource 安装 Node.js 20（Ubuntu/Debian）
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 验证安装
node --version  # 应该显示 v20.x.x
npm --version
```

### 1.3 安装 Git

```bash
# Ubuntu/Debian
sudo apt install -y git

# CentOS
sudo yum install -y git

# 验证安装
git --version
```

### 1.4 安装 Nginx（可选，但推荐）

```bash
# Ubuntu/Debian
sudo apt install -y nginx

# CentOS
sudo yum install -y nginx

# 启动并设置开机自启
sudo systemctl start nginx
sudo systemctl enable nginx
```

---

## 第二步：从 Git 仓库拉取代码

### 2.1 克隆项目

```bash
# 进入合适的目录（例如 /var/www）
cd /var/www

# 克隆项目（替换为你的实际仓库地址）
git clone <your-repo-url> yinxin

# 进入项目目录
cd yinxin
```

### 2.2 检查项目结构

```bash
# 确认项目结构正确
ls -la

# 应该看到以下目录：
# - backend/
# - frontend/
# - data/
# - poetry_settings.json
# - poets_settings.json
```

---

## 第三步：安装 Meilisearch

### 3.1 下载并安装 Meilisearch

```bash
# 下载 Meilisearch
curl -L https://install.meilisearch.com | sh

# 移动到系统路径
sudo mv ./meilisearch /usr/local/bin/meilisearch
sudo chmod +x /usr/local/bin/meilisearch

# 验证安装
meilisearch --version
```

### 3.2 创建数据目录

```bash
# 创建数据目录
sudo mkdir -p /var/lib/meilisearch
sudo chown $USER:$USER /var/lib/meilisearch
```

### 3.3 生成 Master Key

```bash
# 生成一个安全的随机密钥（保存好这个密钥，后续会用到）
openssl rand -hex 32
```

**重要**：请保存生成的 Master Key，后续配置需要使用！

### 3.4 创建 systemd 服务

创建服务文件：

```bash
sudo nano /etc/systemd/system/meilisearch.service
```

将以下内容粘贴进去（**替换 `YOUR_MASTER_KEY_HERE` 为刚才生成的密钥**）：

```ini
[Unit]
Description=MeiliSearch
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/var/lib/meilisearch
ExecStart=/usr/local/bin/meilisearch \
    --http-addr 127.0.0.1:7700 \
    --master-key YOUR_MASTER_KEY_HERE \
    --env production \
    --db-path /var/lib/meilisearch
Restart=always
RestartSec=3
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

**注意**：
- 将 `YOUR_MASTER_KEY_HERE` 替换为刚才生成的密钥
- 如果不想用 root 用户运行，将 `User=root` 改为你的用户名，并确保该用户有 `/var/lib/meilisearch` 目录的读写权限

### 3.5 启动 Meilisearch 服务

```bash
# 重新加载 systemd
sudo systemctl daemon-reload

# 启用并启动服务
sudo systemctl enable meilisearch
sudo systemctl start meilisearch

# 查看状态
sudo systemctl status meilisearch

# 如果状态正常，应该看到 "Active: active (running)"
```

### 3.6 测试 Meilisearch

```bash
# 测试健康检查（不需要认证）
curl http://127.0.0.1:7700/health

# 应该返回: {"status":"available"}
```

---

## 第四步：配置环境变量

### 4.1 配置后端环境变量

```bash
# 进入项目目录
cd /var/www/yinxin

# 复制示例文件
cp backend/env.example backend/.env

# 编辑配置文件
nano backend/.env
```

编辑 `backend/.env`，填入以下内容（**替换为你的实际值**）：

```env
PORT=3000
MEILI_HOST=http://127.0.0.1:7700
MEILI_API_KEY=你的_meilisearch_master_key
JWT_SECRET=你的_jwt_密钥_建议使用长随机字符串
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_USER=你的QQ邮箱@qq.com
SMTP_PASS=你的SMTP授权码
MAIL_FROM=吟心 <你的QQ邮箱@qq.com>
```

**重要说明**：
- `MEILI_API_KEY`：必须与第三步中 Meilisearch 启动时使用的 `--master-key` 一致
- `JWT_SECRET`：用于 JWT 签名，建议使用长随机字符串（可以用 `openssl rand -hex 32` 生成）
- SMTP 配置：用于发送邮件，如果不需要邮件功能，可以暂时不配置

### 4.2 配置前端环境变量

```bash
# 复制示例文件
cp frontend/env.example frontend/.env

# 编辑配置文件
nano frontend/.env
```

编辑 `frontend/.env`：

```env
VITE_API_BASE=/api
```

**说明**：
- 如果使用 Nginx 反向代理，使用 `/api`（推荐）
- 如果直接访问后端，使用 `http://your-server-ip:3000/api`

---

## 第五步：导入 Meilisearch 数据

### 5.1 检查数据文件

```bash
# 确认数据文件存在
ls -lh data/*.ndjson

# 应该看到：
# - data/poets.ndjson（诗人数据）
# - data/poetry_part_*.ndjson（诗歌数据分片文件）
```

### 5.2 创建索引

```bash
# 设置变量（替换为你的实际值）
MEILI_HOST="http://127.0.0.1:7700"
MEILI_API_KEY="你的_meilisearch_master_key"

# 创建 poets 索引
curl -X POST "$MEILI_HOST/indexes" \
  -H "Authorization: Bearer $MEILI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"uid": "poets"}'

# 创建 poetry 索引
curl -X POST "$MEILI_HOST/indexes" \
  -H "Authorization: Bearer $MEILI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"uid": "poetry"}'
```

### 5.3 导入 poets 数据

```bash
# 进入项目目录
cd /var/www/yinxin

# 导入 poets 数据
curl -X POST "$MEILI_HOST/indexes/poets/documents?primaryKey=id" \
  -H "Authorization: Bearer $MEILI_API_KEY" \
  -H "Content-Type: application/x-ndjson" \
  --data-binary "@data/poets.ndjson"

# 等待几秒钟让索引处理完成
sleep 5
```

### 5.4 导入 poetry 数据

由于 poetry 数据文件较大，使用分片文件逐个导入：

```bash
# 进入项目目录
cd /var/www/yinxin

# 按顺序导入所有分片文件
for file in data/poetry_part_*.ndjson; do
  echo "正在导入: $(basename $file)"
  curl -X POST "$MEILI_HOST/indexes/poetry/documents?primaryKey=id" \
    -H "Authorization: Bearer $MEILI_API_KEY" \
    -H "Content-Type: application/x-ndjson" \
    --data-binary "@$file"
  echo "完成: $(basename $file)"
  sleep 2  # 等待一下再导入下一个文件
done

echo "所有数据导入完成！"
```

**注意**：导入过程可能需要几分钟，请耐心等待。

### 5.5 检查导入状态

```bash
# 检查 poets 索引统计
curl "$MEILI_HOST/indexes/poets/stats" \
  -H "Authorization: Bearer $MEILI_API_KEY"

# 检查 poetry 索引统计
curl "$MEILI_HOST/indexes/poetry/stats" \
  -H "Authorization: Bearer $MEILI_API_KEY"

# 查看任务状态
curl "$MEILI_HOST/tasks?limit=5" \
  -H "Authorization: Bearer $MEILI_API_KEY"
```

等待所有任务状态变为 `"status": "succeeded"`。

---

## 第六步：配置索引设置

### 6.1 配置 poetry 索引

```bash
# 进入项目目录
cd /var/www/yinxin

# 配置 poetry 索引设置
curl -X PATCH "$MEILI_HOST/indexes/poetry/settings" \
  -H "Authorization: Bearer $MEILI_API_KEY" \
  -H "Content-Type: application/json" \
  --data-binary "@poetry_settings.json"
```

### 6.2 配置 poets 索引

```bash
# 配置 poets 索引设置
curl -X PATCH "$MEILI_HOST/indexes/poets/settings" \
  -H "Authorization: Bearer $MEILI_API_KEY" \
  -H "Content-Type: application/json" \
  --data-binary "@poets_settings.json"
```

### 6.3 等待索引处理完成

```bash
# 查看任务状态，等待所有任务完成
curl "$MEILI_HOST/tasks?limit=10" \
  -H "Authorization: Bearer $MEILI_API_KEY" | grep -E '"status"|"type"'
```

等待所有任务状态变为 `"succeeded"`。

---

## 第七步：部署后端服务

### 7.1 安装后端依赖

```bash
# 进入后端目录
cd /var/www/yinxin/backend

# 安装依赖
npm install

# 如果安装失败，尝试使用国内镜像
# npm install --registry=https://registry.npmmirror.com
```

### 7.2 构建后端

```bash
# 构建 TypeScript 代码
npm run build

# 检查构建结果
ls -la dist/
```

### 7.3 安装 PM2（进程管理器）

```bash
# 全局安装 PM2
sudo npm install -g pm2

# 验证安装
pm2 --version
```

### 7.4 启动后端服务

```bash
# 使用 PM2 启动后端
pm2 start dist/index.js --name yinxin-backend

# 设置开机自启
pm2 startup
# 执行上面命令输出的命令（通常是 sudo env PATH=...）
pm2 save

# 查看状态
pm2 status

# 查看日志
pm2 logs yinxin-backend
```

### 7.5 测试后端 API

```bash
# 测试健康检查
curl http://127.0.0.1:3000/api/health

# 测试搜索功能
curl "http://127.0.0.1:3000/api/search/poetry?q=李白"
```

---

## 第八步：部署前端服务

### 8.1 安装前端依赖

```bash
# 进入前端目录
cd /var/www/yinxin/frontend

# 安装依赖
npm install

# 如果安装失败，尝试使用国内镜像
# npm install --registry=https://registry.npmmirror.com
```

### 8.2 构建前端

```bash
# 构建前端（生产环境）
npm run build

# 检查构建结果
ls -la dist/
```

### 8.3 部署前端文件

#### 方式一：使用 Nginx（推荐）

```bash
# 复制构建文件到 Nginx 目录
sudo cp -r dist/* /var/www/html/

# 或者使用自定义目录
sudo mkdir -p /var/www/yinxin-frontend
sudo cp -r dist/* /var/www/yinxin-frontend/
```

#### 方式二：使用 Node.js 静态服务器（临时测试）

```bash
# 安装 serve
sudo npm install -g serve

# 启动静态服务器（仅用于测试）
serve -s dist -l 8080
```

---

## 第九步：配置 Nginx（可选）

### 9.1 创建 Nginx 配置

```bash
# 创建配置文件
sudo nano /etc/nginx/sites-available/yinxin
```

将以下内容粘贴进去（**替换 `your-domain.com` 为你的域名或 IP**）：

```nginx
server {
    listen 80;
    server_name your-domain.com;  # 替换为你的域名或 IP

    # 前端静态文件
    root /var/www/html;  # 或 /var/www/yinxin-frontend
    index index.html;

    # 前端路由支持
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

    # WebSocket 支持（如果需要）
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

### 9.2 启用配置

```bash
# 创建符号链接
sudo ln -s /etc/nginx/sites-available/yinxin /etc/nginx/sites-enabled/

# 测试配置
sudo nginx -t

# 如果测试通过，重新加载 Nginx
sudo systemctl reload nginx
```

---

## 第十步：验证部署

### 10.1 检查所有服务状态

```bash
# 检查 Meilisearch
sudo systemctl status meilisearch

# 检查后端（PM2）
pm2 status

# 检查 Nginx（如果使用）
sudo systemctl status nginx
```

### 10.2 测试功能

```bash
# 1. 测试 Meilisearch 搜索
curl "http://127.0.0.1:7700/indexes/poetry/search?q=李白" \
  -H "Authorization: Bearer $MEILI_API_KEY"

# 2. 测试后端 API
curl http://127.0.0.1:3000/api/health
curl "http://127.0.0.1:3000/api/search/poetry?q=李白"

# 3. 测试前端（在浏览器中访问）
# http://your-server-ip 或 http://your-domain.com
```

### 10.3 检查日志

```bash
# Meilisearch 日志
sudo journalctl -u meilisearch -n 50

# 后端日志
pm2 logs yinxin-backend

# Nginx 日志
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

---

## 常见问题排查

### 问题 1：Meilisearch 连接失败

**症状**：后端报错 "MeiliSearch 连接失败"

**排查步骤**：
```bash
# 1. 检查服务是否运行
sudo systemctl status meilisearch

# 2. 检查端口是否监听
sudo netstat -tlnp | grep 7700
# 或
sudo ss -tlnp | grep 7700

# 3. 测试连接
curl http://127.0.0.1:7700/health

# 4. 查看日志
sudo journalctl -u meilisearch -n 50
```

**解决方案**：
- 确保 Meilisearch 服务正在运行
- 检查 `backend/.env` 中的 `MEILI_HOST` 和 `MEILI_API_KEY` 是否正确
- 确保 Master Key 一致

### 问题 2：API Key 认证失败

**症状**：返回 401 Unauthorized

**排查步骤**：
```bash
# 检查 backend/.env 中的 MEILI_API_KEY
cat backend/.env | grep MEILI_API_KEY

# 检查 Meilisearch 服务配置
sudo cat /etc/systemd/system/meilisearch.service | grep master-key
```

**解决方案**：
- 确保 `backend/.env` 中的 `MEILI_API_KEY` 与 Meilisearch 启动时使用的 `--master-key` 完全一致
- 重启后端服务：`pm2 restart yinxin-backend`

### 问题 3：数据导入失败

**症状**：导入数据时出错或超时

**排查步骤**：
```bash
# 检查数据文件是否存在
ls -lh data/*.ndjson

# 检查文件权限
ls -l data/*.ndjson

# 查看 Meilisearch 任务状态
curl "$MEILI_HOST/tasks?limit=10" \
  -H "Authorization: Bearer $MEILI_API_KEY"
```

**解决方案**：
- 确保数据文件存在且可读：`chmod 644 data/*.ndjson`
- 如果文件很大，可以分批导入
- 检查 Meilisearch 日志查看详细错误

### 问题 4：前端无法连接后端

**症状**：前端页面显示 API 错误

**排查步骤**：
```bash
# 检查后端是否运行
pm2 status

# 测试后端 API
curl http://127.0.0.1:3000/api/health

# 检查前端 .env 配置
cat frontend/.env
```

**解决方案**：
- 确保后端服务正在运行
- 检查 `frontend/.env` 中的 `VITE_API_BASE` 配置
- 如果使用 Nginx，检查反向代理配置是否正确
- 检查防火墙是否开放了 3000 端口

### 问题 5：端口被占用

**症状**：服务启动失败，提示端口被占用

**排查步骤**：
```bash
# 检查端口占用
sudo netstat -tlnp | grep 3000
sudo netstat -tlnp | grep 7700
sudo netstat -tlnp | grep 80
```

**解决方案**：
- 停止占用端口的进程
- 或修改配置文件中的端口号

### 问题 6：PM2 服务未启动

**症状**：服务器重启后后端服务未自动启动

**解决方案**：
```bash
# 重新设置 PM2 开机自启
pm2 startup
# 执行输出的命令
pm2 save
```

---

## 更新代码

当代码更新后，在服务器上执行以下步骤：

### 1. 拉取最新代码

```bash
# 进入项目目录
cd /var/www/yinxin

# 拉取最新代码
git pull
```

### 2. 更新后端

```bash
# 进入后端目录
cd backend

# 安装新依赖（如果有）
npm install

# 重新构建
npm run build

# 重启服务
pm2 restart yinxin-backend
```

### 3. 更新前端

```bash
# 进入前端目录
cd ../frontend

# 安装新依赖（如果有）
npm install

# 重新构建
npm run build

# 复制新文件到 Nginx 目录
sudo cp -r dist/* /var/www/html/
```

### 4. 如果 Meilisearch 数据有更新

```bash
# 重新导入数据（参考第五步）
# 注意：这会覆盖现有数据
```

---

## 快速参考命令

### Meilisearch

```bash
# 查看状态
sudo systemctl status meilisearch

# 重启
sudo systemctl restart meilisearch

# 查看日志
sudo journalctl -u meilisearch -f

# 测试连接
curl http://127.0.0.1:7700/health
```

### 后端

```bash
# 查看状态
pm2 status

# 查看日志
pm2 logs yinxin-backend

# 重启
pm2 restart yinxin-backend

# 停止
pm2 stop yinxin-backend
```

### Nginx

```bash
# 测试配置
sudo nginx -t

# 重新加载
sudo systemctl reload nginx

# 重启
sudo systemctl restart nginx

# 查看日志
sudo tail -f /var/log/nginx/access.log
```

---

## 安全建议

1. **使用 HTTPS**：配置 SSL 证书，使用 Let's Encrypt 免费证书
2. **防火墙配置**：只开放必要的端口（80, 443）
3. **密钥安全**：使用强随机密钥，不要提交到代码仓库
4. **定期更新**：保持系统和依赖包更新
5. **备份数据**：定期备份数据库和 Meilisearch 数据

---

## 完成！

恭喜！您已经成功部署了吟心项目。如果遇到任何问题，请参考"常见问题排查"部分，或查看相关服务的日志文件。

---

**最后更新**：2024年

