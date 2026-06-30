import { PrismaClient } from '../generated/prisma'
import { PrismaPg } from '@prisma/adapter-pg'
import { env } from './env'

// ── Database connection ───────────────────────
// Single shared Prisma Client instance
// Entire app imports this — never create
// multiple PrismaClient instances

const adapter = new PrismaPg({
  connectionString: env.DATABASE_URL
})

export const prisma = new PrismaClient({ adapter })

// ── Graceful shutdown ──────────────────────────
// Close DB connections cleanly when app stops
// Prevents connection leaks during restarts/deploys

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect()
}
