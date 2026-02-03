"""
CF Bypass Service - 领域层 (Domain Layer)

这是CF Bypass服务的核心领域层，负责反爬虫业务逻辑。
该领域包含以下核心概念：
- 绕过任务 (BypassTask): Cloudflare绕过任务
- 绕过策略 (BypassStrategy): 反检测策略
- 验证结果 (VerificationResult): 绕过验证结果
- 代理池 (ProxyPool): 代理IP管理
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Dict, List, Optional, Any, Protocol
import uuid
import hashlib


# ===== 领域基础类 =====

class Entity:
    """领域实体基类"""

    def __init__(self, entity_id: str):
        self.id = entity_id
        self.version = 0
        self.created_at = datetime.now()
        self.updated_at = datetime.now()

    def increment_version(self):
        """增加版本号"""
        self.version += 1
        self.updated_at = datetime.now()


class AggregateRoot(Entity):
    """聚合根基类"""

    def __init__(self, aggregate_id: str):
        super().__init__(aggregate_id)
        self._uncommitted_events: List[DomainEvent] = []

    def add_domain_event(self, event: 'DomainEvent'):
        """添加领域事件"""
        self._uncommitted_events.append(event)

    def get_uncommitted_events(self) -> List['DomainEvent']:
        """获取未提交的领域事件"""
        return self._uncommitted_events.copy()

    def clear_uncommitted_events(self):
        """清除未提交的领域事件"""
        self._uncommitted_events.clear()


class ValueObject:
    """值对象基类"""
    pass


class DomainService(ABC):
    """领域服务接口"""

    @property
    @abstractmethod
    def name(self) -> str:
        """服务名称"""
        pass

    @abstractmethod
    async def execute(self, context: 'DomainContext') -> 'DomainResult':
        """执行领域服务逻辑"""
        pass


# ===== 领域事件 =====

@dataclass
class DomainEvent:
    """领域事件基类"""
    event_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    event_type: str = ""
    timestamp: datetime = field(default_factory=datetime.now)
    aggregate_id: str = ""
    event_data: Dict[str, Any] = field(default_factory=dict)

    def __post_init__(self):
        if not self.event_type:
            self.event_type = self.__class__.__name__


class BypassTaskCreatedEvent(DomainEvent):
    """绕过任务创建事件"""
    def __init__(self, task_id: str, url: str, strategy: str):
        super().__init__(
            aggregate_id=task_id,
            event_data={
                'task_id': task_id,
                'url': url,
                'strategy': strategy
            }
        )


class BypassTaskCompletedEvent(DomainEvent):
    """绕过任务完成事件"""
    def __init__(self, task_id: str, success: bool, duration_ms: int):
        super().__init__(
            aggregate_id=task_id,
            event_data={
                'task_id': task_id,
                'success': success,
                'duration_ms': duration_ms
            }
        )


class ProxyValidatedEvent(DomainEvent):
    """代理验证事件"""
    def __init__(self, proxy_id: str, is_valid: bool, response_time_ms: int):
        super().__init__(
            aggregate_id=proxy_id,
            event_data={
                'proxy_id': proxy_id,
                'is_valid': is_valid,
                'response_time_ms': response_time_ms
            }
        )


# ===== 领域上下文 =====

@dataclass
class DomainContext:
    """领域上下文"""
    user_id: Optional[str] = None
    session_id: Optional[str] = None
    correlation_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: datetime = field(default_factory=datetime.now)
    metadata: Dict[str, Any] = field(default_factory=dict)


# ===== 领域结果 =====

@dataclass
class DomainResult:
    """领域操作结果"""
    success: bool
    data: Optional[Any] = None
    events: List[DomainEvent] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
    execution_time_ms: int = 0


# ===== 领域错误 =====

class DomainError(Exception):
    """领域错误基类"""
    pass


class ValidationError(DomainError):
    """验证错误"""
    pass


class BusinessLogicError(DomainError):
    """业务逻辑错误"""
    pass


class NotFoundError(DomainError):
    """未找到错误"""
    pass


class ConflictError(DomainError):
    """冲突错误"""
    pass


# ===== 业务规则验证器 =====

class BusinessRuleValidator(ABC):
    """业务规则验证器接口"""

    @property
    @abstractmethod
    def rule_name(self) -> str:
        """规则名称"""
        pass

    @abstractmethod
    async def validate(self, entity, context: DomainContext) -> None:
        """验证业务规则"""
        pass

    @property
    @abstractmethod
    def description(self) -> str:
        """规则描述"""
        pass


# ===== 核心领域实体 =====

class BypassTaskStatus(Enum):
    """绕过任务状态"""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class BypassStrategy(Enum):
    """绕过策略"""
    NONE = "none"
    USER_AGENT_ROTATION = "user_agent_rotation"
    DELAY = "delay"
    PROXY = "proxy"
    CLOUDFLARE_BYPASS = "cloudflare_bypass"
    ADVANCED = "advanced"


@dataclass
class BypassTask(AggregateRoot):
    """绕过任务聚合根"""

    url: str
    method: str = "GET"
    headers: Dict[str, str] = field(default_factory=dict)
    body: Optional[str] = None
    timeout_ms: int = 30000
    strategy: BypassStrategy = BypassStrategy.NONE
    proxy: Optional[str] = None
    retry_count: int = 0
    max_retries: int = 3
    status: BypassTaskStatus = BypassTaskStatus.PENDING
    result: Optional['BypassResult'] = None

    def __post_init__(self):
        super().__init__(str(uuid.uuid4()))

    def start(self):
        """启动任务"""
        if self.status == BypassTaskStatus.PENDING:
            self.status = BypassTaskStatus.RUNNING
            self.add_domain_event(BypassTaskCreatedEvent(
                task_id=self.id,
                url=self.url,
                strategy=self.strategy.value
            ))

    def complete(self, result: 'BypassResult'):
        """完成任务"""
        self.status = BypassTaskStatus.COMPLETED if result.success else BypassTaskStatus.FAILED
        self.result = result

        self.add_domain_event(BypassTaskCompletedEvent(
            task_id=self.id,
            success=result.success,
            duration_ms=result.duration_ms
        ))

    def can_retry(self) -> bool:
        """检查是否可以重试"""
        return self.retry_count < self.max_retries

    def increment_retry(self):
        """增加重试次数"""
        if self.can_retry():
            self.retry_count += 1
        else:
            self.status = BypassTaskStatus.FAILED


@dataclass
class BypassResult(ValueObject):
    """绕过结果值对象"""

    success: bool
    status_code: Optional[int]
    response_headers: Dict[str, str] = field(default_factory=dict)
    response_body: Optional[str] = None
    response_size_bytes: int = 0
    duration_ms: int = 0
    error_message: Optional[str] = None
    verification_passed: bool = False
    cf_challenge_detected: bool = False
    cf_challenge_solved: bool = False


@dataclass
class ProxyInfo(ValueObject):
    """代理信息值对象"""

    host: str
    port: int
    protocol: str = "http"
    username: Optional[str] = None
    password: Optional[str] = None
    country: Optional[str] = None
    response_time_ms: Optional[int] = None
    last_checked: Optional[datetime] = None
    is_working: bool = True
    failure_count: int = 0

    @property
    def url(self) -> str:
        """获取代理URL"""
        auth = ""
        if self.username and self.password:
            auth = f"{self.username}:{self.password}@"

        return f"{self.protocol}://{auth}{self.host}:{self.port}"


@dataclass
class ProxyPool(AggregateRoot):
    """代理池聚合根"""

    name: str
    proxies: List[ProxyInfo] = field(default_factory=list)
    max_size: int = 100
    validation_interval_minutes: int = 30
    last_validation: Optional[datetime] = None

    def __post_init__(self):
        super().__init__(str(uuid.uuid4()))

    def add_proxy(self, proxy: ProxyInfo):
        """添加代理"""
        if len(self.proxies) < self.max_size:
            self.proxies.append(proxy)
            self.increment_version()

    def remove_proxy(self, proxy_url: str):
        """移除代理"""
        self.proxies = [p for p in self.proxies if p.url != proxy_url]
        self.increment_version()

    def get_working_proxies(self) -> List[ProxyInfo]:
        """获取可用的代理"""
        return [p for p in self.proxies if p.is_working]

    def mark_proxy_failed(self, proxy_url: str):
        """标记代理失败"""
        for proxy in self.proxies:
            if proxy.url == proxy_url:
                proxy.is_working = False
                proxy.failure_count += 1
                proxy.last_checked = datetime.now()
                break

    def mark_proxy_success(self, proxy_url: str, response_time_ms: int):
        """标记代理成功"""
        for proxy in self.proxies:
            if proxy.url == proxy_url:
                proxy.is_working = True
                proxy.response_time_ms = response_time_ms
                proxy.last_checked = datetime.now()
                proxy.failure_count = 0
                break


# ===== 领域服务 =====

class BypassTaskService(DomainService):
    """绕过任务服务"""

    @property
    def name(self) -> str:
        return "bypass_task_service"

    async def execute(self, context: DomainContext) -> DomainResult:
        """执行绕过任务逻辑"""
        # 这里实现具体的绕过逻辑
        # 为了简化，这里返回成功结果

        return DomainResult(
            success=True,
            data={"message": "Bypass task executed"},
            events=[],
            metadata=context.metadata,
            execution_time_ms=150
        )


class ProxyValidationService(DomainService):
    """代理验证服务"""

    @property
    def name(self) -> str:
        return "proxy_validation_service"

    async def execute(self, context: DomainContext) -> DomainResult:
        """执行代理验证逻辑"""
        # 这里实现代理验证逻辑
        # 为了简化，这里返回成功结果

        return DomainResult(
            success=True,
            data={"message": "Proxy validation executed"},
            events=[],
            metadata=context.metadata,
            execution_time_ms=200
        )


# ===== 业务规则 =====

class BypassTaskUrlValidRule(BusinessRuleValidator):
    """绕过任务URL验证规则"""

    @property
    def rule_name(self) -> str:
        return "bypass_task_url_valid"

    async def validate(self, entity: BypassTask, context: DomainContext) -> None:
        if not entity.url or not entity.url.strip():
            raise ValidationError("Bypass task URL cannot be empty")

        if not entity.url.startswith(('http://', 'https://')):
            raise ValidationError("Bypass task URL must start with http:// or https://")

    @property
    def description(self) -> str:
        return "Ensures that bypass task URL is valid"


class ProxyPoolSizeValidRule(BusinessRuleValidator):
    """代理池大小验证规则"""

    @property
    def rule_name(self) -> str:
        return "proxy_pool_size_valid"

    async def validate(self, entity: ProxyPool, context: DomainContext) -> None:
        if len(entity.proxies) > entity.max_size:
            raise ValidationError(f"Proxy pool size exceeds maximum limit of {entity.max_size}")

    @property
    def description(self) -> str:
        return "Ensures that proxy pool size is within limits"


# ===== 仓库接口 =====

class BypassTaskRepository(Protocol):
    """绕过任务仓库接口"""

    async def save(self, task: BypassTask) -> None:
        """保存绕过任务"""
        ...

    async def find_by_id(self, task_id: str) -> Optional[BypassTask]:
        """根据ID查找绕过任务"""
        ...

    async def find_by_status(self, status: BypassTaskStatus, limit: int = 50) -> List[BypassTask]:
        """根据状态查找绕过任务"""
        ...

    async def delete(self, task_id: str) -> None:
        """删除绕过任务"""
        ...


class ProxyPoolRepository(Protocol):
    """代理池仓库接口"""

    async def save(self, pool: ProxyPool) -> None:
        """保存代理池"""
        ...

    async def find_by_id(self, pool_id: str) -> Optional[ProxyPool]:
        """根据ID查找代理池"""
        ...

    async def find_by_name(self, name: str) -> Optional[ProxyPool]:
        """根据名称查找代理池"""
        ...

    async def find_all(self, limit: int = 50) -> List[ProxyPool]:
        """查找所有代理池"""
        ...

    async def delete(self, pool_id: str) -> None:
        """删除代理池"""
        ...


# ===== 内存实现 =====

class InMemoryBypassTaskRepository:
    """内存实现的绕过任务仓库"""

    def __init__(self):
        self.tasks: Dict[str, BypassTask] = {}

    async def save(self, task: BypassTask) -> None:
        self.tasks[task.id] = task

    async def find_by_id(self, task_id: str) -> Optional[BypassTask]:
        return self.tasks.get(task_id)

    async def find_by_status(self, status: BypassTaskStatus, limit: int = 50) -> List[BypassTask]:
        return [task for task in self.tasks.values()
                if task.status == status][:limit]

    async def delete(self, task_id: str) -> None:
        self.tasks.pop(task_id, None)


class InMemoryProxyPoolRepository:
    """内存实现的代理池仓库"""

    def __init__(self):
        self.pools: Dict[str, ProxyPool] = {}

    async def save(self, pool: ProxyPool) -> None:
        self.pools[pool.id] = pool

    async def find_by_id(self, pool_id: str) -> Optional[ProxyPool]:
        return self.pools.get(pool_id)

    async def find_by_name(self, name: str) -> Optional[ProxyPool]:
        return next((pool for pool in self.pools.values()
                    if pool.name == name), None)

    async def find_all(self, limit: int = 50) -> List[ProxyPool]:
        return list(self.pools.values())[:limit]

    async def delete(self, pool_id: str) -> None:
        self.pools.pop(pool_id, None)


# ===== 领域层初始化 =====

class BypassDomainLayer:
    """CF Bypass领域层"""

    def __init__(self):
        self.task_repository: BypassTaskRepository = InMemoryBypassTaskRepository()
        self.pool_repository: ProxyPoolRepository = InMemoryProxyPoolRepository()
        self.domain_services = [
            BypassTaskService(),
            ProxyValidationService(),
        ]
        self.business_rules = [
            BypassTaskUrlValidRule(),
            ProxyPoolSizeValidRule(),
        ]

    async def handle_command(self, command: 'BypassCommand') -> DomainResult:
        """处理领域命令"""
        # 这里实现命令处理逻辑
        # 为了简化，返回成功结果
        return DomainResult(
            success=True,
            data={"command": command.__class__.__name__},
            events=[],
            metadata={},
            execution_time_ms=50
        )

    async def handle_query(self, query: 'BypassQuery') -> DomainResult:
        """处理领域查询"""
        # 这里实现查询处理逻辑
        # 为了简化，返回成功结果
        return DomainResult(
            success=True,
            data={"query": query.__class__.__name__},
            events=[],
            metadata={},
            execution_time_ms=30
        )


# ===== 应用层接口 =====

@dataclass
class BypassCommand:
    """绕过命令基类"""
    pass


@dataclass
class BypassQuery:
    """绕过查询基类"""
    pass


# ===== 全局初始化函数 =====

_bypass_domain_layer: Optional[BypassDomainLayer] = None

def get_bypass_domain_layer() -> BypassDomainLayer:
    """获取全局CF Bypass领域层实例"""
    global _bypass_domain_layer
    if _bypass_domain_layer is None:
        _bypass_domain_layer = BypassDomainLayer()
    return _bypass_domain_layer