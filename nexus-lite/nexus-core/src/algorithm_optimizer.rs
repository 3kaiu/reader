//! 算法性能优化器
//!
//! 提供高性能算法实现和优化：
//! - 数据结构优化
//! - 排序算法优化
//! - 搜索算法优化
//! - 缓存算法优化
//! - 并行计算优化

use std::collections::{BTreeMap, HashMap, HashSet, VecDeque};
use std::hash::Hash;
use std::sync::{Arc, OnceLock};
use std::{cmp::Ordering, future::Future};
use tokio::sync::RwLock;

/// 算法优化配置
#[derive(Debug, Clone)]
pub struct AlgorithmConfig {
    pub enable_parallel_processing: bool,
    pub max_parallel_tasks: usize,
    pub cache_enabled: bool,
    pub cache_size: usize,
    pub adaptive_chunk_size: bool,
    pub enable_simd: bool,
}

/// 性能指标
#[derive(Debug, Clone)]
pub struct AlgorithmMetrics {
    pub operation: String,
    pub input_size: usize,
    pub execution_time_ns: u128,
    pub memory_usage: usize,
    pub cache_hits: u64,
    pub cache_misses: u64,
}

/// 算法优化器
pub struct AlgorithmOptimizer {
    config: AlgorithmConfig,
    metrics: Arc<RwLock<Vec<AlgorithmMetrics>>>,
    result_cache: Arc<RwLock<HashMap<String, CachedResult>>>,
}

#[derive(Debug, Clone)]
struct CachedResult {
    _data: Vec<u8>,
    _hash: u64,
    _timestamp: std::time::Instant,
}

/// 数据压缩算法
pub struct DataCompressor;

impl DataCompressor {
    /// 运行长度编码 (RLE)
    pub fn rle_compress<T: Eq + Clone>(data: &[T]) -> Vec<(T, usize)> {
        if data.is_empty() {
            return Vec::new();
        }

        let mut result = Vec::new();
        let mut current = &data[0];
        let mut count = 1;

        for item in data.iter().skip(1) {
            if item == current {
                count += 1;
            } else {
                result.push((current.clone(), count));
                current = item;
                count = 1;
            }
        }

        result.push((current.clone(), count));
        result
    }

    /// 运行长度解码
    pub fn rle_decompress<T: Clone>(compressed: &[(T, usize)]) -> Vec<T> {
        let mut result = Vec::new();
        for (value, count) in compressed {
            for _ in 0..*count {
                result.push(value.clone());
            }
        }
        result
    }

    /// 字典编码
    pub fn dictionary_encode<T: Hash + Eq + Clone>(data: &[T]) -> (Vec<usize>, Vec<T>) {
        let mut dictionary = HashMap::new();
        let mut encoded = Vec::new();

        for item in data {
            let index = dictionary.len();
            let dict_index = *dictionary.entry(item.clone()).or_insert(index);
            encoded.push(dict_index);
        }

        let dict_values: Vec<T> = dictionary
            .into_iter()
            .map(|(k, v)| (v, k))
            .collect::<BTreeMap<_, _>>()
            .into_values()
            .collect();

        (encoded, dict_values)
    }

    /// 字典解码
    pub fn dictionary_decode<T: Clone>(encoded: &[usize], dictionary: &[T]) -> Vec<T> {
        encoded
            .iter()
            .map(|&index| dictionary[index].clone())
            .collect()
    }
}

/// 自适应排序算法
pub struct AdaptiveSorter;

impl AdaptiveSorter {
    /// 自适应排序 - 根据数据特征选择最优算法
    pub fn adaptive_sort<T: Ord + Clone + Hash>(data: &mut [T]) {
        let len = data.len();

        if len <= 1 {
            return;
        }

        // 小数据集：插入排序
        if len <= 32 {
            Self::insertion_sort(data);
            return;
        }

        // 检测是否接近有序
        let inversions = Self::count_inversions(data);
        let inversion_ratio = inversions as f64 / (len * (len - 1) / 2) as f64;

        // 如果接近有序，使用插入排序
        if inversion_ratio < 0.1 {
            Self::insertion_sort(data);
            return;
        }

        // 检测是否有大量重复元素
        let unique_count = Self::count_unique(data);
        let duplicate_ratio = 1.0 - (unique_count as f64 / len as f64);

        // 如果重复元素多，使用计数排序（适用于整数）
        if duplicate_ratio > 0.5 && Self::is_integer_type(data) {
            // 这里简化为标准排序，实际实现需要类型检查
            data.sort();
            return;
        }

        // 默认使用Timsort（Rust的标准排序）
        data.sort();
    }

