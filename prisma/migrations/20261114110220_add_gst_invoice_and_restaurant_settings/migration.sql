-- CreateTable
CREATE TABLE "restaurant_settings" (
    "id" SERIAL NOT NULL,
    "restaurant_name" VARCHAR(120) NOT NULL DEFAULT 'TableFlow Bistro',
    "legal_name" VARCHAR(190) NOT NULL DEFAULT 'TableFlow Hospitality Private Limited',
    "address" VARCHAR(255) NOT NULL DEFAULT 'Plot 42, Sector 18, Gurugram, Haryana - 122002',
    "phone" VARCHAR(20) DEFAULT '+91 98765 43210',
    "email" VARCHAR(190) DEFAULT 'billing@tableflow.in',
    "gstin" VARCHAR(20) NOT NULL DEFAULT '06AAACT2727Q1ZB',
    "fssai_number" VARCHAR(20) NOT NULL DEFAULT '10822005000123',
    "state_code" VARCHAR(10) NOT NULL DEFAULT '06',
    "state_name" VARCHAR(60) NOT NULL DEFAULT 'Haryana',
    "hsn_sac_code" VARCHAR(20) NOT NULL DEFAULT '996331',
    "cgst_bps" INTEGER NOT NULL DEFAULT 250,
    "sgst_bps" INTEGER NOT NULL DEFAULT 250,
    "payment_provider" VARCHAR(40) NOT NULL DEFAULT 'razorpay',
    "upi_id" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "restaurant_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_sequences" (
    "id" SERIAL NOT NULL,
    "financial_year" VARCHAR(10) NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" SERIAL NOT NULL,
    "invoice_number" VARCHAR(32) NOT NULL,
    "financial_year" VARCHAR(10) NOT NULL,
    "sequence_number" INTEGER NOT NULL,
    "table_session_id" INTEGER NOT NULL,
    "table_id" INTEGER NOT NULL,
    "subtotal_paise" INTEGER NOT NULL,
    "discount_paise" INTEGER NOT NULL DEFAULT 0,
    "cgst_paise" INTEGER NOT NULL,
    "sgst_paise" INTEGER NOT NULL,
    "cgst_bps" INTEGER NOT NULL,
    "sgst_bps" INTEGER NOT NULL,
    "tip_paise" INTEGER NOT NULL DEFAULT 0,
    "total_paise" INTEGER NOT NULL,
    "legal_name" VARCHAR(190) NOT NULL,
    "trade_name" VARCHAR(120) NOT NULL,
    "gstin" VARCHAR(20) NOT NULL,
    "fssai_number" VARCHAR(20) NOT NULL,
    "address" VARCHAR(255) NOT NULL,
    "state_code" VARCHAR(10) NOT NULL,
    "state_name" VARCHAR(60) NOT NULL,
    "hsn_sac_code" VARCHAR(20) NOT NULL,
    "customer_email" VARCHAR(190),
    "customer_phone" VARCHAR(20),
    "customer_gstin" VARCHAR(20),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invoice_sequences_financial_year_key" ON "invoice_sequences"("financial_year");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoice_number_key" ON "invoices"("invoice_number");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_table_session_id_key" ON "invoices"("table_session_id");

-- CreateIndex
CREATE INDEX "idx_invoices_fy_seq" ON "invoices"("financial_year", "sequence_number");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_table_session_id_fkey" FOREIGN KEY ("table_session_id") REFERENCES "table_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "tables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
