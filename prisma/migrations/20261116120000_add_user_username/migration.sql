-- AlterTable
ALTER TABLE "users" ADD COLUMN "username" VARCHAR(30);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- Case-insensitive unique index
CREATE UNIQUE INDEX "users_username_lower_idx" ON "users"(LOWER("username")) WHERE "username" IS NOT NULL;
