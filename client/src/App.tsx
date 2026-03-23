import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, NavLink } from 'react-router-dom';
import { ShoppingBag, User, Search, Menu, X } from 'lucide-react';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import Login from './pages/Login';
import Register from './pages/Register';
import Products from './pages/Products';
import ProductDetail from './pages/ProductDetail';
import Cart from './pages/Cart'; // SẼ TẠO Ở BƯỚC 3
import { useCartStore } from './store/useCartStore'; // IMPORT STORE
import { useAuthStore } from './store/useAuthStore';
import Account from './pages/Account';
import Home from './pages/Home';
import Categories from './pages/Categories';
import Contact from './pages/Contact';
import Checkout from './pages/Checkout';
import AdminProducts from './pages/AdminProducts';
import AdminRoute from './pages/AdminRoute';
import AdminCategories from './pages/AdminCategories';
import AdminMenu from './components/AdminMenu';
import AdminOrders from './pages/AdminOrders';
import AdminUsers from './pages/AdminUsers';


const Navbar = () => {
  const { totalItems, fetchCart } = useCartStore();
  const { isAuthenticated } = useAuthStore();

  // Tự động tải giỏ hàng khi người dùng đã đăng nhập (có token)
  useEffect(() => {
    if (localStorage.getItem('accessToken')) {
      fetchCart();
    }
  }, [fetchCart]);

  return (
    <nav className="bg-white border-b border-gray-200">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">

          <Link to="/" className="text-2xl font-black tracking-tighter text-black">
            NEXUS<span className="text-blue-500">.</span>
          </Link>

          <div className="hidden md:flex space-x-10 items-center">
            <Link to="/" className="text-[15px] font-semibold text-black hover:text-blue-600 transition-colors">Home</Link>
            <Link to="/products" className="text-[15px] font-semibold text-black hover:text-blue-600 transition-colors">Products</Link>
            {/* Link đến trang Categories */}
            <Link to="/categories" className="text-[15px] font-semibold text-black hover:text-blue-600 transition-colors">Shop</Link>
            {/* Link đến trang Contact */}
            <Link to="/contact" className="text-[15px] font-semibold text-black hover:text-blue-600 transition-colors">Contact</Link>
          </div>

          <div className="flex items-center space-x-6">
            {/* Đổi button Search thành Link điều hướng về Products */}
            <Link to="/products" className="flex items-center space-x-2 text-black hover:text-blue-600 transition-colors">
              <Search size={20} strokeWidth={2} />
              <span className="hidden sm:block text-[15px] font-semibold">Search</span>
            </Link>

            {/* KIỂM TRA ĐĂNG NHẬP ĐỂ CHUYỂN HƯỚNG */}
            <Link to={isAuthenticated ? "/account" : "/login"} className="flex items-center space-x-2 text-black hover:text-blue-600 transition-colors">
              <User size={20} strokeWidth={2} />
              <span className="hidden sm:block text-[15px] font-semibold">
                {isAuthenticated ? "Account" : "Sign in"}
              </span>
            </Link>
            <Link to="/cart" className="text-black hover:text-blue-600 relative transition-colors">
              <ShoppingBag size={20} strokeWidth={2} />
              {/* Hiển thị số lượng thật từ Store */}
              {totalItems > 0 && (
                <span className="absolute -top-2 -right-2 bg-blue-600 text-white text-[10px] font-bold h-4 w-4 rounded-full flex items-center justify-center">
                  {totalItems}
                </span>
              )}
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
};

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-white font-sans text-black selection:bg-blue-100">
        <Navbar />
        <main>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/account" element={<Account />} />

            {/* Thêm Route Categories và Contact */}
            <Route path="/categories" element={<Categories />} />
            <Route path="/contact" element={<Contact />} />

            <Route path="/products" element={<Products />} />
            <Route path="/products/:id" element={<ProductDetail />} />
            <Route path="/cart" element={<Cart />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route element={<AdminRoute />}>
              <Route path="/admin/products" element={<AdminProducts />} />
              <Route path="/admin/categories" element={<AdminCategories />} />
              <Route path="/admin/orders" element={<AdminOrders />} />
              <Route path="/admin/users" element={<AdminUsers />} />
            </Route>
          </Routes>
        </main>
      </div>
      <ToastContainer position="bottom-right" autoClose={3000} hideProgressBar theme="dark" />
      <AdminMenu />
    </BrowserRouter>
  );
}

export default App;