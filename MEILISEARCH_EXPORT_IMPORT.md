# Meilisearch 数据导出和导入教程

本教程介绍如何将本地 Meilisearch 的数据导出，并传输到服务器上导入。

## 概述

当你对本地 Meilisearch 数据进行了修改，需要将这些修改同步到服务器时，可以使用本教程提供的脚本进行数据导出和导入。

**导出脚本**：`export-meilisearch-data.js` - 在本地运行，导出所有索引的数据和设置

**导入脚本**：`import-meilisearch-export.js` - 在服务器上运行，导入导出的数据

## 第一步：在本地导出数据

### 1.1 准备环境变量

确保你的本地 Meilisearch 正在运行，并准备好 API 密钥。

**Windows (CMD):**
```bash
set MEILI_HOST=http://127.0.0.1:7700
set MEILI_API_KEY=你的本地密钥
```

**Windows (PowerShell):**
```powershell
$env:MEILI_HOST="http://127.0.0.1:7700"
$env:MEILI_API_KEY="你的本地密钥"
```

**Linux/Mac:**
```bash
export MEILI_HOST=http://127.0.0.1:7700
export MEILI_API_KEY=你的本地密钥
```

> 提示：你也可以在项目根目录创建 `.env` 文件，脚本会自动读取。

### 1.2 运行导出脚本

```bash
node export-meilisearch-data.js
```

### 1.3 导出结果

脚本会在项目根目录创建 `meilisearch-export` 文件夹，包含：

- `export-info.json` - 导出信息（索引列表、导出时间等）
- `{索引名}.ndjson` - 每个索引的数据文件（NDJSON 格式）
- `{索引名}_settings.json` - 每个索引的设置文件（主键、搜索配置等）

例如：
```
meilisearch-export/
├── export-info.json
├── poetry.ndjson
├── poetry_settings.json
├── poets.ndjson
└── poets_settings.json
```

### 1.4 验证导出结果

检查导出目录和文件大小：
```bash
# Windows
dir meilisearch-export

# Linux/Mac
ls -lh meilisearch-export
```

查看导出信息：
```bash
# Windows
type meilisearch-export\export-info.json

# Linux/Mac
cat meilisearch-export/export-info.json
```

## 第二步：打包并传输到服务器

### 2.1 打包导出目录

**Windows (使用 Git Bash 或 WSL):**
```bash
tar -czf meilisearch-export.tar.gz meilisearch-export/
```

**Windows (使用 PowerShell 7+):**
```powershell
Compress-Archive -Path meilisearch-export -DestinationPath meilisearch-export.zip
```

**Linux/Mac:**
```bash
tar -czf meilisearch-export.tar.gz meilisearch-export/
```

### 2.2 传输到服务器

使用 `scp` 命令：
```bash
scp meilisearch-export.tar.gz user@your-server:/var/www/yinxin/
```

或使用 FTP/SFTP 工具（如 FileZilla、WinSCP）上传文件。

### 2.3 在服务器上解压

SSH 登录到服务器后：
```bash
cd /var/www/yinxin
tar -xzf meilisearch-export.tar.gz
```

如果使用的是 zip 文件：
```bash
unzip meilisearch-export.zip
```

## 第三步：在服务器上导入数据

### 3.1 准备环境变量

确保服务器上的 Meilisearch 正在运行，并准备好 API 密钥。

```bash
export MEILI_HOST=http://127.0.0.1:7700
export MEILI_API_KEY=你的服务器密钥
```

> 注意：服务器的 `MEILI_API_KEY` 必须与服务器上 Meilisearch 启动时使用的 `--master-key` 一致。

### 3.2 运行导入脚本

```bash
node import-meilisearch-export.js meilisearch-export
```

如果导出目录在当前目录，也可以直接运行：
```bash
node import-meilisearch-export.js
```

### 3.3 导入过程

脚本会自动执行以下操作：

1. **测试连接** - 验证 Meilisearch 连接是否正常
2. **读取导出信息** - 从 `export-info.json` 读取索引列表
3. **创建索引** - 如果索引不存在，自动创建
4. **恢复设置** - 恢复每个索引的设置（主键、搜索配置等）
5. **导入数据** - 批量导入所有文档
6. **等待处理** - 等待 Meilisearch 完成索引处理
7. **显示统计** - 显示最终导入结果

### 3.4 验证导入结果

导入完成后，脚本会显示每个索引的文档数量。你也可以手动检查：

```bash
# 检查索引统计
curl "http://127.0.0.1:7700/indexes/poetry/stats" \
  -H "Authorization: Bearer $MEILI_API_KEY"

curl "http://127.0.0.1:7700/indexes/poets/stats" \
  -H "Authorization: Bearer $MEILI_API_KEY"

# 查看任务状态
curl "http://127.0.0.1:7700/tasks?limit=10" \
  -H "Authorization: Bearer $MEILI_API_KEY"
```

## 脚本详细说明

### export-meilisearch-data.js

**功能：**
- 连接到本地 Meilisearch 实例
- 获取所有索引列表
- 导出每个索引的所有文档（NDJSON 格式）
- 导出每个索引的设置（主键、搜索配置等）
- 生成导出信息文件

