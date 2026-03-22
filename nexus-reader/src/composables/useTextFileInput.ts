import { ref } from 'vue'
import { readTextFile } from '@/utils/fileText'

export function useTextFileInput(options: {
  onText: (text: string, file: File) => Promise<void> | void
  onError?: (error: unknown) => void
}) {
  const inputRef = ref<HTMLInputElement | null>(null)

  async function loadFile(file: File, input?: HTMLInputElement | null) {
    try {
      const text = await readTextFile(file)
      await options.onText(text, file)
    } catch (error) {
      options.onError?.(error)
    } finally {
      if (input) {
        input.value = ''
      }
    }
  }

  async function handleFileChange(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return

    await loadFile(file, input)
  }

  function triggerFileSelect() {
    inputRef.value?.click()
  }

  return {
    inputRef,
    loadFile,
    handleFileChange,
    triggerFileSelect,
  }
}
