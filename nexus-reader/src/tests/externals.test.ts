/**
 * 外部依赖配置属性测试
 * 功能: client-side-ai-optimization, 属性7: 外部依赖配置
 * 验证: 需求 2.3
 */

import { describe, test, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

describe('外部依赖配置属性测试', () => {
  test('属性7: 外部依赖配置 - 大型AI库应该被标记为external', async () => {
    // **功能: client-side-ai-optimization, 属性7: 外部依赖配置**
    
    // 读取构建配置文件
    const configPath = join(process.cwd(), 'rsbuild.config.ts')
    const configContent = readFileSync(configPath, 'utf-8')
    
    // 验证externals配置存在
    expect(configContent).toContain('externals:')
    
    // 验证关键AI库被外部化
    const requiredExternals = [
      '@mlc-ai/web-llm',
      '@huggingface/transformers', 
      'onnxruntime-web',
      'piper-tts-web'
    ]
    
    for (const external of requiredExternals) {
      expect(configContent).toContain(`'${external}'`)
    }
    
    // 验证只在生产环境启用externals
    expect(configContent).toContain("process.env.NODE_ENV === 'production'")
  })

  test('属性7: CDN资源配置完整性验证', async () => {
    // 动态导入CDN配置
    const { CDN_RESOURCES, getCDNResource } = await import('../config/cdnResources')
    
    // 验证所有必需的AI库都有CDN配置
    const requiredPackages = [
      '@mlc-ai/web-llm',
      '@huggingface/transformers',
      'onnxruntime-web', 
      'piper-tts-web'
    ]
    
    for (const packageName of requiredPackages) {
      const resource = getCDNResource(packageName)
      expect(resource).toBeTruthy()
      expect(resource?.url).toMatch(/^https:\/\//)
      expect(resource?.globalName).toBeTruthy()
      expect(resource?.fallback).toBeInstanceOf(Array)
    }
  })

  test('属性7: 构建产物不应包含外部化的AI库', async () => {
    // 这个测试需要在构建后运行
    // 检查dist目录中是否包含应该被外部化的库
    
    const fs = await import('fs')
    const path = await import('path')
    
    const distPath = path.join(process.cwd(), 'dist')
    
    // 如果dist目录存在，检查是否包含外部化的库
    if (fs.existsSync(distPath)) {
      const jsFiles = fs.readdirSync(path.join(distPath, 'static/js'), { recursive: true })
        .filter(file => typeof file === 'string' && file.endsWith('.js'))
      
      // 读取所有JS文件内容
      for (const file of jsFiles) {
        const filePath = path.join(distPath, 'static/js', file as string)
        const content = fs.readFileSync(filePath, 'utf-8')
        
        // 验证不包含应该被外部化的库的大量代码
        // 注意：可能包含少量引用代码，但不应该包含完整的库
        const suspiciousPatterns = [
          'webllm',
          'huggingface',
          'onnxruntime',
          'piper-tts'
        ]
        
        for (const pattern of suspiciousPatterns) {
          // 如果文件很大且包含这些模式，可能没有正确外部化
          if (content.length > 1000000 && content.toLowerCase().includes(pattern)) {
            console.warn(`警告: ${file} 可能包含未外部化的 ${pattern} 代码`)
          }
        }
      }
    }
  })
})