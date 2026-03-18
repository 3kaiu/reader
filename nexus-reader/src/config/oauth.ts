export const GITHUB_CLIENT_ID = import.meta.env.VITE_OAUTH_GITHUB_CLIENT_ID || ''
export const GITHUB_CLIENT_SECRET = import.meta.env.VITE_OAUTH_GITHUB_CLIENT_SECRET || ''
export const AUTH_SECRET = import.meta.env.VITE_AUTH_SECRET || ''
export const GITHUB_OAUTH_CALLBACK_URL = 'https://nexus-reader.pages.dev/auth/callback'

export function isOAuthConfigured(): boolean {
  return !!(GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET && AUTH_SECRET)
}
