# Reader NAS 部署指南

## 快速开始

```bash
# 在项目根目录运行
docker compose -f reader-rs/docker-compose.yml build
docker compose -f reader-rs/docker-compose.yml up -d
```

## 访问地址

- Reader: `http://your-nas-ip:8080`
- Flaresolverr (调试): `http://your-nas-ip:8191` (需取消 compose 中的端口映射注释)

## 包含服务

| 服务 | 说明 | 端口 |
|------|------|------|
| reader-rs | Rust 后端 + Vue 前端 | 8080 |
| flaresolverr | Cloudflare 绕过服务 | 8191 (内部) |

## 数据持久化

数据存储在 Docker Volume `reader-data` 中，包含：
- `/app/storage/data` - 数据库和用户数据
- `/app/storage/cache` - 缓存文件

## 更新镜像

```bash
docker compose -f reader-rs/docker-compose.yml pull
docker compose -f reader-rs/docker-compose.yml up -d
```

## 查看日志

```bash
# 所有服务日志
docker compose -f reader-rs/docker-compose.yml logs -f

# 仅 reader-rs
docker logs -f reader-rs

# 仅 flaresolverr
docker logs -f flaresolverr
```

## 停止服务

```bash
docker compose -f reader-rs/docker-compose.yml down
```

## 完全删除（包括数据）

```bash
docker compose -f reader-rs/docker-compose.yml down -v
```
