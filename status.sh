#!/bin/bash

# Nexus Reader 状态检查

echo "📊 服务状态"
docker compose -f docker-compose.fnos.yml ps 2>/dev/null || echo "服务未运行"

echo ""
echo "📈 资源使用"
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}" 2>/dev/null | head -5

echo ""
echo "🌐 访问地址"
IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")
echo "  API: http://$IP:${NEXUS_PORT:-8080}"
echo "  前端: https://nexus-reader.pages.dev"
