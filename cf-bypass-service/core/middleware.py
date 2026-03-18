"""
Middleware Architecture for CF Bypass Service
Provides composable middleware system for request processing, caching, monitoring, etc.
"""

import asyncio
import time
import logging
import jwt
from typing import Dict, List, Optional, Any, Callable, Awaitable, TypeVar, Generic
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

TInput = TypeVar('TInput')
TOutput = TypeVar('TOutput')


@dataclass
class MiddlewareContext:
    """Context passed between middleware components"""
    request_id: str
    start_time: datetime
    metadata: Dict[str, Any] = field(default_factory=dict)
    user_context: Optional['UserContext'] = None


@dataclass
class UserContext:
    """User authentication context"""
    user_id: str
    roles: List[str] = field(default_factory=list)
    permissions: List[str] = field(default_factory=list)
    session_id: Optional[str] = None


class MiddlewareError(Exception):
    """Middleware-specific errors"""
    pass


class MiddlewareResult(Generic[TOutput]):
    """Result wrapper for middleware operations"""
    def __init__(self, value: TOutput, context: MiddlewareContext):
        self.value = value
        self.context = context

    @classmethod
    def success(cls, value: TOutput, context: MiddlewareContext) -> 'MiddlewareResult[TOutput]':
        return cls(value, context)

    @classmethod
    def error(cls, error: Exception) -> 'MiddlewareResult[TOutput]':
        raise error


class Middleware(ABC, Generic[TInput, TOutput]):
    """Base middleware interface"""

    def __init__(self, name: str, priority: int = 100, enabled: bool = True):
        self._name = name
        self._priority = priority
        self._enabled = enabled

    @property
    def name(self) -> str:
        return self._name

    @property
    def priority(self) -> int:
        return self._priority

    @property
    def enabled(self) -> bool:
        return self._enabled

    @abstractmethod
    async def process(self, input_data: TInput, context: MiddlewareContext) -> MiddlewareResult[TOutput]:
        """Process input data and return result"""
        pass

    def enable(self) -> None:
        """Enable middleware"""
        self._enabled = True

    def disable(self) -> None:
        """Disable middleware"""
        self._enabled = False


class MiddlewareChain(Generic[TInput, TOutput]):
    """Chain of middleware components"""

    def __init__(self):
        self._middlewares: List[Middleware[TInput, Any]] = []
        self._final_processor: Optional[Callable[[TInput, MiddlewareContext], Awaitable[TOutput]]] = None

    def add_middleware(self, middleware: Middleware[TInput, Any]) -> 'MiddlewareChain[TInput, TOutput]':
        """Add middleware to chain"""
        self._middlewares.append(middleware)
        # Sort by priority (lower numbers first)
        self._middlewares.sort(key=lambda m: m.priority)
        return self

    def set_final_processor(self, processor: Callable[[TInput, MiddlewareContext], Awaitable[TOutput]]) -> 'MiddlewareChain[TInput, TOutput]':
        """Set the final processor that handles the actual business logic"""
        self._final_processor = processor
        return self

    async def execute(self, input_data: TInput, context: Optional[MiddlewareContext] = None) -> TOutput:
        """Execute the middleware chain"""
        if context is None:
            context = MiddlewareContext(
                request_id=f"req_{int(time.time() * 1000000)}",
                start_time=datetime.now()
            )

        # Execute enabled middleware
        current_data = input_data
        for middleware in self._middlewares:
            if middleware.enabled:
                try:
                    result = await middleware.process(current_data, context)
                    current_data = result.value
                    context = result.context
                except Exception as e:
                    logger.error(f"Middleware {middleware.name} failed: {e}")
                    raise MiddlewareError(f"Middleware {middleware.name} failed") from e

        # Execute final processor
        if self._final_processor:
            return await self._final_processor(current_data, context)
        else:
            # If no final processor, return the processed data
            return current_data  # type: ignore


# ===== Specific Middleware Implementations =====

class AuthenticationMiddleware(Middleware[Dict[str, Any], Dict[str, Any]]):
    """Authentication middleware"""

    def __init__(self, jwt_secret: str):
        super().__init__("authentication", priority=10)
        self.jwt_secret = jwt_secret

    async def process(self, input_data: Dict[str, Any], context: MiddlewareContext) -> MiddlewareResult[Dict[str, Any]]:
        # Extract token from headers
        headers = input_data.get('headers', {})
        auth_header = headers.get('Authorization', headers.get('authorization', ''))

        if not auth_header.startswith('Bearer '):
            raise MiddlewareError("Missing or invalid authorization header")

        token = auth_header[7:]  # Remove 'Bearer ' prefix

        try:
            # Validate JWT token
            payload = jwt.decode(
                token,
                self.jwt_secret,
                algorithms=['HS256'],
                options={
                    'verify_signature': True,
                    'verify_exp': True,
                    'verify_iat': True,
                }
            )

            # Extract user information from payload
            user_id = payload.get('sub')
            if not user_id:
                raise MiddlewareError("Invalid token: missing user ID")

            roles = payload.get('roles', ['user'])
            permissions = payload.get('permissions', ['read'])
            session_id = payload.get('session_id')

            # Create user context
            user_context = UserContext(
                user_id=user_id,
                roles=roles,
                permissions=permissions,
                session_id=session_id
            )

            context.user_context = user_context
            context.metadata['authenticated'] = True
            context.metadata['user_id'] = user_id
            context.metadata['token_exp'] = payload.get('exp')

            return MiddlewareResult.success(input_data, context)

        except jwt.ExpiredSignatureError:
            raise MiddlewareError("Token has expired")
        except jwt.InvalidTokenError as e:
            raise MiddlewareError(f"Invalid token: {str(e)}")
        except Exception as e:
            logger.error(f"JWT validation error: {e}")
            raise MiddlewareError("Authentication failed")


