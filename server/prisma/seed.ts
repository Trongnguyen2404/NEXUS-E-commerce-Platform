import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const SALT_ROUNDS = 12;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const photo = (id: string) =>
  `https://images.unsplash.com/photo-${id}?w=1200&q=80`;

const CATEGORIES = [
  {
    slug: 'electronics',
    name: 'Electronics',
    description: 'Phones, laptops and gadgets',
    imageUrl: photo('1491933382434-500287f9b54b'),
  },
  {
    slug: 'audio',
    name: 'Audio',
    description: 'Headphones, speakers and hi-fi',
    imageUrl: photo('1484704849700-f032a568e944'),
  },
  {
    slug: 'accessories',
    name: 'Accessories',
    description: 'Cases, cables and chargers',
    imageUrl: photo('1526738549149-8e07eca6c147'),
  },
];

const IMG = {
  mbpPurple: '1517336714731-489689fd1ca8',
  mbpDesk: '1496181133206-80ce9b88a853',
  mbpWood: '1541807084-5c52b6b3adef',
  typing: '1517430816045-df4b7de11d1d',
  mbClosed: '1611186871348-b1ce696e52c9',
  laptopMarble: '1593642632823-8f785ba67e45',
  laptopDark: '1531297484001-80022131f5a1',

  iphonePro: '1574944985070-8f3ebc6b79d2',
  iphoneOnLaptop: '1511707171634-5f897ff02aa9',
  iphoneBlue: '1512499617640-c74ae3a79d37',
  phoneFlatlay: '1616353071855-2c045c4458ae',
  androidBlack: '1610945415295-d9bbf067e59c',
  phoneAmber: '1601784551446-20c9e07cdbdb',
  phoneInHand: '1592890288564-76628a30a657',
  tabletKeyboard: '1544244015-0df4b3ffc6b0',
  deskFlatlay: '1468495244123-6c6c332eeece',

  imacWhite: '1517059224940-d4af9eec41b7',
  imacNeon: '1547082299-de196ea013d6',
  gamingDesk: '1625842268584-8f3296236761',
  gamingRoom: '1593305841991-05c297ba4575',
  rgbTower: '1587202372775-e229f172b9d7',
  cpuBoard: '1615663245857-ac93bb7c39e7',

  dslr: '1502920917128-1aa500764cbd',
  cameraLenses: '1516035069371-29a1b244cc32',
  polaroid: '1526170375885-4d8ecf77b99f',
  gameboy: '1531525645387-7f14be1bdbbd',

  hpYellow: '1505740420928-5e560c06d30e',
  hpGrey: '1546435770-a3e426bf472b',
  hpBlack: '1585298723682-7115561c51b7',
  hpCopper: '1484704849700-f032a568e944',
  hpRose: '1613040809024-b4ef7ba99bc3',
  hpSilver: '1609081219090-a6d81d3085bf',
  hpDesk: '1550009158-9ebf69173e03',
  hpWired: '1583394838336-acd977736f90',
  hpBeige: '1618366712010-f4ae9c647dcb',
  hpStudio: '1558756520-22cfe5d382ca',

  budsPurple: '1590658268037-6bf12165a8df',
  budsCase: '1572569511254-d8f925fe2cbb',
  budsCap: '1600294037681-c80b4cb5b434',
  budsWood: '1592899677977-9c10ca588bbd',
  budsNeon: '1606220945770-b5b6c2c55bf1',
  speakerJbl: '1608043152269-423dbba4e7e1',
  speakerMini: '1519558260268-cde7e03a0152',
  speakerTall: '1543512214-318c7553f230',

  kbMech: '1618384887929-16ec33fab9ef',
  kbColour: '1595044426077-d36d9236d54a',
  kbMagic: '1587829741301-dc798b83add3',
  kbWhite: '1541140532154-b024d705b90a',
  mouseWhite: '1527814050087-3793815479db',
  mouseSilver: '1527864550417-7fd91fc51a46',
  mouseGaming: '1563297007-0686b7003af7',
  mouseDark: '1602143407151-7111542de6e8',
  gamingSetup: '1629429407759-01cd3d7cfb38',

  watchLuxury: '1524805444758-089113d48a6d',
  watchBronze: '1622434641406-a158123450f9',
  watchFlatlay: '1498049794561-7780e7231661',
  watchRound: '1523275335684-37898b6baf30',
  watchBlack: '1546868871-7041f2a55e12',
  watchWrist: '1434493789847-2f02dc6ca35d',
  watchBlue: '1631281956016-3cdc1b2fe5fb',
  charger: '1583863788434-e58a36330cf0',
  backpack: '1491637639811-60e2756cc1c7',
};

