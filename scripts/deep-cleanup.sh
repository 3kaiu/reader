#!/bin/bash

# =============================================================================
# Nexus Reader 深度清理脚本
# =============================================================================
# 功能：
# 1. 清理 Rust 构建产物（target/）
# 2. 清理前端缓存和构建产物
# 3. 清理日志文件
# 4. 清理空目录
# =============================================================================

set -e

echo "🧹 Nexus Reader 深度清理脚本"
echo "============================"
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 统计清理前的大小
echo "📊 统计清理前的大小..."
BEFORE_SIZE=0

if [ -d "nexus-lite/target" ]; then
  TARGET_SIZE=$(du -sm nexus-lite/target 2>/dev/null | cut -f1)
  BEFORE_SIZE=$((BEFORE_SIZE + TARGET_SIZE))
  echo "  Rust target/: ${TARGET_SIZE}MB"
fi

if [ -d "nexus-reader/dist" ]; then
  DIST_SIZE=$(du -sm nexus-reader/dist 2>/dev/null | cut -f1)
  BEFORE_SIZE=$((BEFORE_SIZE + DIST_SIZE))
  echo "  Frontend dist/: ${DIST_SIZE}MB"
fi

if [ -d "nexus-reader/node_modules/.cache" ]; then
  CACHE_SIZE=$(du -sm nexus-reader/node_modules/.cache 2>/dev/null | cut -f1)
  BEFORE_SIZE=$((BEFORE_SIZE + CACHE_SIZE))
  echo "  Node cache: ${CACHE_SIZE}MB"
fi

echo ""
echo "总计: ${BEFORE_SIZE}MB"
echo ""

# 询问用户确认
read -p "是否继续清理？(y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "❌ 取消清理"
  exit 0
fi

echo ""

# 1. 清理 Rust 构建产物
if [ -d "nexus-lite" ]; then
  echo "📦 清理 Rust 构建产物..."
  cd nexus-lite
  if command -v cargo &> /dev/null; then
    cargo clean
    echo -e "${GREEN}✓${NC} Rust target/ 已清理"
  else
    echo -e "${YELLOW}⚠${NC} cargo 未安装，跳过"
  fi
  cd ..
else
  echo -e "${YELLOW}⚠${NC} nexus-lite 目录不存在，跳过"
fi

# 2. 清理前端缓存
if [ -d "nexus-reader" ]; then
  echo "🗑️  清理前端缓存..."
  cd nexus-reader
  
  # 清理构建产物
  if [ -d "dist" ]; then
    rm -rf dist/
    echo -e "${GREEN}✓${NC} dist/ 已清理"
  fi
  
  # 清理 node_modules 缓存
  if [ -d "node_modules/.cache" ]; then
    rm -rf node_modules/.cache/
    echo -e "${GREEN}✓${NC} node_modules/.cache/ 已清理"
  fi
  
  # 清理 rsbuild 缓存
  if [ -d ".rsbuild" ]; then
    rm -rf .rsbuild/
    echo -e "${GREEN}✓${NC} .rsbuild/ 已清理"
  fi
  
  # 清理测试结果
  if [ -d "test-results" ]; then
    rm -rf test-results/
    echo -e "${GREEN}✓${NC} test-results/ 已清理"
  fi
  
  cd ..
else
  echo -e "${YELLOW}⚠${NC} nexus-reader 目录不存在，跳过"
fi

# 3. 清理空目录
echo "📁 清理空目录..."
if [ -d "cache" ] && [ -z "$(ls -A cache)" ]; then
  rm -rf cache/
  echo -e "${GREEN}✓${NC} cache/ 已清理"
fi

if [ -d "nexus-lite/cache" ] && [ -z "$(ls -A nexus-lite/cache)" ]; then
  rm -rf nexus-lite/cache/
  echo -e "${GREEN}✓${NC} nexus-lite/cache/ 已清理"
fi

if [ -d "nexus-reader/src/stubs" ] && [ -z "$(ls -A nexus-reader/src/stubs)" ]; then
  rm -rf nexus-reader/src/stubs/
  echo -e "${GREEN}✓${NC} nexus-reader/src/stubs/ 已清理"
fi

# 4. 清理日志文件
echo "📝 清理日志文件..."
LOG_COUNT=$(find . -name "*.log" -type f 2>/dev/null | wc -l | tr -d ' ')
if [ "$LOG_COUNT" -gt 0 ]; then
  find . -name "*.log" -type f -delete 2>/dev/null
  echo -e "${GREEN}✓${NC} 已清理 ${LOG_COUNT} 个日志文件"
else
  echo "  无日志文件需要清理"
fi

# 5. 清理 Python 缓存
if [ -d "cf-bypass-service" ]; then
  echo "🐍 清理 Python 缓存..."
  find cf-bypass-service -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
  find cf-bypass-service -type f -name "*.pyc" -delete 2>/dev/null || true
  echo -e "${GREEN}✓${NC} Python 缓存已清理"
fi

echo ""
echo "✅ 清理完成！"
echo ""

# 统计清理后的效果
AFTER_SIZE=0

if [ -d "nexus-lite/target" ]; then
  TARGET_SIZE=$(du -sm nexus-lite/target 2>/dev/null | cut -f1)
  AFTER_SIZE=$((AFTER_SIZE + TARGET_SIZE))
fi

if [ -d "nexus-reader/dist" ]; then
  DIST_SIZE=$(du -sm nexus-reader/dist 2>/dev/null | cut -f1)
  AFTER_SIZE=$((AFTER_SIZE + DIST_SIZE))
fi

FREED_SIZE=$((BEFORE_SIZE - AFTER_SIZE))

echo "📊 清理统计："
echo "  清理前: ${BEFORE_SIZE}MB"
echo "  清理后: ${AFTER_SIZE}MB"
echo -e "  ${GREEN}释放空间: ${FREED_SIZE}MB${NC}"
echo ""
echo "💡 提示："
echo "  - 运行 'cargo build --release' 重新构建 Rust 项目"
echo "  - 运行 'npm run build' 重新构建前端项目"
echo ""
