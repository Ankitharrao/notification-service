// ─────────────────────────────────────────────
// Shared TypeScript interfaces for the entire
// notification service codebase
// Every file imports types from here
// ─────────────────────────────────────────────

// Enums 

// Channel — which delivery method to use
export enum Channel {
  EMAIL = 'email',
  SMS = 'sms',
  PUSH = 'push',
  INAPP = 'inapp'
}

// Priority — how urgently to deliver
export enum Priority {
  HIGH = 'high',
  NORMAL = 'normal',
  LOW = 'low'
}

// NotificationStatus — lifecycle of a notification
export enum NotificationStatus {
  PENDING = 'pending',       // received, not yet queued
  QUEUED = 'queued',         // published to Kafka
  SENT = 'sent',             // delivered to provider
  FAILED = 'failed',         // max retries exceeded
  CANCELLED = 'cancelled'    // cancelled before delivery
}

// DeliveryStatus — result of a single delivery attempt
export enum DeliveryStatus {
  SUCCESS = 'success',
  FAILED = 'failed',
  BOUNCED = 'bounced',       // email bounced
  RATE_LIMITED = 'rate_limited'
}

// Core Interfaces

// The request body when someone calls POST /api/v1/notify
export interface NotificationRequest {
  userId: string
  channels: Channel[]
  templateId: string
  payload: Record<string, string>   // template variables
  priority?: Priority               // defaults to NORMAL
  scheduledAt?: Date                // for future delivery
  idempotencyKey?: string           // prevent duplicate sends
}

// What gets stored in PostgreSQL notifications table
export interface Notification {
  id: string
  userId: string
  templateId: string
  channel: Channel
  priority: Priority
  status: NotificationStatus
  payload: Record<string, string>
  idempotencyKey?: string
  scheduledAt?: Date
  createdAt: Date
  updatedAt: Date
}

// What gets published to Kafka
// Slim version — only what workers need
export interface NotificationMessage {
  notificationId: string
  userId: string
  channel: Channel
  priority: Priority
  templateId: string
  payload: Record<string, string>
  attempt: number                   // retry counter
  createdAt: Date
}

// User preferences per channel
export interface UserPreference {
  userId: string
  channel: Channel
  enabled: boolean
  quietHoursStart?: string          // "22:00"
  quietHoursEnd?: string            // "08:00"
  timezone: string                  // "Asia/Kolkata"
}

// Template — what gets rendered before sending
export interface Template {
  id: string
  name: string
  channel: Channel
  subject?: string                  // email only
  body: string                      // supports {{variables}}
  createdAt: Date
}

// Result of a delivery attempt by a worker
export interface DeliveryResult {
  notificationId: string
  channel: Channel
  status: DeliveryStatus
  provider: string                  // 'ses' | 'twilio' | 'fcm'
  attempt: number
  error?: string
  deliveredAt?: Date
}

//  API Response Interfaces 

// Standard API response wrapper
// Every endpoint returns this shape
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  timestamp: string
}

// Response when notification is accepted
export interface NotificationResponse {
  notificationId: string
  status: NotificationStatus
  message: string
}
