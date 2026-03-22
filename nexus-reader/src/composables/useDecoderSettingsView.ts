import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useDecoderStore } from '@/stores/decoder'
import type { BookType } from '@/types/decoder'

const bookTypeOptions: { value: BookType; label: string; description: string }[] = [
  { value: 'era', label: '年代文', description: '涉及历史人物、政治事件' },
  { value: 'entertainment', label: '娱乐圈', description: '明星、导演、综艺节目' },
  { value: 'urban', label: '都市', description: '商业大佬、互联网公司' },
  { value: 'history', label: '历史', description: '古代人物、朝代事件' },
  { value: 'business', label: '商战', description: '企业家、商业竞争' },
]

export function useDecoderSettingsView(options: {
  bookUrl: string
  close: () => void
}) {
  const router = useRouter()
  const decoderStore = useDecoderStore()

  const settings = computed(() => decoderStore.getBookSettings(options.bookUrl))

  function updateBookType(type: BookType) {
    decoderStore.updateBookSettings(options.bookUrl, { bookType: type })
  }

  function goToDictionary() {
    options.close()
    void router.push('/decoder-dictionary')
  }

  return {
    bookTypeOptions,
    settings,
    updateBookType,
    goToDictionary,
  }
}
