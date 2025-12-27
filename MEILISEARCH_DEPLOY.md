# Meilisearch 服务器部署和数据导入指南

本文档详细说明如何在服务器上部署 Meilisearch 并导入数据。

## 目录

1. [安装 Meilisearch](#安装-meilisearch)
2. [配置 Meilisearch](#配置-meilisearch)
3. [准备数据文件](#准备数据文件)
4. [导入数据](#导入数据)
5. [配置索引设置](#配置索引设置)
6. [验证导入](#验证导入)
7. [常见问题](#常见问题)

---

## 安装 Meilisearch

### 方式一：使用自动化脚本（推荐）

项目提供了自动化安装脚本，可以一键完成安装和配置：

```bash
# 1. 进入项目根目录
cd /path/to/yinxin

# 2. 给脚本执行权限
chmod +x setup-meilisearch.sh

# 3. 运行安装脚本（需要 root 权限）
# 可以指定 master key，或不指定让脚本自动生成
sudo ./setup-meilisearch.sh your_master_key_here

# 或自动生成 master key
sudo ./setup-meilisearch.sh
```

脚本会自动：
- 下载并安装 Meilisearch
- 创建数据目录 (`/var/lib/meilisearch`)
- 配置 systemd 服务
- 启动并启用 Meilisearch 服务

**重要**：请保存脚本输出的 Master Key，后续配置需要使用！

### 方式二：手动安装

#### 1. 下载 Meilisearch

```bash
# 下载最新版本
curl -L https://install.meilisearch.com | sh

# 移动到系统路径（可选）
sudo mv ./meilisearch /usr/local/bin/meilisearch
sudo chmod +x /usr/local/bin/meilisearch
```

#### 2. 创建数据目录

```bash
sudo mkdir -p /var/lib/meilisearch
sudo chown $USER:$USER /var/lib/meilisearch
```

#### 3. 创建 systemd 服务

创建 `/etc/systemd/system/meilisearch.service`：

```ini
[Unit]
Description=MeiliSearch
After=network.target

[Service]
Type=simple
User=your_user
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

**注意**：将 `YOUR_MASTER_KEY_HERE` 替换为你的实际 master key，将 `your_user` 替换为实际运行用户。

#### 4. 启动服务

```bash
# 重新加载 systemd
sudo systemctl daemon-reload

# 启用并启动服务
sudo systemctl enable meilisearch
sudo systemctl start meilisearch

# 查看状态
sudo systemctl status meilisearch

# 查看日志
sudo journalctl -u meilisearch -f
```

---

## 配置 Meilisearch

### 1. 测试连接

```bash
# 测试健康检查（不需要认证）
curl http://127.0.0.1:7700/health

# 应该返回: {"status":"available"}
```

### 2. 配置后端环境变量

编辑 `backend/.env` 文件，设置 Meilisearch 连接信息：

```env
# Meilisearch 配置
MEILI_HOST=http://127.0.0.1:7700
MEILI_API_KEY=your_master_key_here
```

**重要**：`MEILI_API_KEY` 必须与启动 Meilisearch 时使用的 `--master-key` 一致！

---

## 准备数据文件

### 1. 上传数据文件到服务器

将以下文件上传到服务器的 `data/` 目录：

- `data/poets.ndjson` - 诗人数据
- `data/poetry.ndjson` - 诗歌数据（单文件格式）
- 或 `data/poetry_part_*.ndjson` - 诗歌数据（分片格式）

**推荐使用分片格式**，因为数据量较大，分片可以更好地处理。

### 2. 检查文件权限

```bash
# 确保文件可读
chmod 644 data/*.ndjson

# 检查文件是否存在
ls -lh data/*.ndjson
```

---

## 导入数据

### 方式一：使用自动化脚本（推荐）

项目提供了数据导入脚本：

```bash
# 1. 进入项目根目录
cd /path/to/yinxin

# 2. 确保已配置 backend/.env（包含 MEILI_HOST 和 MEILI_API_KEY）
# 编辑 backend/.env 文件

# 3. 给脚本执行权限
chmod +x import-meilisearch-data.sh

# 4. 运行导入脚本
./import-meilisearch-data.sh
```

脚本会自动：
- 从 `backend/.env` 读取 Meilisearch 配置
- 检查 Meilisearch 连接
- 检测数据文件格式（单文件或分片）
- 批量导入数据（自动分批处理）
- 显示导入进度和统计信息

**脚本配置**：

默认情况下，脚本假设项目路径为 `/var/www/yinxin`。如果路径不同，可以修改脚本开头的配置：

```bash
PROJECT_DIR="/var/www/yinxin"  # 修改为你的项目路径
DATA_DIR="$PROJECT_DIR/data"
BACKEND_ENV="$PROJECT_DIR/backend/.env"
```

### 方式二：手动导入（使用 curl）

#### 1. 导入 poets 索引

```bash
# 清空现有数据（如果存在）
curl -X DELETE "http://127.0.0.1:7700/indexes/poets" \
  -H "Authorization: Bearer YOUR_MASTER_KEY"

# 创建索引
curl -X POST "http://127.0.0.1:7700/indexes" \
  -H "Authorization: Bearer YOUR_MASTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"uid": "poets"}'

# 导入数据
curl -X POST "http://127.0.0.1:7700/indexes/poets/documents?primaryKey=id" \
  -H "Authorization: Bearer YOUR_MASTER_KEY" \
  -H "Content-Type: application/x-ndjson" \
  --data-binary @data/poets.ndjson
```

#### 2. 导入 poetry 索引

```bash
# 清空现有数据（如果存在）
curl -X DELETE "http://127.0.0.1:7700/indexes/poetry" \
  -H "Authorization: Bearer YOUR_MASTER_KEY"

# 创建索引
curl -X POST "http://127.0.0.1:7700/indexes" \
  -H "Authorization: Bearer YOUR_MASTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"uid": "poetry"}'

# 导入数据（单文件）
curl -X POST "http://127.0.0.1:7700/indexes/poetry/documents?primaryKey=id" \
  -H "Authorization: Bearer YOUR_MASTER_KEY" \
  -H "Content-Type: application/x-ndjson" \
  --data-binary @data/poetry.ndjson

# 或导入分片文件（需要逐个导入）
for file in data/poetry_part_*.ndjson; do
  echo "导入: $file"
  curl -X POST "http://127.0.0.1:7700/indexes/poetry/documents?primaryKey=id" \
    -H "Authorization: Bearer YOUR_MASTER_KEY" \
    -H "Content-Type: application/x-ndjson" \
    --data-binary @"$file"
done
```

**注意**：手动导入时，数据量较大可能导致请求超时，建议使用自动化脚本。

---

## 配置索引设置

导入数据后，需要配置索引的搜索和显示属性。

### 1. 配置 poetry 索引

```bash
curl -X PATCH "http://127.0.0.1:7700/indexes/poetry/settings" \
  -H "Authorization: Bearer YOUR_MASTER_KEY" \
  -H "Content-Type: application/json" \
  -d @poetry_settings.json
```

`poetry_settings.json` 内容：

```json
{
  "searchableAttributes": ["title", "author", "tags", "content"],
  "filterableAttributes": ["dynasty", "tags", "author"],
  "displayedAttributes": [
    "id",
    "title",
    "author",
    "dynasty",
    "tags",
    "content",
    "translation",
    "about",
    "appreciation"
  ],
  "sortableAttributes": []
}
```

### 2. 配置 poets 索引

```bash
curl -X PATCH "http://127.0.0.1:7700/indexes/poets/settings" \
  -H "Authorization: Bearer YOUR_MASTER_KEY" \
  -H "Content-Type: application/json" \
  -d @poets_settings.json
```

`poets_settings.json` 内容：

```json
{
  "searchableAttributes": ["name", "description", "content", "dynasty"],
  "filterableAttributes": ["dynasty"],
  "displayedAttributes": ["id", "name", "dynasty", "description", "content", "avatar"],
  "sortableAttributes": []
}
```

### 3. 等待索引完成

配置后，Meilisearch 会自动处理索引任务。可以查看任务状态：

```bash
# 查看 poetry 索引任务
curl "http://127.0.0.1:7700/tasks?indexUids=poetry&limit=5" \
  -H "Authorization: Bearer YOUR_MASTER_KEY"

# 查看 poets 索引任务
curl "http://127.0.0.1:7700/tasks?indexUids=poets&limit=5" \
  -H "Authorization: Bearer YOUR_MASTER_KEY"
```

---

## 验证导入

### 1. 检查索引统计

```bash
# 检查 poetry 索引
curl "http://127.0.0.1:7700/indexes/poetry/stats" \
  -H "Authorization: Bearer YOUR_MASTER_KEY"

# 检查 poets 索引
curl "http://127.0.0.1:7700/indexes/poets/stats" \
  -H "Authorization: Bearer YOUR_MASTER_KEY"
```

应该返回类似：

```json
{
  "numberOfDocuments": 12345,
  "isIndexing": false,
  "fieldDistribution": {...}
}
```

### 2. 测试搜索

```bash
# 搜索诗歌
curl "http://127.0.0.1:7700/indexes/poetry/search?q=李白" \
  -H "Authorization: Bearer YOUR_MASTER_KEY"

# 搜索诗人
curl "http://127.0.0.1:7700/indexes/poets/search?q=李白" \
  -H "Authorization: Bearer YOUR_MASTER_KEY"
```

### 3. 测试后端 API

```bash
# 测试随机诗句
curl http://your-server/api/poetry/random-line

# 测试搜索
curl "http://your-server/api/search/poetry?q=李白"
```

---

## 常见问题

### 1. Meilisearch 连接失败

**症状**：导入脚本报错 "MeiliSearch 连接失败"

**解决方案**：
```bash
# 检查服务状态
sudo systemctl status meilisearch

# 检查端口是否监听
sudo netstat -tlnp | grep 7700
# 或
sudo ss -tlnp | grep 7700

# 查看日志
sudo journalctl -u meilisearch -n 50

# 手动测试连接
curl http://127.0.0.1:7700/health
```

### 2. API Key 认证失败

**症状**：返回 401 Unauthorized

**解决方案**：
- 检查 `backend/.env` 中的 `MEILI_API_KEY` 是否与 Meilisearch 启动时的 `--master-key` 一致
- 检查环境变量是否正确传递

### 3. 导入数据时超时

**症状**：curl 请求超时或连接中断

**解决方案**：
- 使用自动化脚本（脚本内部已经处理了批量导入和重试机制）
- 如果使用分片格式，脚本会逐个导入，避免单次请求过大

### 4. 索引任务一直处于 processing 状态

**症状**：导入后，索引任务长时间处于 processing

**解决方案**：
- 检查服务器资源（CPU、内存）使用情况
- 查看 Meilisearch 日志：`sudo journalctl -u meilisearch -f`
- 等待一段时间，大数据量索引需要较长时间

### 5. 数据文件路径错误

**症状**：脚本报错 "数据文件不存在"

**解决方案**：
- 检查数据文件是否在正确位置：`ls -lh data/*.ndjson`
- 修改脚本中的 `PROJECT_DIR` 和 `DATA_DIR` 变量
- 确保有读取权限：`chmod 644 data/*.ndjson`

### 6. 索引设置未生效

**症状**：搜索行为不符合预期

**解决方案**：
- 确认已应用索引设置（参考"配置索引设置"章节）
- 等待索引任务完成后再测试
- 检查设置是否正确：`curl "http://127.0.0.1:7700/indexes/poetry/settings" -H "Authorization: Bearer YOUR_MASTER_KEY"`

---

## 快速参考

### 常用命令

```bash
# 查看 Meilisearch 状态
sudo systemctl status meilisearch

# 重启 Meilisearch
sudo systemctl restart meilisearch

# 查看日志
sudo journalctl -u meilisearch -f

# 查看索引统计
curl "http://127.0.0.1:7700/indexes/poetry/stats" \
  -H "Authorization: Bearer YOUR_MASTER_KEY"

# 搜索测试
curl "http://127.0.0.1:7700/indexes/poetry/search?q=李白" \
  -H "Authorization: Bearer YOUR_MASTER_KEY"
```

### 文件路径

- 项目根目录：`/var/www/yinxin`（默认）
- 数据目录：`/var/www/yinxin/data`
- Meilisearch 数据：`/var/lib/meilisearch`
- 配置文件：`/etc/systemd/system/meilisearch.service`

---

## 下一步

数据导入完成后：

1. **配置后端**：确保 `backend/.env` 中的 Meilisearch 配置正确
2. **配置前端**：确保 `frontend/.env` 中的 API 地址正确
3. **测试功能**：测试搜索、随机诗句等功能
4. **监控服务**：定期检查 Meilisearch 服务状态和日志

更多部署信息请参考：
- [DEPLOY.md](./DEPLOY.md) - 完整部署指南
- [UPDATE.md](./UPDATE.md) - 更新指南

