<script setup lang="ts">
import { Info, Settings } from 'lucide-vue-next'
</script>

<template>
  <section class="animate-in fade-in slide-in-from-bottom-4 duration-500 delay-300">
    <div class="flex items-center gap-2 mb-4 px-1">
      <Info class="w-4 h-4 text-primary" />
      <h2 class="text-sm font-bold text-muted-foreground uppercase tracking-wider">关于</h2>
    </div>
    <div
      class="rounded-2xl border border-border/50 bg-card hover:bg-muted/30 transition-all duration-200 hover:shadow-md overflow-hidden"
    >
      <div class="p-8 text-center space-y-5">
        <div class="relative inline-flex items-center justify-center">
          <div class="absolute inset-0 bg-primary/20 blur-2xl rounded-full" />
          <div
            class="relative w-20 h-20 rounded-3xl bg-linear-to-br from-primary/10 to-primary/5 flex items-center justify-center border border-primary/20 shadow-lg"
          >
            <Settings class="h-10 w-10 text-primary" />
          </div>
        </div>
        <div class="space-y-2">
          <h3 class="text-2xl font-bold tracking-tight">Reader Web v3</h3>
          <p class="text-sm text-muted-foreground">Modern Web Reader powered by Shadcn Vue</p>
          <p class="text-xs text-muted-foreground">
            设置页已按“日常设置 / 高级治理”进行分层展示。
          </p>
        </div>
        <div class="pt-2 flex items-center justify-center gap-4 text-sm">
          <a
            href="https://github.com/hectorqin/reader"
            target="_blank"
            class="text-primary hover:text-primary/80 hover:underline transition-colors font-medium"
          >
            GitHub
          </a>
          <span class="text-muted-foreground/50">•</span>
          <span class="text-muted-foreground">MIT License</span>
        </div>
      </div>
    </div>
  </section>
</template>
