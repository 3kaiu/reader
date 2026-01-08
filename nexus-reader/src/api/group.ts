import { $get, $post, $delete } from './client'

export interface BookGroup {
    groupId: number | string
    groupName: string
    order: number
    show: boolean
}

export const groupApi = {
    // Get all groups
    getBookGroups: () => $get<BookGroup[]>('/groups'),

    // Save (Add/Edit)
    saveBookGroup: (group: Partial<BookGroup>) => $post('/groups', group),

    // Delete
    deleteBookGroup: (groupId: string | number) => $delete(`/groups/${groupId}`),

    // Order
    saveBookGroupOrder: async (order: { groupId: string; orderIndex: number }[]) => {
        const results = await Promise.all(order.map(o => $post('/groups', { id: o.groupId, orderIndex: o.orderIndex })))
        return {
            isSuccess: results.every(r => r.isSuccess),
            data: results.map(r => r.data),
            errorMsg: results.find(r => !r.isSuccess)?.errorMsg
        }
    }
}
