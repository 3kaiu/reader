# Nexus Reader - 项目维护指南

## 🧹 项目清理

### 自动清理脚本

运行清理脚本来移除临时文件、构建产物和其他不必要的文件：

```bash
./scripts/cleanup.sh
```

### 手动清理命令

#### Rust 构建产物
```bash
cd nexus-lite
cargo clean
```

#### Python 缓存文件
```bash
find . -name "*.pyc" -delete
find . -name "__pycache__" -type d -exec rm -rf {} +
```

#### Node.js 清理
```bash
cd nexus-reader
rm -rf node_modules
rm -rf dist
rm -rf coverage
bun install  # 或 npm install
```

#### 临时文件
```bash
find . -name "*.tmp" -delete
find . -name "*.log" -delete
find . -name ".DS_Store" -delete
```

## 📁 文件结构说明

### 应该被忽略的文件类型

- **环境配置文件**: `.env*` (除了 `.env.example`)
- **构建产物**: `target/`, `dist/`, `build/`, `out/`
- **依赖目录**: `node_modules/`, `.venv/`, `__pycache__/`
- **临时文件**: `*.tmp`, `*.log`, `*.bak`, `*~`
- **系统文件**: `.DS_Store`, `Thumbs.db`
- **IDE 配置**: `.idea/`, `.vscode/` (部分)
- **测试产物**: `coverage/`, `test-results/`

### 重要的配置文件

- `.gitignore` - Git 忽略规则
- `.env.example` - 环境变量模板
- `nexus-lite/nexus-server/config.json` - 服务器配置（安全）
- `fnos-config.env` - 飞牛OS配置

## 🔒 安全注意事项

### 敏感文件管理

1. **永远不要提交包含真实密钥的环境文件**
   - ✅ 提交: `.env.example`
   - ❌ 提交: `.env`, `.env.production`, `.env.local`

2. **API 密钥和令牌**
   - 使用环境变量或密钥管理服务
   - 定期轮换 API 密钥
   - 使用最小权限原则

3. **配置文件检查**
   ```bash
   # 检查是否有敏感信息泄露
   git log --all --full-history -- .env*
   git log --all --full-history -- *config.json
   ```

## 📊 磁盘空间优化

### 大文件检查
```bash
# 查找大于 10MB 的文件
find . -type f -size +10M -not -path "./node_modules/*" -not -path "./.git/*"

# 查看目录大小
du -sh */ | sort -hr
```

### 定期清理建议

1. **每周清理**:
   - 运行 `./scripts/cleanup.sh`
   - 清理 Docker 镜像: `docker system prune`

2. **每月清理**:
   - 重新安装依赖: `rm -rf node_modules && bun install`
   - 清理 Rust 缓存: `cargo clean`

3. **发布前清理**:
   - 确保所有测试通过
   - 运行完整清理脚本
   - 检查 `.gitignore` 规则

## 🔧 开发环境设置

### 环境变量配置

1. 复制环境变量模板:
   ```bash
   cp .env.example .env
   ```

2. 填入实际配置值（不要提交到 Git）

3. 验证配置:
   ```bash
   # 检查环境变量是否正确加载
   node -e "console.log(process.env.NODE_ENV)"
   ```

### IDE 配置

推荐的 VS Code 设置已包含在 `.vscode/settings.json` 中，包括：
- 自动格式化
- 文件排除规则
- 调试配置

## 📈 监控和维护

### 文件大小监控
```bash
# 监控项目总大小
du -sh .

# 监控各子目录大小
du -sh */ | sort -hr | head -10
```

### Git 仓库健康检查
```bash
# 检查仓库大小
git count-objects -vH

# 检查大文件
git rev-list --objects --all | git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)' | awk '/^blob/ {print substr($0,6)}' | sort --numeric-sort --key=2 | tail -10
```

## 🚀 部署前检查清单

- [ ] 运行清理脚本
- [ ] 确保没有敏感信息在代码中
- [ ] 所有测试通过
- [ ] 构建成功
- [ ] 环境变量正确配置
- [ ] `.gitignore` 规则完整
- [ ] 文档更新

---

**注意**: 定期维护项目清洁度有助于：
- 减少仓库大小
- 提高构建速度
- 避免敏感信息泄露
- 改善开发体验