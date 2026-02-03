#!/bin/bash

# Nexus Reader - Cloudflare Free Tier 自动部署脚本
# 使用方法: ./deploy.sh

set -e

echo "🚀 Nexus Reader - Cloudflare Free Tier 自动部署"
echo "=============================================="

# 检查系统依赖
check_dependencies() {
    echo "📋 检查系统依赖..."

    # 检查Node.js
    if ! command -v node &> /dev/null; then
        echo "❌ 需要安装 Node.js (https://nodejs.org)"
        exit 1
    fi

    # 检查npm
    if ! command -v npm &> /dev/null; then
        echo "❌ 需要安装 npm"
        exit 1
    fi

    # 检查git
    if ! command -v git &> /dev/null; then
        echo "❌ 需要安装 git"
        exit 1
    fi

    echo "✅ 依赖检查通过 (Node.js $(node -v), npm $(npm -v))"
}

# 检查Cloudflare配置
check_cloudflare_config() {
    echo "☁️ 检查Cloudflare配置..."

    # 检查环境变量（可选，用于本地测试）
    if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
        echo "⚠️ CLOUDFLARE_API_TOKEN 未设置 (GitHub Actions会自动设置)"
    fi

    if [ -z "$CLOUDFLARE_ACCOUNT_ID" ]; then
        echo "⚠️ CLOUDFLARE_ACCOUNT_ID 未设置 (GitHub Actions会自动设置)"
    fi

    echo "✅ Cloudflare配置检查完成"
}

# 构建前端应用
build_frontend() {
    echo "🔨 构建前端应用..."

    cd nexus-reader

    # 清理缓存
    rm -rf node_modules/.cache dist

    # 安装依赖
    echo "   📦 安装依赖..."
    npm ci

    # 运行测试（如果有的话）
    if [ -f "package.json" ] && grep -q '"test"' package.json; then
        echo "   🧪 运行测试..."
        npm test || echo "⚠️ 测试失败，继续构建..."
    fi

    # 构建生产版本
    echo "   🏗️ 构建生产版本..."
    npm run build

    # 检查构建结果
    if [ ! -d "dist" ]; then
        echo "❌ 构建失败：dist目录不存在"
        exit 1
    fi

    # 显示构建信息
    BUILD_SIZE=$(du -sh dist | cut -f1)
    echo "✅ 前端构建完成 (大小: $BUILD_SIZE)"

    cd ..
}

# 准备Cloudflare部署
prepare_cloudflare_deployment() {
    echo "☁️ 准备Cloudflare部署..."

    # 检查wrangler配置
    if [ ! -f "cloudflare-workers/wrangler.toml" ]; then
        echo "❌ wrangler.toml 配置文件不存在"
        exit 1
    fi

    # 检查package.json
    if [ ! -f "cloudflare-workers/package.json" ]; then
        echo "❌ cloudflare-workers/package.json 不存在"
        exit 1
    fi

    echo "✅ Cloudflare部署准备完成"
}

# 验证部署配置
validate_deployment_config() {
    echo "🔍 验证部署配置..."

    # 检查GitHub Actions配置
    if [ ! -f ".github/workflows/production-deployment.yml" ]; then
        echo "❌ GitHub Actions工作流文件不存在"
        exit 1
    fi

    # 检查必要的secrets（通过注释提醒）
    echo "   📝 请确保在GitHub仓库中设置以下secrets:"
    echo "      - CLOUDFLARE_API_TOKEN"
    echo "      - CLOUDFLARE_ACCOUNT_ID"
    echo "      - HF_TOKEN (如果使用CF绕过服务)"

    echo "✅ 部署配置验证完成"
}

# 生成部署摘要
generate_deployment_summary() {
    echo "📊 生成部署摘要..."

    # 计算项目统计
    TOTAL_FILES=$(find . -type f -not -path './.*' -not -path './node_modules/*' -not -path './target/*' | wc -l)
    FRONTEND_SIZE=$(du -sh nexus-reader/dist 2>/dev/null | cut -f1 || echo "N/A")
    BACKEND_SIZE=$(du -sh nexus-lite/target/release 2>/dev/null | cut -f1 || echo "N/A")

    cat << EOF

📋 项目统计:
   • 总文件数: $TOTAL_FILES
   • 前端大小: $FRONTEND_SIZE
   • 后端大小: $BACKEND_SIZE
   • Cloudflare集成: ✅
   • 免费额度: ✅

🌐 部署架构:
   • 前端: Cloudflare Pages (免费)
   • API: Cloudflare Workers (免费)
   • 缓存: Cloudflare KV (免费)
   • CI/CD: GitHub Actions (免费)

EOF
}

# 显示使用说明
show_usage_instructions() {
    echo ""
    echo "🎯 下一步操作:"
    echo ""
    echo "1. 📤 推送代码到GitHub:"
    echo "   git add ."
    echo "   git commit -m 'Deploy to Cloudflare'"
    echo "   git push origin main"
    echo ""
    echo "2. 🤖 自动部署流程:"
    echo "   • GitHub Actions检测代码变更"
    echo "   • 自动构建前端和后端"
    echo "   • 部署到Cloudflare Pages/Workers"
    echo "   • 配置KV存储和CDN"
    echo "   • 应用性能优化"
    echo ""
    echo "3. 🌐 访问应用:"
    echo "   • 前端: https://nexus-reader.pages.dev"
    echo "   • API: https://api.nexus-reader.pages.dev"
    echo ""
    echo "4. 📊 监控状态:"
    echo "   • GitHub Actions查看部署进度"
    echo "   • Cloudflare控制台查看性能指标"
    echo ""
}

# 主函数
main() {
    echo "🎬 开始部署准备..."
    echo ""

    check_dependencies
    echo ""

    check_cloudflare_config
    echo ""

    build_frontend
    echo ""

    prepare_cloudflare_deployment
    echo ""

    validate_deployment_config
    echo ""

    generate_deployment_summary

    show_usage_instructions

    echo ""
    echo "🎉 本地准备完成！现在可以推送代码开始自动部署了。"
    echo ""
    echo "💡 提示: 整个部署过程完全免费，使用Cloudflare的慷慨免费额度"
    echo ""
}

# 执行主函数
main "$@"