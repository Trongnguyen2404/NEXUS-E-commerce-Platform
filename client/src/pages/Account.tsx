import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { 
  User, Mail, LogOut, Loader2, Package,
  Settings, Key, ChevronDown, ChevronUp, Shield, MapPin, XCircle,
  AlertCircle
} from 'lucide-react';
import { toast } from 'react-toastify';
import axiosClient, { getErrorMessage } from '../api/axiosClient';
import AddressBook from '../components/AddressBook';
import Pagination from '../components/Pagination';
import type { Order, OrderStatus, PageResponse, User as ApiUser } from '../types/api';
import useDocumentMeta from '../hooks/useDocumentMeta';



const ORDER_STATUS_STYLES: Record<OrderStatus, string> = {
  PENDING: 'bg-state-warning-soft text-state-warning',
  PROCESSING: 'bg-state-info-soft text-state-info',
  SHIPPED: 'bg-brand-soft text-brand-ink',
  DELIVERED: 'bg-state-success-soft text-state-success',
  CANCELLED: 'bg-state-danger-soft text-state-danger',
};

const ORDERS_PER_PAGE = 10;

// Account area: order history, addresses, profile and password.
const Account = () => {
  useDocumentMeta({ title: 'Your account', noIndex: true });
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  
  const [profile, setProfile] = useState<ApiUser | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderPage, setOrderPage] = useState(1);
  const [orderTotal, setOrderTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'orders' | 'addresses' | 'settings' | 'security'>('orders');
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  const [profileForm, setProfileForm] = useState({ firstName: '', lastName: '' });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '' });
  const [isUpdating, setIsUpdating] = useState(false);

  
  const showBackendError = (err: unknown, defaultMessage: string) => {
    console.error('Backend error:', err);
    toast.error(getErrorMessage(err, defaultMessage));
  };

  const fetchData = useCallback(async () => {
    try {
      const [profileRes, ordersRes] = await Promise.all([
        axiosClient.get<ApiUser>('/users/me'),
        axiosClient.get<PageResponse<Order>>('/orders', {
          params: { page: orderPage, limit: ORDERS_PER_PAGE },
        })
      ]);
      setProfile(profileRes);
      setOrders(Array.isArray(ordersRes?.data) ? ordersRes.data : []);
      setOrderTotal(ordersRes?.total ?? 0);
      setProfileForm({ 
        firstName: profileRes?.firstName || '', 
        lastName: profileRes?.lastName || '' 
      });
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  }, [orderPage]);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    fetchData();
  }, [user, navigate, fetchData]);

  const toggleOrder = (id: string) => setExpandedOrderId(expandedOrderId === id ? null : id);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdating(true);
    try {
      await axiosClient.patch('/users/me', profileForm);
      toast.success('Profile updated successfully!');
      fetchData(); 
    } catch (err) {
      showBackendError(err, 'Failed to update profile');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdating(true);
    try {
      await axiosClient.patch('/users/me/password', passwordForm);
      toast.success('Password changed successfully!');
      setPasswordForm({ currentPassword: '', newPassword: '' }); 
    } catch (err) {
      showBackendError(err, 'Password update failed');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCancelOrder = async (e: React.MouseEvent, orderId: string) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to cancel this order?")) return;
    try {
      await axiosClient.delete(`/orders/${orderId}`);
      toast.success("Order cancelled successfully");
      fetchData();
    } catch (err) {
      showBackendError(err, "Cannot cancel this order");
    }
  };

  if (isLoading) return (
    <div className="min-h-[80vh] flex items-center justify-center bg-white">
      <Loader2 className="animate-spin text-black" size={40} />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#EDEDF0] pb-24">
      <div className="bg-white border-b border-gray-200 pt-10 pb-10">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-2">
              <h1 className="text-3xl font-black uppercase tracking-tighter text-black leading-none">Settings</h1>
              <p className="text-gray-400 text-[10px] font-black uppercase tracking-[0.4em]">
                Member Since {profile?.createdAt ? new Date(profile.createdAt).getFullYear() : '—'}
              </p>
            </div>
            
            <div className="flex bg-gray-200 p-1.5 rounded-2xl border border-gray-300 shadow-inner">
              {([
                { id: 'orders', label: 'Orders', icon: Package },
                { id: 'addresses', label: 'Addresses', icon: MapPin },
                { id: 'settings', label: 'Profile', icon: Settings },
                { id: 'security', label: 'Security', icon: Key }
              ] as const).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center space-x-2 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                    activeTab === tab.id ? 'bg-white text-black shadow-sm' : 'text-gray-600 hover:text-black'
                  }`}
                >
                  <tab.icon size={14} />
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-6 mt-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          
          <div className="lg:col-span-4">
            <div className="bg-white rounded-[2.5rem] p-10 border border-gray-200 shadow-sm sticky top-24">
              <div className="relative inline-block mb-8">
                <div className="w-24 h-24 bg-black rounded-[2rem] flex items-center justify-center shadow-2xl shadow-black/20">
                  <User size={40} className="text-white" />
                </div>
                <div className="absolute -bottom-2 -right-2 bg-state-success w-6 h-6 rounded-full border-4 border-white"></div>
              </div>
              
              <h2 className="text-3xl font-black uppercase tracking-tight text-black leading-tight mb-2">
                {profile?.firstName} <br/> {profile?.lastName} 
              </h2>
              
              <div className="space-y-5 pt-8 mt-8 border-t border-gray-100">
                <div className="flex items-center space-x-4 text-gray-500 group">
                  <div className="p-2 bg-[#F5F5F7] rounded-lg group-hover:bg-black group-hover:text-white transition-colors">
                    <Mail size={16} />
                  </div>
                  <span className="text-xs font-bold truncate">{profile?.email}</span>
                </div>
                <div className="flex items-center space-x-4 text-gray-500 group">
                  <div className="p-2 bg-[#F5F5F7] rounded-lg group-hover:bg-black group-hover:text-white transition-colors">
                    <Shield size={16} />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-[0.1em]">{profile?.role} Verified </span>
                </div>
              </div>

              <button 
                onClick={() => { logout(); navigate('/login'); }}
                className="w-full mt-12 flex items-center justify-center space-x-3 text-state-danger font-black uppercase tracking-widest text-[10px] py-5 rounded-2xl bg-state-danger-soft hover:bg-state-danger hover:text-white transition-all shadow-sm"
              >
                <LogOut size={16} />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
          <div className="lg:col-span-8">
            <div className="bg-white rounded-[3rem] border border-gray-200 shadow-sm overflow-hidden min-h-[600px]">
              
              {activeTab === 'orders' && (
                <div className="p-8 sm:p-12">
                  <div className="flex items-center justify-between mb-12">
                    <h3 className="text-2xl font-black uppercase tracking-tight text-black italic">Order History</h3>
                    <div className="bg-black text-white px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-tighter">
                      {orderTotal} Orders
                    </div>
                  </div>

                  {orders.length === 0 ? (
                    <div className="text-center py-20 bg-[#F5F5F7] rounded-[2rem] border-2 border-dashed border-gray-200">
                      <Package size={44} className="mx-auto text-gray-300 mb-5" />
                      <h4 className="text-lg font-black uppercase tracking-tight text-black mb-2">
                        No orders yet
                      </h4>
                      <p className="text-sm font-medium text-gray-500 max-w-xs mx-auto mb-7">
                        When you place an order it will show up here with its tracking status.
                      </p>
                      <Link
                        to="/products"
                        className="inline-flex items-center gap-2 bg-black text-white px-7 py-3.5 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-gray-800 transition-colors"
                      >
                        Start shopping
                      </Link>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {orders.map((order) => {
                        const isExpanded = expandedOrderId === order.id;
                        return (
                          <div key={order.id} className="group border border-gray-100 rounded-[2rem] overflow-hidden transition-all hover:border-black hover:shadow-xl hover:shadow-black/5">
                            <div 
                              onClick={() => toggleOrder(order.id)}
                              className={`p-8 flex items-center justify-between cursor-pointer transition-colors ${order.status === 'CANCELLED' ? 'bg-gray-50' : 'bg-white'}`}
                            >
                              <div className="flex flex-wrap items-center gap-8 md:gap-12">
                                <div>
                                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Placed On</p>
                                  <p className="text-sm font-bold text-black">{new Date(order.createdAt).toLocaleDateString()}</p>
                                </div>
                                <div>
                                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Status</p>
                                  <span className={`text-[9px] font-black uppercase px-3 py-1.5 rounded-lg border-none ${ORDER_STATUS_STYLES[order.status] ?? ORDER_STATUS_STYLES.PENDING}`}>
                                    {order.status}
                                  </span>
                                </div>
                                <div>
                                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Amount</p>
                                  <p className="text-sm font-black text-black">${Number(order.total).toFixed(2)}</p>
                                </div>
                              </div>
                              <div className="bg-[#F5F5F7] p-3 rounded-xl group-hover:bg-black group-hover:text-white transition-all text-gray-400">
                                {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                              </div>
                            </div>

                            {isExpanded && (
                              <div className="bg-gray-100 border-t border-gray-200 p-8 space-y-8 animate-in slide-in-from-top-4 duration-300 shadow-inner">
                                <div className="space-y-4">
                                  <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 flex items-center">
                                    <Package size={12} className="mr-2" /> Shipment Content
                                  </h4>
                                  <div className="space-y-2">
                                    {order.items?.map((item) => (
                                      <div key={item.id} className="flex items-center justify-between bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                                        <div className="flex items-center space-x-4">
                                          <div className="w-12 h-12 bg-[#F5F5F7] rounded-xl flex items-center justify-center text-[10px] font-black text-black border border-gray-200">
                                            x{item.quantity}
                                          </div>
                                          <span className="text-xs font-black uppercase text-black tracking-tight">
                                            {item.productName}
                                            {item.variantLabel && (
                                              <span className="text-gray-400 font-bold"> · {item.variantLabel}</span>
                                            )}
                                          </span>
                                        </div>
                                        <span className="text-xs font-bold text-gray-500 tracking-tighter">${Number(item.subtotal).toFixed(2)}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                                
                                <div className="pt-8 border-t border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
                                  <div className="flex items-start space-x-3 text-gray-400">
                                    <MapPin size={16} className="mt-0.5" />
                                    <div>
                                      <p className="text-[9px] font-black uppercase tracking-widest">Delivery Address</p>
                                      <p className="text-[11px] font-bold text-black max-w-xs leading-relaxed">{order.shippingAddress || 'Digital Product'}</p>
                                    </div>
                                  </div>
                                  {order.status === 'PENDING' && (
                                    <button 
                                      onClick={(e) => handleCancelOrder(e, order.id)}
                                      className="flex items-center space-x-2 text-state-danger bg-state-danger-soft hover:bg-state-danger hover:text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                                    >
                                      <XCircle size={14} />
                                      <span>Cancel This Order</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <Pagination
                    page={orderPage}
                    totalPages={Math.ceil(orderTotal / ORDERS_PER_PAGE)}
                    total={orderTotal}
                    onChange={setOrderPage}
                    label="orders"
                  />
                </div>
              )}

              {activeTab === 'addresses' && (
                <div>
                  <h3 className="text-xl font-black uppercase tracking-tight mb-2">Shipping addresses</h3>
                  <p className="text-xs font-medium text-gray-500 mb-8">
                    Your default address is preselected at checkout.
                  </p>
                  <AddressBook />
                </div>
              )}

              {activeTab === 'settings' && (
                <div className="p-8 sm:p-12 animate-in fade-in duration-500">
                  <div className="mb-12">
                    <h3 className="text-2xl font-black uppercase tracking-tight text-black italic">Personal Info</h3>
                    <p className="text-gray-400 text-[10px] font-bold uppercase mt-1">Update your profile details.</p>
                  </div>
                  
                  <form onSubmit={handleUpdateProfile} className="max-w-xl space-y-8">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">First Name</label>
                        <input type="text" value={profileForm.firstName} onChange={e => setProfileForm({...profileForm, firstName: e.target.value})} className="w-full bg-[#F5F5F7] border-2 border-transparent rounded-2xl p-5 text-sm font-bold focus:border-black focus:bg-white outline-none transition-all text-black" />
                      </div>
                      <div className="space-y-3">
                        <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Last Name</label>
                        <input type="text" value={profileForm.lastName} onChange={e => setProfileForm({...profileForm, lastName: e.target.value})} className="w-full bg-[#F5F5F7] border-2 border-transparent rounded-2xl p-5 text-sm font-bold focus:border-black focus:bg-white outline-none transition-all text-black" />
                      </div>
                    </div>
                    <button type="submit" disabled={isUpdating} className="w-full bg-black text-white py-6 rounded-[1.5rem] font-black uppercase text-xs tracking-[0.3em] shadow-xl shadow-black/10 hover:-translate-y-1 active:translate-y-0 transition-all disabled:opacity-50">
                      {isUpdating ? 'Updating...' : 'Commit Changes'}
                    </button>
                  </form>
                </div>
              )}

              {activeTab === 'security' && (
                <div className="p-8 sm:p-12 animate-in fade-in duration-500">
                  <div className="mb-12">
                    <h3 className="text-2xl font-black uppercase tracking-tight text-black italic">Access Control</h3>
                    <p className="text-gray-400 text-[10px] font-bold uppercase mt-1">Secure your NEXUS account.</p>
                  </div>
                  
                  <form onSubmit={handleChangePassword} className="max-w-md space-y-8">
                    <div className="space-y-3">
                      <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Current Password</label>
                      <input type="password" required value={passwordForm.currentPassword} onChange={e => setPasswordForm({...passwordForm, currentPassword: e.target.value})} className="w-full bg-[#F5F5F7] border-2 border-transparent rounded-2xl p-5 text-sm font-bold focus:border-black focus:bg-white outline-none transition-all text-black" />
                    </div>
                    <div className="space-y-3">
                      <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest">New Secret Key</label>
                      <input type="password" required minLength={8} value={passwordForm.newPassword} onChange={e => setPasswordForm({...passwordForm, newPassword: e.target.value})} className="w-full bg-[#F5F5F7] border-2 border-transparent rounded-2xl p-5 text-sm font-bold focus:border-black focus:bg-white outline-none transition-all text-black" />
                      <div className="flex items-start space-x-2 text-gray-400 p-2">
                        <AlertCircle size={14} className="mt-0.5 shrink-0" />
                        <p className="text-[9px] font-medium leading-relaxed uppercase tracking-tighter">Required: 8+ chars, upper/lower case, numbers, and symbols. </p>
                      </div>
                    </div>
                    <button type="submit" disabled={isUpdating} className="w-full bg-black text-white py-6 rounded-[1.5rem] font-black uppercase text-xs tracking-[0.3em] hover:bg-gray-800 transition-all disabled:opacity-50">
                      Update Credentials
                    </button>
                  </form>
                  <div className="mt-16 pt-10 border-t border-gray-200">
                    <h4 className="text-sm font-black uppercase text-state-danger tracking-widest mb-2">Danger Zone</h4>
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-6 leading-relaxed">
                      Permanently delete your account and all associated data. This action cannot be undone.
                    </p>
                    <button 
                      type="button"
                      onClick={async () => {
                        if (window.confirm('WARNING: Are you absolutely sure you want to delete your account? All your data will be lost forever.')) {
                          try {
                            await axiosClient.delete('/users/me'); 
                            toast.success('Account deleted permanently.');
                            await logout();
                            navigate('/');
                          } catch (err) {
                            showBackendError(err, 'Failed to delete account');
                          }
                        }
                      }}
                      className="w-full sm:w-auto px-8 py-4 bg-state-danger-soft text-state-danger rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-state-danger hover:text-white transition-all"
                    >
                      Delete Account
                    </button>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Account;