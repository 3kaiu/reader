import { $post, $get, $delete, $put } from './client'
import type { BookSource } from '@/types/source'

export type { BookSource }

export const sourceApi = {
    // 获取所有书源
    getBookSources: () => $get<BookSource[]>('/sources'),

    // 获取单个书源
    getBookSource: (id: string) => $get<BookSource>(`/sources/${id}`),

    // 添加/修改书源 (导入)
    addSource: (source: Partial<BookSource> & Record<string, unknown>) => $post('/sources', source),

    // 删除书源
    deleteBookSource: (id: string) => $delete(`/sources/${id}`),

    // 更新书源状态
    updateSourceStatus: (id: string, enabled: boolean) =>
        $put<BookSource>(`/sources/${id}/status`, { enabled }),
}
