import type { TestNovelRecord, TestUserRecord } from './types'

interface KVLookupMock {
  get: {
    mockImplementation: (implementation: (key: string) => Promise<string | null>) => void
  }
}

function getKVService(services: Map<string, unknown>): KVLookupMock {
  const mockKV = services.get('kv')
  if (!mockKV || typeof mockKV !== 'object' || typeof (mockKV as KVLookupMock).get?.mockImplementation !== 'function') {
    throw new Error('KV mock service is not available')
  }

  return mockKV as KVLookupMock
}

function createTestUsers(): TestUserRecord[] {
  return [
    {
      id: 'user-1',
      preferences: { theme: 'dark', fontSize: 16 },
      progress: { 'novel-1': { chapter: 5, position: 0.3 } },
    },
    {
      id: 'user-2',
      preferences: { theme: 'light', fontSize: 14 },
      progress: { 'novel-2': { chapter: 2, position: 0.7 } },
    },
  ]
}

function createTestNovels(): TestNovelRecord[] {
  return [
    {
      id: 'novel-1',
      title: 'Test Novel 1',
      author: 'Test Author 1',
      chapters: [
        { id: 'ch-1', title: 'Chapter 1', content: 'Test content 1' },
        { id: 'ch-2', title: 'Chapter 2', content: 'Test content 2' },
      ],
    },
    {
      id: 'novel-2',
      title: 'Test Novel 2',
      author: 'Test Author 2',
      chapters: [
        { id: 'ch-3', title: 'Chapter 1', content: 'Test content 3' },
        { id: 'ch-4', title: 'Chapter 2', content: 'Test content 4' },
      ],
    },
  ]
}

export async function setupTestData(services: Map<string, unknown>): Promise<void> {
  console.log('📊 Setting up test data...')

  const testUsers = createTestUsers()
  const testNovels = createTestNovels()
  const mockKV = getKVService(services)
  const kvEntries = new Map<string, string>()

  for (const user of testUsers) {
    kvEntries.set(`user:${user.id}:preferences`, JSON.stringify(user.preferences))
    kvEntries.set(`user:${user.id}:progress`, JSON.stringify(user.progress))
  }

  for (const novel of testNovels) {
    kvEntries.set(`novel:${novel.id}`, JSON.stringify(novel))
  }

  mockKV.get.mockImplementation((key: string) => Promise.resolve(kvEntries.get(key) ?? null))

  services.set('testUsers', testUsers)
  services.set('testNovels', testNovels)

  console.log('✅ Test data setup complete')
}
