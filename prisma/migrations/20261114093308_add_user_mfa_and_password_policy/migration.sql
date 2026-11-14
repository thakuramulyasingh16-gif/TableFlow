-- AlterTable
ALTER TABLE "users" ADD COLUMN     "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mfa_recovery_codes" TEXT,
ADD COLUMN     "mfa_secret" VARCHAR(255),
ADD COLUMN     "must_change_password" BOOLEAN NOT NULL DEFAULT false;
