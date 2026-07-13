import type { ReaderTheme, ThemeTokens } from '@/types/settings'

/**
 * 阅读器设计 Token 集 — oklch 色彩空间
 * 参考 69shuba Immersive Reader 微信读书风格
 *
 * 3 主题 × 41 tokens = 123 个设计变量
 * 核心 token ~20 个通过 JS 设置 CSS 变量
 * 衍生 token ~21 个通过 CSS color-mix(in oklab, ...) 动态计算
 *
 * Core tokens (JS -> CSS custom properties):
 *   --ir-bg, --ir-panel, --ir-text, --ir-text-body, --ir-muted, --ir-faint,
 *   --ir-placeholder, --ir-border, --ir-border-focus, --ir-accent,
 *   --ir-shadow-xs, --ir-shadow-sm, --ir-shadow-md, --ir-shadow-lg,
 *   --ir-panel-hover, --ir-surface-stroke, --ir-glow-*, --ir-wash-*,
 *   --ir-heading, --ir-divider
 *
 * Derived tokens (CSS color-mix):
 *   --ir-panel-alt, --ir-panel-elevated, --ir-accent-soft, --ir-accent-glow,
 *   --ir-panel-strong, --ir-panel-soft, --ir-progress-bar, --ir-progress-bg,
 *   --ir-progress-done, --ir-selection, --ir-button-bg, --ir-ripple,
 *   --ir-card-bg, ...plus dark-mode overrides
 */

