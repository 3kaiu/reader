#!/bin/bash

# =============================================================================
# 端侧AI优化 - 性能分析脚本
# =============================================================================

echo "⚡ Nexus Reader 性能分析工具"
echo "============================"

# 检查当前目录
if [ ! -f "package.json" ]; then
    echo "❌ 请在nexus-reader目录中运行此脚本"
    exit 1
fi

ACTION=${1:-"all"}

analyze_build_performance() {
    echo "🏗️  构建性能分析"
    echo "=================="
    
    if [ ! -d "dist" ]; then
        echo "❌ 构建产物不存在，请先运行构建"
        return 1
    fi
    
    # 分析构建时间
    if [ -f "dist/build-stats.json" ]; then
        echo "📊 构建统计:"
        node -e "
            const stats = require('./dist/build-stats.json');
            console.log(\`   构建时间: \${stats.time || 'N/A'}ms\`);
            console.log(\`   入口数量: \${stats.entrypoints ? Object.keys(stats.entrypoints).length : 'N/A'}\`);
            console.log(\`   资源数量: \${stats.assets ? stats.assets.length : 'N/A'}\`);
        " 2>/dev/null || echo "   构建统计文件格式错误"
    else
        echo "⚠️  构建统计文件不存在"
    fi
    
    # 分析chunk大小和数量
    echo ""
    echo "📦 Chunk分析:"
    js_count=$(find dist/static/js -name "*.js" 2>/dev/null | wc -l)
    css_count=$(find dist/static/css -name "*.css" 2>/dev/null | wc -l)
    
    echo "   JS文件: $js_count 个"
    echo "   CSS文件: $css_count 个"
    
    # 分析最大的chunks
    echo ""
    echo "📈 最大的JS chunks:"
    find dist/static/js -name "*.js" -exec du -h {} \; | sort -hr | head -5 | while read size file; do
        filename=$(basename "$file")
        echo "   $size - $filename"
    done
    
    # 分析代码分割效果
    echo ""
    echo "🔀 代码分割分析:"
    vendor_size=$(find dist/static/js -name "*vendor*" -exec du -ch {} \; 2>/dev/null | tail -1 | cut -f1 || echo "0")
    app_size=$(find dist/static/js -name "*app*" -o -name "*main*" -exec du -ch {} \; 2>/dev/null | tail -1 | cut -f1 || echo "0")
    ai_size=$(find dist/static/js -name "*ai*" -exec du -ch {} \; 2>/dev/null | tail -1 | cut -f1 || echo "0")
    
    echo "   Vendor chunks: $vendor_size"
    echo "   App chunks: $app_size"
    echo "   AI chunks: $ai_size"
    
    if [ "$ai_size" = "0" ]; then
        echo "   ✅ AI代码已成功分离"
    else
        echo "   ⚠️  AI代码仍在主bundle中"
    fi
}

analyze_runtime_performance() {
    echo ""
    echo "🚀 运行时性能分析"
    echo "=================="
    
    # 检查性能监控模块
    if [ -f "src/utils/performanceMonitor.ts" ]; then
        echo "✅ 性能监控模块已安装"
        
        # 分析性能监控功能
        echo ""
        echo "📊 性能监控功能:"
        
        # 检查AI性能监控方法
        ai_methods=$(grep -n "reportAI\|reportModel\|reportInference\|reportTTS\|reportCache" src/utils/performanceMonitor.ts | wc -l)
        echo "   AI性能监控方法: $ai_methods 个"
        
        # 检查性能阈值
        echo ""
        echo "⚡ 性能阈值配置:"
        grep -A 10 "PERFORMANCE_THRESHOLDS" src/utils/performanceMonitor.ts | grep -E "(aiLibraryLoad|modelLoad|inference|ttsLoad)" | while read line; do
            echo "   $line"
        done
        
    else
        echo "❌ 性能监控模块未找到"
    fi
    
    # 检查AI服务性能配置
    echo ""
    echo "🤖 AI服务性能配置:"
    if [ -f "src/services/aiServiceManager.ts" ]; then
        # 检查自动卸载配置
        auto_unload=$(grep -n "AUTO_UNLOAD_TIMEOUT" src/services/aiServiceManager.ts | head -1)
        if [ ! -z "$auto_unload" ]; then
            echo "   ✅ 自动卸载已配置"
            echo "   $auto_unload"
        else
            echo "   ⚠️  未配置自动卸载"
        fi
        
        # 检查性能监控集成
        perf_integration=$(grep -n "performanceMonitor\|reportAI\|reportModel" src/services/aiServiceManager.ts | wc -l)
        if [ "$perf_integration" -gt 0 ]; then
            echo "   ✅ 性能监控已集成 ($perf_integration 处)"
        else
            echo "   ⚠️  性能监控未集成"
        fi
    fi
}

analyze_memory_usage() {
    echo ""
    echo "💾 内存使用分析"
    echo "================"
    
    # 检查模型缓存配置
    if [ -f "src/utils/modelCacheManager.ts" ]; then
        echo "✅ 模型缓存管理器已安装"
        
        # 检查缓存大小限制
        cache_limit=$(grep -n "MAX_CACHE_SIZE\|maxCacheSize" src/utils/modelCacheManager.ts | head -1)
        if [ ! -z "$cache_limit" ]; then
            echo "   缓存大小限制: $cache_limit"
        fi
        
        # 检查LRU策略
        lru_config=$(grep -n "LRU\|evict" src/utils/modelCacheManager.ts | wc -l)
        if [ "$lru_config" -gt 0 ]; then
            echo "   ✅ LRU淘汰策略已配置"
        else
            echo "   ⚠️  LRU淘汰策略未配置"
        fi
        
        # 检查智能预加载
        preload_config=$(grep -n "preload\|warmup" src/utils/modelCacheManager.ts | wc -l)
        if [ "$preload_config" -gt 0 ]; then
            echo "   ✅ 智能预加载已配置"
        else
            echo "   ⚠️  智能预加载未配置"
        fi
    fi
    
    # 检查当前缓存使用情况
    echo ""
    echo "📊 当前缓存状态:"
    if [ -d "node_modules/.cache/ai-models" ]; then
        cache_size=$(du -sh node_modules/.cache/ai-models | cut -f1)
        cache_files=$(find node_modules/.cache/ai-models -type f | wc -l)
        echo "   缓存大小: $cache_size"
        echo "   缓存文件: $cache_files 个"
        
        # 列出缓存的模型
        echo "   缓存的模型:"
        find node_modules/.cache/ai-models -name "*.bin" -o -name "*.json" | head -5 | while read file; do
            filename=$(basename "$file")
            size=$(du -h "$file" | cut -f1)
            echo "     $size - $filename"
        done
    else
        echo "   缓存目录不存在"
    fi
}

analyze_network_performance() {
    echo ""
    echo "🌐 网络性能分析"
    echo "================"
    
    # 检查CDN配置
    if [ -f "src/utils/cdnResourceLoader.ts" ]; then
        echo "✅ CDN资源加载器已安装"
        
        # 检查CDN配置
        cdn_urls=$(grep -n "cdn\|CDN" src/utils/cdnResourceLoader.ts | wc -l)
        echo "   CDN配置项: $cdn_urls 个"
        
        # 检查重试机制
        retry_config=$(grep -n "retry\|timeout" src/utils/cdnResourceLoader.ts | wc -l)
        if [ "$retry_config" -gt 0 ]; then
            echo "   ✅ 重试机制已配置"
        else
            echo "   ⚠️  重试机制未配置"
        fi
        
        # 检查完整性验证
        integrity_check=$(grep -n "integrity\|checksum\|hash" src/utils/cdnResourceLoader.ts | wc -l)
        if [ "$integrity_check" -gt 0 ]; then
            echo "   ✅ 完整性验证已配置"
        else
            echo "   ⚠️  完整性验证未配置"
        fi
    fi
    
    # 检查网络错误处理
    echo ""
    echo "🔧 网络错误处理:"
    if [ -f "src/utils/aiErrorHandler.ts" ]; then
        network_errors=$(grep -n "network\|timeout\|offline" src/utils/aiErrorHandler.ts | wc -l)
        if [ "$network_errors" -gt 0 ]; then
            echo "   ✅ 网络错误处理已配置 ($network_errors 处)"
        else
            echo "   ⚠️  网络错误处理不完整"
        fi
    fi
}

generate_performance_report() {
    echo ""
    echo "📋 生成性能报告"
    echo "================"
    
    report_file="performance-analysis-$(date +%Y%m%d-%H%M%S).md"
    
    cat > "$report_file" << EOF
# Nexus Reader 性能分析报告

生成时间: $(date)

## 构建性能

EOF
    
    # 添加构建信息
    if [ -d "dist" ]; then
        total_size=$(du -sh dist/ | cut -f1)
        js_count=$(find dist/static/js -name "*.js" 2>/dev/null | wc -l)
        css_count=$(find dist/static/css -name "*.css" 2>/dev/null | wc -l)
        
        cat >> "$report_file" << EOF
- 总构建大小: $total_size
- JS文件数量: $js_count
- CSS文件数量: $css_count

### 最大的文件
EOF
        
        find dist/static/js -name "*.js" -exec du -h {} \; | sort -hr | head -5 | while read size file; do
            filename=$(basename "$file")
            echo "- $size - $filename" >> "$report_file"
        done
    fi
    
    cat >> "$report_file" << EOF

## AI服务性能配置

EOF
    
    # 检查AI服务配置
    if [ -f "src/services/aiServiceManager.ts" ]; then
        echo "- ✅ AI服务管理器已安装" >> "$report_file"
        
        if grep -q "AUTO_UNLOAD_TIMEOUT" src/services/aiServiceManager.ts; then
            echo "- ✅ 自动卸载已配置" >> "$report_file"
        else
            echo "- ⚠️ 自动卸载未配置" >> "$report_file"
        fi
    fi
    
    cat >> "$report_file" << EOF

## 性能监控

EOF
    
    if [ -f "src/utils/performanceMonitor.ts" ]; then
        ai_methods=$(grep -c "reportAI\|reportModel\|reportInference\|reportTTS\|reportCache" src/utils/performanceMonitor.ts)
        echo "- ✅ 性能监控模块已安装" >> "$report_file"
        echo "- AI性能监控方法: $ai_methods 个" >> "$report_file"
    else
        echo "- ❌ 性能监控模块未安装" >> "$report_file"
    fi
    
    cat >> "$report_file" << EOF

## 优化建议

EOF
    
    # 生成优化建议
    if [ -d "dist" ]; then
        total_mb=$(du -sm dist/ | cut -f1)
        if [ "$total_mb" -gt 50 ]; then
            echo "- 🔧 构建大小超过50MB，建议进一步优化" >> "$report_file"
        else
            echo "- ✅ 构建大小已达到目标" >> "$report_file"
        fi
    fi
    
    if [ ! -f "src/utils/performanceMonitor.ts" ]; then
        echo "- 🔧 建议安装性能监控模块" >> "$report_file"
    fi
    
    echo ""
    echo "✅ 性能报告已生成: $report_file"
}

# 主逻辑
case $ACTION in
    "build")
        analyze_build_performance
        ;;
    "runtime")
        analyze_runtime_performance
        ;;
    "memory")
        analyze_memory_usage
        ;;
    "network")
        analyze_network_performance
        ;;
    "report")
        generate_performance_report
        ;;
    "all"|*)
        analyze_build_performance
        analyze_runtime_performance
        analyze_memory_usage
        analyze_network_performance
        generate_performance_report
        ;;
esac

echo ""
echo "🎯 性能分析完成"
echo ""
echo "💡 使用方法:"
echo "  $0 build    - 仅分析构建性能"
echo "  $0 runtime  - 仅分析运行时性能"
echo "  $0 memory   - 仅分析内存使用"
echo "  $0 network  - 仅分析网络性能"
echo "  $0 report   - 生成详细报告"
echo "  $0 all      - 完整分析 (默认)"