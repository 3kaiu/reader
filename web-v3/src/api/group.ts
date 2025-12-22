import { $get, $post } from './client'

export interface BookGroup {
    groupId: number
    groupName: string
    order: number
    show: boolean
}

export const groupApi = {
    // Get all groups
    getBookGroups: () => $get<BookGroup[]>('/getBookGroups'),

    // Save (Add/Edit)
    saveBookGroup: (group: Partial<BookGroup>) => $post('/saveBookGroup', group),

    // Delete
    deleteBookGroup: (groupId: number) => $post('/deleteBookGroup', { groupId }),

    // Order
    saveBookGroupOrder: (order: { groupId: number; order: number }[]) =>
        $post('/saveBookGroupOrder', { order })
}
