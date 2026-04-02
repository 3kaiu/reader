import { proxyRequestWithEnv } from '../../../shared/proxy.ts'
import { handleDecodeRequest } from '../../../worker/routes.ts'
import type { SkillDescriptor } from '../types.ts'

export function buildCoreReadingSkills(): SkillDescriptor[] {
  return [
    {
      id: 'decoder-main',
      domain: 'decoder',
      description: 'Text decode and entity extraction',
      patterns: ['/decode/*'],
      methods: ['POST'],
      execute: ({ request, env }) => handleDecodeRequest(request, env),
    },
    {
      id: 'proxy-api',
      domain: 'core-reading',
      description: 'Proxy API requests to nexus-lite backend',
      patterns: ['/api/*'],
      execute: ({ request, env, ctx }) => proxyRequestWithEnv(request, env, ctx),
    },
  ]
}
