<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { 
  ArrowLeft, Moon, Sun, Download, Upload, Info, Monitor,
  Trash2, Database
} from 'lucide-vue-next'
import { useDark, useToggle } from '@vueuse/core'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { useMessage } from '@/composables/useMessage'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { groupApi } from '@/api/group'
import { replaceApi } from '@/api/replace'
import { sourceApi } from '@/api/source'

const router = useRouter()
const { success, error, info } = useMessage()

// Theme
const isDark = useDark()
const toggleDark = useToggle(isDark)

// Data Management
async function handleExportData() {
  try {
    const [groups, replaces, sources] = await Promise.all([
      groupApi.getBookGroups(),
      replaceApi.getReplaceRules(),
      sourceApi.getBookSources()
    ])
    
    const data = {
      groups: groups.data,
      replaces: replaces.data,
      sources: sources.data,
      timestamp: Date.now(),
      version: '3.0'
    }
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `reader_backup_${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    
    success('备份导出成功')
  } catch (e) {
    error('导出失败')
  }
}

// Import is tricky because it involves overwriting complex data.
// For now, simple export is good enough for "Data Backup" feature in Phase 3.
// Or just "Clear Cache".

async function handleClearCache() {
  if (!confirm('确定清除所有应用缓存吗？这将重置所有本地设置。')) return
  localStorage.clear()
  location.reload()
}

function goBack() {
  router.back()
}
</script>

<template>
  <div class="min-h-screen bg-background">
     <header class="sticky top-0 z-50 w-full bg-background/95 backdrop-blur border-b">
      <div class="container mx-auto flex h-14 max-w-screen-2xl items-center gap-4 px-4">
        <Button variant="ghost" size="icon" @click="goBack">
          <ArrowLeft class="h-4 w-4" />
        </Button>
        <h1 class="font-semibold">设置</h1>
      </div>
    </header>

    <main class="container mx-auto max-w-screen-2xl px-4 py-6 space-y-8">
      <!-- Appearance -->
      <section class="space-y-4">
        <h2 class="text-sm font-medium text-muted-foreground uppercase tracking-wider">外观</h2>
        <div class="rounded-lg border bg-card text-card-foreground shadow-sm">
           <div class="p-4 flex items-center justify-between">
              <div class="flex items-center gap-3">
                 <div class="p-2 rounded-full bg-muted">
                    <Moon v-if="isDark" class="h-5 w-5" />
                    <Sun v-else class="h-5 w-5" />
                 </div>
                 <div class="flex flex-col">
                    <span class="font-medium">深色模式</span>
                    <span class="text-xs text-muted-foreground">切换应用亮色/暗色主题</span>
                 </div>
              </div>
              <Switch :checked="isDark" @update:checked="toggleDark()" />
           </div>
        </div>
      </section>

      <!-- Data -->
      <section class="space-y-4">
        <h2 class="text-sm font-medium text-muted-foreground uppercase tracking-wider">数据</h2>
         <div class="rounded-lg border bg-card text-card-foreground shadow-sm divide-y">
            <div 
              class="p-4 flex items-center justify-between cursor-pointer hover:bg-muted/50 transition-colors"
              @click="handleExportData"
            >
              <div class="flex items-center gap-3">
                 <div class="p-2 rounded-full bg-muted">
                    <Download class="h-5 w-5" />
                 </div>
                 <div class="flex flex-col">
                    <span class="font-medium">导出数据备份</span>
                    <span class="text-xs text-muted-foreground">备份书源、分组、替换规则等数据</span>
                 </div>
              </div>
            </div>

            <div 
              class="p-4 flex items-center justify-between cursor-pointer hover:bg-muted/50 transition-colors"
              @click="handleClearCache"
            >
              <div class="flex items-center gap-3">
                 <div class="p-2 rounded-full bg-destructive/10 text-destructive">
                    <Trash2 class="h-5 w-5" />
                 </div>
                 <div class="flex flex-col">
                    <span class="font-medium text-destructive">清除应用缓存</span>
                    <span class="text-xs text-muted-foreground">重置本地设置（不删除服务器书籍）</span>
                 </div>
              </div>
            </div>
         </div>
      </section>

      <!-- About -->
      <section class="space-y-4">
        <h2 class="text-sm font-medium text-muted-foreground uppercase tracking-wider">关于</h2>
         <div class="rounded-lg border bg-card text-card-foreground shadow-sm">
            <div class="p-6 text-center space-y-4">
               <div class="inline-flex items-center justify-center p-4 bg-muted rounded-full mb-2">
                  <Monitor class="h-8 w-8 text-primary" />
               </div>
               <div>
                 <h3 class="text-lg font-bold">Reader Web v3</h3>
                 <p class="text-sm text-muted-foreground">Modern Web Reader powered by Shadcn Vue</p>
               </div>
               <div class="pt-4 flex justify-center gap-4">
                  <a href="https://github.com/hectorqin/reader" target="_blank" class="text-sm text-primary hover:underline">GitHub</a>
                  <span class="text-muted-foreground">|</span>
                  <span class="text-sm text-muted-foreground">MIT License</span>
               </div>
            </div>
         </div>
      </section>
    </main>
  </div>
</template>
