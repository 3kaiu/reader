/**
 * UI Domain Layer
 *
 * Defines UI-related business logic and entities
 */

import { reactive } from 'vue'

export interface UITheme {
  name: string
  mode: 'light' | 'dark' | 'auto'
  colors: ThemeColors
  typography: TypographySettings
  spacing: SpacingSettings
  breakpoints: BreakpointSettings
}

export interface ThemeColors {
  primary: string
  secondary: string
  accent: string
  background: string
  surface: string
  text: string
  textSecondary: string
  border: string
  error: string
  warning: string
  success: string
  info: string
}

export interface TypographySettings {
  fontFamily: string
  fontSize: {
    xs: string
    sm: string
    md: string
    lg: string
    xl: string
    '2xl': string
    '3xl': string
  }
  fontWeight: {
    light: number
    normal: number
    medium: number
    semibold: number
    bold: number
  }
  lineHeight: {
    tight: number
    normal: number
    relaxed: number
  }
}

export interface SpacingSettings {
  spacing: {
    1: string
    2: string
    3: string
    4: string
    6: string
    8: string
    10: string
    12: string
    16: string
    20: string
    24: string
    32: string
  }
}

export interface BreakpointSettings {
  sm: string
  md: string
  lg: string
  xl: string
  '2xl': string
}

export interface UILayout {
  sidebar: {
    width: string
    collapsedWidth: string
    isCollapsed: boolean
  }
  header: {
    height: string
  }
  content: {
    padding: string
  }
  footer: {
    height: string
  }
}

export interface UIComponent {
  id: string
  type: string
  props: Record<string, any>
  children?: UIComponent[]
  styles?: Record<string, any>
  events?: Record<string, string>
}

export interface UIModal {
  id: string
  title: string
  content: UIComponent
  size: 'sm' | 'md' | 'lg' | 'xl' | 'fullscreen'
  closable: boolean
  backdrop: boolean
  centered: boolean
}

export interface UIToast {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  title?: string
  message: string
  duration: number
  position:
    | 'top-left'
    | 'top-right'
    | 'bottom-left'
    | 'bottom-right'
    | 'top-center'
    | 'bottom-center'
}

export interface UIDrawer {
  id: string
  title?: string
  content: UIComponent
  placement: 'left' | 'right' | 'top' | 'bottom'
  width?: string
  height?: string
  closable: boolean
  mask: boolean
}

export interface UIState {
  theme: UITheme
  layout: UILayout
  modals: UIModal[]
  toasts: UIToast[]
  drawers: UIDrawer[]
  loadingStates: Map<string, boolean>
  errorStates: Map<string, string>
}

// UI domain state
const uiState = reactive<UIState>({
  theme: {
    name: 'default',
    mode: 'auto',
    colors: {
      primary: '#007acc',
      secondary: '#6c757d',
      accent: '#28a745',
      background: '#ffffff',
      surface: '#f8f9fa',
      text: '#212529',
      textSecondary: '#6c757d',
      border: '#dee2e6',
      error: '#dc3545',
      warning: '#ffc107',
      success: '#28a745',
      info: '#17a2b8',
    },
    typography: {
      fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: {
        xs: '0.75rem',
        sm: '0.875rem',
        md: '1rem',
        lg: '1.125rem',
        xl: '1.25rem',
        '2xl': '1.5rem',
        '3xl': '1.875rem',
      },
      fontWeight: {
        light: 300,
        normal: 400,
        medium: 500,
        semibold: 600,
        bold: 700,
      },
      lineHeight: {
        tight: 1.25,
        normal: 1.5,
        relaxed: 1.75,
      },
    },
    spacing: {
      spacing: {
        1: '0.25rem',
        2: '0.5rem',
        3: '0.75rem',
        4: '1rem',
        6: '1.5rem',
        8: '2rem',
        10: '2.5rem',
        12: '3rem',
        16: '4rem',
        20: '5rem',
        24: '6rem',
        32: '8rem',
      },
    },
    breakpoints: {
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
    },
  },
  layout: {
    sidebar: {
      width: '280px',
      collapsedWidth: '64px',
      isCollapsed: false,
    },
    header: {
      height: '64px',
    },
    content: {
      padding: '24px',
    },
    footer: {
      height: '60px',
    },
  },
  modals: [],
  toasts: [],
  drawers: [],
  loadingStates: new Map(),
  errorStates: new Map(),
})

// Export reactive state
export { uiState }
