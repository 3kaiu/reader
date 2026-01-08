<script setup lang="ts">
/**
 * 角色关系图谱组件
 * 使用 Canvas 绘制人物关系网络
 */
import { ref, onMounted, watch, computed } from 'vue'
import { Loader2, Users, ZoomIn, ZoomOut, RotateCcw } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import type { CharacterGraph, CharacterNode, CharacterEdge } from '@/types/ai'

const props = defineProps<{
  graph: CharacterGraph
  loading?: boolean
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const scale = ref(1)
const offsetX = ref(0)
const offsetY = ref(0)

// 角色颜色映射
const roleColors: Record<CharacterNode['role'], string> = {
  protagonist: '#22c55e',   // 绿色 - 主角
  antagonist: '#ef4444',    // 红色 - 反派
  supporting: '#3b82f6',    // 蓝色 - 配角
  mentioned: '#9ca3af'      // 灰色 - 仅提及
}

// 节点位置 (力导向布局简化版)
interface NodePosition {
  x: number
  y: number
  vx: number
  vy: number
}

const nodePositions = ref<Map<string, NodePosition>>(new Map())

// 初始化节点位置
function initPositions() {
  const canvas = canvasRef.value
  if (!canvas || props.graph.nodes.length === 0) return
  
  const centerX = canvas.width / 2
  const centerY = canvas.height / 2
  const radius = Math.min(canvas.width, canvas.height) * 0.35
  
  nodePositions.value.clear()
  
  props.graph.nodes.forEach((node, i) => {
    const angle = (i / props.graph.nodes.length) * Math.PI * 2
    nodePositions.value.set(node.name, {
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
      vx: 0,
      vy: 0
    })
  })
}

// 简单力导向模拟
function simulate() {
  const nodes = props.graph.nodes
  const edges = props.graph.edges
  const positions = nodePositions.value
  
  // 斥力 (节点间)
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const p1 = positions.get(nodes[i].name)
      const p2 = positions.get(nodes[j].name)
      if (!p1 || !p2) continue
      
      const dx = p2.x - p1.x
      const dy = p2.y - p1.y
      const dist = Math.sqrt(dx * dx + dy * dy) || 1
      const force = 2000 / (dist * dist)
      
      p1.vx -= (dx / dist) * force
      p1.vy -= (dy / dist) * force
      p2.vx += (dx / dist) * force
      p2.vy += (dy / dist) * force
    }
  }
  
  // 引力 (边连接)
  edges.forEach(edge => {
    const p1 = positions.get(edge.from)
    const p2 = positions.get(edge.to)
    if (!p1 || !p2) return
    
    const dx = p2.x - p1.x
    const dy = p2.y - p1.y
    const dist = Math.sqrt(dx * dx + dy * dy) || 1
    const force = dist * 0.01
    
    p1.vx += (dx / dist) * force
    p1.vy += (dy / dist) * force
    p2.vx -= (dx / dist) * force
    p2.vy -= (dy / dist) * force
  })
  
  // 应用速度 + 阻尼
  positions.forEach(p => {
    p.x += p.vx * 0.1
    p.y += p.vy * 0.1
    p.vx *= 0.9
    p.vy *= 0.9
  })
}

// 绘制图谱
function draw() {
  const canvas = canvasRef.value
  if (!canvas) return
  
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  
  const dpr = window.devicePixelRatio || 1
  canvas.width = canvas.offsetWidth * dpr
  canvas.height = canvas.offsetHeight * dpr
  ctx.scale(dpr, dpr)
  
  // 清空画布
  ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight)
  
  ctx.save()
  ctx.translate(offsetX.value, offsetY.value)
  ctx.scale(scale.value, scale.value)
  
  const positions = nodePositions.value
  
  // 绘制边
  ctx.strokeStyle = 'rgba(156, 163, 175, 0.3)'
  ctx.lineWidth = 1.5
  props.graph.edges.forEach(edge => {
    const p1 = positions.get(edge.from)
    const p2 = positions.get(edge.to)
    if (!p1 || !p2) return
    
    ctx.beginPath()
    ctx.moveTo(p1.x, p1.y)
    ctx.lineTo(p2.x, p2.y)
    ctx.stroke()
    
    // 关系标签
    const midX = (p1.x + p2.x) / 2
    const midY = (p1.y + p2.y) / 2
    ctx.fillStyle = 'rgba(156, 163, 175, 0.8)'
    ctx.font = '10px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText(edge.relation, midX, midY - 4)
  })
  
  // 绘制节点
  props.graph.nodes.forEach(node => {
    const pos = positions.get(node.name)
    if (!pos) return
    
    const color = roleColors[node.role]
    const radius = node.role === 'protagonist' ? 28 : node.role === 'antagonist' ? 24 : 20
    
    // 节点圆
    ctx.beginPath()
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2)
    ctx.fillStyle = color + '20'
    ctx.fill()
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.stroke()
    
    // 节点名称
    ctx.fillStyle = '#e5e7eb'
    ctx.font = 'bold 12px system-ui'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(node.name, pos.x, pos.y)
  })
  
  ctx.restore()
}

