/**
 * Shapes returned by the API, mirroring the server's response DTOs.
 *
 * Dates arrive as ISO strings over JSON even though the server types them as
 * `Date`, so they are `string` here — typing them as `Date` would compile but
 * then `.toLocaleDateString()` would blow up at runtime.
 */

export type Role = 'USER' | 'ADMIN';

export type OrderStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED';

export type PaymentStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';

export type ContactStatus = 'PENDING' | 'READ' | 'REPLIED';

export interface User {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: Role;
  createdAt: string;
  updatedAt: string;
}

/** POST /auth/login and /auth/register. The refresh token is a cookie, not a field. */
export interface AuthResponse {
  accessToken: string;
  user: Pick<User, 'id' | 'email' | 'firstName' | 'lastName' | 'role'>;
}

export interface ProductVariant {
  id: string;
  productId: string;
  sku: string;
  /** e.g. { Size: "M", Color: "Black" } */
  options: Record<string, string>;
  /** Rendered options, e.g. "M / Black". */
  label: string;
  /** Effective price — the variant's own, or the product's when it has none. */
  price: number;
  stock: number;
  imageUrl: string | null;
  isActive: boolean;
}

export interface Product {
  id: string;
  name: string;
  description: string | null;
  /** For a variant product this is the CHEAPEST option ("from $X"). */
  price: number;
  /** For a variant product this is the total across active variants. */
  stock: number;
  /** When true, buying requires choosing a variant. */
  hasVariants: boolean;
  variants: ProductVariant[];
  sku: string;
  imageUrl: string | null;
  /** The category NAME, flattened by the server — not an id. */
  category: string | null;
  categoryId: string;
  isActive: boolean;
  /** Mean review score; 0 when nobody has reviewed it yet. */
  rating: number;
  reviewCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  description: string | null;
  slug: string | null;
  imageUrl: string | null;
  isActive: boolean;
  productCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CartItem {
  id: string;
  cartId: string;
  productId: string;
  variantId: string | null;
  /** e.g. "M / Black"; null for products without variants. */
  variantLabel: string | null;
  /** What this line costs per unit — variant price when there is one. */
  unitPrice: number;
  /** Stock left for this exact line, variant-aware. */
  availableStock: number;
  quantity: number;
  product: Product;
  createdAt: string;
  updatedAt: string;
}

export interface Cart {
  id: string;
  userId: string;
  cartItems: CartItem[];
  totalPrice: number;
  totalItems: number;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  /** Snapshot of the variant as it read at purchase time. */
  variantLabel: string | null;
  quantity: number;
  price: number;
  subtotal: number;
  createdAt: string;
  updatedAt: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  userId: string;
  status: OrderStatus;
  /** Goods before discount, shipping and tax. */
  subtotal: number;
  discountAmount: number;
  shippingFee: number;
  taxAmount: number;
  couponCode: string | null;
  /** subtotal - discount + shipping + tax */
  total: number;
  shippingAddress: string;
  items: OrderItem[];
  /** Only present on admin endpoints, which include the related user. */
  userEmail?: string;
  userName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id: string;
  orderId: string;
  userId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  paymentMethod: string | null;
  transactionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Review {
  id: string;
  rating: number;
  title: string | null;
  comment: string | null;
  isVerifiedPurchase: boolean;
  productId: string;
  userId: string;
  /** "John D." — the server never publishes the reviewer's email. */
  authorName: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewSummary {
  average: number;
  total: number;
  /** Keys 1–5 mapped to how many reviews gave that many stars. */
  distribution: Record<number, number>;
}

export interface PaginatedReviews {
  data: Review[];
  summary: ReviewSummary;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** POST/DELETE /wishlist/:productId and its toggle variant. */
export interface WishlistToggleResponse {
  message: string;
  inWishlist: boolean;
}

export interface Contact {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: ContactStatus;
  createdAt?: string;
  updatedAt?: string;
}

/* --- envelopes ----------------------------------------------------------- */

/** Products: `{ data, meta }`. */
export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    /**
     * Only sent by /products. Bounds ignore the active price filter, so a range
     * input keeps stable hints instead of collapsing as the user narrows it.
     */
    priceRange?: { min: number; max: number };
  };
}

/** Orders and contacts: pagination fields sit at the top level instead. */
export interface PageResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

/** Orders and payments wrap single results in `{ success, data, message }`. */
export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  message: string;
}

/* --- checkout ------------------------------------------------------------ */

export interface Address {
  id: string;
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string | null;
  postalCode: string;
  country: string;
  isDefault: boolean;
  /** Single-line rendering, the same string stored on an order. */
  formatted: string;
  createdAt: string;
  updatedAt: string;
}

export type AddressInput = Omit<
  Address,
  'id' | 'formatted' | 'createdAt' | 'updatedAt' | 'line2' | 'state' | 'country'
> & {
  line2?: string;
  state?: string;
  country?: string;
};

export type DiscountType = 'PERCENT' | 'FIXED';

export interface Coupon {
  id: string;
  code: string;
  type: DiscountType;
  value: number;
  minOrderAmount: number | null;
  maxDiscount: number | null;
  maxUses: number | null;
  usedCount: number;
  startsAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface QuoteLine {
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

/** POST /orders/quote — the same arithmetic the real order will use. */
export interface Quote {
  items: QuoteLine[];
  subtotal: number;
  discountAmount: number;
  coupon: {
    id: string;
    code: string;
    type: DiscountType;
    value: number;
    discountAmount: number;
  } | null;
  shippingFee: number;
  freeShippingThreshold: number;
  /** How much more the basket needs for free shipping; 0 once it qualifies. */
  amountToFreeShipping: number;
  taxRate: number;
  taxAmount: number;
  total: number;
}

/* --- admin dashboard --------------------------------------------------- */

export interface Metric {
  current: number;
  previous: number;
  /** Null when the previous period was zero — growth from nothing is undefined. */
  changePercent: number | null;
}

export interface DashboardOverview {
  periodDays: number;
  revenue: Metric;
  orders: Metric;
  customers: Metric;
  averageOrderValue: number;
  lifetimeRevenue: number;
  pendingOrders: number;
  lowStockProducts: number;
  outOfStockProducts: number;
  unreadContacts: number;
}

export interface RevenuePoint {
  /** ISO date, UTC. */
  date: string;
  revenue: number;
  orders: number;
}

export interface TopProduct {
  productId: string;
  name: string;
  imageUrl: string | null;
  unitsSold: number;
  revenue: number;
}

export interface StatusBreakdown {
  status: string;
  count: number;
}

/** Body of a 4xx/5xx from AllExceptionsFilter, as rejected by axiosClient. */
export interface ApiError {
  statusCode: number;
  /** class-validator returns an array; a plain throw returns a string. */
  message: string | string[];
  path?: string;
  timestamp?: string;
}