class LoggingMiddleware(Middleware[TInput, TOutput]):
    """Logging middleware"""

    def __init__(self):
        super().__init__("logging", priority=1)  # Very high priority

    async def process(self, input_data: TInput, context: MiddlewareContext) -> MiddlewareResult[TInput]:
        # Log request
        logger.info(f"[{context.request_id}] Request: {type(input_data).__name__}")

        # Add timing metadata
        start_time = time.time()
        context.metadata['start_time'] = start_time

        # Return input unchanged - this middleware only observes
        return MiddlewareResult.success(input_data, context)


class MetricsMiddleware(Middleware[TInput, TOutput]):
    """Metrics collection middleware"""

    def __init__(self):
        super().__init__("metrics", priority=5)
        self._counters: Dict[str, int] = {}
        self._histograms: Dict[str, List[float]] = {}

    async def process(self, input_data: TInput, context: MiddlewareContext) -> MiddlewareResult[TInput]:
        operation = context.metadata.get('operation', 'unknown')

        # Increment request counter
        counter_key = f"{operation}_requests"
        self._counters[counter_key] = self._counters.get(counter_key, 0) + 1

        # Record in context for response metrics
        context.metadata['metrics_start'] = time.time()
        context.metadata['operation'] = operation

        return MiddlewareResult.success(input_data, context)

    def record_response_time(self, operation: str, duration: float) -> None:
        """Record response time (called by response middleware)"""
        if operation not in self._histograms:
            self._histograms[operation] = []
        self._histograms[operation].append(duration)

        # Keep only last 1000 measurements
        if len(self._histograms[operation]) > 1000:
            self._histograms[operation] = self._histograms[operation][-1000:]

    def get_metrics(self) -> Dict[str, Any]:
        """Get collected metrics"""
        return {
            'counters': self._counters.copy(),
            'histograms': {
                name: {
                    'count': len(values),
                    'avg': sum(values) / len(values) if values else 0,
                    'min': min(values) if values else 0,
                    'max': max(values) if values else 0
                }
                for name, values in self._histograms.items()
            }
        }


class CachingMiddleware(Middleware[Dict[str, Any], Dict[str, Any]]):
    """Caching middleware"""

    def __init__(self, cache_backend: 'CacheBackend', ttl_seconds: int = 300):
        super().__init__("caching", priority=20)
        self.cache = cache_backend
        self.ttl = ttl_seconds

    async def process(self, input_data: Dict[str, Any], context: MiddlewareContext) -> MiddlewareResult[Dict[str, Any]]:
        # Generate cache key
        cache_key = self._generate_cache_key(input_data)

        # Try to get from cache first
        cached_result = await self.cache.get(cache_key)
        if cached_result is not None:
            context.metadata['cache_hit'] = True
            context.metadata['cache_key'] = cache_key

            # Return cached result directly (skip rest of pipeline)
            # This would need special handling in the chain
            pass

        # Add cache key to context for response caching
        context.metadata['cache_key'] = cache_key
        context.metadata['cache_hit'] = False

        return MiddlewareResult.success(input_data, context)

    def _generate_cache_key(self, input_data: Dict[str, Any]) -> str:
        """Generate cache key from input data"""
        import hashlib
        import json

        # Create a stable representation
        key_data = {
            k: v for k, v in input_data.items()
            if k not in ['timestamp', 'request_id']  # Exclude volatile fields
        }

        key_str = json.dumps(key_data, sort_keys=True, default=str)
        return hashlib.md5(key_str.encode()).hexdigest()


class RateLimitMiddleware(Middleware[TInput, TOutput]):
    """Rate limiting middleware"""

    def __init__(self, requests_per_minute: int = 60):
        super().__init__("rate_limit", priority=15)
        self.requests_per_minute = requests_per_minute
        self._request_times: List[float] = []
        self._lock = asyncio.Lock()

    async def process(self, input_data: TInput, context: MiddlewareContext) -> MiddlewareResult[TInput]:
        async with self._lock:
            now = time.time()
            window_start = now - 60  # 1 minute window

            # Remove old requests outside the window
            self._request_times = [t for t in self._request_times if t > window_start]

            # Check rate limit
            if len(self._request_times) >= self.requests_per_minute:
                raise MiddlewareError(f"Rate limit exceeded: {self.requests_per_minute} requests per minute")

            # Record this request
            self._request_times.append(now)
            context.metadata['rate_limit_remaining'] = self.requests_per_minute - len(self._request_times)

            return MiddlewareResult.success(input_data, context)


