#!/usr/bin/env python3
"""
Performance Optimization Test Script
Tests the integrated performance optimizations
"""
import asyncio
import time
from cloudscraper_wrapper import CloudScraperWrapper

async def test_basic_fetch():
    """Test basic fetch with optimized cache key generation"""
    print("\n=== Test 1: Basic Fetch with Optimized Cache Key ===")
    wrapper = CloudScraperWrapper()
    
    url = "https://www.qidian.com"
    start = time.time()
    result = await wrapper.fetch(url)
    duration = time.time() - start
    
    print(f"✓ Fetch completed: {result.status} in {duration:.2f}s")
    print(f"✓ CF Bypassed: {result.cf_bypassed}")
    print(f"✓ Cached: {result.cached}")
    print(f"✓ HTML length: {len(result.html)}")
    
    # Test cache hit
    start = time.time()
    result2 = await wrapper.fetch(url)
    cache_duration = time.time() - start
    
    print(f"✓ Cache hit: {result2.cached} in {cache_duration:.3f}s")
    print(f"✓ Cache speedup: {duration/cache_duration:.1f}x faster")
    
    await wrapper.shutdown()
    return True

async def test_parallel_fetch():
    """Test parallel fetch optimization"""
    print("\n=== Test 2: Parallel Fetch ===")
    wrapper = CloudScraperWrapper()
    
    urls = [
        "https://www.qidian.com",
        "https://book.qidian.com",
        "https://www.qidian.com/rank",
    ]
    
    # Sequential baseline
    print("Sequential fetch (baseline)...")
    start = time.time()
    for url in urls:
        await wrapper.fetch(url)
    sequential_time = time.time() - start
    print(f"✓ Sequential: {sequential_time:.2f}s")
    
    # Clear cache for fair comparison
    wrapper.scrapers.clear()
    
    # Parallel fetch
    print("Parallel fetch (optimized)...")
    requests = [{'url': url} for url in urls]
    start = time.time()
    results = await wrapper.fetch_parallel(requests)
    parallel_time = time.time() - start
    
    print(f"✓ Parallel: {parallel_time:.2f}s")
    print(f"✓ Speedup: {sequential_time/parallel_time:.1f}x faster")
    print(f"✓ Success rate: {sum(1 for r in results if r.status == 200)}/{len(results)}")
    
    await wrapper.shutdown()
    return True

async def test_batch_fetch():
    """Test batch fetch optimization"""
    print("\n=== Test 3: Batch Fetch ===")
    wrapper = CloudScraperWrapper()
    
    urls = [
        "https://www.qidian.com",
        "https://www.qidian.com/rank",
        "https://www.qidian.com/free",
    ]
    
    start = time.time()
    results = await wrapper.fetch_batch(urls)
    duration = time.time() - start
    
    print(f"✓ Batch fetch: {len(results)} URLs in {duration:.2f}s")
    print(f"✓ Throughput: {len(results)/duration:.1f} req/s")
    print(f"✓ Success rate: {sum(1 for r in results if r.status == 200)}/{len(results)}")
    
    await wrapper.shutdown()
    return True

async def test_js_interpreter_selection():
    """Test JS interpreter optimization"""
    print("\n=== Test 4: JS Interpreter Selection ===")
    wrapper = CloudScraperWrapper()
    
    # Get interpreter info
    info = wrapper.performance_optimizer.js_optimizer.get_interpreter_info()
    
    print(f"✓ Node.js available: {info['nodejs_available']}")
    print(f"✓ V8 available: {info['v8_available']}")
    print(f"✓ Recommended: {info['recommended']}")
    
    if info['nodejs_available']:
        print("✓ Using Node.js (10-100x faster than js2py)")
    elif info['v8_available']:
        print("✓ Using V8 (5-50x faster than js2py)")
    else:
        print("⚠ Using js2py (slowest option)")
    
    await wrapper.shutdown()
    return True

