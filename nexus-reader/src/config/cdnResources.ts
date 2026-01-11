/**
 * CDN Resources Configuration
 * Defines CDN resources and their loading strategies
 */

export interface CDNResource {
  name: string
  url: string
  type: 'script' | 'style' | 'font' | 'image' | 'data'
  priority: 'high' | 'medium' | 'low'
  preload?: boolean
  fallback?: string
  integrity?: string
  globalName?: string
}

export const CDN_RESOURCES: Record<string, CDNResource> = {
  // AI/ML Libraries
  '@mlc-ai/web-llm': {
    name: 'MLC Web LLM',
    url: 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@latest/dist/index.js',
    type: 'script',
    priority: 'medium',
    preload: false,
    globalName: 'WebLLM'
  },
  
  '@huggingface/transformers': {
    name: 'Hugging Face Transformers',
    url: 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@latest/dist/transformers.min.js',
    type: 'script',
    priority: 'medium',
    preload: false,
    globalName: 'Transformers'
  },
  
  'onnxruntime-web': {
    name: 'ONNX Runtime Web',
    url: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@latest/dist/ort.min.js',
    type: 'script',
    priority: 'medium',
    preload: false,
    globalName: 'ort'
  },
  
  'piper-tts-web': {
    name: 'Piper TTS Web',
    url: 'https://cdn.jsdelivr.net/npm/piper-tts-web@latest/dist/piper.min.js',
    type: 'script',
    priority: 'low',
    preload: false,
    globalName: 'PiperTTS'
  },
  
  'tensorflow': {
    name: 'TensorFlow.js',
    url: 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@latest/dist/tf.min.js',
    type: 'script',
    priority: 'medium',
    preload: false,
    fallback: '/assets/js/tf-fallback.js',
    globalName: 'tf'
  },
  
  'transformers': {
    name: 'Transformers.js',
    url: 'https://cdn.jsdelivr.net/npm/@xenova/transformers@latest/dist/transformers.min.js',
    type: 'script',
    priority: 'medium',
    preload: false,
    globalName: 'Transformers'
  },
  
  // TTS Libraries
  'speech-synthesis': {
    name: 'Speech Synthesis Polyfill',
    url: 'https://cdn.jsdelivr.net/npm/speech-synthesis-polyfill@latest/dist/speech-synthesis.min.js',
    type: 'script',
    priority: 'low',
    preload: false
  },
  
  // UI Libraries
  'react': {
    name: 'React',
    url: 'https://unpkg.com/react@18/umd/react.production.min.js',
    type: 'script',
    priority: 'high',
    preload: true,
    integrity: 'sha384-...',
    globalName: 'React'
  },
  
  'react-dom': {
    name: 'React DOM',
    url: 'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
    type: 'script',
    priority: 'high',
    preload: true,
    integrity: 'sha384-...',
    globalName: 'ReactDOM'
  },
  
  // Fonts
  'inter-font': {
    name: 'Inter Font',
    url: 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
    type: 'style',
    priority: 'medium',
    preload: true
  },
  
  // Icons
  'lucide-icons': {
    name: 'Lucide Icons',
    url: 'https://unpkg.com/lucide@latest/dist/umd/lucide.js',
    type: 'script',
    priority: 'low',
    preload: false
  },
  
  // Utilities
  'lodash': {
    name: 'Lodash',
    url: 'https://cdn.jsdelivr.net/npm/lodash@latest/lodash.min.js',
    type: 'script',
    priority: 'low',
    preload: false
  },
  
  // Analytics
  'analytics': {
    name: 'Analytics',
    url: 'https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID',
    type: 'script',
    priority: 'low',
    preload: false
  }
}

export const CDN_DOMAINS = [
  'cdn.jsdelivr.net',
  'unpkg.com',
  'fonts.googleapis.com',
  'www.googletagmanager.com'
]

export const CDN_PRECONNECT_HINTS = CDN_DOMAINS.map(domain => `https://${domain}`)

export function getCDNResource(name: string): CDNResource | undefined {
  return CDN_RESOURCES[name]
}

export function getHighPriorityResources(): CDNResource[] {
  return Object.values(CDN_RESOURCES).filter(resource => resource.priority === 'high')
}

export function getPreloadResources(): CDNResource[] {
  return Object.values(CDN_RESOURCES).filter(resource => resource.preload)
}

export function getResourcesByType(type: CDNResource['type']): CDNResource[] {
  return Object.values(CDN_RESOURCES).filter(resource => resource.type === type)
}