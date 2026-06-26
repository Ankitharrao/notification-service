import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import dotenv from 'dotenv'

dotenv.config()

const server = Fastify({
  logger: {
    transport: {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname'
      }
    }
  }
})

const start = async () => {
  try {
    // ── Register plugins FIRST ──────────────────
    // Plugins must be registered before routes
    // so they're available when routes execute
    await server.register(cors, {
      origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE']
    })

    await server.register(jwt, {
      secret: process.env.JWT_SECRET || 'dev-secret-change-in-production'
    })

    // ── Register routes AFTER plugins ──────────
    server.get('/health', async () => {
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'notification-service'
      }
    })

    // ── Start listening
    const port = Number(process.env.PORT) || 3000
    const host = process.env.HOST || '0.0.0.0'

    await server.listen({ port, host })

  } catch (err) {
    server.log.error(err)
    process.exit(1)
  }
}

start()