import { ref } from 'vue'

export function useSourceBuilderDebugFormState() {
  const bookCurl = ref('')
  const chapterCurl = ref('')
  const searchCurl = ref('')
  const siteEntryCurl = ref('')
  const searchKeyword = ref('')
  const sourceId = ref('')
  const sourceName = ref('')
  const tagsText = ref('')
  const fetchMode = ref('external')
  const fetchProvider = ref('jina_reader')
  const fetchServiceUrl = ref('')
  const fetchEngine = ref('markdown')

  return {
    bookCurl,
    chapterCurl,
    searchCurl,
    siteEntryCurl,
    searchKeyword,
    sourceId,
    sourceName,
    tagsText,
    fetchMode,
    fetchProvider,
    fetchServiceUrl,
    fetchEngine,
  }
}
