#!/bin/bash

# =============================================================================
# Nexus Reader 健康检查脚本
# =============================================================================

# 获取端口配置
NEXUS_PORT=${NEXUS_PORT:-8080}
CF_BYPASS_PORT=${CF_BYPASS_PORT:-8000}

# 健康检查函数
check_service() {
    local service_name=$1
    local port=$2
    local endpoint=$3
    
    if curl -f -s --max-time 5 "http://localhost:$port$endpoint" >/dev/null 2>&1; then
        echo "✅ $service_name"
        return 0
    else
        echo "❌ $service_name"
        return 1
    fi
}

# 检查Redis
check_redis() {
    if docker exec nexus-redis redis-cli ping >/dev/null 2>&1; then
        echo "✅ Redis"
        return 0
    else
        echo "❌ Redis"
        return 1
    fi
}

echo "🏥 Nexus Reader 健康检查"
echo "========================"

# 检查各个服务
all_healthy=true

check_service "主应用" "$NEXUS_PORT" "/health" || all_healthy=false
check_service "CF绕过服务" "$CF_BYPASS_PORT" "/health" || all_healthy=false
check_redis || all_healthy=false

echo "========================"

if [ "$all_healthy" = true ]; then
    echo "🎉 所有服务运行正常"
    exit 0
else
    echo "⚠️  部分服务存在问题"
    echo ""
    echo "建议操作："
    echo "  1. 查看日志: make logs"
    echo "  2. 查看状态: make status"
    echo "  3. 重启服务: make restart"
    exit 1
fi