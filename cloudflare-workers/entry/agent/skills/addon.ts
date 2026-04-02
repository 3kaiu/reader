import {
  handleContentUpload,
  handleUserBackup,
  handleUserPreferences,
} from '../../../worker/routes.ts'
import type { SkillDescriptor } from '../types.ts'

export function buildAddonSkills(): SkillDescriptor[] {
  return [
    {
      id: 'user-preferences',
      domain: 'addon',
      description: 'User preferences management endpoint',
      patterns: ['/api/preferences'],
      methods: ['GET', 'POST'],
      execute: ({ request, env, userServices }) =>
        handleUserPreferences(request, env, userServices.getUserPreferences()),
    },
    {
      id: 'content-upload',
      domain: 'addon',
      description: 'User content upload endpoint',
      patterns: ['/api/content/upload'],
      methods: ['POST'],
      execute: ({ request, env, userServices }) =>
        handleContentUpload(request, env, userServices.getContentManagement()),
    },
    {
      id: 'user-backup',
      domain: 'addon',
      description: 'User backup creation endpoint',
      patterns: ['/api/backup'],
      methods: ['POST'],
      execute: ({ request, env, userServices }) =>
        handleUserBackup(
          request,
          env,
          userServices.getContentManagement(),
          userServices.getQueueProcessor()
        ),
    },
  ]
}
