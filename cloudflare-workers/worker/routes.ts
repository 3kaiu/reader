export {
  handleHealthCheck,
  handleUserStats,
  handlePopularContent,
  handleClientRoutingAnalytics,
  handleClientMetrics,
} from './routes/analytics.ts'

export {
  handleGitHubLogin,
  handleGitHubCallback,
  handleAuthVerify,
} from './routes/auth.ts'

export {
  handleUserPreferences,
  handleContentUpload,
  handleUserBackup,
  handleDecodeRequest,
  handleProgressSync,
} from './routes/content.ts'
