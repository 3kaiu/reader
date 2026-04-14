# NexusLite 代码规范

## 命名规范

### 文件命名
- 模块文件：`snake_case.rs`
- 测试文件：`mod_name_test.rs`
- 文档文件：`snake_case.md`

### 模块命名
- 模块名：`snake_case`
- 类型名：`PascalCase`
- 函数名：`snake_case`
- 变量名：`snake_case`
- 常量名：`SCREAMING_SNAKE_CASE`
- 结构体字段：`snake_case`

### 接口命名
- Trait 名：`PascalCase`（如 `BookEngine`、`BookEngineRuntime`、`Fetcher`）
- 异步 trait：使用 `async_trait`
- trait 方法：`snake_case`

## 文档规范

### 模块文档
```rust
//! 模块描述
//!
//! # 功能说明
//! 详细描述模块功能
//!
//! # 使用示例
//! ```rust
//! use nexus_core::BookEngine;
//! ```
//!
//! # 性能考虑
//! - 使用连接池优化网络请求
//! - 使用缓存减少重复请求
```

### 函数文档
```rust
/// 函数简短描述
///
/// # 参数
///
/// * `param1` - 参数1说明
/// * `param2` - 参数2说明
///
/// # 返回
///
/// 返回值说明
///
/// # 示例
///
/// ```rust
/// let result = function_name(arg1, arg2);
/// ```
///
/// # 错误
///
/// 可能返回的错误类型和原因
async fn function_name(param1: Type, param2: Type) -> Result<ReturnType, ErrorType> {
    // 实现
}
```

## 错误处理规范

### 错误类型定义
```rust
use thiserror::Error;

#[derive(Debug, Error)]
pub enum EngineError {
    #[error("Network error: {0}")]
    Network(String),
    
    #[error("Parse error: {0}")]
    Parse(String),
    
    #[error("Cache error: {0}")]
    Cache(String),
    
    #[error("Not found: {0}")]
    NotFound(String),
}
```

### 错误处理
```rust
// 使用 Result<T, EngineError>
fn function() -> Result<(), EngineError> {
    // 实现
}

// 使用 ? 运算符
async fn async_function() -> Result<(), EngineError> {
    other_function().await?;
    Ok(())
}

// 使用 map_err 转换错误
async fn convert_error() -> Result<(), EngineError> {
    other_function().await.map_err(|e| EngineError::Other(e.to_string()))?;
    Ok(())
}
```

## 异步规范

### 异步 trait 定义
```rust
use async_trait::async_trait;

#[async_trait]
pub trait BookEngine: Send + Sync {
    async fn search(&self, query: &str) -> Result<Vec<BookItem>, EngineError>;
}
```

### 异步函数
```rust
use tokio::time::{sleep, Duration};

async fn fetch_with_retry(url: &str, max_retries: u32) -> Result<FetchResponse, EngineError> {
    let mut retries = 0;
    loop {
        match fetch_url(url).await {
            Ok(response) => return Ok(response),
            Err(e) if retries < max_retries => {
                retries += 1;
                sleep(Duration::from_secs(1)).await;
            }
            Err(e) => return Err(e),
        }
    }
}
```

## 代码组织规范

### 模块组织
```rust
// 1. 导入
use std::collections::HashMap;

// 2. 类型定义
pub struct MyStruct {
    field: Type,
}

// 3. impl 块
impl MyStruct {
    // 关联函数
    pub fn new() -> Self {
        // 实现
    }
    
    // 方法
    pub fn method(&self) -> Result<(), Error> {
        // 实现
    }
}

// 3. trait 定义
pub trait MyTrait {
    fn trait_method(&self) -> Result<(), Error>;
}

// 4. 测试模块
#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_function() {
        // 测试
    }
}
```

## 性能规范

### 使用缓存
```rust
// 使用 Arc 共享状态
use std::sync::Arc;