**环境变量：**
- `MEILI_HOST` - Meilisearch 主机地址（默认：`http://127.0.0.1:7700`）
- `MEILI_API_KEY` - Meilisearch API 密钥（必需）
- `EXPORT_DIR` - 导出目录（默认：`./meilisearch-export`）

**输出：**
- `{索引名}.ndjson` - 索引数据文件
- `{索引名}_settings.json` - 索引设置文件
- `export-info.json` - 导出元信息

### import-meilisearch-export.js

**功能：**
- 连接到服务器 Meilisearch 实例
- 读取导出信息文件
- 自动创建不存在的索引
- 恢复索引设置
- 批量导入文档数据
- 等待索引处理完成
- 显示导入统计

**环境变量：**
- `MEILI_HOST` - Meilisearch 主机地址（默认：`http://127.0.0.1:7700`）
- `MEILI_API_KEY` - Meilisearch API 密钥（必需）
- `EXPORT_DIR` - 导出目录（默认：`./meilisearch-export`）

**命令行参数：**
- 第一个参数：导出目录路径（可选，默认使用 `EXPORT_DIR` 环境变量）

## 常见问题

### Q1: 导出时提示 "MEILI_API_KEY 未设置"

**解决方案：**
确保设置了环境变量或 `.env` 文件中有配置：
```bash
export MEILI_API_KEY=你的密钥
```

### Q2: 连接失败

**可能原因：**
- Meilisearch 服务未启动
- `MEILI_HOST` 地址不正确
- API 密钥错误

**解决方案：**
```bash
# 检查 Meilisearch 是否运行
# Windows
netstat -an | findstr 7700

# Linux
sudo systemctl status meilisearch
# 或
curl http://127.0.0.1:7700/health
```

### Q3: 导入时提示索引已存在

脚本会自动清空已存在的索引数据，然后导入新数据。如果遇到问题，可以手动删除索引：

```bash
curl -X DELETE "http://127.0.0.1:7700/indexes/{索引名}" \
  -H "Authorization: Bearer $MEILI_API_KEY"
```

### Q4: 导入后文档数量不匹配

**可能原因：**
- 导入过程中网络中断
- Meilisearch 处理任务失败

**解决方案：**
1. 检查任务状态：
```bash
curl "http://127.0.0.1:7700/tasks?limit=10" \
  -H "Authorization: Bearer $MEILI_API_KEY"
```

2. 查看 Meilisearch 日志：
```bash
# Linux
sudo journalctl -u meilisearch -n 50
```

3. 重新运行导入脚本（脚本会自动清空旧数据）

### Q5: 大文件导入很慢

**说明：**
这是正常现象。Meilisearch 需要时间处理索引。脚本会显示进度，并在导入完成后等待所有任务处理完成。

**建议：**
- 保持网络连接稳定
- 确保服务器有足够的内存和 CPU
- 耐心等待，不要中断脚本

### Q6: 如何只导出/导入特定索引？

目前脚本会导出/导入所有索引。如果需要只处理特定索引，可以：

1. 运行完整导出
2. 手动删除不需要的索引文件
3. 修改 `export-info.json`，只保留需要的索引信息
4. 运行导入脚本

## 注意事项

1. **备份数据**：在导入前，建议备份服务器上的现有数据
2. **API 密钥**：确保本地和服务器使用正确的 API 密钥
3. **版本兼容**：确保本地和服务器上的 Meilisearch 版本兼容
4. **磁盘空间**：确保有足够的磁盘空间存储导出文件
5. **网络稳定**：传输和导入过程中保持网络连接稳定

## 完整示例

### 本地导出（Windows）

```bash
# 1. 设置环境变量
set MEILI_HOST=http://127.0.0.1:7700
set MEILI_API_KEY=h-gRKMpBUukHrLcBpCSoNyM2pPLEIs4F5JVLZrBtwnI

# 2. 运行导出
node export-meilisearch-data.js

# 3. 打包（使用 Git Bash）
tar -czf meilisearch-export.tar.gz meilisearch-export/

# 4. 上传到服务器
scp meilisearch-export.tar.gz user@server:/var/www/yinxin/
```

### 服务器导入（Linux）

```bash
# 1. SSH 登录服务器
ssh user@server

# 2. 进入项目目录
cd /var/www/yinxin

# 3. 解压文件
tar -xzf meilisearch-export.tar.gz

# 4. 设置环境变量
export MEILI_HOST=http://127.0.0.1:7700
export MEILI_API_KEY=服务器密钥

# 5. 运行导入
node import-meilisearch-export.js meilisearch-export

# 6. 验证结果
curl "http://127.0.0.1:7700/indexes/poetry/stats" \
  -H "Authorization: Bearer $MEILI_API_KEY"
```

## 相关文件

- `export-meilisearch-data.js` - 导出脚本
- `import-meilisearch-export.js` - 导入脚本
- `import-data-simple.js` - 简单导入脚本（用于初始数据导入）
- `DEPLOY.md` - 服务器部署文档

