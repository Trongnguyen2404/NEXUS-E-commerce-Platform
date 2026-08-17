/**
 * Bootstraps a usable database: one ADMIN account plus a small sample catalog.
 *
 *   npm run seed
 *
 * Idempotent — every write is an upsert keyed on a unique column, so running it
 * twice updates instead of duplicating. Safe to re-run after a migration.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

// Must match AuthService.SALT_ROUNDS, otherwise the seeded admin cannot log in
// with the same cost factor the app uses for everyone else.
const SALT_ROUNDS = 12;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const CATEGORIES = [
  { slug: 'electronics', name: 'Electronics', description: 'Phones, laptops and gadgets' },
  { slug: 'audio', name: 'Audio', description: 'Headphones, speakers and hi-fi' },
  { slug: 'accessories', name: 'Accessories', description: 'Cases, cables and chargers' },
];

// imageUrl matters: the storefront renders a broken-image icon without it, and
// an empty catalogue is the first thing anyone sees after seeding.
const PRODUCTS = [
  { sku: 'NX-PHONE-001', name: 'Nexus Phone X', price: 899.0, stock: 25, category: 'electronics', description: '6.7" OLED, 256GB storage.', imageUrl: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=800&q=80' },
  { sku: 'NX-LAPTOP-001', name: 'Nexus Book Pro 14', price: 1799.0, stock: 12, category: 'electronics', description: '14" laptop, 16GB RAM, 1TB SSD.', imageUrl: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800&q=80' },
  { sku: 'NX-HEADPHONE-001', name: 'Nexus Studio Headphones', price: 299.0, stock: 40, category: 'audio', description: 'Over-ear, active noise cancelling.', imageUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&q=80' },
  { sku: 'NX-EARBUDS-001', name: 'Nexus Buds Air', price: 149.0, stock: 60, category: 'audio', description: 'True wireless earbuds, 30h battery.', imageUrl: 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=800&q=80' },
  { sku: 'NX-CHARGER-001', name: 'Nexus 65W GaN Charger', price: 59.0, stock: 100, category: 'accessories', description: 'Dual USB-C fast charger.', imageUrl: 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=800&q=80' },
  { sku: 'NX-CASE-001', name: 'Nexus Leather Case', price: 39.0, stock: 80, category: 'accessories', description: 'Full-grain leather, magnetic.', imageUrl: 'https://images.unsplash.com/photo-1556306535-0f09a537f0a3?w=800&q=80' },
];

async function seedAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@nexus.local';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345';

  const admin = await prisma.user.upsert({
    where: { email },
    // Re-seeding must not silently reset a password that was changed later, so
    // only the role is forced back to ADMIN on an existing account.
    update: { role: Role.ADMIN },
    create: {
      email,
      password: await bcrypt.hash(password, SALT_ROUNDS),
      firstName: 'Nexus',
      lastName: 'Admin',
      role: Role.ADMIN,
    },
  });

  return { admin, email, password };
}

async function seedCatalog() {
  const categoryIdBySlug = new Map<string, string>();

  for (const category of CATEGORIES) {
    const saved = await prisma.category.upsert({
      where: { slug: category.slug },
      update: { name: category.name, description: category.description },
      create: category,
    });
    categoryIdBySlug.set(saved.slug, saved.id);
  }

  for (const { category, ...product } of PRODUCTS) {
    const categoryId = categoryIdBySlug.get(category);
    if (!categoryId) throw new Error(`Unknown category slug: ${category}`);

    await prisma.product.upsert({
      where: { sku: product.sku },
      // Stock is left alone on update — re-seeding should not undo real sales.
      update: { name: product.name, description: product.description, price: product.price, imageUrl: product.imageUrl, categoryId },
      create: { ...product, categoryId },
    });
  }

  return { categories: CATEGORIES.length, products: PRODUCTS.length };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set — copy .env.example to .env first');
  }

  const { email, password } = await seedAdmin();
  const { categories, products } = await seedCatalog();

  console.log(`\n  Seeded ${categories} categories and ${products} products.`);
  console.log('\n  Admin account');
  console.log(`    email    ${email}`);
  console.log(`    password ${password}`);
  console.log('\n  Change this password before exposing the app to the internet.\n');
}

main()
  .catch((error) => {
    console.error('Seeding failed:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
