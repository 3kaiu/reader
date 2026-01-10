#!/bin/bash

# =============================================================================
# 端侧AI优化 - 开发环境调试支持脚本
# =============================================================================

echo "🔧 Nexus Reader AI服务调试工具"
echo "=================================="

# 检查当前目录
if [ ! -f "package.json" ]; then
    echo "❌ 请在nexus-reader目录中运行此脚本"
    exit 1
fi

# 解析命令行参数
ACTION=${1:-"status"}
MODEL_ID=${2:-""}

case $ACTION in
    "status")
        echo "📊 AI服务状态检查"
        echo ""
        
        # 检查WebGPU支持
        echo "🔍 WebGPU支持检测:"
        if command -v node >/dev/null 2>&1; then
            node -e "
                console.log('   浏览器环境: 需要在浏览器中检测');
                console.log('   Node.js环境: WebGPU不可用');
            "
        fi
        
        # 检查AI服务文件
        echo ""
        echo "📁 AI服务文件检查:"
        files=(
            "src/services/aiServiceManager.ts"
            "src/services/ttsServiceManager.ts"
            "src/utils/modelCacheManager.ts"
            "src/utils/aiErrorHandler.ts"
            "src/utils/performanceMonitor.ts"
        )
        
        for file in "${files[@]}"; do
            if [ -f "$file" ]; then
                echo "   ✅ $file"
            else
                echo "   ❌ $file (缺失)"
            fi
        done
        
        # 检查缓存状态
        echo ""
        echo "💾 缓存状态:"
        if [ -d "node_modules/.cache/ai-models" ]; then
            cache_size=$(du -sh node_modules/.cache/ai-models | cut -f1)
            echo "   模型缓存: $cache_size"
            echo "   缓存位置: node_modules/.cache/ai-models"
        else
            echo "   模型缓存: 未初始化"
        fi
        
        # 检查依赖状态
        echo ""
        echo "📦 依赖状态:"
        deps=("@mlc-ai/web-llm" "piper-tts-web" "@huggingface/transformers")
        for dep in "${deps[@]}"; do
            if [ -d "node_modules/$dep" ]; then
                echo "   ✅ $dep (已安装)"
            else
                echo "   ⚠️  $dep (未安装 - 将从CDN加载)"
            fi
        done
        ;;
        
    "test-webgpu")
        echo "🧪 WebGPU功能测试"
        echo ""
        echo "启动开发服务器进行WebGPU测试..."
        echo "请在浏览器中打开 http://localhost:3000 并查看控制台"
        echo ""
        echo "测试步骤:"
        echo "1. 打开浏览器开发者工具"
        echo "2. 在控制台中运行: navigator.gpu"
        echo "3. 如果返回对象，则支持WebGPU"
        echo "4. 运行: await navigator.gpu.requestAdapter()"
        echo "5. 检查返回的适配器信息"
        echo ""
        echo "按 Ctrl+C 停止服务器"
        bun run dev
        ;;
        
    "test-ai")
        echo "🤖 AI服务功能测试"
        echo ""
        
        if [ -z "$MODEL_ID" ]; then
            echo "使用方法: $0 test-ai <model-id>"
            echo ""
            echo "可用模型:"
            echo "  - Qwen2.5-0.5B-Instruct-q4f16_1-MLC"
            echo "  - Qwen2.5-1.5B-Instruct-q4f16_1-MLC"
            echo "  - Llama-3.2-1B-Instruct-q4f16_1-MLC"
            exit 1
        fi
        
        echo "测试模型: $MODEL_ID"
        echo ""
        echo "创建测试脚本..."
        
        cat > test-ai-service.js << 'EOF'
import { aiServiceManager } from './src/services/aiServiceManager.ts'

async function testAIService() {
    console.log('🚀 开始AI服务测试...')
    
    try {
        // 初始化服务
        console.log('1. 初始化AI服务...')
        await aiServiceManager.initialize()
        
        // 检测WebGPU
        console.log('2. 检测WebGPU支持...')
        const supported = await aiServiceManager.detectWebGPUSupport()
        console.log(`   WebGPU支持: ${supported}`)
        
        if (!supported) {
            console.log('❌ WebGPU不支持，无法继续测试')
            return
        }
        
        // 加载模型
        console.log(`3. 加载模型: ${process.argv[2]}`)
        const loaded = await aiServiceManager.loadModel(process.argv[2])
        console.log(`   模型加载: ${loaded}`)
        
        if (!loaded) {
            console.log('❌ 模型加载失败')
            return
        }
        
        // 测试推理
        console.log('4. 测试推理...')
        const response = await aiServiceManager.inference('你好，请介绍一下自己。')
        console.log(`   推理结果: ${response}`)
        
        // 获取性能指标
        console.log('5. 性能指标:')
        console.log(`   ${JSON.stringify(aiServiceManager.performance.value, null, 2)}`)
        
        console.log('✅ AI服务测试完成')
        
    } catch (error) {
        console.error('❌ 测试失败:', error)
    } finally {
        // 清理
        await aiServiceManager.cleanup()
        process.exit(0)
    }
}

