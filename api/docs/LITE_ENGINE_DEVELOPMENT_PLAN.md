# Lite 引擎后续开发方案

## 0. 当前架构基线（已落地）
本轮收敛后，Nexus 后端（当前目录为 `api`）的引擎主链路已经明确分成三层：

1. `nexus-core`
   - 主契约入口是 `book_engine.rs`、`traits.rs`、`types.rs`
   - `interfaces.rs` 已降级为兼容 shim，历史定义迁入 `legacy_interfaces.rs`
   - `EngineError` 已承接健康分类语义，避免 `server` 重复维护错误映射

2. `nexus-engine`
   - `NxsEngine` 现在是运行时装配器和 trait 实现入口，不再承载全部细节
   - 已拆出私有执行组件：
     - `nxs_ops.rs`: `search / book_info / chapters`
     - `nxs_parser.rs`: HTML 解析与 DTO 映射
     - `content_pipeline.rs`: 正文清洗、质量门、校验
     - `content_fetch.rs`: 分页正文抓取状态机

3. `nexus-server`
   - `runtime_bootstrap.rs` 负责运行时组装
   - `runtime_state_service.rs` 负责 runtime snapshot / overview / reset 聚合
   - route 层已收敛为 thin routes，主要做 HTTP 绑定与状态码映射

## 0.1 当前测试基线（已恢复）
1. `nexus-engine` 组件级测试已覆盖：
   - `nxs_parser`
   - `content_fetch`
2. `69shuba` 离线回归已恢复，规则文件使用 [69shuba.nxs](/Users/edy/code/reader/api/sources/69shuba.nxs)
3. 当前可作为最小回归集合的命令：
   - `cargo test -p nexus-engine --quiet`
   - `cargo test -p nexus-server --quiet`

## 1. 目标与范围
本方案聚焦四条主线：功能增强、架构优化、性能提升、缺陷解构。核心目标是提升盗版小说站内容抓取的稳定性、准确率与可观测性，支撑前端缓存阅读场景。

## 2. 阶段规划（4-6 周）

### 阶段 A：稳定性与可观测性（第 1-2 周）
1. 提取链路指标完善：成功率、失败类型、回退命中率、空内容率、规则失配率。
2. 健康检查增强：输出聚合提取摘要和 Top 失败源。
3. 指标内存防护：来源基数上限、冷数据淘汰策略、配置化阈值。
4. 路由级与模块级测试补齐：提取统计 API、批量内容 API、异常路径。

**验收标准**
- `/api/health` 与 `/api/sources/extraction` 数据可用于定位失败源。
- 连续压测 24h 无明显内存增长异常。

### 阶段 B：提取质量提升（第 2-4 周）
1. NXS 规则能力增强：分页、清洗、字体解密、脚本 DSL 的组合能力。
2. 动态噪声与正文判别优化：降低误删、减少广告残留。
3. 失败分层诊断：规则失配/反爬失败/内容过短自动归类。
4. 样本回归集建设：维护高频站点样本与黄金输出。

**验收标准**
- 回归集提取成功率提升到目标值（建议 >= 92%）。
- 误提取（广告、导航、错段）显著下降。

### 阶段 C：性能与架构优化（第 4-6 周）
1. 热路径优化：正则与选择器静态化复用，减少重复编译和分配。
2. `NxsEngine` 剩余 operation 对象化：把 `content` 主流程也收敛到显式 operation。
3. 并发模型优化：搜索与批量内容的限流、超时、背压策略统一。
4. 缓存策略升级：章节缓存键增强、失效策略分层（源级/章节级）。
5. Prometheus 指标接入：提取成功/失败/回退计数统一上报。

**验收标准**
- 同等机器下吞吐提升，P95 延迟下降。
- 异常站点不会拖垮全局队列。
- 核心引擎模块可通过组件级单测独立验证，而不是只依赖端到端回归。

## 3. 风险与对策
1. 站点反爬快速变化：采用多策略回退链 + 失败自动分型。
2. 规则膨胀导致维护成本高：建立规则评审和样本回归门禁。
3. 指标维度爆炸：限制高基数字段并设置淘汰策略。

## 4. 交付节奏
1. 每周提交一次阶段报告（成功率、失败源 Top、性能趋势）。
2. 每阶段结束输出可回滚版本与变更清单。
