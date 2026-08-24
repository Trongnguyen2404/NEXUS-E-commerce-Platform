import { useEffect, useState, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { ShoppingBag, User, Search, Menu, X, Heart, Loader2 } from 'lucide-react';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import Login from './pages/Login';
import Register from './pages/Register';
import Products from './pages/Products';
import ProductDetail from './pages/ProductDetail';
import Cart from './pages/Cart';
import { useCartStore } from './store/useCartStore';
import { useAuthStore } from './store/useAuthStore';
import Account from './pages/Account';
import Home from './pages/Home';
import Categories from './pages/Categories';
import Contact from './pages/Contact';
import NotFound from './pages/NotFound';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import AdminRoute from './pages/AdminRoute';
import AdminMenu from './components/AdminMenu';
import Wishlist from './pages/Wishlist';
import { useWishlistStore } from './store/useWishlistStore';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import ScrollToTop from './components/ScrollToTop';
import ColdStartNotice from './components/ColdStartNotice';
import Footer from './components/Footer';

// Checkout drags in the whole Stripe SDK and the admin area is seven screens
// no shopper ever opens. Splitting them keeps the first load to the storefront.
const Checkout = lazy(() => import('./pages/Checkout'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const AdminProducts = lazy(() => import('./pages/AdminProducts'));
const AdminCategories = lazy(() => import('./pages/AdminCategories'));
const AdminOrders = lazy(() => import('./pages/AdminOrders'));
const AdminUsers = lazy(() => import('./pages/AdminUsers'));
const AdminContacts = lazy(() => import('./pages/AdminContacts'));
const AdminCoupons = lazy(() => import('./pages/AdminCoupons'));

// Shown while a split chunk is on the wire.
const RouteFallback = () => (
  <div className="min-h-[60vh] flex items-center justify-center" role="status" aria-label="Loading">
    <Loader2 className="animate-spin text-black" size={36} />
  </div>
);

const NAV_LINKS = [
  { to: '/', label: 'Home' },
  { to: '/products', label: 'Products' },
  { to: '/categories', label: 'Shop' },
  { to: '/contact', label: 'Contact' },
];

// Sticky top bar with navigation and the cart and wishlist counters.
const Navbar = () => {
  const totalItems = useCartStore((state) => state.totalItems);
  const fetchCart = useCartStore((state) => state.fetchCart);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const savedCount = useWishlistStore((state) => state.savedIds.size);
  const fetchWishlist = useWishlistStore((state) => state.fetchWishlist);

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const closeMenu = () => setIsMenuOpen(false);

  
  useEffect(() => {
    if (!isAuthenticated) return;

    fetchCart();
    fetchWishlist();
  }, [isAuthenticated, fetchCart, fetchWishlist]);

  
  
  return (
    <nav data-sticky-top className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">

          <Link to="/" className="text-2xl font-black tracking-tighter text-black">
            NEXUS<span className="text-brand">.</span>
          </Link>

          <div className="hidden md:flex space-x-10 items-center">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="text-[15px] font-semibold text-black hover:text-brand-ink transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="flex items-center space-x-5 sm:space-x-6">
            <Link to="/products" className="flex items-center space-x-2 text-black hover:text-brand-ink transition-colors">
              <Search size={20} strokeWidth={2} />
              <span className="hidden sm:block text-[15px] font-semibold">Search</span>
            </Link>

            <Link to={isAuthenticated ? '/account' : '/login'} className="flex items-center space-x-2 text-black hover:text-brand-ink transition-colors">
              <User size={20} strokeWidth={2} />
              <span className="hidden sm:block text-[15px] font-semibold">
                {isAuthenticated ? 'Account' : 'Sign in'}
              </span>
            </Link>

            {isAuthenticated && (
              <Link
                to="/wishlist"
                aria-label="Wishlist"
                className="text-black hover:text-brand-ink relative transition-colors"
              >
                <Heart size={20} strokeWidth={2} />
                {savedCount > 0 && (
                  <span className="absolute -top-2 -right-2 bg-brand text-white text-[10px] font-bold h-4 w-4 rounded-full flex items-center justify-center">
                    {savedCount}
                  </span>
                )}
              </Link>
            )}

            <Link to="/cart" className="text-black hover:text-brand-ink relative transition-colors">
              <ShoppingBag size={20} strokeWidth={2} />
              {totalItems > 0 && (
                <span className="absolute -top-2 -right-2 bg-brand text-white text-[10px] font-bold h-4 w-4 rounded-full flex items-center justify-center">
                  {totalItems}
                </span>
              )}
            </Link>

            <button
              type="button"
              onClick={() => setIsMenuOpen((open) => !open)}
              className="md:hidden text-black hover:text-brand-ink transition-colors"
              aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={isMenuOpen}
              aria-controls="mobile-menu"
            >
              {isMenuOpen ? <X size={22} strokeWidth={2} /> : <Menu size={22} strokeWidth={2} />}
            </button>
          </div>
        </div>
      </div>

      {isMenuOpen && (
        <div id="mobile-menu" className="md:hidden border-t border-gray-100 bg-white">
          <div className="px-4 sm:px-6 py-4 space-y-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                onClick={closeMenu}
                className="block py-3 text-[15px] font-semibold text-black hover:text-brand-ink transition-colors"
              >
                {link.label}
              </Link>
            ))}
            <Link
              to={isAuthenticated ? '/account' : '/login'}
              onClick={closeMenu}
              className="block py-3 text-[15px] font-semibold text-black hover:text-brand-ink transition-colors border-t border-gray-100 mt-2 pt-4"
            >
              {isAuthenticated ? 'Account' : 'Sign in'}
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
};

// Mounts the router, global layout, error boundary and toast host.
function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <ScrollToTop />
        <div className="min-h-screen bg-white font-sans text-black selection:bg-brand-soft flex flex-col">
          <ColdStartNotice />
          <Navbar />
          <main className="flex-1">
            <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />

              <Route path="/categories" element={<Categories />} />
              <Route path="/contact" element={<Contact />} />

              <Route path="/products" element={<Products />} />
              <Route path="/products/:id" element={<ProductDetail />} />

              <Route element={<ProtectedRoute />}>
                <Route path="/account" element={<Account />} />
                <Route path="/cart" element={<Cart />} />
                <Route path="/checkout" element={<Checkout />} />
                <Route path="/wishlist" element={<Wishlist />} />
              </Route>

              <Route element={<AdminRoute />}>
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/admin/products" element={<AdminProducts />} />
                <Route path="/admin/categories" element={<AdminCategories />} />
                <Route path="/admin/orders" element={<AdminOrders />} />
                <Route path="/admin/users" element={<AdminUsers />} />
                <Route path="/admin/contacts" element={<AdminContacts />} />
                <Route path="/admin/coupons" element={<AdminCoupons />} />
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
            </Suspense>
          </main>
          <Footer />
        </div>
      </ErrorBoundary>
      {/* Light theme: the card styling lives in index.css and matches the
          storefront. 4s rather than 3s — an error needs longer to read. */}
      <ToastContainer
        position="bottom-right"
        autoClose={4000}
        hideProgressBar
        theme="light"
        newestOnTop
        closeOnClick
      />
      <AdminMenu />
    </BrowserRouter>
  );
}

export default App;