// 动画循环
let animationFrame: number | null = null
function animate() {
  simulate()
  draw()
  animationFrame = requestAnimationFrame(animate)
}

function startAnimation() {
  if (animationFrame) return
  initPositions()
  animate()
}

function stopAnimation() {
  if (animationFrame) {
    cancelAnimationFrame(animationFrame)
    animationFrame = null
  }
}

// 控制
function zoomIn() {
  scale.value = Math.min(scale.value * 1.2, 3)
}

function zoomOut() {
  scale.value = Math.max(scale.value / 1.2, 0.5)
}

function reset() {
  scale.value = 1
  offsetX.value = 0
  offsetY.value = 0
  initPositions()
}

// 生命周期
onMounted(() => {
  if (props.graph.nodes.length > 0) {
    startAnimation()
  }
})

watch(() => props.graph, (newGraph) => {
  if (newGraph.nodes.length > 0) {
    stopAnimation()
    startAnimation()
  }
}, { deep: true })

const isEmpty = computed(() => props.graph.nodes.length === 0)
</script>

<template>
  <div class="relative w-full h-[300px] rounded-2xl bg-muted/30 border border-white/5 overflow-hidden">
    <!-- 加载状态 -->
    <div v-if="loading" class="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm z-10">
      <Loader2 class="w-8 h-8 animate-spin text-primary" />
    </div>
    
    <!-- 空状态 -->
    <div v-else-if="isEmpty" class="absolute inset-0 flex flex-col items-center justify-center">
      <Users class="w-12 h-12 text-muted-foreground/30 mb-3" />
      <p class="text-xs text-muted-foreground">暂无人物数据</p>
    </div>
    
    <!-- 画布 -->
    <canvas 
      ref="canvasRef" 
      class="w-full h-full"
      :class="{ 'opacity-50': loading }"
    />
    
    <!-- 控制按钮 -->
    <div v-if="!isEmpty" class="absolute bottom-3 right-3 flex gap-1.5">
      <Button variant="outline" size="icon" class="w-8 h-8 rounded-lg bg-background/80" @click="zoomIn">
        <ZoomIn class="w-4 h-4" />
      </Button>
      <Button variant="outline" size="icon" class="w-8 h-8 rounded-lg bg-background/80" @click="zoomOut">
        <ZoomOut class="w-4 h-4" />
      </Button>
      <Button variant="outline" size="icon" class="w-8 h-8 rounded-lg bg-background/80" @click="reset">
        <RotateCcw class="w-4 h-4" />
      </Button>
    </div>
    
    <!-- 图例 -->
    <div v-if="!isEmpty" class="absolute top-3 left-3 flex flex-wrap gap-2 text-[10px]">
      <span class="flex items-center gap-1 px-2 py-1 rounded-full bg-background/80">
        <span class="w-2 h-2 rounded-full bg-green-500" /> 主角
      </span>
      <span class="flex items-center gap-1 px-2 py-1 rounded-full bg-background/80">
        <span class="w-2 h-2 rounded-full bg-red-500" /> 反派
      </span>
      <span class="flex items-center gap-1 px-2 py-1 rounded-full bg-background/80">
        <span class="w-2 h-2 rounded-full bg-blue-500" /> 配角
      </span>
    </div>
  </div>
</template>
