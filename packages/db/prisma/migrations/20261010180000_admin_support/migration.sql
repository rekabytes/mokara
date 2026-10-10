ALTER TABLE "users"
  ADD COLUMN "billing_status" TEXT,
  ADD COLUMN "billing_cancel_at_period_end" BOOLEAN,
  ADD COLUMN "billing_cancel_at" TIMESTAMPTZ(3),
  ADD COLUMN "billing_verified_at" TIMESTAMPTZ(3),
  ADD COLUMN "billing_attempted_at" TIMESTAMPTZ(3),
  ADD COLUMN "billing_error_code" TEXT,
  ADD COLUMN "billing_invoice_status" TEXT,
  ADD COLUMN "billing_invoice_observed_at" TIMESTAMPTZ(3),
  ADD CONSTRAINT "users_billing_status_check" CHECK ("billing_status" IS NULL OR "billing_status" IN ('none','active','trialing','past_due','unpaid','canceled','paused','incomplete','incomplete_expired')),
  ADD CONSTRAINT "users_billing_invoice_status_check" CHECK ("billing_invoice_status" IS NULL OR "billing_invoice_status" IN ('paid','payment_failed'));
CREATE TABLE "billing_reconciliation_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID,
  "source" TEXT NOT NULL,
  "outcome" TEXT NOT NULL,
  "error_code" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "billing_reconciliation_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "billing_reconciliation_events_source_check" CHECK ("source" IN ('webhook','user_sync')),
  CONSTRAINT "billing_reconciliation_events_outcome_check" CHECK ("outcome" IN ('verified','failed')),
  CONSTRAINT "billing_reconciliation_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "billing_reconciliation_events_created_at_id_idx" ON "billing_reconciliation_events"("created_at", "id");
CREATE INDEX "billing_reconciliation_events_user_id_idx" ON "billing_reconciliation_events"("user_id");
