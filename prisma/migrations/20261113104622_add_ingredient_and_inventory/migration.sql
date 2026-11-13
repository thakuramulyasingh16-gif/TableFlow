-- CreateEnum
CREATE TYPE "StockStatus" AS ENUM ('IN_STOCK', 'OUT_OF_STOCK', 'ORDERED');

-- CreateEnum
CREATE TYPE "StockAlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "IngredientUnit" AS ENUM ('kg', 'g', 'l', 'ml', 'pcs');

-- AlterTable
ALTER TABLE "menu_items" ADD COLUMN     "archived_at" TIMESTAMP(3),
ADD COLUMN     "is_available_override" BOOLEAN,
ADD COLUMN     "override_reason" VARCHAR(255);

-- CreateTable
CREATE TABLE "ingredients" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "unit" "IngredientUnit" NOT NULL DEFAULT 'kg',
    "stock_status" "StockStatus" NOT NULL DEFAULT 'IN_STOCK',
    "current_stock" DECIMAL(12,3) DEFAULT 0,
    "low_stock_threshold" DECIMAL(12,3) DEFAULT 0,
    "notes" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_items" (
    "id" SERIAL NOT NULL,
    "menu_item_id" INTEGER NOT NULL,
    "ingredient_id" INTEGER NOT NULL,
    "quantity_per_serving" DECIMAL(10,3),
    "unit" "IngredientUnit" NOT NULL DEFAULT 'g',
    "is_optional" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipe_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchases" (
    "id" SERIAL NOT NULL,
    "ingredient_id" INTEGER NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL,
    "unit" "IngredientUnit" NOT NULL,
    "total_cost" INTEGER NOT NULL,
    "supplier" VARCHAR(190),
    "notes" VARCHAR(500),
    "purchased_by" INTEGER NOT NULL,
    "alert_id" INTEGER,
    "purchased_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "received_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_alerts" (
    "id" SERIAL NOT NULL,
    "ingredient_id" INTEGER NOT NULL,
    "raised_by" INTEGER NOT NULL,
    "status" "StockAlertStatus" NOT NULL DEFAULT 'OPEN',
    "affected_dishes" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledged_by" INTEGER,
    "acknowledged_at" TIMESTAMP(3),
    "resolved_by" INTEGER,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "stock_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_events" (
    "id" SERIAL NOT NULL,
    "ingredient_id" INTEGER NOT NULL,
    "changed_by" INTEGER,
    "from_status" "StockStatus" NOT NULL,
    "to_status" "StockStatus" NOT NULL,
    "reason" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ingredients_name_key" ON "ingredients"("name");

-- CreateIndex
CREATE INDEX "idx_ingredients_stock_status" ON "ingredients"("stock_status");

-- CreateIndex
CREATE INDEX "idx_ingredients_archived_at" ON "ingredients"("archived_at");

-- CreateIndex
CREATE INDEX "idx_recipe_items_menu_item" ON "recipe_items"("menu_item_id");

-- CreateIndex
CREATE INDEX "idx_recipe_items_ingredient" ON "recipe_items"("ingredient_id");

-- CreateIndex
CREATE UNIQUE INDEX "uniq_recipe_menu_item_ingredient" ON "recipe_items"("menu_item_id", "ingredient_id");

-- CreateIndex
CREATE INDEX "idx_purchases_ingredient" ON "purchases"("ingredient_id");

-- CreateIndex
CREATE INDEX "idx_purchases_purchased_at" ON "purchases"("purchased_at");

-- CreateIndex
CREATE INDEX "idx_purchases_alert" ON "purchases"("alert_id");

-- CreateIndex
CREATE INDEX "idx_stock_alerts_status_created" ON "stock_alerts"("status", "created_at");

-- CreateIndex
CREATE INDEX "idx_stock_alerts_ingredient_status" ON "stock_alerts"("ingredient_id", "status");

-- CreateIndex
CREATE INDEX "idx_stock_events_ingredient_created" ON "stock_events"("ingredient_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_stock_events_changed_by" ON "stock_events"("changed_by");

-- CreateIndex
CREATE INDEX "idx_menu_items_archived_at" ON "menu_items"("archived_at");

-- AddForeignKey
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_purchased_by_fkey" FOREIGN KEY ("purchased_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "stock_alerts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_alerts" ADD CONSTRAINT "stock_alerts_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_alerts" ADD CONSTRAINT "stock_alerts_raised_by_fkey" FOREIGN KEY ("raised_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_alerts" ADD CONSTRAINT "stock_alerts_acknowledged_by_fkey" FOREIGN KEY ("acknowledged_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_alerts" ADD CONSTRAINT "stock_alerts_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_events" ADD CONSTRAINT "stock_events_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_events" ADD CONSTRAINT "stock_events_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
