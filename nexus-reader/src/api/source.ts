import { $post, $get, $delete, $put } from './client'
import type {
  BookSource,
  SourceCircuitStateResponse,
  SourceHealthSummary,
  SourcePolicy,
  RuntimeSnapshotSaveResponse,
  RuntimeSnapshotExportResponse,
  RuntimeSnapshotImportResponse,
  RuntimeStateOverviewResponse,
  SourceRuntimeResetResponse,
  SourceRuntimeProfileResponse,
} from '@/types/source'

export type { BookSource }

export const sourceApi = {
    // 获取所有书源
    getBookSources: () => $get<BookSource[]>('/sources'),

    // 获取单个书源
    getBookSource: (id: string) => $get<BookSource>(`/sources/${id}`),

    // 获取书源健康信息
    getSourceHealth: () => $get<SourceHealthSummary[]>('/sources/health'),

    // 立即保存当前运行时快照
    saveRuntimeSnapshot: () =>
        $post<RuntimeSnapshotSaveResponse>('/sources/runtime-state/snapshot', {}),

    // 导出当前运行时治理快照
    exportRuntimeSnapshot: () =>
        $get<RuntimeSnapshotExportResponse>('/sources/runtime-state/export'),

    // 导入治理快照（replace）
    importRuntimeSnapshot: (payload: RuntimeSnapshotExportResponse) =>
        $post<RuntimeSnapshotImportResponse>('/sources/runtime-state/import', payload),

    // 获取运行时治理总览
    getRuntimeStateOverview: () =>
        $get<RuntimeStateOverviewResponse>('/sources/runtime-state/overview'),

    // 获取书源运行时画像
    getSourceRuntimeProfile: (id: string) =>
        $get<SourceRuntimeProfileResponse>(`/sources/${id}/runtime-profile`),

    // 获取书源熔断状态
    getSourceCircuitState: (id: string) =>
        $get<SourceCircuitStateResponse>(`/sources/${id}/circuit-state`),

    // 重置书源运行时状态（健康分、熔断、提取指标）
    resetSourceRuntimeState: (id: string, mode: 'full' | 'circuit_only' = 'full') =>
        $post<SourceRuntimeResetResponse>(`/sources/${id}/runtime-state/reset`, { mode }),

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
