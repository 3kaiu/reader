# 端侧AI运行时优化需求文档

## 介绍

针对Nexus Reader的端侧AI功能进行优化，解决当前构建产物过大（205MB）的问题。用户使用Qwen3 8B量化模型通过WebGPU在浏览器端运行，需要将AI库配置为纯运行时加载模式，避免将模型数据和WASM文件打包到构建产物中。

## 术语表

- **Client_Side_AI**: 在浏览器端运行的AI推理系统
- **Runtime_Loading**: 运行时动态加载模型和依赖，而非构建时打包
- **WebGPU_Acceleration**: 使用WebGPU API进行AI模型推理加速
- **Bundle_Size**: 前端构建产物的总大小
- **WASM_Runtime**: WebAssembly运行时环境
- **Model_Cache**: 浏览器端模型缓存系统
- **Lazy_Loading**: 按需延迟加载功能模块

## 需求

### 需求 1: 构建产物大小优化

**用户故事:** 作为开发者，我希望前端构建产物大小控制在合理范围内，以便快速部署和用户下载。

#### 验收标准

1. WHEN 执行生产构建 THEN 系统 SHALL 生成总大小不超过50MB的构建产物
2. WHEN 分析构建产物 THEN 系统 SHALL 确保AI相关的WASM文件不被打包到bundle中
3. WHEN 检查静态资源 THEN 系统 SHALL 确保模型文件和训练数据不包含在构建产物中
4. WHEN 对比优化前后 THEN 系统 SHALL 实现至少75%的构建大小减少（从205MB降到50MB以下）

### 需求 2: AI库运行时加载配置

**用户故事:** 作为用户，我希望AI功能在需要时才加载相关资源，避免影响应用启动速度。

#### 验收标准

1. WHEN 应用启动 THEN 系统 SHALL 不预加载AI相关的WASM文件和模型数据
2. WHEN 用户首次使用AI功能 THEN 系统 SHALL 动态加载所需的运行时库
3. WHEN 配置外部依赖 THEN 系统 SHALL 将大型AI库标记为external或使用CDN加载
4. WHEN 检查网络请求 THEN 系统 SHALL 确保WASM文件通过网络请求获取而非bundle内嵌

### 需求 3: WebGPU模型加载优化

**用户故事:** 作为用户，我希望使用Qwen3 8B量化模型时有良好的加载和推理体验。

#### 验收标准

1. WHEN 初始化WebGPU THEN 系统 SHALL 检测设备WebGPU支持并提供降级方案
2. WHEN 加载Qwen3模型 THEN 系统 SHALL 从指定URL动态下载量化模型文件
3. WHEN 模型加载完成 THEN 系统 SHALL 将模型缓存到IndexedDB中避免重复下载
4. WHEN 进行AI推理 THEN 系统 SHALL 使用WebGPU加速提供流畅的推理体验
5. WHEN 检测到WebGPU不可用 THEN 系统 SHALL 自动降级到CPU推理模式

### 需求 4: TTS功能运行时优化

**用户故事:** 作为用户，我希望TTS功能不影响应用的初始加载大小。

#### 验收标准

1. WHEN 应用启动 THEN 系统 SHALL 不加载piper-tts-web的WASM文件和模型数据
2. WHEN 用户首次使用TTS THEN 系统 SHALL 动态加载TTS运行时和必要的语音模型
3. WHEN 配置TTS模型 THEN 系统 SHALL 支持从远程URL加载自定义训练的音色模型
4. WHEN TTS模型加载完成 THEN 系统 SHALL 缓存模型数据以提升后续使用体验

### 需求 5: 智能缓存和预加载策略

**用户故事:** 作为用户，我希望系统能智能管理AI资源的缓存和预加载。

#### 验收标准

1. WHEN 用户频繁使用AI功能 THEN 系统 SHALL 在空闲时预加载常用模型
2. WHEN 检测到网络状况良好 THEN 系统 SHALL 在后台预加载AI运行时库
3. WHEN 存储空间不足 THEN 系统 SHALL 自动清理最少使用的模型缓存
4. WHEN 模型版本更新 THEN 系统 SHALL 自动更新缓存中的模型文件
5. WHEN 离线使用 THEN 系统 SHALL 使用已缓存的模型和运行时提供基本AI功能

### 需求 6: 构建配置优化

**用户故事:** 作为开发者，我希望构建系统能正确处理AI库的外部化配置。

#### 验收标准

1. WHEN 配置webpack externals THEN 系统 SHALL 将大型AI库排除在bundle之外
2. WHEN 设置代码分割 THEN 系统 SHALL 将AI相关代码分离到独立的异步chunk中
3. WHEN 启用tree shaking THEN 系统 SHALL 移除未使用的AI库代码和依赖
4. WHEN 配置CDN资源 THEN 系统 SHALL 支持从CDN加载AI运行时库
5. WHEN 生成source map THEN 系统 SHALL 排除AI库的source map以减少构建大小

### 需求 7: 性能监控和错误处理

**用户故事:** 作为开发者，我希望能监控AI功能的加载性能和错误情况。

#### 验收标准

1. WHEN AI库加载失败 THEN 系统 SHALL 记录详细错误信息并提供用户友好的提示
2. WHEN 监控加载性能 THEN 系统 SHALL 记录AI库和模型的加载时间
3. WHEN 检测到加载超时 THEN 系统 SHALL 提供重试机制和降级方案
4. WHEN WebGPU初始化失败 THEN 系统 SHALL 自动切换到CPU模式并通知用户
5. WHEN 模型推理出错 THEN 系统 SHALL 提供错误恢复机制和用户反馈

### 需求 8: 开发和调试支持

**用户故事:** 作为开发者，我希望在开发环境中能方便地调试AI功能。

#### 验收标准

1. WHEN 开发环境启动 THEN 系统 SHALL 提供AI库加载状态的详细日志
2. WHEN 调试模型加载 THEN 系统 SHALL 支持本地模型文件的加载和测试
3. WHEN 分析构建产物 THEN 系统 SHALL 提供详细的bundle分析报告
4. WHEN 测试不同配置 THEN 系统 SHALL 支持通过环境变量切换AI库加载策略
5. WHEN 性能分析 THEN 系统 SHALL 提供AI功能的性能指标和优化建议