    fn insertion_sort<T: Ord>(data: &mut [T]) {
        for i in 1..data.len() {
            let mut j = i;
            while j > 0 && data[j - 1] > data[j] {
                data.swap(j - 1, j);
                j -= 1;
            }
        }
    }

    fn count_inversions<T: Ord>(data: &[T]) -> usize {
        // 简化的逆序对计数
        let mut inversions = 0;
        for i in 0..data.len() {
            for j in (i + 1)..data.len() {
                if data[i] > data[j] {
                    inversions += 1;
                }
            }
        }
        inversions
    }

    fn count_unique<T: Hash + Eq>(data: &[T]) -> usize {
        let mut set = HashSet::new();
        for item in data {
            set.insert(item);
        }
        set.len()
    }

    fn is_integer_type<T>(_data: &[T]) -> bool {
        // 简化的类型检查，实际实现需要更复杂的检查
        false
    }

    /// 并行排序
    pub async fn parallel_sort<T: Ord + Clone + Copy + Send + Sync + 'static>(
        data: &mut [T],
        max_threads: usize,
    ) {
        let len = data.len();
        if len <= 1024 {
            // 小数据集使用单线程排序
            data.sort();
            return;
        }

        // 分块并行排序
        let chunk_size = (len / max_threads).max(1024);
        let mut handles = Vec::new();

        for chunk in data.chunks_mut(chunk_size) {
            let mut chunk_vec = chunk.to_vec();
            let handle = tokio::spawn(async move {
                chunk_vec.sort();
                chunk_vec
            });
            handles.push((handle, chunk.as_ptr() as usize));
        }

        // 收集结果
        let mut sorted_chunks = Vec::new();
        for (handle, ptr) in handles {
            match handle.await {
                Ok(sorted) => sorted_chunks.push((ptr, sorted)),
                Err(_) => {
                    // 如果任一并行任务失败，回退到稳定的单线程排序
                    data.sort();
                    return;
                },
            }
        }

        // 归并排序结果
        Self::merge_sorted_chunks(data, sorted_chunks);
    }

    fn merge_sorted_chunks<T: Ord + Clone + Copy>(target: &mut [T], chunks: Vec<(usize, Vec<T>)>) {
        // 简化的归并实现
        let mut all_elements = Vec::new();
        for (_, chunk) in chunks {
            all_elements.extend(chunk);
        }
        all_elements.sort();

        target.copy_from_slice(&all_elements);
    }
}

/// 自适应搜索算法
pub struct AdaptiveSearcher;

impl AdaptiveSearcher {
    /// 自适应搜索 - 根据数据特征选择最优算法
    pub fn adaptive_search<T: Eq + Ord + Hash>(data: &[T], target: &T) -> Option<usize> {
        let len = data.len();

        if len == 0 {
            return None;
        }

        // 小数据集：线性搜索
        if len <= 32 {
            return Self::linear_search(data, target);
        }

        // 如果数据有序，使用二分搜索
        if Self::is_sorted(data) {
            return Self::binary_search(data, target);
        }

        // 大数据集且无序，使用哈希查找（需要预处理）
        if len > 1000 {
            return Self::hash_search(data, target);
        }

        // 默认使用线性搜索
        Self::linear_search(data, target)
    }

    fn linear_search<T: Eq>(data: &[T], target: &T) -> Option<usize> {
        data.iter().position(|item| item == target)
    }

    fn binary_search<T: Ord>(data: &[T], target: &T) -> Option<usize> {
        let mut left = 0;
        let mut right = data.len();

        while left < right {
            let mid = left + (right - left) / 2;
            match data[mid].cmp(target) {
                std::cmp::Ordering::Less => left = mid + 1,
                std::cmp::Ordering::Greater => right = mid,
                std::cmp::Ordering::Equal => return Some(mid),
            }
        }

        None
    }

    fn hash_search<T: Hash + Eq>(data: &[T], target: &T) -> Option<usize> {
        let mut map = HashMap::new();

        // 构建哈希表
        for (i, item) in data.iter().enumerate() {
            map.insert(item, i);
        }

        // 查找目标
        map.get(target).copied()
    }

