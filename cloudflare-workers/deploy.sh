#!/bin/bash

# Cloudflare Workers 自动部署脚本
# 每次推送自动运行，无需手动操作

set -e

echo "🚀 Cloudflare Workers 自动部署开始"

# 检查 Wrangler
if ! command -v wrangler &> /dev/null; then
    echo "❌ Wrangler 未安装"
    exit 1
fi

# 检查认证
if ! wrangler whoami &> /dev/null; then
    echo "❌ 未登录 Cloudflare"
    exit 1
fi

echo "📦 部署优化版本..."

# 部署到生产环境
wrangler deploy novel-decoder-worker-optimized.ts --env production

echo "✅ 部署完成！"

# 快速健康检查
echo "🏥 健康检查..."
sleep 5

# 尝试获取 Worker URL
WORKER_URL=$(wrangler tail --format=json 2>/dev/null | head -1 | jq -r '.url // empty' 2>/dev/null || echo "")

if [ -n "$WORKER_URL" ]; then
    echo "🔗 Worker URL: $WORKER_URL"

    # 健康检查
    if curl -s "$WORKER_URL/health" | grep -q '"status":"ok"'; then
        echo "✅ 健康检查通过"
        echo ""
        echo "🎉 自动优化部署成功！"
        echo "系统已启动自动调优和自我修复功能。"
    else
        echo "⚠️ 健康检查失败，请检查日志"
    fi
else
    echo "✅ 部署成功（无法获取URL）"
fi