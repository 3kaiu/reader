import { proxyRequestWithEnv } from '../../shared/proxy.ts'
import {
  handleAuthVerify,
  handleClientMetrics,
  handleClientRoutingAnalytics,
  handleContentUpload,
  handleDecodeRequest,
  handleAgentRouterStats,
  handleAgentRouterConfig,
  handleAgentRouterConfigAudit,
  handleGitHubCallback,
  handleGitHubLogin,
  handleHealthCheck,
  handlePopularContent,
  handleProgressSync,
  handleUserBackup,
  handleUserPreferences,
  handleUserStats,
} from '../../worker/routes.ts'
import type { SkillCandidate, SkillDescriptor } from './types.ts'

function matchesPath(pathname: string, pattern: string): boolean {
  if (pattern === '*') return true

  if (pattern.endsWith('*')) {
    return pathname.startsWith(pattern.slice(0, -1))
  }

  return pathname === pattern
}

function calcPatternScore(pathname: string, pattern: string): number {
  if (!matchesPath(pathname, pattern)) return -1

  if (pattern === '*') return 1
  if (pattern.endsWith('*')) return 100 + pattern.length
  return 200 + pattern.length
}

function methodAllowed(method: string, allowed: string[] | undefined): boolean {
  if (!allowed || allowed.length === 0) return true
  return allowed.includes(method)
}

export function collectSkillCandidates(
  request: Request,
  skills: SkillDescriptor[]
): SkillCandidate[] {
  const pathname = new URL(request.url).pathname
  const method = request.method.toUpperCase()
  const candidates: SkillCandidate[] = []

  for (const skill of skills) {
    if (!methodAllowed(method, skill.methods)) continue
    let score = -1
    for (const pattern of skill.patterns) {
      score = Math.max(score, calcPatternScore(pathname, pattern))
    }
    if (score > 0) {
      candidates.push({ skill, score })
    }
  }

  return candidates.sort((a, b) => b.score - a.score)
}

export function buildAgentSkills(): SkillDescriptor[] {
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
      id: 'decoder-main',
      domain: 'decoder',
      description: 'Text decode and entity extraction',
      patterns: ['/decode/*'],
      methods: ['POST'],
      execute: ({ request, env }) => handleDecodeRequest(request, env),
    },
    {
      id: 'progress-sync',
      domain: 'auth-sync',
      description: 'User progress read/write',
      patterns: ['/progress/*'],
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      execute: ({ request, env, url }) => handleProgressSync(request, env, url),
    },
    {
      id: 'analytics-health',
      domain: 'analytics',
      description: 'System health endpoint',
      patterns: ['/api/health'],
      methods: ['GET'],
      execute: ({ request, env, userServices }) =>
        handleHealthCheck(request, env, userServices.getAnalytics()),
    },
    {
      id: 'analytics-user-stats',
      domain: 'analytics',
      description: 'User analytics summary endpoint',
      patterns: ['/api/analytics/user-stats'],
      methods: ['GET'],
      execute: ({ request, env, userServices }) =>
        handleUserStats(request, env, userServices.getAnalytics()),
    },
    {
      id: 'analytics-popular-content',
      domain: 'analytics',
      description: 'Popular content analytics endpoint',
      patterns: ['/api/analytics/popular-content'],
      methods: ['GET'],
      execute: ({ request, env, userServices }) =>
        handlePopularContent(request, env, userServices.getAnalytics()),
    },
    {
      id: 'analytics-client-routing',
      domain: 'analytics',
      description: 'Client route metrics aggregation endpoint',
      patterns: ['/api/analytics/client-routing'],
      methods: ['GET'],
      execute: ({ request, env }) => handleClientRoutingAnalytics(request, env),
    },
    {
      id: 'analytics-agent-router-stats',
      domain: 'analytics',
      description: 'Agent router analytics summary endpoint',
      patterns: ['/api/agent/router-stats'],
      methods: ['GET'],
      execute: ({ request, env }) => handleAgentRouterStats(request, env),
    },
    {
      id: 'analytics-agent-config',
      domain: 'analytics',
      description: 'Agent router config snapshot endpoint',
      patterns: ['/api/agent/config'],
      methods: ['GET', 'PATCH', 'DELETE'],
      execute: ({ request, env }) => handleAgentRouterConfig(request, env),
    },
    {
      id: 'analytics-agent-config-audit',
      domain: 'analytics',
      description: 'Agent router config audit timeline endpoint',
      patterns: ['/api/agent/config/audit'],
      methods: ['GET'],
      execute: ({ request, env }) => handleAgentRouterConfigAudit(request, env),
    },
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
    {
      id: 'analytics-client-metrics',
      domain: 'analytics',
      description: 'Client metrics ingestion endpoint',
      patterns: ['/api/metrics/client'],
      methods: ['POST'],
      execute: ({ request, env }) => handleClientMetrics(request, env),
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