    fn is_sorted<T: Ord>(data: &[T]) -> bool {
        for i in 1..data.len() {
            if data[i - 1] > data[i] {
                return false;
            }
        }
        true
    }

    /// 模糊搜索 - 支持相似度匹配
    pub fn fuzzy_search<T: AsRef<str>>(
        data: &[T],
        query: &str,
        threshold: f32,
    ) -> Vec<(usize, f32)> {
        let mut results = Vec::new();

        for (i, item) in data.iter().enumerate() {
            let text = item.as_ref();
            let similarity = Self::calculate_similarity(text, query);
            if similarity >= threshold {
                results.push((i, similarity));
            }
        }

        // 按相似度排序
        results.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(Ordering::Equal));
        results
    }

    fn calculate_similarity(a: &str, b: &str) -> f32 {
        // 简化的Levenshtein距离计算
        let a_chars: Vec<char> = a.chars().collect();
        let b_chars: Vec<char> = b.chars().collect();

        let len_a = a_chars.len();
        let len_b = b_chars.len();

        if len_a == 0 {
            return if len_b == 0 { 1.0 } else { 0.0 };
        }
        if len_b == 0 {
            return 0.0;
        }

        let mut matrix = vec![vec![0; len_b + 1]; len_a + 1];

        for (i, row) in matrix.iter_mut().enumerate().take(len_a + 1) {
            row[0] = i;
        }
        for (j, cell) in matrix[0].iter_mut().enumerate().take(len_b + 1) {
            *cell = j;
        }

        for i in 1..=len_a {
            for j in 1..=len_b {
                let cost = if a_chars[i - 1] == b_chars[j - 1] {
                    0
                } else {
                    1
                };
                matrix[i][j] = (matrix[i - 1][j] + 1)
                    .min(matrix[i][j - 1] + 1)
                    .min(matrix[i - 1][j - 1] + cost);
            }
        }

        let distance = matrix[len_a][len_b] as f32;
        let max_len = len_a.max(len_b) as f32;
        1.0 - (distance / max_len)
    }
}

/// LRU缓存算法优化
pub struct LRUCache<K, V> {
    capacity: usize,
    cache: HashMap<K, V>,
    order: VecDeque<K>,
}

impl<K: Clone + Eq + Hash, V> LRUCache<K, V> {
    pub fn new(capacity: usize) -> Self {
        Self {
            capacity,
            cache: HashMap::new(),
            order: VecDeque::new(),
        }
    }

    pub fn get(&mut self, key: &K) -> Option<&V> {
        if self.cache.contains_key(key) {
            // 移动到最前面（最近使用）
            self.touch(key);
            Some(&self.cache[key])
        } else {
            None
        }
    }

    pub fn put(&mut self, key: K, value: V) {
        if self.cache.contains_key(&key) {
            // 更新现有值
            self.cache.insert(key.clone(), value);
            self.touch(&key);
        } else {
            // 添加新值
            if self.cache.len() >= self.capacity {
                // 移除最久未使用的
                if let Some(oldest) = self.order.pop_back() {
                    self.cache.remove(&oldest);
                }
            }
            self.cache.insert(key.clone(), value);
            self.order.push_front(key);
        }
    }

    pub fn remove(&mut self, key: &K) -> Option<V> {
        if let Some(value) = self.cache.remove(key) {
            self.order.retain(|k| k != key);
            Some(value)
        } else {
            None
        }
    }

    pub fn clear(&mut self) {
        self.cache.clear();
        self.order.clear();
    }

    pub fn len(&self) -> usize {
        self.cache.len()
    }

    pub fn is_empty(&self) -> bool {
        self.cache.is_empty()
    }

    fn touch(&mut self, key: &K) {
        // 从当前位置移除
        self.order.retain(|k| k != key);
        // 添加到最前面
        self.order.push_front(key.clone());
    }
}

/// 并行计算优化器
pub struct ParallelProcessor;

