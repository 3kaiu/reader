//! Benchmark tests for Native vs JS execution performance
//!
//! Run with: cargo test --lib bench_ --release -- --nocapture

#[cfg(test)]
mod bench_tests {
    use crate::engine::js_analyzer::{AnalysisResult, JsPatternAnalyzer};
    use crate::engine::js_executor::JsExecutor;
    use crate::engine::native_api::NativeApiProvider;
    use crate::engine::preprocessor::NativeApi;
    use crate::engine::cookie::CookieManager;
    use crate::storage::kv::KvStore;
    use crate::storage::FileStorage;
    use std::sync::Arc;
    use std::time::Instant;

    const ITERATIONS: usize = 1000;

    fn create_native_api() -> Arc<NativeApiProvider> {
        let cookie_manager = Arc::new(CookieManager::new());
        let fs = FileStorage::new("/tmp/reader_benchmarks");
        let kv_store = Arc::new(KvStore::new(fs, "bench_kv.json"));
        Arc::new(NativeApiProvider::new(cookie_manager, kv_store))
    }

    fn create_js_executor() -> JsExecutor {
        let native_api = create_native_api();
        JsExecutor::new(native_api).unwrap()
    }

    /// Benchmark Base64 encoding: Native vs JS
    #[test]
    fn bench_base64_encode() {
        let native_api = create_native_api();
        let js_executor = create_js_executor();
        let test_data = "Hello, World! This is a test string for base64 encoding benchmark.";

        // Warm up
        let _ = native_api.execute(&NativeApi::Base64Encode, &[test_data.to_string()]);
        let _ = js_executor.eval_with_context(
            &format!("java.base64Encode('{}')", test_data),
            &std::collections::HashMap::new(),
        );

        // Native benchmark
        let start = Instant::now();
        for _ in 0..ITERATIONS {
            let _ = native_api.execute(&NativeApi::Base64Encode, &[test_data.to_string()]);
        }
        let native_duration = start.elapsed();

        // JS benchmark
        let start = Instant::now();
        for _ in 0..ITERATIONS {
            let _ = js_executor.eval_with_context(
                &format!("java.base64Encode('{}')", test_data),
                &std::collections::HashMap::new(),
            );
        }
        let js_duration = start.elapsed();

        println!("\n=== Base64 Encode Benchmark ({} iterations) ===", ITERATIONS);
        println!("Native: {:?} ({:.2} µs/op)", native_duration, native_duration.as_micros() as f64 / ITERATIONS as f64);
        println!("JS:     {:?} ({:.2} µs/op)", js_duration, js_duration.as_micros() as f64 / ITERATIONS as f64);
        println!("Speedup: {:.2}x", js_duration.as_nanos() as f64 / native_duration.as_nanos() as f64);
    }

    /// Benchmark MD5 hashing: Native vs JS
    #[test]
    fn bench_md5_encode() {
        let native_api = create_native_api();
        let js_executor = create_js_executor();
        let test_data = "Hello, World! This is a test string for MD5 hashing benchmark.";

        // Warm up
        let _ = native_api.execute(&NativeApi::Md5Encode, &[test_data.to_string()]);
        let _ = js_executor.eval_with_context(
            &format!("java.md5Encode('{}')", test_data),
            &std::collections::HashMap::new(),
        );

        // Native benchmark
        let start = Instant::now();
        for _ in 0..ITERATIONS {
            let _ = native_api.execute(&NativeApi::Md5Encode, &[test_data.to_string()]);
        }
        let native_duration = start.elapsed();

        // JS benchmark
        let start = Instant::now();
        for _ in 0..ITERATIONS {
            let _ = js_executor.eval_with_context(
                &format!("java.md5Encode('{}')", test_data),
                &std::collections::HashMap::new(),
            );
        }
        let js_duration = start.elapsed();

        println!("\n=== MD5 Encode Benchmark ({} iterations) ===", ITERATIONS);
        println!("Native: {:?} ({:.2} µs/op)", native_duration, native_duration.as_micros() as f64 / ITERATIONS as f64);
        println!("JS:     {:?} ({:.2} µs/op)", js_duration, js_duration.as_micros() as f64 / ITERATIONS as f64);
        println!("Speedup: {:.2}x", js_duration.as_nanos() as f64 / native_duration.as_nanos() as f64);
    }

    /// Benchmark URL encoding: Native vs JS
    #[test]
    fn bench_encode_uri() {
        let native_api = create_native_api();
        let js_executor = create_js_executor();
        let test_data = "Hello World! 你好世界 Special chars: &=?#";

        // Warm up
        let _ = native_api.execute(&NativeApi::EncodeUri, &[test_data.to_string()]);
        let _ = js_executor.eval_with_context(
            &format!("java.encodeURI('{}')", test_data),
            &std::collections::HashMap::new(),
        );

        // Native benchmark
        let start = Instant::now();
        for _ in 0..ITERATIONS {
            let _ = native_api.execute(&NativeApi::EncodeUri, &[test_data.to_string()]);
        }
        let native_duration = start.elapsed();

        // JS benchmark
        let start = Instant::now();
        for _ in 0..ITERATIONS {
            let _ = js_executor.eval_with_context(
                &format!("java.encodeURI('{}')", test_data),
                &std::collections::HashMap::new(),
            );
        }
        let js_duration = start.elapsed();

        println!("\n=== URI Encode Benchmark ({} iterations) ===", ITERATIONS);
        println!("Native: {:?} ({:.2} µs/op)", native_duration, native_duration.as_micros() as f64 / ITERATIONS as f64);
        println!("JS:     {:?} ({:.2} µs/op)", js_duration, js_duration.as_micros() as f64 / ITERATIONS as f64);
        println!("Speedup: {:.2}x", js_duration.as_nanos() as f64 / native_duration.as_nanos() as f64);
    }

