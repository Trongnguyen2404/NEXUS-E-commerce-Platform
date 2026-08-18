import { Prisma, Role, OrderStatus, DiscountType } from '@prisma/client';

// Prisma returns money as Decimal; tests build them the same way so services
// see exactly what the database would hand them.
export const money = (value: number | string): Prisma.Decimal =>
  new Prisma.Decimal(value);

const AT = new Date('2026-01-01T00:00:00.000Z');

// Every factory takes an override object so a test states only what matters.
type Over<T> = Partial<T>;

export const aUser = (over: Over<Record<string, unknown>> = {}) => ({
  id: 'user-1',
  email: 'buyer@nexus.test',
  password: '$2b$12$hashhashhashhashhashhashhashhashhashhashhashhashhashha',
  firstName: 'Lan',
  lastName: 'Pham',
  role: Role.USER,
  refreshToken: null,
  createdAt: AT,
  updatedAt: AT,
  ...over,
});

export const aCategory = (over: Over<Record<string, unknown>> = {}) => ({
  id: 'cat-1',
  name: 'Audio',
  slug: 'audio',
  description: null,
  imageUrl: null,
  isActive: true,
  createdAt: AT,
  updatedAt: AT,
  ...over,
});

export const aProduct = (over: Over<Record<string, unknown>> = {}) => ({
  id: 'prod-1',
  name: 'Nexus Headphones',
  description: 'Over-ear',
  price: money(100),
  stock: 10,
  sku: 'NX-HP',
  imageUrl: null,
  isActive: true,
  hasVariants: false,
  categoryId: 'cat-1',
  createdAt: AT,
  updatedAt: AT,
  ...over,
});

export const aVariant = (over: Over<Record<string, unknown>> = {}) => ({
  id: 'var-1',
  productId: 'prod-1',
  sku: 'NX-HP-BLK',
  options: { Color: 'Black' } as Prisma.JsonValue,
  label: 'Black',
  price: money(120),
  stock: 5,
  imageUrl: null,
  isActive: true,
  createdAt: AT,
  updatedAt: AT,
  ...over,
});

export const aCoupon = (over: Over<Record<string, unknown>> = {}) => ({
  id: 'coupon-1',
  code: 'SAVE10',
  type: DiscountType.PERCENT,
  value: money(10),
  minOrderAmount: null,
  maxDiscount: null,
  maxUses: null,
  usedCount: 0,
  startsAt: null,
  expiresAt: null,
  isActive: true,
  createdAt: AT,
  updatedAt: AT,
  ...over,
});

export const anOrder = (over: Over<Record<string, unknown>> = {}) => ({
  id: 'order-1',
  orderNumber: 'ORD-1',
  status: OrderStatus.PENDING,
  subtotal: money(100),
  discountAmount: money(0),
  shippingFee: money(0),
  taxAmount: money(8),
  totalAmount: money(108),
  userId: 'user-1',
  cartId: null,
  couponId: null,
  addressId: null,
  shippingAddress: '1 Test St',
  createdAt: AT,
  updatedAt: AT,
  ...over,
});

export const anOrderItem = (over: Over<Record<string, unknown>> = {}) => ({
  id: 'oi-1',
  quantity: 1,
  price: money(100),
  productName: 'Nexus Headphones',
  productId: 'prod-1',
  variantId: null,
  variantLabel: null,
  orderId: 'order-1',
  createdAt: AT,
  updatedAt: AT,
  ...over,
});

export const aCart = (over: Over<Record<string, unknown>> = {}) => ({
  id: 'cart-1',
  userId: 'user-1',
  checkedOut: false,
  createdAt: AT,
  updatedAt: AT,
  cartItems: [],
  ...over,
});

export const aCartItem = (over: Over<Record<string, unknown>> = {}) => ({
  id: 'ci-1',
  quantity: 1,
  cartId: 'cart-1',
  productId: 'prod-1',
  variantId: null,
  // Part of the (cartId, productId, variantKey) unique key; '' means no variant.
  variantKey: '',
  createdAt: AT,
  updatedAt: AT,
  ...over,
});

export const anAddress = (over: Over<Record<string, unknown>> = {}) => ({
  id: 'addr-1',
  userId: 'user-1',
  fullName: 'Lan Pham',
  phone: '0900000000',
  line1: '1 Test St',
  line2: null,
  city: 'Ho Chi Minh',
  state: null,
  postalCode: '700000',
  country: 'Vietnam',
  isDefault: true,
  createdAt: AT,
  updatedAt: AT,
  ...over,
});
