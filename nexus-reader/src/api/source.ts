import { $post, $get, $delete } from './client'

export interface BookSource {
    id: string
    name: string
    author?: string
    version?: string
    enabled: boolean
}

export const sourceApi = {
    // 获取所有书源
    getBookSources: () => $get<BookSource[]>('/sources'),

    // 获取单个书源
    getBookSource: (id: string) => $get<BookSource>(`/sources/${id}`),

    // 添加/修改书源 (导入)
    addSource: (source: Partial<BookSource> & Record<string, unknown>) => $post('/sources', source),

    // 删除书源
    deleteBookSource: (id: string) => $delete(`/sources/${id}`),

    // 搜索书源 (Nexus-lite 搜索书籍时会自动在内部处理多源)
    // 如果有特定的源搜索需求，可以保留占位或根据需求添加

    // 调试书源 (Nexus-lite 待实现)
    testBookSource: (id: string) => $post(`/sources/${id}/test`, {}),
}
