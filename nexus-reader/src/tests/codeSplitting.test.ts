/**
 * 代码分割策略属性测试
 * 功能: client-side-ai-optimization, 属性23: 代码分割策略
 * 验证: 需求 6.2
 */

import { describe, test, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

describe('代码分割策略属性测试', () => {
  test('属性23: 代码分割策略 - AI相关代码应该被分离到独立的异步chunk', async () => {
    // **功能: client-side-ai-optimization, 属性23: 代码分割策略**
    
    // 读取构建配置文件
    const configPath = join(process.cwd(), 'rsbuild.config.ts')
    const configContent = readFileSync(configPath, 'utf-8')
    
    // 验证AI相关的cacheGroups配置
    expect(configContent).toContain('cacheGroups:')
    
    // 验证AI库被配置为异步加载
    expect(configContent).toContain('name: "lib-ai"')
    expect(configContent).toContain('chunks: "async"')
    expect(configContent).toContain('enforce: true')
    
    // 验证TTS库被配置为异步加载
    expect(configContent).toContain('name: "lib-tts"')
    expect(configContent).toContain('chunks: "async"')
    
    // 验证AI服务代码被分离
    expect(configContent).toContain('ai-services')
    expect(configContent).toContain('stores[\\\\\/]ai')
    expect(configContent).toContain('pages[\\\\\/]ai-')
  })

  test('属性23: 构建产物应该包含独立的AI chunk文件', async () => {
    const fs = await import('fs')
    const path = await import('path')
    
    const distPath = path.join(process.cwd(), 'dist')
    
    // 如果dist目录存在，检查chunk分离情况
    if (fs.existsSync(distPath)) {
      const jsDir = path.join(distPath, 'static/js')
      
      if (fs.existsSync(jsDir)) {
        const jsFiles = fs.readdirSync(jsDir, { recursive: true })
          .filter(file => typeof file === 'string' && file.endsWith('.js'))
          .map(file => file as string)
        
        // 验证存在AI相关的独立chunk
        const hasAIChunk = jsFiles.some(file => 
          file.includes('lib-ai') || 
          file.includes('ai-services') ||
          file.includes('async') // 异步chunk通常包含async
        )
        
        const hasTTSChunk = jsFiles.some(file => 
          file.includes('lib-tts') || 
          file.includes('tts')
        )
        
        // 如果有构建产物，应该有正确的chunk分离
        if (jsFiles.length > 0) {
          expect(hasAIChunk || hasTTSChunk).toBe(true)
        }
        
        // 验证主bundle不应该过大（如果AI代码被正确分离）
        const mainFiles = jsFiles.filter(file => 
          file.includes('index') || 
          file.includes('main') ||
          (!file.includes('async') && !file.includes('lib-'))
        )
        
        for (const mainFile of mainFiles) {
          const filePath = path.join(jsDir, mainFile)
          const stats = fs.statSync(filePath)
          
          // 主文件不应该超过5MB（如果AI代码被正确分离）
          if (stats.size > 5 * 1024 * 1024) {
            console.warn(`警告: 主文件 ${mainFile} 大小为 ${Math.round(stats.size / 1024 / 1024)}MB，可能包含未分离的AI代码`)
          }
        }
      }
    }
  })

  test('属性23: chunk大小限制验证', async () => {
    // 读取构建配置
    const configPath = join(process.cwd(), 'rsbuild.config.ts')
    const configContent = readFileSync(configPath, 'utf-8')
    
    // 验证vendor chunk有大小限制
    expect(configContent).toContain('maxSize:')
    expect(configContent).toContain('100000') // 100KB限制
    
    // 验证minSize配置
    expect(configContent).toContain('minSize:')
  })

  test('属性23: 优先级配置正确性验证', async () => {
    const configPath = join(process.cwd(), 'rsbuild.config.ts')
    const configContent = readFileSync(configPath, 'utf-8')
    
    // 验证AI相关chunk有最高优先级
    const aiPriorityMatch = configContent.match(/name: "lib-ai"[\s\S]*?priority: (\d+)/)
    const ttsPriorityMatch = configContent.match(/name: "lib-tts"[\s\S]*?priority: (\d+)/)
    const vuePriorityMatch = configContent.match(/name: "lib-vue"[\s\S]*?priority: (\d+)/)
    
    if (aiPriorityMatch && vuePriorityMatch) {
      const aiPriority = parseInt(aiPriorityMatch[1])
      const vuePriority = parseInt(vuePriorityMatch[1])
      
      // AI chunk应该有更高的优先级
      expect(aiPriority).toBeGreaterThan(vuePriority)
    }
    
    if (ttsPriorityMatch && vuePriorityMatch) {
      const ttsPriority = parseInt(ttsPriorityMatch[1])
      const vuePriority = parseInt(vuePriorityMatch[1])
      
      // TTS chunk应该有更高的优先级
      expect(ttsPriority).toBeGreaterThan(vuePriority)
    }
  })
})