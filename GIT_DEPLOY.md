# 使用 Git 更新代码（不使用 Docker）

本文档说明如何在不使用 Docker 的情况下，使用 Git 来更新和部署代码。

## 方式一：手动 Git Pull + 更新脚本（最简单）

### 1. 本地提交代码

```bash
git add .
git commit -m "更新说明"
git push origin main
```

### 2. 在服务器上更新

```bash
# 进入项目目录
cd /path/to/yinxin

# 运行更新脚本
./update-git.sh
```

更新脚本会自动：
- ✅ 备份数据库
- ✅ 拉取最新代码
- ✅ 安装新依赖
- ✅ 重新构建前后端
- ✅ 重启服务（如果使用 PM2）

### 3. 验证更新

```bash
# 检查后端服务
pm2 status
pm2 logs yinxin-backend

# 测试 API
curl http://localhost:3000/api/health
```

## 方式二：纯 Git 命令（最基础）

如果不想使用脚本，可以直接执行以下命令：

### 更新后端

```bash
cd /path/to/yinxin

# 拉取代码
git pull

# 更新后端
cd backend
npm install
npm run build
pm2 restart yinxin-backend  # 或使用其他进程管理器

# 更新前端
cd ../frontend
npm install
npm run build
sudo cp -r dist/* /var/www/html/  # 或你的 Web 服务器目录
```

## 方式三：Git Hooks 自动部署（最自动化）

设置 Git Hook，实现推送代码后自动部署。

### 1. 在服务器上设置 Git Hook

```bash
# 进入项目目录
cd /path/to/yinxin

# 创建 post-receive hook
cat > .git/hooks/post-receive << 'EOF'
#!/bin/bash
cd /path/to/yinxin
git pull
cd backend && npm install && npm run build && pm2 restart yinxin-backend
cd ../frontend && npm install && npm run build && sudo cp -r dist/* /var/www/html/
EOF

chmod +x .git/hooks/post-receive
```

### 2. 在本地配置 Git Remote

```bash
# 添加服务器作为 remote
git remote add production user@server:/path/to/yinxin

# 推送代码（会自动触发部署）
git push production main
```

### 3. 使用提供的脚本设置

```bash
# 在服务器上运行
./setup-git-deploy.sh /path/to/yinxin
```

## 方式四：使用 Git + SSH（推荐用于生产环境）

### 1. 配置 SSH 密钥

```bash
# 在本地生成 SSH 密钥（如果还没有）
ssh-keygen -t rsa -b 4096

# 复制公钥到服务器
ssh-copy-id user@server
```

### 2. 在服务器上创建裸仓库

```bash
# 在服务器上
cd /var/repos
git clone --bare /path/to/yinxin yinxin.git

# 设置 post-receive hook
cat > yinxin.git/hooks/post-receive << 'EOF'
#!/bin/bash
WORK_TREE=/var/www/yinxin
GIT_DIR=/var/repos/yinxin.git
cd $WORK_TREE
git --git-dir=$GIT_DIR --work-tree=$WORK_TREE pull origin main

# 更新后端
cd $WORK_TREE/backend
npm install
npm run build
pm2 restart yinxin-backend

# 更新前端
cd $WORK_TREE/frontend
npm install
npm run build
sudo cp -r dist/* /var/www/html/
EOF

chmod +x yinxin.git/hooks/post-receive
```

### 3. 在本地配置

```bash
# 添加 remote
git remote add production user@server:/var/repos/yinxin.git

# 推送代码
git push production main
```

## 快速更新命令（一行）

如果已经配置好环境，可以使用这些快速命令：

### 最简单的方式

```bash
# 在服务器项目目录
git pull && cd backend && npm install && npm run build && pm2 restart yinxin-backend && cd ../frontend && npm install && npm run build && sudo cp -r dist/* /var/www/html/
```

### 使用脚本

```bash
# Linux/Mac
./update-git.sh

# Windows
.\update-git.ps1
```

## 更新流程对比

| 方式              | 优点                   | 缺点                 | 适用场景           |
| ----------------- | ---------------------- | -------------------- | ------------------ |
| **手动 Git Pull** | 简单直接，完全控制     | 需要手动执行多个命令 | 偶尔更新，学习阶段 |
| **更新脚本**      | 自动化，一键更新       | 需要 SSH 到服务器    | 定期更新，小团队   |
| **Git Hooks**     | 完全自动化，推送即部署 | 设置较复杂           | 频繁更新，生产环境 |
| **裸仓库 + Hook** | 最专业，支持多环境     | 配置最复杂           | 大型项目，多环境   |

## 常见问题

### Q: 更新后服务无法启动怎么办？

A: 
1. 查看日志：`pm2 logs yinxin-backend`
2. 检查环境变量是否正确
3. 检查依赖是否安装成功：`npm list`
4. 回滚代码：`git reset --hard HEAD~1`

### Q: 如何只更新前端或后端？

A: 
```bash
# 只更新后端
git pull
cd backend && npm install && npm run build && pm2 restart yinxin-backend

# 只更新前端
git pull
cd frontend && npm install && npm run build && sudo cp -r dist/* /var/www/html/
```

### Q: 更新时如何避免服务中断？

A: 
1. 使用 PM2 的 graceful reload：`pm2 reload yinxin-backend`
2. 使用 Nginx 的负载均衡（如果有多个实例）
3. 在低峰期更新

### Q: 如何回滚到之前的版本？

A: 
```bash
# 查看提交历史
git log --oneline

# 回滚到指定版本
git reset --hard <commit-hash>

# 重新构建和部署
./update-git.sh
```

### Q: 更新时数据库会丢失吗？

A: 不会。数据库文件 `backend/data/app.db` 不会被 Git 跟踪，更新代码不会影响数据库。但建议更新前备份。

### Q: 如何查看更新日志？

A: 
```bash
# Git 提交历史
git log --oneline -10

# PM2 日志
pm2 logs yinxin-backend --lines 100
```

## 最佳实践

1. **更新前备份**
   ```bash
   cp backend/data/app.db backend/data/app.db.backup.$(date +%Y%m%d)
   ```

2. **测试环境验证**
   - 先在测试环境验证更新
   - 确认无误后再更新生产环境

3. **使用分支管理**
   ```bash
   # 创建更新分支
   git checkout -b update-20250101
   # 测试后合并到 main
   git checkout main
   git merge update-20250101
   ```

4. **监控服务状态**
   ```bash
   # 更新后立即检查
   pm2 status
   curl http://localhost:3000/api/health
   ```

5. **记录更新内容**
   - 在 Git commit 中详细说明更新内容
   - 记录可能影响的功能

## 与 Docker 方式的对比

| 特性           | Git 方式           | Docker 方式          |
| -------------- | ------------------ | -------------------- |
| **更新速度**   | 快（只需构建）     | 较慢（需要构建镜像） |
| **资源占用**   | 低                 | 较高                 |
| **环境一致性** | 需要手动保证       | 自动保证             |
| **回滚难度**   | 简单               | 中等                 |
| **学习曲线**   | 低                 | 中等                 |
| **适用场景**   | 单服务器，简单部署 | 多服务器，复杂环境   |

## 总结

对于大多数情况，**推荐使用方式一（更新脚本）**：
- ✅ 简单易用
- ✅ 自动化程度高
- ✅ 容易理解和维护
- ✅ 适合个人项目和小团队

如果更新频繁，可以考虑**方式三（Git Hooks）**，实现完全自动化部署。

