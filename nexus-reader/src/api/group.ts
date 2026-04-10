import { $get, $post, $delete } from './client'
import type { BookGroup } from '@/types/group'

export type { BookGroup }

export const groupApi = {
  // Get all groups
  getBookGroups: () => $get<BookGroup[]>('/groups'),

  // Save (Add/Edit)
  saveBookGroup: (group: Partial<BookGroup>) => $post('/groups', group),

  // Delete
  deleteBookGroup: (groupId: string | number) => $delete(`/groups/${groupId}`),
}
