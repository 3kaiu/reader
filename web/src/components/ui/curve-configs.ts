/**
 * 数学曲线加载动效 — 曲线配置库
 *
 * 移植自 https://github.com/Paidax01/math-curve-loaders
 * 每条曲线通过 point(progress, detailScale, config) 返回 {x, y}（0-100 坐标系），
 * 一组 SVG 粒子沿曲线分布并形成渐变拖尾，detailScale 随时间正弦波动产生呼吸效果。
 */

export interface CurvePoint {
  x: number
  y: number
}

export interface CurveConfig {
  name: string
  tag: string
  /** 参数化曲线坐标函数，progress 为 0-1 循环进度，detailScale 为 0-1 呼吸缩放 */
  point(progress: number, detailScale: number, config: CurveConfig): CurvePoint
  particleCount: number
  /** 尾迹占循环的比例 (0-1) */
  trailSpan: number
  /** 一个完整循环时长 (ms) */
  durationMs: number
  /** 呼吸周期 (ms) */
  pulseDurationMs: number
  /** 旋转周期 (ms)，0 = 不旋转 */
  rotationDurationMs: number
  strokeWidth: number
  rotate: boolean
  /** 曲线特有数值参数 */
  [key: string]:
    | number
    | string
    | boolean
    | ((progress: number, detailScale: number, config: CurveConfig) => CurvePoint)
}

// ========================
// 辅助函数
// ========================

function normalizeProgress(progress: number): number {
  return ((progress % 1) + 1) % 1
}

// ========================
// 20 种曲线定义
// ========================

