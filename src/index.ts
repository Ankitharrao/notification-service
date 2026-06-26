import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'

import { env } from './config/env'



const server = Fastify({
  logger: {
    transport: env.NODE_ENV === 'development' ? {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname'
      }
    } : undefined
  }
})

const start = async () => {
  try {
    // ── Register plugins FIRST ──────────────────
    // Plugins must be registered before routes
    // so they're available when routes execute
    await server.register(cors, {
      origin: env.ALLOWED_ORIGINS.length > 0 ? env.ALLOWED_ORIGINS : '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE']
    })

    await server.register(jwt, {
      secret: env.JWT_SECRET 
    })

    // ── Register routes AFTER plugins ──────────
    server.get('/health', async () => {
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'notification-service',
        environment: env.NODE_ENV
      }
    })

    // ── Start listening
    const port = Number(env.PORT) 
    const host = env.HOST 

    await server.listen({ port, host })

  } catch (err) {
    server.log.error(err)
    process.exit(1)
  }
}

start()