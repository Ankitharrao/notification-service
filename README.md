# Notification Service

![Build Status](https://img.shields.io/badge/build-passing-brightgreen)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)
![Node.js](https://img.shields.io/badge/Node.js-20.x-green)
![License](https://img.shields.io/badge/license-MIT-blue)

A production-grade distributed notification service supporting 
email, SMS, push, and in-app channels — built to handle 
1M+ notifications/day with at-least-once delivery guarantees.

---

## The Problem It Solves

Modern applications need to notify users across multiple 
channels reliably, at scale, without duplicate sends — even 
when downstream providers (SendGrid, Twilio) are temporarily 
unavailable. This service decouples notification triggering 
from delivery using an async Kafka pipeline, ensuring no 
notification is ever lost.

---

## Architecture

![Architecture Diagram](docs/architecture.png)

### Request Flow
1. Client calls `POST /api/v1/notify`
2. API Gateway authenticates and rate limits the request
3. Core service checks user preferences, deduplicates, 
   renders template, assigns priority
4. Message published to Kafka topic per channel
5. Channel worker consumes message, applies per-user 
   rate limiting via Redis
6. Worker delivers via provider (SES/Twilio/FCM/WebSocket)
7. Delivery status logged, retried on failure with 
   exponential backoff
8. Failed messages after max retries go to Dead Letter Queue

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Language | TypeScript | Type safety, self-documenting interfaces |
| Framework | Fastify | 2-3x faster than Express, built-in schema validation |
| Queue | Apache Kafka | Durable, replayable, ordered per partition |
| Cache / Rate limit | Redis | Sub-millisecond ops, atomic token bucket ops |
| Database | PostgreSQL | ACID compliance for delivery guarantees |
| Email | AWS SES | Cost-effective at scale ($0.10/1000 emails) |
| SMS | Twilio | Industry standard, reliable delivery |
| Push | Firebase FCM | Supports both Android and iOS |
| In-app | Socket.io | WebSocket with fallback, room-based delivery |
| Infra | Docker + AWS | Reproducible environments, managed services |

---

## Key Design Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Queue | Kafka over SQS | Message replay, topic-per-channel isolation |
| Framework | Fastify over Express | Performance, schema validation |
| Rate limiting | Redis token bucket | Atomic ops, distributed, sub-ms latency |
| Delivery guarantee | At-least-once | Simpler than exactly-once, idempotency handles dupes |
| Schema | PostgreSQL JSONB for payload | Flexible per-channel data without schema changes |

See [/docs/adr](/docs/adr) for full Architecture Decision Records.

---

## Features

- **Multi-channel delivery** — Email, SMS, push, in-app from 
  single API call
- **User preferences** — Per-user, per-channel opt-in/out 
  and quiet hours
- **Template engine** — Dynamic variable substitution with 
  per-channel templates
- **Priority queuing** — High/normal/low priority lanes in Kafka
- **Deduplication** — Idempotency keys prevent duplicate sends
- **Rate limiting** — Token bucket per user per channel via Redis
- **Retry logic** — Exponential backoff with jitter on failures
- **Dead letter queue** — Failed notifications captured for 
  inspection
- **Delivery logs** — Full audit trail per notification attempt
- **Observability** — Prometheus metrics + Grafana dashboards

---

## Getting Started

### Prerequisites
- Node.js 20+
- Docker + Docker Compose
- AWS account (for SES)

### Local Setup

```bash
# Clone the repo
git clone https://github.com/Ankitharrao/notification-service
cd notification-service

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
# Fill in your values in .env

# Start infrastructure (Kafka, Redis, PostgreSQL)
docker-compose up -d

# Run database migrations
npm run migrate

# Start the service
npm run dev
```

### Send a test notification

```bash
curl -X POST http://localhost:3000/api/v1/notify \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "userId": "user-123",
    "channels": ["email", "push"],
    "templateId": "welcome-template",
    "payload": {
      "name": "Ankith",
      "link": "https://example.com"
    },
    "priority": "high"
  }'
```

---

## API Documentation

### POST /api/v1/notify
Trigger a notification for a user.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| userId | string | ✅ | Target user ID |
| channels | string[] | ✅ | email, sms, push, inapp |
| templateId | string | ✅ | Template to render |
| payload | object | ✅ | Template variables |
| priority | string | ❌ | high/normal/low (default: normal) |
| scheduledAt | ISO string | ❌ | Schedule for future delivery |
| idempotencyKey | string | ❌ | Prevent duplicate sends |

### GET /api/v1/notifications/:userId
Get notification history for a user.

### PUT /api/v1/preferences/:userId
Update user channel preferences and quiet hours.

---

## Load Test Results

> Coming soon — k6 load test targeting 1000 req/sec

---

## Future Improvements

- **Exactly-once delivery** using Kafka transactions
- **Multi-provider fallback** — SES fails → Mailgun fallback
- **ML-based send time optimization** — predict best delivery 
  time per user
- **Webhook support** — notify callers on delivery status change
- **Admin dashboard** — real-time delivery metrics UI
- **Multi-tenancy** — support multiple applications per deployment

---

## What I Learned

- Designing async pipelines with guaranteed delivery semantics
- Tradeoffs between at-least-once vs exactly-once delivery
- Distributed rate limiting patterns using Redis
- Kafka consumer group rebalancing and partition strategies
- Idempotency patterns in distributed systems

---