const curves: CurveConfig[] = [
  {
    name: 'Original Thinking',
    tag: 'Custom Rose Trail',
    baseRadius: 7,
    detailAmplitude: 3,
    petalCount: 7,
    curveScale: 3.9,
    rotate: true,
    particleCount: 64,
    trailSpan: 0.38,
    durationMs: 4600,
    rotationDurationMs: 28000,
    pulseDurationMs: 4200,
    strokeWidth: 5.5,
    point(progress, detailScale, config) {
      const t = progress * Math.PI * 2
      const petals = Math.round(config.petalCount as number)
      const x =
        (config.baseRadius as number) * Math.cos(t) -
        (config.detailAmplitude as number) * detailScale * Math.cos(petals * t)
      const y =
        (config.baseRadius as number) * Math.sin(t) -
        (config.detailAmplitude as number) * detailScale * Math.sin(petals * t)
      return {
        x: 50 + x * (config.curveScale as number),
        y: 50 + y * (config.curveScale as number),
      }
    },
  },
  {
    name: 'Thinking Five',
    tag: 'Custom Rose Trail',
    baseRadius: 7,
    detailAmplitude: 3,
    petalCount: 5,
    curveScale: 3.9,
    rotate: true,
    particleCount: 62,
    trailSpan: 0.38,
    durationMs: 4600,
    rotationDurationMs: 28000,
    pulseDurationMs: 4200,
    strokeWidth: 5.5,
    point(progress, detailScale, config) {
      const t = progress * Math.PI * 2
      const petals = Math.round(config.petalCount as number)
      const x =
        (config.baseRadius as number) * Math.cos(t) -
        (config.detailAmplitude as number) * detailScale * Math.cos(petals * t)
      const y =
        (config.baseRadius as number) * Math.sin(t) -
        (config.detailAmplitude as number) * detailScale * Math.sin(petals * t)
      return {
        x: 50 + x * (config.curveScale as number),
        y: 50 + y * (config.curveScale as number),
      }
    },
  },
  {
    name: 'Thinking Nine',
    tag: 'Custom Rose Trail',
    baseRadius: 7,
    detailAmplitude: 3,
    petalCount: 9,
    curveScale: 3.9,
    rotate: true,
    particleCount: 68,
    trailSpan: 0.39,
    durationMs: 4700,
    rotationDurationMs: 30000,
    pulseDurationMs: 4200,
    strokeWidth: 5.5,
    point(progress, detailScale, config) {
      const t = progress * Math.PI * 2
      const petals = Math.round(config.petalCount as number)
      const x =
        (config.baseRadius as number) * Math.cos(t) -
        (config.detailAmplitude as number) * detailScale * Math.cos(petals * t)
      const y =
        (config.baseRadius as number) * Math.sin(t) -
        (config.detailAmplitude as number) * detailScale * Math.sin(petals * t)
      return {
        x: 50 + x * (config.curveScale as number),
        y: 50 + y * (config.curveScale as number),
      }
    },
  },
  {
    name: 'Rose Orbit',
    tag: 'r = cos(kθ)',
    orbitRadius: 7,
    detailAmplitude: 2.7,
    petalCount: 7,
    curveScale: 3.9,
    rotate: true,
    particleCount: 72,
    trailSpan: 0.42,
    durationMs: 5200,
    rotationDurationMs: 28000,
    pulseDurationMs: 4600,
    strokeWidth: 5.2,
    point(progress, detailScale, config) {
      const t = progress * Math.PI * 2
      const k = Math.round(config.petalCount as number)
      const r =
        (config.orbitRadius as number) -
        (config.detailAmplitude as number) * detailScale * Math.cos(k * t)
      return {
        x: 50 + Math.cos(t) * r * (config.curveScale as number),
        y: 50 + Math.sin(t) * r * (config.curveScale as number),
      }
    },
  },
  {
    name: 'Rose Curve',
    tag: 'r = a cos(kθ)',
    roseA: 9.2,
    roseABoost: 0.6,
    roseBreathBase: 0.72,
    roseBreathBoost: 0.28,
    roseK: 5,
    roseScale: 3.25,
    rotate: true,
    particleCount: 78,
    trailSpan: 0.32,
    durationMs: 5400,
    rotationDurationMs: 28000,
    pulseDurationMs: 4600,
    strokeWidth: 4.5,
    point(progress, detailScale, config) {
      const t = progress * Math.PI * 2
      const a = (config.roseA as number) + detailScale * (config.roseABoost as number)
      const k = Math.round(config.roseK as number)
      const r =
        a *
        ((config.roseBreathBase as number) + detailScale * (config.roseBreathBoost as number)) *
        Math.cos(k * t)
      return {
        x: 50 + Math.cos(t) * r * (config.roseScale as number),
        y: 50 + Math.sin(t) * r * (config.roseScale as number),
      }
    },
  },
  {
    name: 'Rose Two',
    tag: 'r = a cos(2θ)',
    roseA: 9.2,
    roseABoost: 0.6,
    roseBreathBase: 0.72,
    roseBreathBoost: 0.28,
    roseScale: 3.25,
    rotate: true,
    particleCount: 74,
    trailSpan: 0.3,
    durationMs: 5200,
    rotationDurationMs: 28000,
    pulseDurationMs: 4300,
    strokeWidth: 4.6,
    point(progress, detailScale, config) {
      const t = progress * Math.PI * 2
      const a = (config.roseA as number) + detailScale * (config.roseABoost as number)
      const r =
        a *
        ((config.roseBreathBase as number) + detailScale * (config.roseBreathBoost as number)) *
        Math.cos(2 * t)
      return {
        x: 50 + Math.cos(t) * r * (config.roseScale as number),
        y: 50 + Math.sin(t) * r * (config.roseScale as number),
      }
    },
  },
  {
    name: 'Rose Three',
    tag: 'r = a cos(3θ)',
    roseA: 9.2,
    roseABoost: 0.6,
    roseBreathBase: 0.72,
    roseBreathBoost: 0.28,
    roseScale: 3.25,
    rotate: true,
    particleCount: 76,
    trailSpan: 0.31,
    durationMs: 5300,
    rotationDurationMs: 28000,
    pulseDurationMs: 4400,
    strokeWidth: 4.6,
    point(progress, detailScale, config) {
      const t = progress * Math.PI * 2
      const a = (config.roseA as number) + detailScale * (config.roseABoost as number)
      const r =
        a *
        ((config.roseBreathBase as number) + detailScale * (config.roseBreathBoost as number)) *
        Math.cos(3 * t)
      return {
        x: 50 + Math.cos(t) * r * (config.roseScale as number),
        y: 50 + Math.sin(t) * r * (config.roseScale as number),
      }
    },
  },
  {
    name: 'Rose Four',
    tag: 'r = a cos(4θ)',
    roseA: 9.2,
    roseABoost: 0.6,
    roseBreathBase: 0.72,
    roseBreathBoost: 0.28,
    roseScale: 3.25,
    rotate: true,
    particleCount: 78,
    trailSpan: 0.32,
    durationMs: 5400,
    rotationDurationMs: 28000,
    pulseDurationMs: 4500,
    strokeWidth: 4.6,
    point(progress, detailScale, config) {
      const t = progress * Math.PI * 2
      const a = (config.roseA as number) + detailScale * (config.roseABoost as number)
      const r =
        a *
        ((config.roseBreathBase as number) + detailScale * (config.roseBreathBoost as number)) *
        Math.cos(4 * t)
      return {
        x: 50 + Math.cos(t) * r * (config.roseScale as number),
        y: 50 + Math.sin(t) * r * (config.roseScale as number),
      }
    },
  },
  {
    name: 'Lissajous Drift',
    tag: 'x = sin(at), y = sin(bt)',
    lissajousAmp: 24,
    lissajousAmpBoost: 6,
    lissajousAX: 3,
    lissajousBY: 4,
    lissajousPhase: 1.57,
    lissajousYScale: 0.92,
    rotate: false,
    particleCount: 68,
    trailSpan: 0.34,
    durationMs: 6000,
    rotationDurationMs: 36000,
    pulseDurationMs: 5400,
    strokeWidth: 4.7,
    point(progress, detailScale, config) {
      const t = progress * Math.PI * 2
      const amp =
        (config.lissajousAmp as number) + detailScale * (config.lissajousAmpBoost as number)
      return {
        x:
          50 +
          Math.sin(
            Math.round(config.lissajousAX as number) * t + (config.lissajousPhase as number)
          ) *
            amp,
        y:
          50 +
          Math.sin(Math.round(config.lissajousBY as number) * t) *
            (amp * (config.lissajousYScale as number)),
      }
    },
  },
  {
    name: 'Lemniscate Bloom',
    tag: 'Bernoulli Lemniscate',
    lemniscateA: 20,
    lemniscateBoost: 7,
    rotate: false,
    particleCount: 70,
    trailSpan: 0.4,
    durationMs: 5600,
    rotationDurationMs: 34000,
    pulseDurationMs: 5000,
    strokeWidth: 4.8,
    point(progress, detailScale, config) {
      const t = progress * Math.PI * 2
      const scale =
        (config.lemniscateA as number) + detailScale * (config.lemniscateBoost as number)
      const denom = 1 + Math.sin(t) ** 2
      return {
        x: 50 + (scale * Math.cos(t)) / denom,
        y: 50 + (scale * Math.sin(t) * Math.cos(t)) / denom,
      }
    },
  },
  {
    name: 'Hypotrochoid Loop',
    tag: 'Inner Spirograph',
    spiroR: 8.2,
    spiror: 2.7,
    spirorBoost: 0.45,
    spirod: 4.8,
    spirodBoost: 1.2,
    spiroScale: 3.05,
    rotate: false,
    particleCount: 82,
    trailSpan: 0.46,
    durationMs: 7600,
    rotationDurationMs: 42000,
    pulseDurationMs: 6200,
    strokeWidth: 4.6,
    point(progress, detailScale, config) {
      const t = progress * Math.PI * 2
      const r = (config.spiror as number) + detailScale * (config.spirorBoost as number)
      const d = (config.spirod as number) + detailScale * (config.spirodBoost as number)
      const x =
        ((config.spiroR as number) - r) * Math.cos(t) +
        d * Math.cos((((config.spiroR as number) - r) / r) * t)
      const y =
        ((config.spiroR as number) - r) * Math.sin(t) -
        d * Math.sin((((config.spiroR as number) - r) / r) * t)
      return {
        x: 50 + x * (config.spiroScale as number),
        y: 50 + y * (config.spiroScale as number),
      }
    },
  },
  {
    name: 'Three-Petal Spiral',
    tag: 'R = 3, r = 1, d = 3',
    spiralR: 3,
    spiralr: 1,
    spirald: 3,
    spiralScale: 2.2,
    spiralBreath: 0.45,
    rotate: true,
    particleCount: 82,
    trailSpan: 0.34,
    durationMs: 4600,
    rotationDurationMs: 28000,
    pulseDurationMs: 4200,
    strokeWidth: 4.4,
    point(progress, detailScale, config) {
      const t = progress * Math.PI * 2
      const R = config.spiralR as number
      const r = config.spiralr as number
      const d = (config.spirald as number) + detailScale * 0.25
      const baseX = (R - r) * Math.cos(t) + d * Math.cos(((R - r) / r) * t)
      const baseY = (R - r) * Math.sin(t) - d * Math.sin(((R - r) / r) * t)
      const scale = (config.spiralScale as number) + detailScale * (config.spiralBreath as number)
      return { x: 50 + baseX * scale, y: 50 + baseY * scale }
    },
  },
  {
    name: 'Four-Petal Spiral',
    tag: 'R = 4, r = 1, d = 3',
    spiralR: 4,
    spiralr: 1,
    spirald: 3,
    spiralScale: 2.2,
    spiralBreath: 0.45,
    rotate: true,
    particleCount: 84,
    trailSpan: 0.34,
    durationMs: 4600,
    rotationDurationMs: 28000,
    pulseDurationMs: 4200,
    strokeWidth: 4.4,
    point(progress, detailScale, config) {
      const t = progress * Math.PI * 2
      const R = config.spiralR as number
      const r = config.spiralr as number
      const d = (config.spirald as number) + detailScale * 0.25
      const baseX = (R - r) * Math.cos(t) + d * Math.cos(((R - r) / r) * t)
      const baseY = (R - r) * Math.sin(t) - d * Math.sin(((R - r) / r) * t)
      const scale = (config.spiralScale as number) + detailScale * (config.spiralBreath as number)
      return { x: 50 + baseX * scale, y: 50 + baseY * scale }
    },
  },
  {
    name: 'Five-Petal Spiral',
    tag: 'R = 5, r = 1, d = 3',
    spiralR: 5,
    spiralr: 1,
    spirald: 3,
    spiralScale: 2.2,
    spiralBreath: 0.45,
    rotate: true,
    particleCount: 85,
    trailSpan: 0.34,
    durationMs: 4600,
    rotationDurationMs: 28000,
    pulseDurationMs: 4200,
    strokeWidth: 4.4,
    point(progress, detailScale, config) {
      const t = progress * Math.PI * 2
      const R = config.spiralR as number
      const r = config.spiralr as number
      const d = (config.spirald as number) + detailScale * 0.25
      const baseX = (R - r) * Math.cos(t) + d * Math.cos(((R - r) / r) * t)
      const baseY = (R - r) * Math.sin(t) - d * Math.sin(((R - r) / r) * t)
      const scale = (config.spiralScale as number) + detailScale * (config.spiralBreath as number)
      return { x: 50 + baseX * scale, y: 50 + baseY * scale }
    },
  },
  {
    name: 'Six-Petal Spiral',
    tag: 'R = 6, r = 1, d = 3',
    spiralR: 6,
    spiralr: 1,
    spirald: 3,
    spiralScale: 2.2,
    spiralBreath: 0.45,
    rotate: true,
    particleCount: 86,
    trailSpan: 0.34,
    durationMs: 4600,
    rotationDurationMs: 28000,
    pulseDurationMs: 4200,
    strokeWidth: 4.4,
    point(progress, detailScale, config) {
      const t = progress * Math.PI * 2
      const R = config.spiralR as number
      const r = config.spiralr as number
      const d = (config.spirald as number) + detailScale * 0.25
      const baseX = (R - r) * Math.cos(t) + d * Math.cos(((R - r) / r) * t)
      const baseY = (R - r) * Math.sin(t) - d * Math.sin(((R - r) / r) * t)
      const scale = (config.spiralScale as number) + detailScale * (config.spiralBreath as number)
      return { x: 50 + baseX * scale, y: 50 + baseY * scale }
    },
  },
  {
    name: 'Butterfly Phase',
    tag: 'Butterfly Curve',
    butterflyTurns: 12,
    butterflyScale: 4.6,
    butterflyPulse: 0.45,
    butterflyCosWeight: 2,
    butterflyPower: 5,
    rotate: false,
    particleCount: 88,
    trailSpan: 0.32,
    durationMs: 9000,
    rotationDurationMs: 50000,
    pulseDurationMs: 7000,
    strokeWidth: 4.4,
    point(progress, detailScale, config) {
      const t = progress * Math.PI * (config.butterflyTurns as number)
      const s =
        Math.exp(Math.cos(t)) -
        (config.butterflyCosWeight as number) * Math.cos(4 * t) -
        Math.sin(t / 12) ** Math.round(config.butterflyPower as number)
      const scale =
        (config.butterflyScale as number) + detailScale * (config.butterflyPulse as number)
      return { x: 50 + Math.sin(t) * s * scale, y: 50 + Math.cos(t) * s * scale }
    },
  },
  {
    name: 'Cardioid Glow',
    tag: 'Cardioid',
    cardioidA: 8.4,
    cardioidPulse: 0.8,
    cardioidScale: 2.15,
    rotate: false,
    particleCount: 72,
    trailSpan: 0.36,
    durationMs: 6200,
    rotationDurationMs: 36000,
    pulseDurationMs: 5200,
    strokeWidth: 4.9,
    point(progress, detailScale, config) {
      const t = progress * Math.PI * 2
      const a = (config.cardioidA as number) + detailScale * (config.cardioidPulse as number)
      const r = a * (1 - Math.cos(t))
      return {
        x: 50 + Math.cos(t) * r * (config.cardioidScale as number),
        y: 50 + Math.sin(t) * r * (config.cardioidScale as number),
      }
    },
  },
  {
    name: 'Cardioid Heart',
    tag: 'r = a(1 + cosθ)',
    cardioidA: 8.8,
    cardioidPulse: 0.8,
    cardioidScale: 2.15,
    rotate: false,
    particleCount: 74,
    trailSpan: 0.36,
    durationMs: 6200,
    rotationDurationMs: 36000,
    pulseDurationMs: 5200,
    strokeWidth: 4.9,
    point(progress, detailScale, config) {
      const t = progress * Math.PI * 2
      const a = (config.cardioidA as number) + detailScale * (config.cardioidPulse as number)
      const r = a * (1 + Math.cos(t))
      const baseX = Math.cos(t) * r
      const baseY = Math.sin(t) * r
      return {
        x: 50 - baseY * (config.cardioidScale as number),
        y: 50 - baseX * (config.cardioidScale as number),
      }
    },
  },
  {
    name: 'Heart Wave',
    tag: 'f(x) Heart Wave',
    heartWaveB: 6.4,
    heartWaveRoot: 3.3,
    heartWaveAmp: 0.9,
    heartWaveScaleX: 23.2,
    heartWaveScaleY: 24.5,
    rotate: false,
    particleCount: 104,
    trailSpan: 0.18,
    durationMs: 8400,
    rotationDurationMs: 22000,
    pulseDurationMs: 5600,
    strokeWidth: 3.9,
    point(progress, detailScale, config) {
      const xLimit = Math.sqrt(config.heartWaveRoot as number)
      const x = -xLimit + progress * xLimit * 2
      const safeRoot = Math.max(0, (config.heartWaveRoot as number) - x * x)
      const b = config.heartWaveB as number
      const wave = (config.heartWaveAmp as number) * Math.sqrt(safeRoot) * Math.sin(b * Math.PI * x)
      const curve = Math.pow(Math.abs(x), 2 / 3)
      const y = curve + wave
      const scaleX = config.heartWaveScaleX as number
      const scaleY = (config.heartWaveScaleY as number) + detailScale * 1.5
      return { x: 50 + x * scaleX, y: 18 + (1.75 - y) * scaleY }
    },
  },
  {
    name: 'Spiral Search',
    tag: 'Archimedean Spiral',
    searchTurns: 4,
    searchBaseRadius: 8,
    searchRadiusAmp: 8.5,
    searchPulse: 2.4,
    searchScale: 1,
    rotate: false,
    particleCount: 86,
    trailSpan: 0.28,
    durationMs: 7800,
    rotationDurationMs: 44000,
    pulseDurationMs: 6800,
    strokeWidth: 4.3,
    point(progress, detailScale, config) {
      const t = progress * Math.PI * 2
      const angle = t * (config.searchTurns as number)
      const radius =
        (config.searchBaseRadius as number) +
        (1 - Math.cos(t)) *
          ((config.searchRadiusAmp as number) + detailScale * (config.searchPulse as number))
      return {
        x: 50 + Math.cos(angle) * radius * (config.searchScale as number),
        y: 50 + Math.sin(angle) * radius * (config.searchScale as number),
      }
    },
  },
  {
    name: 'Fourier Flow',
    tag: 'Fourier Curve',
    fourierX1: 17,
    fourierX3: 7.5,
    fourierX5: 3.2,
    fourierY1: 15,
    fourierY2: 8.2,
    fourierY4: 4.2,
    fourierMixBase: 1,
    fourierMixPulse: 0.16,
    rotate: false,
    particleCount: 92,
    trailSpan: 0.31,
    durationMs: 8400,
    rotationDurationMs: 44000,
    pulseDurationMs: 6800,
    strokeWidth: 4.2,
    point(progress, detailScale, config) {
      const t = progress * Math.PI * 2
      const mix =
        (config.fourierMixBase as number) + detailScale * (config.fourierMixPulse as number)
      const x =
        (config.fourierX1 as number) * Math.cos(t) +
        (config.fourierX3 as number) * Math.cos(3 * t + 0.6 * mix) +
        (config.fourierX5 as number) * Math.sin(5 * t - 0.4)
      const y =
        (config.fourierY1 as number) * Math.sin(t) +
        (config.fourierY2 as number) * Math.sin(2 * t + 0.25) -
        (config.fourierY4 as number) * Math.cos(4 * t - 0.5 * mix)
      return { x: 50 + x, y: 50 + y }
    },
  },
]

// ========================
// 按 name 建立查找表
// ========================

const curveMap = new Map<string, CurveConfig>()
for (const c of curves) {
  curveMap.set(c.name, c)
}

export function getCurve(name: string): CurveConfig {
  const c = curveMap.get(name)
  if (!c) throw new Error(`Curve "${name}" not found`)
  return c
}

// ========================
// 场景 → 曲线映射
// ========================

export const SCENE_CURVES = {
  reader: 'Original Thinking',
  readerScroll: 'Rose Curve',
  readerChapter: 'Rose Three',
  bookshelf: 'Lemniscate Bloom',
  search: 'Spiral Search',
  searchHeader: 'Lissajous Drift',
  searchCard: 'Cardioid Glow',
  import: 'Fourier Flow',
  chapterRefresh: 'Rose Orbit',
  general: 'Butterfly Phase',
} as const

export type SceneName = keyof typeof SCENE_CURVES

export { normalizeProgress }
