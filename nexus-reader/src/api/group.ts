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
}
