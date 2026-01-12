#!/bin/bash
# 项目清理脚本

echo "🧹 清理项目..."

# 清理临时文件
find . -name "*.tmp" -o -name "*.bak" -o -name "*~" | grep -v node_modules | xargs rm -f 2>/dev/null

# 清理 Python 缓存
find . -name "__pycache__" -type d | grep -v node_modules | xargs rm -rf 2>/dev/null
find . -name "*.pyc" | grep -v node_modules | xargs rm -f 2>/dev/null

# 清理系统文件
find . -name ".DS_Store" -delete 2>/dev/null

# 清理测试产物
rm -rf nexus-reader/test-results/ nexus-reader/coverage/ 2>/dev/null

echo "✅ 清理完成"
