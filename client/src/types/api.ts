

// Account role.
export type Role = 'USER' | 'ADMIN';

// Where an order sits in its lifecycle.
export type OrderStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED';

// Where a payment sits in its lifecycle.
export type PaymentStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';

// Where a contact message sits in the admin inbox.
export type ContactStatus = 'PENDING' | 'READ' | 'REPLIED';

// A user account.
export interface User {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: Role;
  createdAt: string;
  updatedAt: string;
}

// What the login and register endpoints return.
export interface AuthResponse {
  accessToken: string;
  user: Pick<User, 'id' | 'email' | 'firstName' | 'lastName' | 'role'>;
}

// One buyable option of a product, with its own price and stock.
export interface ProductVariant {
  id: string;
  productId: string;
  sku: string;

  options: Record<string, string>;

  label: string;

  price: number;
  stock: number;
  imageUrl: string | null;
  isActive: boolean;
}

// A catalogue product with its images, variants and rating.
export interface Product {
  id: string;
  name: string;
  description: string | null;

  price: number;

  stock: number;

  hasVariants: boolean;
  variants: ProductVariant[];
  sku: string;

  imageUrl: string | null;

  images: string[];

  category: string | null;
  categoryId: string;
  isActive: boolean;

  rating: number;
  reviewCount: number;
  createdAt: string;
  updatedAt: string;
}

// A store category.
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

// One line in the cart, with the variant and price it was added at.
export interface CartItem {
  id: string;
  cartId: string;
  productId: string;
  variantId: string | null;

  variantLabel: string | null;

  unitPrice: number;

  availableStock: number;
  quantity: number;
  product: Product;
  createdAt: string;
  updatedAt: string;
}

// The cart with its lines and computed totals.
export interface Cart {
  id: string;
  userId: string;
  cartItems: CartItem[];
  totalPrice: number;
  totalItems: number;
  createdAt: string;
  updatedAt: string;
}

// One line of a placed order, priced at the time of purchase.
export interface OrderItem {
  id: string;
  productId: string;
  productName: string;

  variantLabel: string | null;
  quantity: number;
  price: number;
  subtotal: number;
  createdAt: string;
  updatedAt: string;
}

// A placed order.
export interface Order {
  id: string;
  orderNumber: string;
  userId: string;
  status: OrderStatus;

  subtotal: number;
  discountAmount: number;
  shippingFee: number;
  taxAmount: number;
  couponCode: string | null;

  total: number;
  shippingAddress: string;
  items: OrderItem[];

  userEmail?: string;
  userName?: string;
  createdAt: string;
  updatedAt: string;
}

// A Stripe payment against an order.
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

// One product review.
export interface Review {
  id: string;
  rating: number;
  title: string | null;
  comment: string | null;
  isVerifiedPurchase: boolean;
  productId: string;
  userId: string;

  authorName: string;
  createdAt: string;
  updatedAt: string;
}

// A product's average rating and star distribution.
export interface ReviewSummary {
  average: number;
  total: number;

  distribution: Record<number, number>;
}

// A page of reviews plus the product's rating summary.
export interface PaginatedReviews {
  data: Review[];
  summary: ReviewSummary;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// What the wishlist toggle returns: the resulting saved state.
export interface WishlistToggleResponse {
  message: string;
  inWishlist: boolean;
}

// A contact form submission.
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

// A page of records with full paging metadata.
export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;

    priceRange?: { min: number; max: number };
  };
}

// A simpler list response carrying only a total.
export interface PageResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

// A single record wrapped with a message.
export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  message: string;
}

// A saved shipping address.
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

  formatted: string;
  createdAt: string;
  updatedAt: string;
}

// The address fields the client may send, without server-owned ones.
export type AddressInput = Omit<
  Address,
  'id' | 'formatted' | 'createdAt' | 'updatedAt' | 'line2' | 'state' | 'country'
> & {
  line2?: string;
  state?: string;
  country?: string;
};

// Whether a promo code takes a percentage or a flat amount off.
export type DiscountType = 'PERCENT' | 'FIXED';

// A promo code and the limits on its use.
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

// One priced line of a quote.
export interface QuoteLine {
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

// A priced basket: discount, shipping, tax and total.
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

  amountToFreeShipping: number;
  taxRate: number;
  taxAmount: number;
  total: number;
}

// One dashboard number with its change on the previous period.
export interface Metric {
  current: number;
  previous: number;

  changePercent: number | null;
}

// The dashboard's headline metrics.
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

// One point on the revenue chart.
export interface RevenuePoint {
  date: string;
  revenue: number;
  orders: number;
}

// One row of the best sellers table.
export interface TopProduct {
  productId: string;
  name: string;
  imageUrl: string | null;
  unitsSold: number;
  revenue: number;
}

// Order count for a single status.
export interface StatusBreakdown {
  status: string;
  count: number;
}

// The error shape the API returns.
export interface ApiError {
  statusCode: number;

  message: string | string[];
  path?: string;
  timestamp?: string;
}
