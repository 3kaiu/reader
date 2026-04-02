import {
  handleAuthVerify,
  handleGitHubCallback,
  handleGitHubLogin,
  handleProgressSync,
} from '../../../worker/routes.ts'
import type { SkillDescriptor } from '../types.ts'

export function buildAuthSyncSkills(): SkillDescriptor[] {
  return [
    {
      id: 'auth-github-login',
      domain: 'auth-sync',
      description: 'GitHub OAuth login redirect',
      patterns: ['/auth/github'],
      methods: ['GET'],
      execute: ({ request, env }) => handleGitHubLogin(request, env),
    },
    {
      id: 'auth-github-callback',
      domain: 'auth-sync',
      description: 'GitHub OAuth callback exchange',
      patterns: ['/auth/github/callback'],
      methods: ['GET'],
      execute: ({ request, env }) => handleGitHubCallback(request, env),
    },
    {
      id: 'auth-verify',
      domain: 'auth-sync',
      description: 'JWT verification endpoint',
      patterns: ['/auth/verify'],
      methods: ['GET'],
      execute: ({ request, env }) => handleAuthVerify(request, env),
    },
    {
      id: 'progress-sync',
      domain: 'auth-sync',
      description: 'User progress read/write',
      patterns: ['/progress/*'],
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      execute: ({ request, env, url }) => handleProgressSync(request, env, url),
    },
  ]
}
