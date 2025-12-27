# 吟心项目

## 本地开发

启动方式：

前端：

```
npm run dev
```

后端

```
npm run dev
```

Meilisearch

```
meilisearch.exe --http-addr 127.0.0.1:7700 --master-key h-gRKMpBUukHrLcBpCSoNyM2pPLEIs4F5JVLZrBtwnI
```

## 服务器部署

详细的服务器部署教程请查看：[DEPLOY.md](./DEPLOY.md)

部署步骤概览：
1. 从 Git 仓库拉取代码
2. 安装 Meilisearch
3. 配置环境变量
4. 导入数据
5. 部署后端和前端服务