impl ParallelProcessor {
    /// 自适应并行处理
    pub async fn adaptive_parallel_process<T, F, Fut>(
        data: Vec<T>,
        processor: F,
        max_concurrency: usize,
    ) -> Vec<Fut::Output>
    where
        T: Send + 'static,
        F: Fn(T) -> Fut + Send + Sync + Clone + 'static,
        Fut: Future + Send + 'static,
        Fut::Output: Send + 'static,
    {
        let len = data.len();

        // 小数据集使用单线程处理
        if len <= 10 {
            let mut results = Vec::new();
            for item in data {
                results.push(processor(item).await);
            }
            return results;
        }

        // 大数据集使用并行处理
        let semaphore = Arc::new(tokio::sync::Semaphore::new(max_concurrency));
        let mut handles = Vec::new();

        for item in data {
            let processor = processor.clone();
            let semaphore = Arc::clone(&semaphore);

            let handle = tokio::spawn(async move {
                match semaphore.acquire_owned().await {
                    Ok(_permit) => Some(processor(item).await),
                    Err(_) => None,
                }
            });

            handles.push(handle);
        }

        // 收集结果
        let mut results = Vec::new();
        for handle in handles {
            if let Ok(Some(result)) = handle.await {
                results.push(result);
            }
        }

        results
    }

    /// 工作窃取调度器
    pub async fn work_stealing_scheduler<T, F, Fut>(
        tasks: Vec<T>,
        processor: F,
        num_workers: usize,
    ) -> Vec<Fut::Output>
    where
        T: Send + 'static,
        F: Fn(T) -> Fut + Send + Sync + Clone + 'static,
        Fut: std::future::Future + Send + 'static,
        Fut::Output: Send + 'static,
    {
        use tokio::sync::mpsc;

        let (task_tx, mut task_rx) = mpsc::channel(num_workers);
        let (result_tx, mut result_rx) = mpsc::channel(num_workers);

        // 分发初始任务
        for task in tasks {
            let _ = task_tx.send(task).await;
        }
        drop(task_tx);

        // 单消费者：一个 worker 从 channel 取任务并处理，通过 result_tx 发送结果
        let processor = processor.clone();
        let worker_handle = tokio::spawn(async move {
            while let Some(task) = task_rx.recv().await {
                let result = processor(task).await;
                let _ = result_tx.send(result).await;
            }
        });

        // result_tx 已移入 worker，worker 结束后会 drop，result_rx 会收到 None

        // 收集结果
        let mut results = Vec::new();
        while let Some(result) = result_rx.recv().await {
            results.push(result);
        }

        let _ = worker_handle.await;

        results
    }
}

/// 内存池优化器
pub struct MemoryPool<T> {
    pool: Vec<T>,
    factory: Box<dyn Fn() -> T + Send + Sync>,
    reset_fn: Box<dyn Fn(&mut T) + Send + Sync>,
}

impl<T> MemoryPool<T> {
    pub fn new<F, R>(capacity: usize, factory: F, reset_fn: R) -> Self
    where
        F: Fn() -> T + Send + Sync + 'static,
        R: Fn(&mut T) + Send + Sync + 'static,
    {
        let mut pool = Vec::with_capacity(capacity);
        for _ in 0..capacity {
            pool.push(factory());
        }

        Self {
            pool,
            factory: Box::new(factory),
            reset_fn: Box::new(reset_fn),
        }
    }

    pub fn acquire(&mut self) -> T {
        if let Some(item) = self.pool.pop() {
            item
        } else {
            (self.factory)()
        }
    }

    pub fn release(&mut self, mut item: T) {
        if self.pool.len() < self.pool.capacity() {
            (self.reset_fn)(&mut item);
            self.pool.push(item);
        }
    }
}

