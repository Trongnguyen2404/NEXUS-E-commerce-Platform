import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';

import { Shield, Package, Layers, X, ShoppingCart, Users, MessageSquare, LayoutDashboard, Tag } from 'lucide-react';

// Floating quick-jump menu, rendered only for admins.
const AdminMenu = () => {
  const { user } = useAuthStore();
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();

  
  if (user?.role !== 'ADMIN') return null;

  const menuItems = [
    { path: '/admin', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/admin/products', label: 'Products', icon: Package },
    { path: '/admin/categories', label: 'Categories', icon: Layers },
    { path: '/admin/orders', label: 'Orders', icon: ShoppingCart },
    { path: '/admin/users', label: 'Users', icon: Users },
    { path: '/admin/contacts', label: 'Contacts', icon: MessageSquare },
    { path: '/admin/coupons', label: 'Promo codes', icon: Tag }, 
  ];

  return (
    <div className="fixed bottom-6 left-6 z-[100]">
      {isOpen && (
        <div className="bg-white p-4 rounded-3xl mb-4 shadow-2xl border border-gray-200 flex flex-col gap-2 w-56 animate-in slide-in-from-bottom-4 duration-200">
          <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2 px-3 pt-2 border-b border-gray-50 pb-2">
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

      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? 'Close admin menu' : 'Open admin menu'}
        aria-expanded={isOpen}
        title={isOpen ? 'Close admin menu' : 'Admin menu'}
        className={`h-14 w-14 flex items-center justify-center rounded-full shadow-2xl transition-all ${
          isOpen
            ? 'bg-state-danger text-white shadow-state-danger/30'
            : 'bg-black text-white hover:scale-105 shadow-black/30'
        }`}
      >
        {isOpen ? <X size={20} /> : <Shield size={20} />}
      </button>
    </div>
  );
};

export default AdminMenu;