const PRODUCTS = [
  {
    sku: 'NX-LAPTOP-PRO14',
    name: 'Nexus Book Pro 14',
    price: 1799.0,
    stock: 12,
    category: 'electronics',
    description:
      '14-inch Liquid Retina display, 16GB unified memory, 1TB SSD. Built for people who keep forty tabs open.',
    images: [IMG.mbpPurple, IMG.mbpDesk, IMG.mbpWood, IMG.typing],
  },
  {
    sku: 'NX-LAPTOP-AIR13',
    name: 'Nexus Book Air 13',
    price: 1099.0,
    stock: 20,
    category: 'electronics',
    description: 'Fanless, 1.2kg, 18-hour battery. The one you actually carry.',
    images: [IMG.mbClosed, IMG.laptopMarble, IMG.laptopDark],
  },
  {
    sku: 'NX-PHONE-XPRO',
    name: 'Nexus Phone X Pro',
    price: 1099.0,
    stock: 30,
    category: 'electronics',
    description: 'Triple 48MP camera system, titanium frame, 512GB storage.',
    images: [
      IMG.iphonePro,
      IMG.iphoneOnLaptop,
      IMG.iphoneBlue,
      IMG.phoneFlatlay,
    ],
  },
  {
    sku: 'NX-PHONE-SULTRA',
    name: 'Nexus Phone S Ultra',
    price: 1299.0,
    stock: 18,
    category: 'electronics',
    description: '6.8-inch 120Hz AMOLED, 200MP main sensor, built-in stylus.',
    images: [IMG.androidBlack, IMG.phoneAmber, IMG.phoneInHand],
  },
  {
    sku: 'NX-TABLET-11',
    name: 'Nexus Tab 11',
    price: 649.0,
    stock: 25,
    category: 'electronics',
    description: '11-inch 120Hz display with pen and keyboard support.',
    images: [IMG.tabletKeyboard, IMG.deskFlatlay],
  },
  {
    sku: 'NX-DISPLAY-27',
    name: 'Nexus Studio Display 27"',
    price: 1299.0,
    stock: 8,
    category: 'electronics',
    description: '5K retina panel, 600 nits, built-in camera and speakers.',
    images: [IMG.imacWhite, IMG.imacNeon],
  },
  {
    sku: 'NX-DISPLAY-G32',
    name: 'Nexus Gaming Monitor 32"',
    price: 899.0,
    stock: 10,
    category: 'electronics',
    description:
      '4K 165Hz, 1ms response, HDR1000. Ships with the RGB you were going to buy anyway.',
    images: [IMG.gamingDesk, IMG.gamingRoom],
  },
  {
    sku: 'NX-TOWER-RGB',
    name: 'Nexus Tower RGB',
    price: 2199.0,
    stock: 5,
    category: 'electronics',
    description: 'Prebuilt desktop, 12-core CPU, 32GB DDR5, liquid cooled.',
    images: [IMG.rgbTower, IMG.cpuBoard],
  },
  {
    sku: 'NX-CAM-MIRRORLESS',
    name: 'Nexus Mirrorless R7',
    price: 1499.0,
    stock: 6,
    category: 'electronics',
    description: '32MP APS-C sensor, in-body stabilisation, 4K60 video.',
    images: [IMG.dslr, IMG.cameraLenses],
  },
  {
    sku: 'NX-CAM-INSTANT',
    name: 'Nexus Instant Snap',
    price: 149.0,
    stock: 35,
    category: 'electronics',
    description: 'Instant film camera with a built-in flash and self-timer.',
    images: [IMG.polaroid],
  },
  {
    sku: 'NX-HANDHELD-RETRO',
    name: 'Nexus Retro Handheld',
    price: 89.0,
    stock: 45,
    category: 'electronics',
    description: '8-bit handheld console preloaded with 200 classics.',
    images: [IMG.gameboy],
  },

  {
    sku: 'NX-HP-STUDIO',
    name: 'Nexus Studio Headphones',
    price: 299.0,
    stock: 40,
    category: 'audio',
    description: 'Over-ear, adaptive noise cancelling, 40-hour battery.',
    images: [IMG.hpYellow, IMG.hpGrey, IMG.hpBlack],
  },
  {
    sku: 'NX-HP-COPPER',
    name: 'Nexus Headphones Copper',
    price: 349.0,
    stock: 18,
    category: 'audio',
    description: 'Machined copper cups, memory-foam pads, wired hi-fi.',
    images: [IMG.hpCopper, IMG.hpRose],
  },
  {
    sku: 'NX-HP-MAX',
    name: 'Nexus Headphones Max',
    price: 549.0,
    stock: 12,
    category: 'audio',
    description: 'Aluminium ear cups, spatial audio, 20-hour battery.',
    images: [IMG.hpSilver],
  },
  {
    sku: 'NX-HP-WIRELESS',
    name: 'Nexus Wireless Headset',
    price: 229.0,
    stock: 28,
    category: 'audio',
    description: 'Dual-device Bluetooth with a boom mic for calls.',
    images: [IMG.hpDesk, IMG.hpWired, IMG.hpBeige],
  },
  {
    sku: 'NX-HP-MONITOR',
    name: 'Nexus Monitor Headphones',
    price: 179.0,
    stock: 24,
    category: 'audio',
    description: 'Closed-back studio monitors with a flat response curve.',
    images: [IMG.hpStudio],
  },
  {
    sku: 'NX-BUDS-AIRPRO',
    name: 'Nexus Buds Air Pro',
    price: 199.0,
    stock: 60,
    category: 'audio',
    description:
      'True wireless, active noise cancelling, wireless charging case.',
    images: [IMG.budsPurple, IMG.budsCase, IMG.budsCap, IMG.budsWood],
  },
  {
    sku: 'NX-BUDS-NEON',
    name: 'Nexus Buds Neon',
    price: 89.0,
    stock: 75,
    category: 'audio',
    description: 'Low-latency gaming earbuds with a 24-hour case.',
    images: [IMG.budsNeon],
  },
  {
    sku: 'NX-SPK-BOOM',
    name: 'Nexus Boom Portable Speaker',
    price: 129.0,
    stock: 50,
    category: 'audio',
    description: 'IPX7 waterproof, 20-hour playtime, pairs in stereo.',
    images: [IMG.speakerJbl],
  },
  {
    sku: 'NX-SPK-MINI',
    name: 'Nexus Home Mini',
    price: 49.0,
    stock: 90,
    category: 'audio',
    description: 'Voice-controlled smart speaker for small rooms.',
    images: [IMG.speakerMini, IMG.speakerTall],
  },

  {
    sku: 'NX-KB-MECH',
    name: 'Nexus Mechanical Keyboard',
    price: 159.0,
    stock: 40,
    category: 'accessories',
    description: 'Hot-swappable 75% layout, aluminium case, tactile switches.',
    images: [IMG.kbMech, IMG.kbColour],
  },
  {
    sku: 'NX-KB-SLIM',
    name: 'Nexus Slim Keyboard',
    price: 99.0,
    stock: 55,
    category: 'accessories',
    description: 'Low-profile wireless keyboard, three-device switching.',
    images: [IMG.kbMagic, IMG.kbWhite],
  },
  {
    sku: 'NX-MOUSE-PRECISION',
    name: 'Nexus Precision Mouse',
    price: 79.0,
    stock: 65,
    category: 'accessories',
    description: 'Silent switches, 8000 DPI sensor, USB-C fast charge.',
    images: [IMG.mouseWhite, IMG.mouseSilver],
  },
  {
    sku: 'NX-MOUSE-GAMING',
    name: 'Nexus Gaming Mouse',
    price: 119.0,
    stock: 38,
    category: 'accessories',
    description: '25K sensor, 8 programmable buttons, 70-hour battery.',
    images: [IMG.mouseGaming, IMG.mouseDark, IMG.gamingSetup],
  },
  {
    sku: 'NX-CHARGER-65W',
    name: 'Nexus 65W GaN Charger',
    price: 59.0,
    stock: 100,
    category: 'accessories',
    description: 'Dual USB-C fast charger, folding pins, laptop-capable.',
    images: [IMG.charger],
  },
  {
    sku: 'NX-WATCH-FIELD',
    name: 'Nexus Field Watch',
    price: 249.0,
    stock: 22,
    category: 'accessories',
    description:
      'Sapphire crystal, 100m water resistance, quick-release strap.',
    images: [IMG.watchLuxury, IMG.watchBronze, IMG.watchFlatlay],
  },
  {
    sku: 'NX-WATCH-SMART',
    name: 'Nexus Watch Round',
    price: 329.0,
    stock: 30,
    category: 'accessories',
    description: 'AMOLED smartwatch with ECG, GPS and 7-day battery.',
    images: [IMG.watchRound, IMG.watchBlack, IMG.watchWrist, IMG.watchBlue],
  },
  {
    sku: 'NX-BAG-DAYPACK',
    name: 'Nexus Everyday Backpack',
    price: 139.0,
    stock: 44,
    category: 'accessories',
    description: 'Water-resistant 22L daypack with a padded 16" laptop sleeve.',
    images: [IMG.backpack],
  },
];

