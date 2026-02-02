#!/bin/bash

# 检查部署状态和系统健康

echo "🔍 检查 Cloudflare Workers 部署状态"
echo "==================================="

# 检查认证
echo "🔐 检查认证状态..."
if ! wrangler whoami &> /dev/null; then
    echo "❌ 未登录 Cloudflare"
    echo "请运行: wrangler auth login"
    exit 1
fi
echo "✅ 已认证"

# 检查 wrangler.toml
echo ""
echo "📄 检查配置文件..."
if [ ! -f "wrangler.toml" ]; then
    echo "❌ wrangler.toml 不存在"
    exit 1
fi
echo "✅ 配置文件存在"

# 检查 KV 命名空间
echo ""
echo "🗄️ 检查 KV 命名空间..."
kv_check=$(wrangler kv:namespace list 2>/dev/null)
if [ $? -ne 0 ]; then
    echo "❌ 无法获取 KV 命名空间列表"
    exit 1
fi

required_kv=("Decoder Data Store" "AI Results Cache" "Content Cache" "User Progress Store")
for kv_title in "${required_kv[@]}"; do
    if echo "$kv_check" | jq -r '.[] | select(.title == "'$kv_title'") | .id' | grep -q .; then
        echo "✅ $kv_title 存在"
    else
        echo "❌ $kv_title 不存在"
        echo "请运行: ./init.sh"
        exit 1
    fi
done

# 检查部署状态
echo ""
echo "🚀 检查部署状态..."
deploy_check=$(wrangler deployments list 2>/dev/null | head -1)
if [ $? -eq 0 ] && [ -n "$deploy_check" ]; then
    echo "✅ 存在部署记录"
    echo "📊 最新部署: $deploy_check"
else
    echo "⚠️ 没有部署记录，建议运行部署"
fi

# 获取 Worker URL
echo ""
echo "🔗 获取 Worker URL..."
worker_url=$(wrangler tail --format=json 2>/dev/null | head -1 | jq -r '.url // empty' 2>/dev/null || echo "")

if [ -n "$worker_url" ]; then
    echo "🌐 Worker URL: $worker_url"

    # 健康检查
    echo ""
    echo "🏥 健康检查..."
    health_response=$(curl -s --max-time 10 "$worker_url/health" 2>/dev/null || echo "")

    if [ -n "$health_response" ] && echo "$health_response" | grep -q '"status":"ok"'; then
        echo "✅ 健康检查通过"

        # 获取性能指标
        echo ""
        echo "📊 性能指标..."
        metrics_response=$(curl -s --max-time 10 "$worker_url/metrics" 2>/dev/null || echo "{}")

        if [ -n "$metrics_response" ] && echo "$metrics_response" | jq -e '.performance' >/dev/null 2>&1; then
            health_score=$(echo "$metrics_response" | jq -r '.healthScore // "unknown"')
            total_requests=$(echo "$metrics_response" | jq -r '.performance | to_entries | map(.value.totalRequests) | add // 0')

            echo "🎯 健康评分: $health_score"
            echo "📈 总请求数: $total_requests"

            if [ "$health_score" != "unknown" ] && [ "$health_score" -gt 80 ]; then
                echo "✅ 系统运行良好"
            elif [ "$health_score" != "unknown" ] && [ "$health_score" -gt 60 ]; then
                echo "⚠️ 系统运行一般"
            else
                echo "❌ 系统需要优化"
            fi
        else
            echo "⚠️ 无法获取性能指标"
        fi
    else
        echo "❌ 健康检查失败"
        echo "响应: $health_response"
    fi
else
    echo "⚠️ 无法获取 Worker URL"
fi

echo ""
echo "🎉 状态检查完成！"