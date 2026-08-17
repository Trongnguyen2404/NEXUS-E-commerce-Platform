-- Product variants.
--
-- Variants are optional: a product without them keeps using its own price and
-- stock, so the existing catalogue and its orders are untouched.

-- Product gains a flag so listings can tell the two kinds apart without a join.
ALTER TABLE "products" ADD COLUMN "hasVariants" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "product_variants" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "label" TEXT NOT NULL,
    "price" DECIMAL(10,2),
    "stock" INTEGER NOT NULL DEFAULT 0,
    "imageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_variants_sku_key" ON "product_variants"("sku");
CREATE INDEX "product_variants_productId_idx" ON "product_variants"("productId");
CREATE INDEX "product_variants_sku_idx" ON "product_variants"("sku");

ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Cart items: which variant, plus a non-null key for the unique index.
-- Postgres treats NULLs as distinct, so indexing the nullable variantId would
-- let the same product be added twice. Existing rows get "", which makes
-- (cartId, productId, "") exactly as unique as the constraint being replaced.
ALTER TABLE "carts_items" ADD COLUMN "variantId" TEXT;
ALTER TABLE "carts_items" ADD COLUMN "variantKey" TEXT NOT NULL DEFAULT '';

DROP INDEX IF EXISTS "carts_items_cartId_productId_key";
CREATE UNIQUE INDEX "carts_items_cartId_productId_variantKey_key"
    ON "carts_items"("cartId", "productId", "variantKey");

ALTER TABLE "carts_items" ADD CONSTRAINT "carts_items_variantId_fkey"
    FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Order items keep a snapshot of the variant label, so a past order still reads
-- correctly after the variant is renamed or deleted.
ALTER TABLE "order_items" ADD COLUMN "variantId" TEXT;
ALTER TABLE "order_items" ADD COLUMN "variantLabel" TEXT;

ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variantId_fkey"
    FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