async function seedAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@nexus.local';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345';

  await prisma.user.upsert({
    where: { email },

    update: { role: Role.ADMIN },
    create: {
      email,
      password: await bcrypt.hash(password, SALT_ROUNDS),
      firstName: 'Nexus',
      lastName: 'Admin',
      role: Role.ADMIN,
    },
  });

  return { email, password };
}

async function seedCatalog() {
  const forceImages = process.env.SEED_FORCE_IMAGES === '1';
  const categoryIdBySlug = new Map<string, string>();

  for (const category of CATEGORIES) {
    const saved = await prisma.category.upsert({
      where: { slug: category.slug },
      update: {
        name: category.name,
        description: category.description,

        ...(forceImages ? { imageUrl: category.imageUrl } : {}),
      },
      create: category,
    });

    if (!forceImages && !saved.imageUrl) {
      await prisma.category.update({
        where: { id: saved.id },
        data: { imageUrl: category.imageUrl },
      });
    }

    categoryIdBySlug.set(saved.slug, saved.id);
  }

  let created = 0;
  let regallered = 0;

  for (const { category, images, ...product } of PRODUCTS) {
    const categoryId = categoryIdBySlug.get(category);
    if (!categoryId) throw new Error(`Unknown category slug: ${category}`);

    const urls = images.map(photo);
    const existing = await prisma.product.findUnique({
      where: { sku: product.sku },
      select: { id: true },
    });

    if (!existing) {
      await prisma.product.create({
        data: {
          ...product,
          categoryId,
          imageUrl: urls[0],
          images: { create: urls.map((url, position) => ({ url, position })) },
        },
      });
      created++;
      continue;
    }

    await prisma.product.update({
      where: { id: existing.id },
      data: {
        name: product.name,
        description: product.description,
        price: product.price,
        categoryId,
      },
    });

    if (forceImages) {
      await prisma.$transaction([
        prisma.productImage.deleteMany({ where: { productId: existing.id } }),
        prisma.productImage.createMany({
          data: urls.map((url, position) => ({
            productId: existing.id,
            url,
            position,
          })),
        }),
        prisma.product.update({
          where: { id: existing.id },
          data: { imageUrl: urls[0] },
        }),
      ]);
      regallered++;
    }
  }

  return {
    categories: CATEGORIES.length,
    products: PRODUCTS.length,
    created,
    regallered,
  };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is not set — copy .env.example to .env first',
    );
  }

  const { email, password } = await seedAdmin();
  const { categories, products, created, regallered } = await seedCatalog();

  console.log(
    `\n  ${categories} categories, ${products} products (${created} created, ${regallered} galleries reset).`,
  );
  console.log('\n  Admin account');
  console.log(`    email    ${email}`);
  console.log(`    password ${password}`);
  console.log(
    '\n  Change this password before exposing the app to the internet.',
  );
  console.log(
    '  Run `npm run mirror-images` to move the catalogue photos onto Cloudinary.\n',
  );
}

main()
  .catch((error) => {
    console.error('Seeding failed:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