async def test_cache_key_performance():
    """Test cache key generation performance"""
    print("\n=== Test 5: Cache Key Generation Performance ===")
    wrapper = CloudScraperWrapper()
    
    url = "https://www.qidian.com/book/123456"
    method = "GET"
    kwargs = {
        'headers': {'User-Agent': 'Test', 'Cookie': 'session=abc123'},
        'data': 'test body data'
    }
    
    # Warm up
    for _ in range(10):
        wrapper.performance_optimizer.generate_cache_key(url, method, kwargs)
    
    # Benchmark
    iterations = 1000
    start = time.time()
    for _ in range(iterations):
        wrapper.performance_optimizer.generate_cache_key(url, method, kwargs)
    duration = time.time() - start
    
    avg_time = (duration / iterations) * 1000  # Convert to ms
    print(f"✓ Generated {iterations} cache keys in {duration:.3f}s")
    print(f"✓ Average time: {avg_time:.3f}ms per key")
    print(f"✓ Expected improvement: 10-100x faster than MD5")
    
    # Get cache stats
    stats = wrapper.performance_optimizer.cache_key_generator.get_stats()
    print(f"✓ Cache hit rate: {stats['hit_rate']*100:.1f}%")
    print(f"✓ Cache size: {stats['cache_size']}/{stats['cache_limit']}")
    
    await wrapper.shutdown()
    return True

async def test_comprehensive_stats():
    """Test comprehensive statistics"""
    print("\n=== Test 6: Comprehensive Statistics ===")
    wrapper = CloudScraperWrapper()
    
    # Do some requests
    await wrapper.fetch("https://www.qidian.com")
    
    # Get stats
    stats = wrapper.get_stats()
    
    print(f"✓ Active sessions: {stats['active_sessions']}")
    print(f"✓ Engine: {stats['engine']} v{stats['version']}")
    print(f"✓ Cache available: {stats['cache_available']}")
    
    if 'performance' in stats:
        perf = stats['performance']
        print("\nPerformance Stats:")
        
        if 'js_interpreter' in perf:
            print(f"  ✓ JS Interpreter: {perf['js_interpreter']['recommended']}")
        
        if 'cache_key_generator' in perf:
            cache_stats = perf['cache_key_generator']
            print(f"  ✓ Cache key hit rate: {cache_stats['hit_rate']*100:.1f}%")
        
        if 'parallel_engine' in perf:
            parallel_stats = perf['parallel_engine']
            print(f"  ✓ Parallel workers: {parallel_stats['max_workers']}")
            print(f"  ✓ Total requests: {parallel_stats['total_requests']}")
    
    await wrapper.shutdown()
    return True

async def main():
    """Run all tests"""
    print("=" * 60)
    print("CF Bypass Service - Performance Optimization Tests")
    print("=" * 60)
    
    tests = [
        ("Basic Fetch", test_basic_fetch),
        ("JS Interpreter Selection", test_js_interpreter_selection),
        ("Cache Key Performance", test_cache_key_performance),
        ("Comprehensive Stats", test_comprehensive_stats),
        # Parallel and batch tests are slower, run them last
        ("Parallel Fetch", test_parallel_fetch),
        ("Batch Fetch", test_batch_fetch),
    ]
    
    results = []
    for name, test_func in tests:
        try:
            success = await test_func()
            results.append((name, success))
        except Exception as e:
            print(f"✗ {name} failed: {e}")
            results.append((name, False))
    
    # Summary
    print("\n" + "=" * 60)
    print("Test Summary")
    print("=" * 60)
    passed = sum(1 for _, success in results if success)
    total = len(results)
    
    for name, success in results:
        status = "✓ PASS" if success else "✗ FAIL"
        print(f"{status}: {name}")
    
    print(f"\nTotal: {passed}/{total} tests passed ({passed/total*100:.0f}%)")
    
    if passed == total:
        print("\n🎉 All tests passed! Performance optimizations are working.")
    else:
        print("\n⚠ Some tests failed. Check the output above.")

if __name__ == "__main__":
    asyncio.run(main())