    /// Benchmark String trim: Native vs JS
    #[test]
    fn bench_string_trim() {
        let native_api = create_native_api();
        let js_executor = create_js_executor();
        let test_data = "   Hello, World! This needs trimming.   ";

        // Native benchmark
        let start = Instant::now();
        for _ in 0..ITERATIONS {
            let _ = native_api.execute(&NativeApi::StringTrim, &[test_data.to_string()]);
        }
        let native_duration = start.elapsed();

        // JS benchmark
        let start = Instant::now();
        for _ in 0..ITERATIONS {
            let mut vars = std::collections::HashMap::new();
            vars.insert("result".to_string(), test_data.to_string());
            let _ = js_executor.eval_with_context("result.trim()", &vars);
        }
        let js_duration = start.elapsed();

        println!("\n=== String Trim Benchmark ({} iterations) ===", ITERATIONS);
        println!("Native: {:?} ({:.2} µs/op)", native_duration, native_duration.as_micros() as f64 / ITERATIONS as f64);
        println!("JS:     {:?} ({:.2} µs/op)", js_duration, js_duration.as_micros() as f64 / ITERATIONS as f64);
        println!("Speedup: {:.2}x", js_duration.as_nanos() as f64 / native_duration.as_nanos() as f64);
    }

    /// Benchmark JS pattern analysis
    #[test]
    fn bench_js_analysis() {
        let analyzer = JsPatternAnalyzer::new();
        let patterns = [
            "java.base64Encode(result)",
            "java.base64Decode(key)",
            "java.md5Encode(content)",
            "java.encodeURI(url)",
            "result.trim()",
            r#"result.replace("old", "new")"#,
            "java.randomUUID()",
            "JSON.parse(result)",
            // Complex patterns that require JS
            "function() { return result * 2; }",
            "if (x > 0) { return x; }",
        ];

        let start = Instant::now();
        for _ in 0..ITERATIONS {
            for pattern in &patterns {
                let _ = analyzer.analyze(pattern);
            }
        }
        let duration = start.elapsed();

        println!("\n=== JS Pattern Analysis Benchmark ({} iterations x {} patterns) ===", ITERATIONS, patterns.len());
        println!("Total: {:?}", duration);
        println!("Per analysis: {:.2} µs", duration.as_micros() as f64 / (ITERATIONS * patterns.len()) as f64);

        // Count native vs JS
        let mut native_count = 0;
        let mut js_count = 0;
        for pattern in &patterns {
            match analyzer.analyze(pattern) {
                AnalysisResult::Native(_) | AnalysisResult::NativeChain(_) => native_count += 1,
                AnalysisResult::RequiresJs(_) => js_count += 1,
            }
        }
        println!("Native patterns: {}/{}", native_count, patterns.len());
        println!("JS-required patterns: {}/{}", js_count, patterns.len());
    }

    /// Benchmark UUID generation: Native vs JS
    #[test]
    fn bench_random_uuid() {
        let native_api = create_native_api();
        let js_executor = create_js_executor();

        // Warm up
        let _ = native_api.execute(&NativeApi::RandomUuid, &[]);
        let _ = js_executor.eval_with_context("java.randomUUID()", &std::collections::HashMap::new());

        // Native benchmark
        let start = Instant::now();
        for _ in 0..ITERATIONS {
            let _ = native_api.execute(&NativeApi::RandomUuid, &[]);
        }
        let native_duration = start.elapsed();

        // JS benchmark
        let start = Instant::now();
        for _ in 0..ITERATIONS {
            let _ = js_executor.eval_with_context("java.randomUUID()", &std::collections::HashMap::new());
        }
        let js_duration = start.elapsed();

        println!("\n=== Random UUID Benchmark ({} iterations) ===", ITERATIONS);
        println!("Native: {:?} ({:.2} µs/op)", native_duration, native_duration.as_micros() as f64 / ITERATIONS as f64);
        println!("JS:     {:?} ({:.2} µs/op)", js_duration, js_duration.as_micros() as f64 / ITERATIONS as f64);
        println!("Speedup: {:.2}x", js_duration.as_nanos() as f64 / native_duration.as_nanos() as f64);
    }

    /// Summary benchmark across all operations
    #[test]
    fn bench_summary() {
        println!("\n");
        println!("╔══════════════════════════════════════════════════════════════╗");
        println!("║      Native Rust vs QuickJS Performance Comparison           ║");
        println!("╠══════════════════════════════════════════════════════════════╣");
        println!("║ Run individual benchmarks to see detailed results:           ║");
        println!("║                                                              ║");
        println!("║   cargo test --lib bench_base64 --release -- --nocapture     ║");
        println!("║   cargo test --lib bench_md5 --release -- --nocapture        ║");
        println!("║   cargo test --lib bench_encode --release -- --nocapture     ║");
        println!("║   cargo test --lib bench_string --release -- --nocapture     ║");
        println!("║   cargo test --lib bench_random --release -- --nocapture     ║");
        println!("║   cargo test --lib bench_js_analysis --release -- --nocapture║");
        println!("║                                                              ║");
        println!("║ Or run all benchmarks:                                       ║");
        println!("║   cargo test --lib bench_ --release -- --nocapture           ║");
        println!("╚══════════════════════════════════════════════════════════════╝");
    }
}
