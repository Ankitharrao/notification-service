import { FastifyInstance } from 'fastify'
import { ApiResponse } from '../../types/index'

// ── Health route plugin ───────────────────────
// Fastify plugin = a function that receives the
// server instance and registers routes on it
// This keeps index.ts clean and routes isolated

export default async function healthRoutes(
  server: FastifyInstance
): Promise<void> {

  // Shallow health check — is the process alive?
  // Used by load balancers (AWS ALB, nginx)
  // Must always return 200 if process is running
  server.get<{ Reply: ApiResponse<object> }>(
    '/health',
    async () => {
      return {
        success: true,
        data: {
          status: 'ok',
          service: 'notification-service',
          uptime: Math.floor(process.uptime()),
          timestamp: new Date().toISOString(),
        },
        timestamp: new Date().toISOString()
      }
    }
  )

  // Deep health check — are all dependencies alive?
  // Used by monitoring dashboards (Grafana, CloudWatch)
  // Will check DB, Redis, Kafka once we add them
  server.get<{ Reply: ApiResponse<object> }>(
    '/health/deep',
    async () => {
      return {
        success: true,
        data: {
          status: 'ok',
          service: 'notification-service',
          dependencies: {
            database: 'not_configured',
            redis: 'not_configured',
            kafka: 'not_configured',
          },
          timestamp: new Date().toISOString(),
        },
        timestamp: new Date().toISOString()
      }
    }
  )
}
