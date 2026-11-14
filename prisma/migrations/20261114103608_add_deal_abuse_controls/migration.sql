-- AlterTable
ALTER TABLE "deals" ADD COLUMN     "is_one_time" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "max_redemptions" INTEGER,
ADD COLUMN     "per_session_limit" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "per_table_limit" INTEGER;
