import {
  Brain,
  Sparkles,
  Infinity as InfinityIcon,
} from 'lucide-vue-next'
import { getAiModelSeries } from '@/utils/aiModel'

const MODEL_SERIES_ICONS = {
  qwen: Sparkles,
  llama: InfinityIcon,
  default: Brain,
} as const

export function getModelSeriesIcon(modelId: string) {
  return MODEL_SERIES_ICONS[getAiModelSeries(modelId)]
}
