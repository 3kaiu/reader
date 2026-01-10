#!/bin/bash

# =============================================================================
# Nexus Reader 飞牛OS 状态检查脚本
# =============================================================================

echo "🔍 Nexus Reader 服务状态检查"
echo "=================================="

# 检查Docker是否运行
if ! docker info >/dev/null 2>&1; then
    echo "❌ Docker 未运行或无权限访问"
    exit 1
fi

# 检查服务状态
echo "📊 容器状态："
docker-compose -f docker-compose.fnos.yml ps

echo ""
echo "📈 资源使用情况："
docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}" 2>/dev/null || echo "无运行中的容器"

echo ""
echo "🌐 网络连接测试："

# 获取端口配置
NEXUS_PORT=${NEXUS_PORT:-8080}
CF_BYPASS_PORT=${CF_BYPASS_PORT:-8000}

# 测试主应用
if curl -f -s "http://localhost:$NEXUS_PORT/health" >/dev/null 2>&1; then
    echo "✅ 主应用 (端口 $NEXUS_PORT): 正常"
else
    echo "❌ 主应用 (端口 $NEXUS_PORT): 无法访问"
fi

# 测试CF绕过服务
if curl -f -s "http://localhost:$CF_BYPASS_PORT/health" >/dev/null 2>&1; then
    echo "✅ CF绕过服务 (端口 $CF_BYPASS_PORT): 正常"
else
    echo "❌ CF绕过服务 (端口 $CF_BYPASS_PORT): 无法访问"
fi

# 测试Redis
if docker exec nexus-redis redis-cli ping >/dev/null 2>&1; then
    echo "✅ Redis: 正常"
else
    echo "❌ Redis: 无法访问"
fi

echo ""
echo "💾 数据目录状态："
if [ -d "data" ]; then
    echo "✅ 数据目录存在"
    du -sh data/* 2>/dev/null | sed 's/^/  /'
else
    echo "❌ 数据目录不存在"
fi

echo ""
echo "🖥️  系统信息："
echo "  架构: $(uname -m)"
echo "  内核: $(uname -r)"
echo "  内存: $(free -h | awk 'NR==2{printf "%.1f/%.1fGB (%.0f%%)", $3/1024/1024, $2/1024/1024, $3*100/$2}')"
echo "  磁盘: $(df -h . | awk 'NR==2{printf "%s/%s (%s)", $3, $2, $5}')"

# 获取本机IP
IP=$(hostname -I | awk '{print $1}')
echo ""
echo "🌐 访问地址："
echo "  📚 主应用: http://$IP:$NEXUS_PORT"
echo "  🔧 CF绕过: http://$IP:$CF_BYPASS_PORT"

echo ""
echo "=================================="