# ===== Middleware Builder =====

class MiddlewareBuilder(Generic[TInput, TOutput]):
    """Builder for creating middleware pipelines"""

    def __init__(self):
        self.chain = MiddlewareChain[TInput, TOutput]()

    def with_authentication(self, jwt_secret: str) -> 'MiddlewareBuilder[TInput, TOutput]':
        """Add authentication middleware"""
        self.chain.add_middleware(AuthenticationMiddleware(jwt_secret))
        return self

    def with_logging(self) -> 'MiddlewareBuilder[TInput, TOutput]':
        """Add logging middleware"""
        self.chain.add_middleware(LoggingMiddleware())
        return self

    def with_metrics(self) -> 'MiddlewareBuilder[TInput, TOutput]':
        """Add metrics middleware"""
        self.chain.add_middleware(MetricsMiddleware())
        return self

    def with_caching(self, cache_backend: 'CacheBackend', ttl: int = 300) -> 'MiddlewareBuilder[TInput, TOutput]':
        """Add caching middleware"""
        self.chain.add_middleware(CachingMiddleware(cache_backend, ttl))
        return self

    def with_rate_limit(self, requests_per_minute: int = 60) -> 'MiddlewareBuilder[TInput, TOutput]':
        """Add rate limiting middleware"""
        self.chain.add_middleware(RateLimitMiddleware(requests_per_minute))
        return self

    def with_custom(self, middleware: Middleware[TInput, Any]) -> 'MiddlewareBuilder[TInput, TOutput]':
        """Add custom middleware"""
        self.chain.add_middleware(middleware)
        return self

    def with_final_processor(self, processor: Callable[[TInput, MiddlewareContext], Awaitable[TOutput]]) -> 'MiddlewareBuilder[TInput, TOutput]':
        """Set final processor"""
        self.chain.set_final_processor(processor)
        return self

    def build(self) -> MiddlewareChain[TInput, TOutput]:
        """Build the middleware chain"""
        return self.chain


# ===== Usage Examples =====

def create_bypass_request_pipeline(jwt_secret: str, cache_backend: 'CacheBackend') -> MiddlewareChain[Dict[str, Any], Dict[str, Any]]:
    """Create middleware pipeline for bypass requests"""
    return (MiddlewareBuilder[Dict[str, Any], Dict[str, Any]]()
            .with_authentication(jwt_secret)
            .with_rate_limit(100)  # 100 requests per minute
            .with_logging()
            .with_metrics()
            .with_caching(cache_backend, ttl=600)  # 10 minutes TTL
            .build())


def create_health_check_pipeline() -> MiddlewareChain[Dict[str, Any], Dict[str, Any]]:
    """Create middleware pipeline for health checks"""
    return (MiddlewareBuilder[Dict[str, Any], Dict[str, Any]]()
            .with_logging()
            .with_metrics()
            .build())


# ===== Mock Cache Backend for Example =====

class CacheBackend(ABC):
    """Abstract cache backend interface"""

    @abstractmethod
    async def get(self, key: str) -> Optional[Any]:
        pass

    @abstractmethod
    async def set(self, key: str, value: Any, ttl: int) -> None:
        pass

    @abstractmethod
    async def delete(self, key: str) -> bool:
        pass

    @abstractmethod
    async def clear(self) -> None:
        pass


class MemoryCacheBackend(CacheBackend):
    """Simple in-memory cache backend for testing"""

    def __init__(self):
        self._cache: Dict[str, Dict[str, Any]] = {}

    async def get(self, key: str) -> Optional[Any]:
        entry = self._cache.get(key)
        if entry:
            if time.time() < entry['expires']:
                return entry['value']
            else:
                # Expired, remove it
                del self._cache[key]
        return None

    async def set(self, key: str, value: Any, ttl: int) -> None:
        self._cache[key] = {
            'value': value,
            'expires': time.time() + ttl
        }

    async def delete(self, key: str) -> bool:
        if key in self._cache:
            del self._cache[key]
            return True
        return False

    async def clear(self) -> None:
        self._cache.clear()


if __name__ == "__main__":
    # Example usage
    async def example_processor(data: Dict[str, Any], context: MiddlewareContext) -> Dict[str, Any]:
        print(f"Processing request {context.request_id}")
        data['processed'] = True
        data['processing_time'] = time.time() - context.start_time.timestamp()
        return data

    async def main():
        # Create pipeline
        cache = MemoryCacheBackend()
        pipeline = (MiddlewareBuilder[Dict[str, Any], Dict[str, Any]]()
                   .with_logging()
                   .with_metrics()
                   .with_final_processor(example_processor)
                   .build())

        # Execute request
        request_data = {
            'url': 'https://example.com',
            'method': 'GET',
            'headers': {'User-Agent': 'test'}
        }

        result = await pipeline.execute(request_data)
        print(f"Result: {result}")

    asyncio.run(main())