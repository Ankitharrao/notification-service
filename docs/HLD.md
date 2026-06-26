# High Level Design — Notification Service

## 1. Requirements

### Functional Requirements
- Send notifications via email, SMS, push, and in-app channels
- Single API call can trigger multiple channels simultaneously
- Support per-user, per-channel preferences (opt-in/opt-out)
- Support quiet hours per user (don't send SMS at 2am)
- Template-based notifications with dynamic variable substitution
- Schedule notifications for future delivery
- Idempotent API — duplicate requests don't cause duplicate sends
- Notification history per user
- Real-time in-app delivery via WebSockets

### Non-Functional Requirements
- **Availability** — 99.9% uptime (max ~8.7 hours downtime/year)
- **Latency** — API response < 500ms (async, so just means 
  "accepted", not "delivered")
- **Throughput** — 1M notifications/day
- **Durability** — no notification lost even if a worker crashes
- **Scalability** — horizontally scalable workers per channel
- **Delivery guarantee** — at-least-once delivery

### Out of Scope (for now)
- Exactly-once delivery (complex, future improvement)
- Multi-tenancy (single application for now)
- Email open/click tracking
- A/B testing of notification content

## 2. Capacity Estimation

### Assumptions
- 1M notifications/day across all channels
- Channel split: 40% email, 30% push, 20% SMS, 10% in-app
- Average notification payload: 1KB
- Average template size: 2KB
- Delivery log per attempt: 500 bytes
- Peak traffic: 5x average (marketing campaigns, flash sales)

### Throughput
- 1M/day = 1,000,000 / 86,400 seconds = ~12 notifications/sec average
- Peak = 12 × 5 = ~60 notifications/sec
- Per channel at peak:
  - Email: 60 × 0.4 = 24/sec
  - Push:  60 × 0.3 = 18/sec
  - SMS:   60 × 0.2 = 12/sec
  - In-app: 60 × 0.1 = 6/sec

### Storage (per day)
- Notification records: 1M × 1KB = 1GB/day
- Delivery logs: 1M × 500B = 500MB/day (assuming 1 attempt avg)
- Templates: negligible (hundreds, not millions)
- Total: ~1.5GB/day → ~550GB/year

### Kafka
- Message size: ~1KB
- Throughput: 60 msg/sec peak
- Retention: 7 days
- Storage: 1KB × 60/sec × 86400 sec × 7 days = ~36GB
- Well within Kafka's comfort zone

### Redis
- Active rate limit keys: one per user per channel
- Assuming 100K active users × 4 channels = 400K keys
- Each key ~100 bytes = 40MB → fits easily in memory

### Database
- PostgreSQL can handle this volume comfortably
- Add read replica if notification history queries get heavy
- Partition notifications table by created_at monthly

### Conclusion
- Single Kafka cluster (3 brokers) handles this easily
- 2-3 worker instances per channel at peak
- Single PostgreSQL instance with read replica
- Single Redis instance (this volume doesn't need cluster)

## 3. Component Breakdown

### 3.1 API Gateway
**What it does:**
- Single entry point for all incoming notification requests
- Authenticates requests (JWT/API key validation)
- Rate limits incoming requests per client
- Validates request schema before it touches business logic
- Routes to Core Notification Service

**Why it exists:**
Keeps garbage out before it reaches your core logic.
Authentication and validation here means your core service
can trust everything it receives is clean and authorized.

**What it is NOT responsible for:**
- Business logic
- Database writes
- Channel decisions

**Tech:** Fastify with @fastify/jwt and @fastify/rate-limit

---

### 3.2 Core Notification Service
**What it does:**
- Checks user preferences (is this channel enabled for this user?)
- Checks quiet hours (is it 2am for this user's timezone?)
- Deduplicates using idempotency key
- Renders template with dynamic variables
- Assigns priority (high/normal/low)
- Publishes message to correct Kafka topic
- Writes notification record to PostgreSQL (status: pending)

**Why it exists:**
This is the brain. All business logic lives here so workers
stay dumb and focused on delivery only. This separation means
you can change business rules without touching delivery logic.



---

### 3.3 Kafka (Message Queue)
**What it does:**
- Decouples core service from channel workers
- Maintains one topic per channel:
  - notifications.email
  - notifications.sms
  - notifications.push
  - notifications.inapp
- Durably stores messages until workers consume them
- Allows message replay if a worker crashes

**Why Kafka over SQS:**
- Message replay — if email worker crashes, messages aren't
  lost, you replay from the last committed offset
- Topic-per-channel gives clean isolation
- Consumer groups allow multiple worker instances to
  share load automatically
- Ordered delivery per partition





---

### 3.4 Channel Workers
**What it does:**
- Consumes messages from its Kafka topic
- Applies per-user rate limiting via Redis
- Calls the appropriate channel handler
- Retries on failure with exponential backoff
- On max retries exceeded — publishes to Dead Letter Queue
- Updates notification status in PostgreSQL (sent/failed)

**Why one worker per channel:**
Each channel has different failure modes, rate limits, and
provider quirks. Email workers need to handle bounce webhooks,
SMS workers handle carrier errors, push handles token
invalidation. Separating them means an SMS provider outage
doesn't affect email delivery.

**Scaling:**
Workers are stateless — you can run N instances of each.
Kafka consumer groups automatically distribute partitions
across instances. Add more workers = more throughput.



### 3.5 Rate Limiter (Redis)
**What it does:**
- Enforces per-user per-channel sending limits
- Example: max 5 emails/hour per user, max 3 SMS/day
- Uses token bucket algorithm
- Atomic operations via Redis Lua scripts

**Why Redis:**
- Sub-millisecond read/write — rate limiting is in the hot path
- Atomic INCR operations prevent race conditions
- TTL on keys means automatic bucket refill
- Distributed — all worker instances share the same limiter

**Token bucket explained:**
Each user gets a bucket with N tokens per channel.
Each notification consumes 1 token. Tokens refill at a
fixed rate. If bucket is empty, notification is delayed
or dropped depending on priority.

---

### 3.6 Channel Handlers (Providers)
**What it does:**
- Email → AWS SES (with SendGrid as fallback)
- SMS → Twilio
- Push → Firebase FCM
- In-app → Socket.io WebSocket

**Why abstracted behind an interface:**
Workers call a generic send(notification) method.
The provider implementation is swappable. If SES has
an outage, we swap in SendGrid without touching worker code.

**Provider interface:**
```typescript
interface ChannelProvider {
  send(notification: NotificationPayload): Promise<DeliveryResult>
  isHealthy(): Promise<boolean>
}
```



---

### 3.7 Dead Letter Queue (DLQ)
**What it does:**
- Receives messages that failed after max retries (3 attempts)
- Stores them for manual inspection and reprocessing
- Triggers alerts when DLQ size exceeds threshold

**Why it matters:**
Without a DLQ, failed messages are silently lost. The DLQ
gives you visibility into what's failing and why. You can
fix the root cause then replay the messages.



---

### 3.8 Delivery Logs + Observability
**What it does:**
- Every delivery attempt logged to PostgreSQL
- Metrics exported to Prometheus
- Dashboards in Grafana
- Key metrics tracked:
  - Delivery success rate per channel
  - P50/P95/P99 delivery latency
  - Kafka consumer lag per topic
  - DLQ message count
  - Rate limit hit rate per channel

**Why consumer lag matters:**
Kafka consumer lag = how far behind your workers are.
If lag is growing, workers can't keep up with producers.
That's your signal to scale up worker instances.

---

## 4. Data Flow

### Happy Path (everything works)

## 5. Failure Scenarios

### 5.1 Kafka goes down
**What happens:**
- Core service cannot publish messages
- API returns 503 to client

**How we handle it:**
- Circuit breaker pattern — after 3 consecutive Kafka 
  failures, stop trying and fail fast
- Fallback — write to a PostgreSQL outbox table instead
- Outbox poller — separate process checks outbox table 
  every 30 seconds, republishes to Kafka when it recovers
- Client can retry safely — idempotency key prevents 
  duplicate processing

**Recovery:**
- Kafka recovers → outbox poller drains table → 
  notifications delivered with delay
- No messages lost

---

### 5.2 Worker crashes mid-delivery
**What happens:**
- Worker read message from Kafka
- Called SES, email delivered
- Crashed before committing offset
- Kafka replays message to restarted worker

**How we handle it:**
- Worker checks PostgreSQL before calling provider
- notification_id already has status "sent" → skip delivery
- Commit offset and move on
- User gets exactly one email

**Key insight:**
This is consumer-side idempotency. Without it, 
crashes = duplicate notifications.

---

### 5.3 SES (email provider) goes down
**What happens:**
- Email worker calls SES → 503 response
- Worker retries with exponential backoff
- After 3 attempts → message goes to DLQ
- CloudWatch alarm fires

**How we handle it:**
- Short outage (< 15 min) → messages wait in DLQ, 
  engineer replays after SES recovers
- Long outage → switch to fallback provider (SendGrid)
- Provider failover is automatic if health check fails

**What we tell users:**
Nothing — email delivery has inherent delays anyway.
If critical, support team reaches out manually.

---

### 5.4 Redis goes down
**What happens:**
- Rate limiter is unavailable
- Workers cannot check token buckets

**How we handle it:**
- Fail open vs fail closed decision:
  - Fail open → skip rate limiting, deliver anyway
  - Fail closed → reject all notifications until Redis recovers
- We choose FAIL OPEN for notifications
- Reasoning: missing a rate limit check occasionally is 
  better than blocking all notifications
- Log every fail-open decision for audit



---

### 5.5 PostgreSQL goes down
**What happens:**
- Core service cannot write notification record
- Cannot check idempotency keys
- Cannot check user preferences

**How we handle it:**
- This is the most critical failure — PostgreSQL is our
  source of truth
- API returns 503 immediately — no point proceeding
- Read replica for preference/history queries — only
  primary going down blocks writes
- PagerDuty alert fires immediately

**Why we don't fail open here:**
Unlike Redis, PostgreSQL failure means we can't guarantee
idempotency. Proceeding risks duplicate sends with no
audit trail. Fail closed is correct here.

---

### 5.6 Thundering herd on retry
**What happens:**
- 10,000 messages fail simultaneously (provider outage)
- All retry after exactly 2 seconds
- Provider just recovered — gets slammed with 10,000
  requests at once
- Provider goes down again

**How we handle it:**
- Jitter — add random delay (±20%) to backoff
- Instead of all retrying at t=2s, they retry between
  t=1.6s and t=2.4s
- Spreads the load, prevents re-triggering the outage

**This is called: Exponential backoff with jitter**
Every distributed systems engineer needs to know this term.

---

## 6. Tradeoffs

### 6.1 At-least-once vs Exactly-once delivery
| | At-least-once | Exactly-once |
|--|--|--|
| Complexity | Low | Very high |
| Duplicates possible | Yes | No |
| Messages lost | Never | Never |
| External provider support | Always | Impossible |
| Our choice | ✅ | ❌ |

**Why we chose at-least-once:**
Exactly-once end-to-end is impossible when calling external
HTTP providers like SES and Twilio. At-least-once with
consumer-side idempotency gives us the same practical
result with far less complexity.

---

### 6.2 Kafka vs SQS
| | Kafka | SQS |
|--|--|--|
| Message replay | ✅ | ❌ |
| Ordering | Per partition | Best effort |
| Throughput | Very high | High |
| Operational complexity | High | Low |
| Cost | Higher (MSK) | Lower |
| Our choice | ✅ | ❌ |

**Why we chose Kafka:**
Message replay is non-negotiable for a notification service.
If a worker is down for 2 hours, we need to replay those
messages. SQS deletes messages after consumption — no replay.

---

### 6.3 Fail open vs Fail closed (Redis down)
| Scenario | Fail open | Fail closed |
|--|--|--|
| Redis down | Skip rate limit, deliver | Block all notifications |
| Risk | Occasional rate limit breach | All notifications blocked |
| User impact | Might get extra notifications | Gets no notifications |
| Our choice | ✅ | ❌ |

**Why fail open for rate limiting:**
A notification service's primary job is to deliver
notifications. Blocking everything because Redis is down
is worse than occasionally exceeding rate limits.
We log every fail-open event for audit.

---

### 6.4 Sync vs Async delivery
| | Sync | Async |
|--|--|--|
| API response time | Slow (waits for delivery) | Fast (202 immediately) |
| Reliability | Provider down = API down | Provider down = queue fills |
| Scalability | Limited by provider speed | Independent scaling |
| Our choice | ❌ | ✅ |

**Why async:**
Email delivery can take 100-500ms. SMS can take longer.
Making the API caller wait for actual delivery would make
our API unusably slow. Async decouples API speed from
delivery speed.

---

## 7. Future Improvements

- **Exactly-once** — Kafka transactions for internal pipeline
- **Multi-provider fallback** — automatic SES → SendGrid failover
- **ML send-time optimization** — predict best delivery time 
  per user based on historical open rates
- **Multi-tenancy** — support multiple applications
- **Webhook callbacks** — notify caller when delivery confirmed
- **Admin dashboard** — real-time delivery metrics
- **Email open/click tracking** — pixel tracking, link wrapping
- **A/B testing** — test notification content variants