pub struct MyService {
    cache: Arc<MemoryCache<String, String>>,
}
```

### 使用连接池
```rust
// 使用连接池复用连接
pub struct HttpClient {
    pool: Arc<ConnectionPool>,
}
```

### 并行处理
```rust
// 使用 rayon 并行处理
use rayon::prelude::*;

fn parallel_process(items: Vec<Item>) -> Vec<Result> {
    items.into_par_iter()
        .map(|item| process_item(item))
        .collect()
}
```

## 安全规范

### 输入验证
```rust
use validator::Validate;

#[derive(Debug, Validate)]
pub struct SearchRequest {
    #[validate(length(min = 1, max = 100))]
    pub query: String,
    
    #[validate(range(min = 1, max = 100))]
    pub page: Option<u32>,
}
```

### URL 验证
```rust
pub fn validate_url(url: &str) -> Result<(), ValidationError> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err(ValidationError::new("URL must start with http:// or https://"));
    }
    Ok(())
}
```

### 内容过滤
```rust
use ammonia::clean;

pub fn sanitize_html(html: &str) -> String {
    let allowed_tags = vec!["p", "br", "strong", "em"];
    clean(html, &allowed_tags, &[])
}
```

## 测试规范

### 单元测试
```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_whitespace() {
        let input = "  hello   world  ";
        let output = normalize_whitespace(input);
        assert_eq!(output, "hello world");
    }

    #[test]
    fn test_extract_content() {
        let html = "<div><p>Content</p></div>";
        let result = extract_content(html);
        assert!(result.is_some());
    }
}
```

### 集成测试
```rust
#[tokio::test]
async fn test_engine_integration() {
    let engine = MyEngine::new();
    let result = engine.search("test", None).await;
    assert!(result.is_ok());
}
```

### 性能测试
```rust
use criterion::{black_box, criterion_group, criterion_main, Criterion};

fn bench_function(c: &mut Criterion) {
    c.bench_function("my_function", |b| {
        b.iter(|| my_function(black_box(input)));
    });
}

criterion_group!(benches, bench_function);
criterion_main!(benches);
```

## 代码检查

### Clippy 配置
```toml
# .clippy.toml
warn-level = "warn"
cognitive-complexity-threshold = 30
type-complexity-threshold = 250
```

### 运行检查
```bash
# 检查代码风格
cargo clippy --all-targets --all-features -- -D warnings

# 格式化代码
cargo fmt

# 运行测试
cargo test

# 检查测试覆盖率
cargo tarpaulin --out Html --output-dir ./coverage
```

## 注释规范

### 行内注释
```rust
// 单行注释：说明代码意图
let result = fetch_url(url).await?; // 获取 URL 内容

// 多行注释
// 这是一个重要的步骤
// 需要特别注意错误处理
let result = fetch_url(url).await?;
```

### 文档注释
```rust
/// 重要函数或结构体必须添加文档注释
///
/// # 功能
/// 描述功能
///
/// # 参数
/// - `param1`: 参数说明
///
/// # 返回
/// 返回值说明
///
/// # 示例
/// ```rust
/// let result = function_name(arg1);
/// ```
pub fn important_function(param1: Type) -> Result<ReturnType, ErrorType> {
    // 实现
}
```

## 版本控制

### Git 提交信息
```
<type>(<scope>): <subject>

<body>

<footer>
```

### 提交类型
- `feat`: 新功能
- `fix`: 修复 bug
- `docs`: 文档更新
- `style`: 代码格式（不影响功能）
- `refactor`: 重构（既不是新功能也不是修复）
- `perf`: 性能优化
- `test`: 测试相关
- `chore`: 构建/工具链相关

### 示例
```
refactor(engine): split nxs engine into smaller execution components

- extract parser, content pipeline, and paginated fetch helpers
- keep BookEngine and BookEngineRuntime as the runtime contract surface
- preserve compatibility shims for legacy interfaces

Closes #123
```
