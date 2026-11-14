-- AlterTable
ALTER TABLE "table_sessions" ADD COLUMN "join_pin" VARCHAR(8),
ADD COLUMN "raw_token" VARCHAR(64);

-- Partial unique index: enforce at most ONE active TableSession per table
CREATE UNIQUE INDEX "idx_one_active_session_per_table" ON "table_sessions" ("table_id") WHERE status = 'active';