const T: Record<ReaderTheme, ThemeTokens> = {
  wechat: {
    label: '浅纸绿',
    bg: '#edf1e7',
    panel: 'rgba(250,248,243,0.86)',
    panelAlt: 'rgba(245,242,236,0.88)',
    panelElevated: 'rgba(253,251,247,0.92)',
    text: '#1c2e24',
    textBody: '#1f3328',
    muted: '#4d6358',
    faint: '#5a6e64',
    placeholder: '#6e8077',
    border: 'rgba(100,140,118,0.15)',
    borderFocus: 'rgba(95,143,120,0.45)',
    accent: '#5c8e76',
    accentSoft: 'rgba(92,142,118,0.10)',
    accentGlow: 'rgba(92,142,118,0.18)',
    shadowXs: '0 1px 2px rgba(90,120,104,0.04)',
    shadowSm: '0 2px 8px rgba(90,120,104,0.05), 0 1px 2px rgba(90,120,104,0.06)',
    shadowMd: '0 8px 24px rgba(90,120,104,0.07), 0 2px 6px rgba(90,120,104,0.05)',
    shadowLg: '0 16px 40px rgba(90,120,104,0.09), 0 4px 12px rgba(90,120,104,0.05)',
    panelStrong: 'rgba(247,250,244,0.82)',
    panelSoft: 'rgba(254,254,252,0.68)',
    panelHover: 'rgba(251,253,248,0.90)',
    surfaceStroke: 'rgba(95,140,117,0.13)',
    selection: 'rgba(92,142,118,0.20)',
    progressBar: 'rgba(92,142,118,0.30)',
    progressBg: 'rgba(92,142,118,0.06)',
    progressDone: '#5c8e76',
    glowTop: 'rgba(95,143,120,0.12)',
    glowSide: 'rgba(255,255,255,0.58)',
    glowBottom: 'rgba(120,155,138,0.07)',
    washTop: 'rgba(249,251,244,0.86)',
    washMid: 'rgba(237,241,230,0.60)',
    washLow: 'rgba(230,236,225,0.24)',
    grainSide: 'rgba(255,255,255,0.14)',
    grainTint: 'rgba(106,152,130,0.026)',
    grainTintLow: 'rgba(106,152,130,0.009)',
    headingColor: '#182a20',
    dividerColor: 'rgba(100,140,118,0.13)',
    cardBg: 'rgba(255,255,255,0.52)',
    buttonBg: 'rgba(255,255,255,0.64)',
    ripple: 'rgba(92,142,118,0.12)',
  },
  mist: {
    label: '暖青灰',
    bg: '#ebe8e0',
    panel: 'rgba(246,244,238,0.86)',
    panelAlt: 'rgba(241,238,232,0.88)',
    panelElevated: 'rgba(250,248,243,0.92)',
    text: '#222e2a',
    textBody: '#25322d',
    muted: '#50635c',
    faint: '#5e706a',
    placeholder: '#728480',
    border: 'rgba(102,126,120,0.15)',
    borderFocus: 'rgba(109,143,136,0.45)',
    accent: '#6a8c85',
    accentSoft: 'rgba(106,140,133,0.10)',
    accentGlow: 'rgba(106,140,133,0.17)',
    shadowXs: '0 1px 2px rgba(92,108,103,0.04)',
    shadowSm: '0 2px 8px rgba(92,108,103,0.05), 0 1px 2px rgba(92,108,103,0.06)',
    shadowMd: '0 8px 24px rgba(92,108,103,0.07), 0 2px 6px rgba(92,108,103,0.05)',
    shadowLg: '0 16px 40px rgba(92,108,103,0.09), 0 4px 12px rgba(92,108,103,0.05)',
    panelStrong: 'rgba(243,241,236,0.82)',
    panelSoft: 'rgba(254,253,250,0.64)',
    panelHover: 'rgba(249,248,244,0.88)',
    surfaceStroke: 'rgba(106,140,133,0.13)',
    selection: 'rgba(106,140,133,0.19)',
    progressBar: 'rgba(106,140,133,0.28)',
    progressBg: 'rgba(106,140,133,0.06)',
    progressDone: '#6a8c85',
    glowTop: 'rgba(109,143,136,0.09)',
    glowSide: 'rgba(255,255,255,0.50)',
    glowBottom: 'rgba(122,138,142,0.07)',
    washTop: 'rgba(249,247,242,0.82)',
    washMid: 'rgba(235,232,224,0.58)',
    washLow: 'rgba(226,223,217,0.22)',
    grainSide: 'rgba(255,255,255,0.12)',
    grainTint: 'rgba(106,140,133,0.020)',
    grainTintLow: 'rgba(106,140,133,0.007)',
    headingColor: '#1a2824',
    dividerColor: 'rgba(102,126,120,0.13)',
    cardBg: 'rgba(255,255,255,0.48)',
    buttonBg: 'rgba(255,255,255,0.60)',
    ripple: 'rgba(106,140,133,0.12)',
  },
  night: {
    label: '夜间黑',
    bg: '#151718',
    panel: 'rgba(30,33,35,0.94)',
    panelAlt: 'rgba(36,39,41,0.94)',
    panelElevated: 'rgba(40,44,46,0.98)',
    text: '#bcc6c1',
    textBody: '#b6c0bb',
    muted: '#8a9b94',
    faint: '#6e7f78',
    placeholder: '#556560',
    border: 'rgba(102,120,115,0.18)',
    borderFocus: 'rgba(118,162,143,0.42)',
    accent: '#76a28e',
    accentSoft: 'rgba(118,162,143,0.12)',
    accentGlow: 'rgba(118,162,143,0.20)',
    shadowXs: '0 1px 3px rgba(0,0,0,0.20)',
    shadowSm: '0 2px 8px rgba(0,0,0,0.28), 0 1px 3px rgba(0,0,0,0.20)',
    shadowMd: '0 8px 24px rgba(0,0,0,0.36), 0 2px 6px rgba(0,0,0,0.24)',
    shadowLg: '0 16px 40px rgba(0,0,0,0.48), 0 4px 12px rgba(0,0,0,0.28)',
    panelStrong: 'rgba(36,40,42,0.86)',
    panelSoft: 'rgba(26,29,31,0.76)',
    panelHover: 'rgba(40,44,46,0.90)',
    surfaceStroke: 'rgba(102,120,115,0.11)',
    selection: 'rgba(118,162,143,0.26)',
    progressBar: 'rgba(118,162,143,0.30)',
    progressBg: 'rgba(118,162,143,0.05)',
    progressDone: '#76a28e',
    glowTop: 'rgba(118,162,143,0.04)',
    glowSide: 'rgba(255,255,255,0.015)',
    glowBottom: 'rgba(96,126,115,0.025)',
    washTop: 'rgba(24,27,29,0.78)',
    washMid: 'rgba(18,21,23,0.44)',
    washLow: 'rgba(14,17,19,0.14)',
    grainSide: 'rgba(255,255,255,0.012)',
    grainTint: 'rgba(118,162,143,0.014)',
    grainTintLow: 'rgba(118,162,143,0.004)',
    headingColor: '#d0dcd5',
    dividerColor: 'rgba(102,120,115,0.11)',
    cardBg: 'rgba(26,29,31,0.58)',
    buttonBg: 'rgba(34,38,40,0.68)',
    ripple: 'rgba(118,162,143,0.14)',
  },
}

/**
 * 获取完整主题 token 集
 */
export function getThemeTokens(theme: ReaderTheme): ThemeTokens {
  return T[theme]
}

/**
 * 所有可用的阅读主题
 */
export const READER_THEMES: ReaderTheme[] = ['wechat', 'mist', 'night']

/**
 * 核心 token key 列表 — 仅这些通过 JS setProperty 设置
 * 其余通过 CSS color-mix() 派生
 */
export const CORE_TOKEN_KEYS = [
  'bg',
  'panel',
  'text',
  'textBody',
  'muted',
  'faint',
  'placeholder',
  'border',
  'borderFocus',
  'accent',
  'shadowXs',
  'shadowSm',
  'shadowMd',
  'shadowLg',
  'panelHover',
  'surfaceStroke',
  'glowTop',
  'glowSide',
  'glowBottom',
  'washTop',
  'washMid',
  'washLow',
  'headingColor',
  'dividerColor',
] as const
