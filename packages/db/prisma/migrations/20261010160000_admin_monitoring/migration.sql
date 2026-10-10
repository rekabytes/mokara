CREATE TABLE "admin_audit_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "actor" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "target_user_id" UUID,
  "target_username" TEXT NOT NULL,
  "from_plan" TEXT,
  "to_plan" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_audit_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "admin_audit_events_action_check" CHECK ("action" = 'plan_override_changed'),
  CONSTRAINT "admin_audit_events_from_plan_check" CHECK ("from_plan" IS NULL OR "from_plan" IN ('starter', 'pro', 'ultra')),
  CONSTRAINT "admin_audit_events_to_plan_check" CHECK ("to_plan" IS NULL OR "to_plan" IN ('starter', 'pro', 'ultra')),
  CONSTRAINT "admin_audit_events_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "admin_audit_events_created_at_id_idx" ON "admin_audit_events"("created_at", "id");
CREATE INDEX "admin_audit_events_target_user_id_idx" ON "admin_audit_events"("target_user_id");