testAIService()
EOF
        
        echo "运行测试..."
        node test-ai-service.js "$MODEL_ID"
        rm -f test-ai-service.js
        ;;
        
    "test-tts")
        echo "🔊 TTS服务功能测试"
        echo ""
        echo "创建TTS测试脚本..."
        
        cat > test-tts-service.js << 'EOF'
import { ttsServiceManager } from './src/services/ttsServiceManager.ts'

async function testTTSService() {
    console.log('🚀 开始TTS服务测试...')
    
    try {
        // 初始化服务
        console.log('1. 初始化TTS服务...')
        await ttsServiceManager.initialize()
        
        // 获取可用语音
        console.log('2. 获取可用语音...')
        const voices = await ttsServiceManager.getAvailableVoices()
        console.log(`   可用语音数量: ${voices.length}`)
        voices.forEach(voice => {
            console.log(`   - ${voice.name} (${voice.lang})`)
        })
        
        // 测试语音合成
        if (voices.length > 0) {
            console.log('3. 测试语音合成...')
            const audioBuffer = await ttsServiceManager.synthesize(
                '这是一个TTS测试。',
                voices[0].name
            )
            console.log(`   音频生成: ${audioBuffer ? '成功' : '失败'}`)
            if (audioBuffer) {
                console.log(`   音频大小: ${audioBuffer.byteLength} bytes`)
            }
        }
        
        console.log('✅ TTS服务测试完成')
        
    } catch (error) {
        console.error('❌ 测试失败:', error)
    } finally {
        process.exit(0)
    }
}

testTTSService()
EOF
        
        echo "运行测试..."
        node test-tts-service.js
        rm -f test-tts-service.js
        ;;
        
    "clear-cache")
        echo "🧹 清理AI缓存"
        echo ""
        
        # 清理模型缓存
        if [ -d "node_modules/.cache/ai-models" ]; then
            echo "清理模型缓存..."
            rm -rf node_modules/.cache/ai-models
            echo "✅ 模型缓存已清理"
        else
            echo "模型缓存目录不存在"
        fi
        
        # 清理浏览器缓存（提示）
        echo ""
        echo "💡 还需要清理浏览器缓存:"
        echo "1. 打开浏览器开发者工具"
        echo "2. 进入 Application/Storage 标签"
        echo "3. 清理 IndexedDB 中的 ai-models 数据库"
        echo "4. 清理 Cache Storage 中的相关缓存"
        ;;
        
    "performance")
        echo "📊 性能分析"
        echo ""
        
        # 检查性能监控文件
        if [ -f "src/utils/performanceMonitor.ts" ]; then
            echo "✅ 性能监控模块已安装"
            
            # 分析性能监控代码
            echo ""
            echo "🔍 性能监控功能:"
            grep -n "report.*:" src/utils/performanceMonitor.ts | head -10
            
            echo ""
            echo "💡 性能监控使用方法:"
            echo "1. 在浏览器中打开应用"
            echo "2. 打开开发者工具控制台"
            echo "3. 运行: performanceMonitor.getAIPerformanceSummary()"
            echo "4. 查看AI性能指标"
            
        else
            echo "❌ 性能监控模块未找到"
        fi
        ;;
        
    "logs")
        echo "📋 查看AI服务日志"
        echo ""
        
        # 检查日志文件
        log_files=(
            "logs/ai-service.log"
            "logs/error.log"
            "logs/performance.log"
        )
        
        found_logs=false
        for log_file in "${log_files[@]}"; do
            if [ -f "$log_file" ]; then
                echo "📄 $log_file (最近10行):"
                tail -10 "$log_file"
                echo ""
                found_logs=true
            fi
        done
        
        if [ "$found_logs" = false ]; then
            echo "未找到日志文件"
            echo ""
            echo "💡 启用日志记录:"
            echo "1. 设置环境变量: DEBUG=ai:*"
            echo "2. 或在代码中启用详细日志"
        fi
        
        # 浏览器控制台日志提示
        echo "💡 查看浏览器控制台日志:"
        echo "1. 打开开发者工具"
        echo "2. 进入 Console 标签"
        echo "3. 过滤 '[AI Service]' 或 '[TTS Service]'"
        ;;
        
    "help"|*)
        echo "使用方法: $0 <action> [options]"
        echo ""
        echo "可用操作:"
        echo "  status          - 检查AI服务状态"
        echo "  test-webgpu     - 测试WebGPU支持"
        echo "  test-ai <model> - 测试AI服务功能"
        echo "  test-tts        - 测试TTS服务功能"
        echo "  clear-cache     - 清理AI缓存"
        echo "  performance     - 性能分析"
        echo "  logs            - 查看服务日志"
        echo "  help            - 显示此帮助信息"
        echo ""
        echo "示例:"
        echo "  $0 status"
        echo "  $0 test-ai Qwen2.5-0.5B-Instruct-q4f16_1-MLC"
        echo "  $0 clear-cache"
        ;;
esac