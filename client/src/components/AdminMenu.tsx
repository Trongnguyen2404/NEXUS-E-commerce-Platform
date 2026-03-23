import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { Shield, Package, Layers, X, ShoppingCart, Users } from 'lucide-react';

const AdminMenu = () => {
  const { user } = useAuthStore();
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();

  // BẢO MẬT: Không phải ADMIN thì KHÔNG render (ẩn hoàn toàn)
  const userRole = user?.role || (user as any)?.user?.role;
  if (String(userRole).toUpperCase() !== 'ADMIN') return null;

  const menuItems = [
    { path: '/admin/products', label: 'Products', icon: Package },
    { path: '/admin/categories', label: 'Categories', icon: Layers },
    { path: '/admin/orders', label: 'Orders', icon: ShoppingCart }, // DÒNG MỚI
    { path: '/admin/users', label: 'Users', icon: Users },
    // Dành cho tính năng duyệt đơn hàng sắp tới:
    // { path: '/admin/orders', label: 'Orders', icon: ShoppingCart },
  ];

  return (
    <div className="fixed bottom-6 left-6 z-[100]">
      {/* Khối Menu sổ lên */}
      {isOpen && (
        <div className="bg-white p-4 rounded-3xl mb-4 shadow-2xl border border-gray-200 flex flex-col gap-2 w-56 animate-in slide-in-from-bottom-4 duration-200">
          <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2 px-3 pt-2">
            Admin Portal
          </div>
          {menuItems.map(item => {
            const isActive = location.pathname === item.path;
            return (
              <Link 
                key={item.path} 
                to={item.path} 
                onClick={() => setIsOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all ${
                  isActive ? 'bg-black text-white shadow-md' : 'text-gray-500 hover:bg-gray-100 hover:text-black'
                }`}
              >
                <item.icon size={16} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      )}

      {/* Nút Kích Hoạt */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-3 px-6 py-4 rounded-full font-black uppercase text-xs tracking-widest shadow-2xl transition-all ${
          isOpen ? 'bg-red-500 text-white shadow-red-500/30' : 'bg-black text-white hover:scale-105 shadow-black/30'
        }`}
      >
        {isOpen ? <X size={20} /> : <Shield size={20} />}
        {!isOpen && <span>Admin</span>}
      </button>
    </div>
  );
};

export default AdminMenu;