-- CreateTable
CREATE TABLE "ProductImage" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductImage_productId_position_idx" ON "ProductImage"("productId", "position");

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill. Every product that already has a cover becomes a one-image gallery,
-- so existing products keep working and nobody has to re-upload 18 photos by
-- hand. gen_random_uuid() is built in from PostgreSQL 13.
INSERT INTO "ProductImage" ("id", "productId", "url", "position", "createdAt")
SELECT gen_random_uuid(), "id", "imageUrl", 0, CURRENT_TIMESTAMP
FROM "products"
WHERE "imageUrl" IS NOT NULL AND "imageUrl" <> '';
