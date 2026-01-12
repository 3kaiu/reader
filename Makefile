.PHONY: help start stop restart status logs update clean dev

help:
	@echo "Nexus Reader 管理命令"
	@echo ""
	@echo "本地开发:"
	@echo "  dev       - 启动前端开发服务器"
	@echo "  build     - 构建前端"
	@echo ""
	@echo "Docker 服务:"
	@echo "  start     - 启动后端服务"
	@echo "  stop      - 停止服务"
	@echo "  restart   - 重启服务"
	@echo "  status    - 查看状态"
	@echo "  logs      - 查看日志"
	@echo "  update    - 更新镜像"
	@echo "  clean     - 清理资源"

# 前端开发
dev:
	@cd nexus-reader && bun run dev

build:
	@cd nexus-reader && bun run build

# Docker 服务管理
start:
	@mkdir -p data/{nexus,cache,logs,cf-bypass,redis}
	@docker compose -f docker-compose.fnos.yml up -d
	@echo "✅ 后端服务已启动: http://localhost:8080"
	@echo "🌐 前端访问: https://nexus-reader.pages.dev"

stop:
	@docker compose -f docker-compose.fnos.yml down

restart:
	@docker compose -f docker-compose.fnos.yml restart

status:
	@docker compose -f docker-compose.fnos.yml ps

logs:
	@docker compose -f docker-compose.fnos.yml logs -f

update:
	@docker compose -f docker-compose.fnos.yml pull
	@docker compose -f docker-compose.fnos.yml up -d
	@echo "✅ 服务已更新"

clean:
	@docker system prune -f
	@echo "✅ 已清理未使用的 Docker 资源"
