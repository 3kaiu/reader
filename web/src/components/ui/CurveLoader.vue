<script setup lang="ts">
/**
 * CurveLoader — 数学曲线粒子加载动效核心组件
 *
 * SVG 粒子沿参数曲线运动，带渐变拖尾、呼吸缩放、整体旋转。
 * 移植自 https://github.com/Paidax01/math-curve-loaders
 */
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import type { CurveConfig } from './curve-configs'
import { normalizeProgress } from './curve-configs'

interface Props {
  config: CurveConfig
  size?: number
  label?: string
}

const props = withDefaults(defineProps<Props>(), {
  size: 120,
  label: 'Loading',
})

// 小尺寸自动降配：粒子数减半、尾迹缩短、隐藏背景 path
const isSmall = props.size < 32
const effectiveParticleCount = isSmall
  ? Math.ceil(props.config.particleCount / 2)
  : props.config.particleCount
const effectiveTrailSpan = isSmall ? Math.min(props.config.trailSpan, 0.22) : props.config.trailSpan
const showBackgroundPath = !isSmall

const svgRef = ref<SVGSVGElement>()
const groupRef = ref<SVGGElement>()
const pathRef = ref<SVGPathElement>()
const particleRefs = ref<SVGCircleElement[]>([])

let rafId = 0
let startTime = 0
let reducedMotion = false

function setParticleRef(el: object | null, index: number) {
  if (el) {
    particleRefs.value[index] = el as SVGCircleElement
  }
}

function buildPath(detailScale: number, steps = 480): string {
  const parts: string[] = []
  for (let i = 0; i <= steps; i++) {
    const p = props.config.point(i / steps, detailScale, props.config)
    parts.push(`${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
  }
  return parts.join(' ')
}

function getDetailScale(elapsed: number): number {
  const pulseProgress = (elapsed % props.config.pulseDurationMs) / props.config.pulseDurationMs
  const pulseAngle = pulseProgress * Math.PI * 2
  return 0.52 + ((Math.sin(pulseAngle + 0.55) + 1) / 2) * 0.48
}

function getRotation(elapsed: number): number {
  if (!props.config.rotate) return 0
  return -(((elapsed % props.config.rotationDurationMs) / props.config.rotationDurationMs) * 360)
}

function renderFrame(elapsed: number) {
  const progress = (elapsed % props.config.durationMs) / props.config.durationMs
  const detailScale = getDetailScale(elapsed)
  const rotation = getRotation(elapsed)

  if (groupRef.value) {
    groupRef.value.setAttribute('transform', `rotate(${rotation.toFixed(2)} 50 50)`)
  }

  if (showBackgroundPath && pathRef.value) {
    pathRef.value.setAttribute('d', buildPath(detailScale))
  }

  const count = effectiveParticleCount
  for (let i = 0; i < count; i++) {
    const node = particleRefs.value[i]
    if (!node) continue

    const tailOffset = count > 1 ? i / (count - 1) : 0
    const p = props.config.point(
      normalizeProgress(progress - tailOffset * effectiveTrailSpan),
      detailScale,
      props.config
    )
    const fade = Math.pow(1 - tailOffset, 0.56)

    node.setAttribute('cx', p.x.toFixed(2))
    node.setAttribute('cy', p.y.toFixed(2))
    node.setAttribute('r', (0.9 + fade * 2.7).toFixed(2))
    node.setAttribute('opacity', (0.04 + fade * 0.96).toFixed(3))
  }
}

function tick(now: number) {
  if (!startTime) startTime = now
  renderFrame(now - startTime)
  rafId = requestAnimationFrame(tick)
}

onMounted(() => {
  reducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  // 渲染第一帧（静态）
  renderFrame(0)

  if (!reducedMotion) {
    startTime = 0
    rafId = requestAnimationFrame(tick)
  }
})

onBeforeUnmount(() => {
  if (rafId) cancelAnimationFrame(rafId)
})

// 支持 config 动态切换
watch(
  () => props.config,
  () => {
    if (pathRef.value) {
      pathRef.value.setAttribute('stroke-width', String(props.config.strokeWidth))
    }
    renderFrame(0)
  }
)
</script>

<template>
  <svg
    ref="svgRef"
    :viewBox="'0 0 100 100'"
    :width="size"
    :height="size"
    fill="none"
    aria-hidden="true"
    :style="{ display: 'block' }"
    class="curve-loader-svg"
  >
    <g ref="groupRef">
      <path
        v-if="showBackgroundPath"
        ref="pathRef"
        stroke="currentColor"
        :stroke-width="config.strokeWidth"
        stroke-linecap="round"
        stroke-linejoin="round"
        opacity="0.1"
      />
      <circle
        v-for="(_, i) in effectiveParticleCount"
        :key="i"
        :ref="el => setParticleRef(el as object | null, i)"
        fill="currentColor"
      />
    </g>
  </svg>
</template>