/// 算法优化器主类
impl AlgorithmOptimizer {
    pub fn new(config: AlgorithmConfig) -> Self {
        Self {
            config,
            metrics: Arc::new(RwLock::new(Vec::new())),
            result_cache: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// 优化的排序算法
    pub async fn optimized_sort<T: Ord + Clone + Copy + Hash + Send + Sync + 'static>(
        &self,
        data: &mut [T],
    ) -> Result<(), String> {
        let start = std::time::Instant::now();

        if self.config.enable_parallel_processing {
            AdaptiveSorter::parallel_sort(data, self.config.max_parallel_tasks).await;
        } else {
            AdaptiveSorter::adaptive_sort(data);
        }

        self.record_metrics("sort", data.len(), start.elapsed().as_nanos(), 0, 0, 0)
            .await;
        Ok(())
    }

    /// 优化的搜索算法
    pub fn optimized_search<T: Eq + Ord + Hash>(&self, data: &[T], target: &T) -> Option<usize> {
        let _ = std::time::Instant::now();
        // 指标记录在异步上下文中进行，此处省略以避免 spawn 生命周期问题
        AdaptiveSearcher::adaptive_search(data, target)
    }

    /// 优化的数据压缩
    pub fn optimized_compress<T: Eq + Clone + Hash + serde::Serialize>(
        &self,
        data: &[T],
    ) -> Vec<u8> {
        let start = std::time::Instant::now();

        // 根据数据特征选择压缩算法
        let compressed = if data.len() < 100 {
            // 小数据集：直接序列化
            serde_json::to_vec(data).unwrap_or_default()
        } else {
            // 检查重复度
            let unique_count = {
                let mut set = HashSet::new();
                for item in data {
                    set.insert(item);
                }
                set.len()
            };

            let duplicate_ratio = 1.0 - (unique_count as f64 / data.len() as f64);

            if duplicate_ratio > 0.5 {
                // 高重复：使用RLE
                let rle = DataCompressor::rle_compress(data);
                serde_json::to_vec(&rle).unwrap_or_default()
            } else {
                // 低重复：使用字典编码
                let (encoded, dict) = DataCompressor::dictionary_encode(data);
                serde_json::to_vec(&(encoded, dict)).unwrap_or_default()
            }
        };

        let _ = start; // sync path intentionally skips async metric recording
        compressed
    }

    /// 并行处理优化
    pub async fn optimized_parallel_process<T, F, Fut>(
        &self,
        data: Vec<T>,
        processor: F,
    ) -> Result<Vec<Fut::Output>, String>
    where
        T: Send + 'static,
        F: Fn(T) -> Fut + Send + Sync + Clone + 'static,
        Fut: std::future::Future + Send + 'static,
        Fut::Output: Send + 'static,
    {
        let start = std::time::Instant::now();
        let result = ParallelProcessor::adaptive_parallel_process(
            data,
            processor,
            self.config.max_parallel_tasks,
        )
        .await;

        self.record_metrics("parallel_process", result.len(), start.elapsed().as_nanos(), 0, 0, 0)
            .await;
        Ok(result)
    }

    /// 获取性能指标
    pub async fn get_metrics(&self) -> Vec<AlgorithmMetrics> {
        self.metrics.read().await.clone()
    }

    /// 清空缓存
    pub async fn clear_cache(&self) {
        self.result_cache.write().await.clear();
    }

    /// 获取缓存统计
    pub async fn get_cache_stats(&self) -> (usize, usize) {
        let cache = self.result_cache.read().await;
        (cache.len(), self.config.cache_size)
    }

    async fn record_metrics(
        &self,
        operation: &str,
        input_size: usize,
        execution_time_ns: u128,
        memory_usage: usize,
        cache_hits: u64,
        cache_misses: u64,
    ) {
        let metrics = AlgorithmMetrics {
            operation: operation.to_string(),
            input_size,
            execution_time_ns,
            memory_usage,
            cache_hits,
            cache_misses,
        };

        let mut metrics_guard = self.metrics.write().await;
        metrics_guard.push(metrics);

        // 保留最近1000个指标
        if metrics_guard.len() > 1000 {
            metrics_guard.remove(0);
        }
    }
}

/// 全局算法优化器管理器
pub struct AlgorithmOptimizerManager {
    optimizer: Arc<RwLock<AlgorithmOptimizer>>,
}

impl AlgorithmOptimizerManager {
    pub fn new(config: AlgorithmConfig) -> Self {
        let optimizer = AlgorithmOptimizer::new(config);
        Self {
            optimizer: Arc::new(RwLock::new(optimizer)),
        }
    }

    pub fn optimizer(&self) -> Arc<RwLock<AlgorithmOptimizer>> {
        Arc::clone(&self.optimizer)
    }
}

/// 全局算法优化器实例
static ALGORITHM_OPTIMIZER_MANAGER: OnceLock<AlgorithmOptimizerManager> = OnceLock::new();

/// 初始化全局算法优化器
pub fn init_algorithm_optimizer(config: AlgorithmConfig) {
    let _ = ALGORITHM_OPTIMIZER_MANAGER.set(AlgorithmOptimizerManager::new(config));
}

/// 获取全局算法优化器
pub fn get_algorithm_optimizer() -> Option<&'static AlgorithmOptimizerManager> {
    ALGORITHM_OPTIMIZER_MANAGER.get()
}
