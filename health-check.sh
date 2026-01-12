#!/bin/bash

# Nexus Reader 健康检查

NEXUS_PORT=${NEXUS_PORT:-8080}
CF_BYPASS_PORT=${CF_BYPASS_PORT:-8001}

echo "🏥 健康检查"
echo "==========="

# 检查服务
check() {
    if curl -sf --max-time 3 "http://localhost:$2$3" >/dev/null; then
        echo "✅ $1"
    else
        echo "❌ $1"
        return 1
    fi
}

check "API服务" "$NEXUS_PORT" "/api/health"
check "CF绕过" "$CF_BYPASS_PORT" "/health"
docker exec nexus-redis redis-cli ping >/dev/null 2>&1 && echo "✅ Redis" || echo "❌ Redis"