/**
 * 网文解密 API
 */
import { ofetch } from 'ofetch'
import { getAuthToken } from '@/utils/authStorage'
import type {
  DecodeRequest,
  DecodeResponse,
  DictionaryEntry,
  BookState,
  ConfirmEntryResponse,
  DictionaryLevel,
  BookType,
} from '@/types/decoder'

// Decoder Worker URL
const DECODER_URL = import.meta.env.VITE_DECODER_URL || 'https://nexus-decoder.cinosci.workers.dev'

// 创建 decoder fetch 实例
const decoderFetch = ofetch.create({
  baseURL: DECODER_URL,
  timeout: 30000,
  credentials: 'include',
  retry: 2,
  retryDelay: 1000,
  onRequest({ options }) {
    // 添加认证 token
    const token = getAuthToken()
    if (token) {
      // 使用 HeadersInit 兼容的方式设置 headers
      const headers = new Headers(options.headers as HeadersInit)
      headers.set('Authorization', `Bearer ${token}`)
      options.headers = headers
    }
  },
})

/**
 * 解码章节内容
 */
export async function decodeChapter(request: DecodeRequest): Promise<DecodeResponse> {
  return decoderFetch<DecodeResponse>('/decode', {
    method: 'POST',
    body: request,
  })
}

/**
 * 获取词典
 */
export async function getDictionary(params?: {
  level?: DictionaryLevel | 'all'
  bookId?: string
  category?: BookType
}): Promise<{ entries: DictionaryEntry[] }> {
  return decoderFetch<{ entries: DictionaryEntry[] }>('/dictionary', {
    method: 'GET',
    params,
  })
}

/**
 * 更新词典条目
 */
export async function updateDictionary(data: {
  entry: Partial<DictionaryEntry>
  level: DictionaryLevel
  bookId?: string
  promote?: boolean
}): Promise<{ success: boolean; entry: DictionaryEntry }> {
  return decoderFetch<{ success: boolean; entry: DictionaryEntry }>('/dictionary', {
    method: 'PUT',
    body: data,
  })
}

/**
 * 导入词典
 */
export async function importDictionary(
  entries: DictionaryEntry[]
): Promise<{ success: boolean; imported: number; total: number }> {
  return decoderFetch<{ success: boolean; imported: number; total: number }>('/dictionary/import', {
    method: 'POST',
    body: { entries },
  })
}

/**
 * 导出词典
 */
export async function exportDictionary(): Promise<{ entries: DictionaryEntry[] }> {
  return decoderFetch<{ entries: DictionaryEntry[] }>('/dictionary/export', {
    method: 'GET',
  })
}

/**
 * 确认词条（触发自动提升检查）
 */
export async function confirmEntry(data: {
  entry: Partial<DictionaryEntry>
  bookId: string
  bookType?: BookType
}): Promise<ConfirmEntryResponse> {
  return decoderFetch<ConfirmEntryResponse>('/dictionary/confirm', {
    method: 'POST',
    body: data,
  })
}

/**
 * 删除词典条目
 */
export async function deleteDictionaryEntry(
  entryId: string,
  params?: {
    level?: DictionaryLevel
    bookId?: string
    category?: BookType
  }
): Promise<{ success: boolean; deletedId: string; level: DictionaryLevel; message: string }> {
  return decoderFetch<{ success: boolean; deletedId: string; level: DictionaryLevel; message: string }>(
    `/dictionary/${encodeURIComponent(entryId)}`,
    {
      method: 'DELETE',
      params,
    }
  )
}

/**
 * 批量删除词典条目
 */
export async function batchDeleteDictionaryEntries(data: {
  ids: string[]
  level?: DictionaryLevel
  bookId?: string
  category?: BookType
}): Promise<{
  success: boolean
  deleted: number
  failed: number
  details: {
    deletedIds: string[]
    failedIds: string[]
  }
}> {
  return decoderFetch<{
    success: boolean
    deleted: number
    failed: number
    details: {
      deletedIds: string[]
      failedIds: string[]
    }
  }>('/dictionary/batch', {
    method: 'DELETE',
    body: data,
  })
}

/**
 * 获取书籍状态
 */
export async function getBookState(bookId: string): Promise<BookState> {
  return decoderFetch<BookState>(`/book/${encodeURIComponent(bookId)}/state`, {
    method: 'GET',
  })
}

/**
 * 更新书籍状态
 */
export async function updateBookState(
  bookId: string,
  data: {
    meta?: Partial<BookState['meta']>
    aliasChain?: { bookAlias: string; realName?: string; entityId?: string }
  }
): Promise<BookState> {
  return decoderFetch<BookState>(`/book/${encodeURIComponent(bookId)}/state`, {
    method: 'PUT',
    body: data,
  })
}

/**
 * 健康检查
 */
export async function checkDecoderHealth(): Promise<{
  status: string
  service: string
  timestamp: string
}> {
  return decoderFetch<{ status: string; service: string; timestamp: string }>('/health', {
    method: 'GET',
  })
}
