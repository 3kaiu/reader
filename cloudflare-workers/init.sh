#!/bin/bash

# 初始化脚本 - 自动创建 KV 命名空间

echo "🔧 初始化 Cloudflare Workers 环境..."

# 创建 KV 命名空间
create_kv() {
    local name=$1
    local title=$2

    echo "创建 $title KV 命名空间..."
    local result=$(wrangler kv:namespace create "$name" --title "$title" 2>&1)

    if echo "$result" | grep -q "already exists"; then
        echo "✅ $title 已存在"
    elif echo "$result" | grep -q "created"; then
        echo "✅ $title 创建成功"
    else
        echo "❌ 创建 $title 失败"
        echo "$result"
        exit 1
    fi
}

create_kv "DECODER_KV" "Decoder Data Store"
create_kv "AI_CACHE_KV" "AI Results Cache"
create_kv "CONTENT_CACHE_KV" "Content Cache"
create_kv "PROGRESS_KV" "User Progress Store"

echo ""
echo "🎉 初始化完成！"
echo ""
echo "请更新 wrangler.toml 中的 KV ID："
echo "1. 运行: wrangler kv:namespace list"
echo "2. 复制对应的 ID 到 wrangler.toml"
echo "3. 然后运行: ./deploy.sh"