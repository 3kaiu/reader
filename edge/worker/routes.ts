

export {
  handleGitHubLogin,
  handleGitHubCallback,
  handleAuthVerify,
} from './routes/auth.ts'

export {
  handleClientRoutingAnalytics,
  handleClientMetrics,
  handleAgentRouterStats,
  handleAgentRouterConfig,
  handleAgentRouterConfigAudit,
} from './routes/analytics.ts'

export {
  handleUserPreferences,
  handleContentUpload,
  handleUserBackup,
  handleProgressSync,
} from './routes/content.ts'

export {
  handleSourceFlowAssist,
  handleSourceFlowAssistError,
  handleSourceFlowAssistFeedback,
  handleSourceFlowAssistFeedbackStats,
  handleSourceFlowAssistProfile,
  handleSourceFlowAssistProfileReset,
  handleSourceFlowAssistProfileAudit,
  handleFetchSessionAutoAcquire,
  handleFetchSessionVerify,
  handleSourceSessionProfile,
  handleSourceSessionProfileRecover,
} from './routes/source-flow.ts'
