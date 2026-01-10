.PHONY: help setup start stop restart status logs update clean backup health

help:
	@echo "可用命令："
	@echo "  start     - 启动服务"
	@echo "  stop      - 停止服务"
	@echo "  restart   - 重启服务"
	@echo "  status    - 查看状态"
	@echo "  logs      - 查看日志"
	@echo "  update    - 更新服务"
	@echo "  clean     - 清理资源"
	@echo "  backup    - 备份数据"

# 初始化环境
setup:
	@mkdir -p data/{nexus,cache,logs,cf-bypass,redis}

# 启动服务
start: setup
	@docker-compose -f docker-compose.fnos.yml up -d
	@echo "服务已启动: http://localhost:8080"

# 停止服务
stop:
	@docker-compose -f docker-compose.fnos.yml down

# 重启服务
restart:
	@docker-compose -f docker-compose.fnos.yml restart

# 查看状态
status:
	@docker-compose -f docker-compose.fnos.yml ps

# 健康检查
health:
	@./health-check.sh

# 查看日志
logs:
	@docker-compose -f docker-compose.fnos.yml logs -f

# 更新服务
update:
	@docker-compose -f docker-compose.fnos.yml pull
	@docker-compose -f docker-compose.fnos.yml up -d

# 清理资源
clean:
	@docker system prune -f

# 备份数据
backup:
	@mkdir -p backup
	@tar -czf backup/backup-$(shell date +%Y%m%d-%H%M%S).tar.gz data/