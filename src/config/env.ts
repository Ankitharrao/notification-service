import dotenv from 'dotenv'

dotenv.config()

// ── Environment variable validation ──────────
// Validates all required env vars at startup
// Crashes with clear message if anything missing
// This is the "fail fast" principle

interface EnvConfig {
  PORT: number
  HOST: string
  JWT_SECRET: string
  ALLOWED_ORIGINS: string[]
  NODE_ENV: 'development' | 'production' | 'test'
}

const getEnvVar = (key: string, required: boolean = true): string => {
  const value = process.env[key]

  if (!value && required) {
    throw new Error(
      `Missing required environment variable: ${key}\n` +
      `Make sure ${key} is set in your .env file`
    )
  }

  return value || ''
}

// Parse and validate all env vars once
// Export a single typed config object
// Rest of codebase imports this, never process.env directly
export const env: EnvConfig = {
  PORT: Number(getEnvVar('PORT', false)) || 3000,
  HOST: getEnvVar('HOST', false) || '0.0.0.0',
  JWT_SECRET: getEnvVar('JWT_SECRET'),
  ALLOWED_ORIGINS: getEnvVar('ALLOWED_ORIGINS', false).split(',').filter(Boolean),
  NODE_ENV: (getEnvVar('NODE_ENV', false) || 'development') as EnvConfig['NODE_ENV'],
}
