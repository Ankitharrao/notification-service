-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('EMAIL', 'SMS', 'PUSH', 'INAPP');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('HIGH', 'NORMAL', 'LOW');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'QUEUED', 'SENT', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('SUCCESS', 'FAILED', 'BOUNCED', 'RATE_LIMITED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "fcm_token" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "quiet_hours_start" TEXT,
    "quiet_hours_end" TEXT,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "priority" "Priority" NOT NULL DEFAULT 'NORMAL',
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL,
    "idempotency_key" TEXT,
    "scheduled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_logs" (
    "id" TEXT NOT NULL,
    "notification_id" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "status" "DeliveryStatus" NOT NULL,
    "provider" TEXT NOT NULL,
    "error_message" TEXT,
    "delivered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_user_id_channel_key" ON "user_preferences"("user_id", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "templates_name_key" ON "templates"("name");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_idempotency_key_key" ON "notifications"("idempotency_key");

-- CreateIndex
CREATE INDEX "notifications_user_id_idx" ON "notifications"("user_id");

-- CreateIndex
CREATE INDEX "notifications_status_idx" ON "notifications"("status");

-- CreateIndex
CREATE INDEX "delivery_logs_notification_id_idx" ON "delivery_logs"("notification_id");

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_logs" ADD CONSTRAINT "delivery_logs_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
