import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { StorageService } from '@/modules/storage/storage.service';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const ASPECT = {
  products: 1,
  variants: 1,
  categories: 4 / 3,
} as const;

const isMirrored = (url: string) =>
  url.includes('res.cloudinary.com') ||
  url.startsWith(process.env.API_PUBLIC_URL || '\0');

const download = async (url: string): Promise<Buffer> => {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NexusImageMirror/1.0)' },
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
};

async function main() {
  const storage = new StorageService();
  storage.onModuleInit();

  const [productImages, categories, variants] = await Promise.all([
    prisma.productImage.findMany({
      orderBy: [{ productId: 'asc' }, { position: 'asc' }],
      include: { product: { select: { name: true } } },
    }),
    prisma.category.findMany({
      select: { id: true, name: true, imageUrl: true },
    }),
    prisma.productVariant.findMany({
      select: { id: true, label: true, imageUrl: true },
    }),
  ]);

  type Target = {
    label: string;
    folder: 'products' | 'categories' | 'variants';
    url: string;
    save: (url: string) => Promise<unknown>;
  };

  const targets: Target[] = [
    ...productImages.map((i) => ({
      label: `${i.product.name} #${i.position}`,
      folder: 'products' as const,
      url: i.url,
      save: (url: string) =>
        prisma.productImage.update({ where: { id: i.id }, data: { url } }),
    })),
    ...categories
      .filter((c): c is typeof c & { imageUrl: string } => Boolean(c.imageUrl))
      .map((c) => ({
        label: `category ${c.name}`,
        folder: 'categories' as const,
        url: c.imageUrl,
        save: (url: string) =>
          prisma.category.update({
            where: { id: c.id },
            data: { imageUrl: url },
          }),
      })),
    ...variants
      .filter((v): v is typeof v & { imageUrl: string } => Boolean(v.imageUrl))
      .map((v) => ({
        label: `variant ${v.label}`,
        folder: 'variants' as const,
        url: v.imageUrl,
        save: (url: string) =>
          prisma.productVariant.update({
            where: { id: v.id },
            data: { imageUrl: url },
          }),
      })),
  ];

  const recrop = process.argv.includes('--recrop');
  const todo = recrop ? targets : targets.filter((t) => !isMirrored(t.url));

  console.log(
    recrop
      ? `\n${targets.length} images, re-cropping all of them to a fixed shape.\n`
      : `\n${targets.length} images total, ${todo.length} still on external hosts.\n`,
  );

  let done = 0;
  const failed: { name: string; url: string; reason: string }[] = [];

  for (const target of todo) {
    try {
      const stored = await storage.saveImage(
        await download(target.url),
        target.folder,
        recrop ? ASPECT[target.folder] : undefined,
      );
      await target.save(stored.url);
      done++;
      console.log(`  ok    ${target.label}`);
    } catch (error) {
      failed.push({
        name: target.label,
        url: target.url,
        reason: (error as Error).message,
      });
      console.log(`  FAIL  ${target.label} — ${(error as Error).message}`);
    }
  }

  const products = await prisma.product.findMany({
    select: {
      id: true,
      imageUrl: true,
      images: { orderBy: { position: 'asc' }, take: 1 },
    },
  });

  let covers = 0;
  for (const product of products) {
    const cover = product.images[0]?.url ?? null;
    if (cover !== product.imageUrl) {
      await prisma.product.update({
        where: { id: product.id },
        data: { imageUrl: cover },
      });
      covers++;
    }
  }

  console.log(
    `\nMirrored ${done}, failed ${failed.length}, covers resynced ${covers}.`,
  );

  if (failed.length) {
    console.log('\nStill pointing at an external host:');
    for (const f of failed)
      console.log(`  ${f.name}\n    ${f.url}\n    ${f.reason}`);
  }
  console.log('');
}

main()
  .catch((error) => {
    console.error('Mirroring failed:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
