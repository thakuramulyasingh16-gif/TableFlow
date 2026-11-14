-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "payment_reference" VARCHAR(100),
ADD COLUMN     "recorded_by" INTEGER;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
