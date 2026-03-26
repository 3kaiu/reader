import { $post, $get, $delete, $put } from './client'
import type { BookSource, SourceHealthSummary, SourcePolicy } from '@/types/source'

export type { BookSource }

export const sourceApi = {
    // 获取所有书源
    getBookSources: () => $get<BookSource[]>('/sources'),

    // 获取单个书源
    getBookSource: (id: string) => $get<BookSource>(`/sources/${id}`),

    // 获取书源健康信息
    getSourceHealth: () => $get<SourceHealthSummary[]>('/sources/health'),

    // 添加/修改书源 (导入)
    addSource: (source: Partial<BookSource> & Record<string, unknown>) => $post('/sources', source),

    // 删除书源
    deleteBookSource: (id: string) => $delete(`/sources/${id}`),

    // 更新书源状态
    updateSourceStatus: (id: string, enabled: boolean) =>
        $put<BookSource>(`/sources/${id}/status`, { enabled }),

    // 更新书源治理策略
    updateSourcePolicy: (id: string, policy: SourcePolicy) =>
        $put<BookSource>(`/sources/${id}/policy`, {
          licenseStatus: policy.licenseStatus ?? 'unknown',
          accessMode: policy.accessMode ?? 'unknown',
          ...(typeof policy.lastVerifiedAt === 'number'
            ? { lastVerifiedAt: policy.lastVerifiedAt }
            : {}),
          ...(typeof policy.notes === 'string' ? { notes: policy.notes } : {}),
        }),
}
