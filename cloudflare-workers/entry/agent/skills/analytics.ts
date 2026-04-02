import {
  handleAgentRouterConfig,
  handleAgentRouterConfigAudit,
  handleAgentRouterStats,
  handleClientMetrics,
  handleClientRoutingAnalytics,
  handleHealthCheck,
  handlePopularContent,
  handleUserStats,
} from '../../../worker/routes.ts'
import type { SkillDescriptor } from '../types.ts'

export function buildAnalyticsSkills(): SkillDescriptor[] {
  return [
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
      id: 'analytics-client-metrics',
      domain: 'analytics',
      description: 'Client metrics ingestion endpoint',
      patterns: ['/api/metrics/client'],
      methods: ['POST'],
      execute: ({ request, env }) => handleClientMetrics(request, env),
    },
  ]
}
