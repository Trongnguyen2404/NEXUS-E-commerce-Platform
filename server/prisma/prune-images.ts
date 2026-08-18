import 'dotenv/config';
import { v2 as cloudinary } from 'cloudinary';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const publicIdOf = (url: string): string | null => {
  const [, after] = url.split('/upload/');
  if (!after) return null;

  return after.replace(/^v\d+\//, '').replace(/\.[^./]+$/, '');
};

const readCredential = (raw: string) =>
  decodeURIComponent(raw).replace(/^<|>$/g, '').trim();

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const url = process.env.CLOUDINARY_URL;

  if (!url) {
    console.log('CLOUDINARY_URL is not set — nothing to prune.\n');
    return;
  }

  const parsed = new URL(url);
  cloudinary.config({
    cloud_name: readCredential(parsed.hostname),
    api_key: readCredential(parsed.username),
    api_secret: readCredential(parsed.password),
    secure: true,
  });

  const [images, products, variants] = await Promise.all([
    prisma.productImage.findMany({ select: { url: true } }),
    prisma.product.findMany({ select: { imageUrl: true } }),
    prisma.productVariant.findMany({ select: { imageUrl: true } }),
  ]);
  const categories = await prisma.category.findMany({
    select: { imageUrl: true },
  });

  const inUse = new Set(
    [
      ...images.map((i) => i.url),
      ...products.map((p) => p.imageUrl),
      ...variants.map((v) => v.imageUrl),
      ...categories.map((c) => c.imageUrl),
    ]
      .filter((u): u is string => Boolean(u))
      .map(publicIdOf)
      .filter((id): id is string => Boolean(id)),
  );

  type StoredImage = { public_id: string; bytes: number };
  // The SDK types this call as `any`, so narrow it once here rather than
  // spreading an untyped array into the accumulator.
  type ResourcePage = { resources?: StoredImage[]; next_cursor?: string };

  const stored: StoredImage[] = [];
  let cursor: string | undefined;
  do {
    const page = (await cloudinary.api.resources({
      type: 'upload',
      prefix: 'nexus/',
      max_results: 500,
      next_cursor: cursor,
    })) as ResourcePage;
    stored.push(...(page.resources ?? []));
    cursor = page.next_cursor;
  } while (cursor);

  const orphans = stored.filter((r) => !inUse.has(r.public_id));
  const wasted = orphans.reduce((sum, r) => sum + r.bytes, 0);

  console.log(
    `\n${stored.length} images under nexus/, ${inUse.size} referenced by the database.`,
  );
  console.log(
    `${orphans.length} orphaned (${(wasted / 1024 / 1024).toFixed(2)} MB).\n`,
  );

  if (orphans.length === 0) return;

  if (dryRun) {
    for (const o of orphans) console.log(`  would delete  ${o.public_id}`);
    console.log('\nRe-run without --dry-run to delete them.\n');
    return;
  }

  let deleted = 0;
  for (const orphan of orphans) {
    const res = await cloudinary.uploader.destroy(orphan.public_id);
    if (res.result === 'ok') deleted++;
    else console.log(`  FAILED  ${orphan.public_id} — ${res.result}`);
  }

  console.log(`Deleted ${deleted} of ${orphans.length}.\n`);
}

main()
  .catch((error) => {
    console.error('Pruning failed:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
