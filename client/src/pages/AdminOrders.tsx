import { useState, useEffect } from 'react';
import { Loader2, Trash2, Package, MapPin } from 'lucide-react';
import { toast } from 'react-toastify';
import axiosClient from '../api/axiosClient';

const AdminOrders = () => {
  const [orders, setOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchOrders = async () => {
    try {
      const res: any = await axiosClient.get('/orders/admin/all');
      setOrders(Array.isArray(res?.data) ? res.data : (res || []));
    } catch (e) {
      toast.error('Failed to load orders');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchOrders(); }, []);

  // Đổi trạng thái đơn hàng (PENDING -> PROCESSING -> SHIPPED -> DELIVERED)
  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      await axiosClient.patch(`/orders/admin/${id}`, { status: newStatus });
      toast.success('Order status updated!');
      fetchOrders();
    } catch (e: any) {
      toast.error(e.message || 'Update failed');
    }
  };

  // Admin xóa/hủy đơn
  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this order?')) return;
    try {
      await axiosClient.delete(`/orders/admin/${id}`);
      toast.success('Order deleted');
      fetchOrders();
    } catch (e: any) {
      toast.error(e.message || 'Delete failed');
    }
  };

  if (isLoading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin" size={40} /></div>;

  return (
    <div className="min-h-screen bg-[#EDEDF0] py-12 px-4 sm:px-8">
      <div className="max-w-[1400px] mx-auto">
        
        <div className="bg-white rounded-[2rem] p-8 sm:p-10 mb-8 border border-gray-300 shadow-sm flex justify-between items-end">
          <div>
            <h1 className="text-4xl sm:text-5xl font-black uppercase tracking-tighter text-black">Orders</h1>
            <p className="text-gray-500 text-[10px] font-black uppercase tracking-[0.4em] mt-2">Manage All Shipments</p>
          </div>
          <div className="bg-black text-white px-6 py-3 rounded-xl font-black uppercase text-xs tracking-widest">
            {orders.length} Total
          </div>
        </div>

        <div className="bg-white rounded-[2.5rem] p-6 sm:p-10 border border-gray-300 shadow-sm overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead>
              <tr className="border-b-2 border-black">
                <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest text-black">Order ID / Date</th>
                <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest text-black">Customer</th>
                <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest text-black">Items</th>
                <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest text-black">Total</th>
                <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest text-black text-center">Status</th>
                <th className="py-4 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {orders.map(o => (
                <tr key={o.id} className="hover:bg-[#F5F5F7] transition-all">
                  <td className="py-5 px-4">
                    <p className="font-bold text-sm uppercase text-black">#{o.id.slice(-8)}</p>
                    <p className="text-[10px] text-gray-500 font-bold uppercase mt-1">{new Date(o.createdAt).toLocaleDateString()}</p>
                  </td>
                  <td className="py-5 px-4">
                    <p className="font-bold text-sm text-black">{o.userName || 'Guest'}</p>
                    <p className="text-[10px] text-gray-500 font-bold">{o.userEmail}</p>
                  </td>
                  <td className="py-5 px-4">
                    <div className="flex items-center space-x-2 text-xs font-bold text-gray-600">
                      <Package size={14} /> <span>{o.items?.length || 0} items</span>
                    </div>
                  </td>
                  <td className="py-5 px-4 font-black text-sm text-black">${Number(o.total).toFixed(2)}</td>
                  
                  {/* Cột chọn trạng thái Đơn hàng */}
                  <td className="py-5 px-4 text-center">
                    <select 
                      value={o.status}
                      onChange={(e) => handleStatusChange(o.id, e.target.value)}
                      className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest outline-none cursor-pointer appearance-none border-2 border-transparent focus:border-black transition-all ${
                        o.status === 'PENDING' ? 'bg-[#FF8A00] text-white' : 
                        o.status === 'PROCESSING' ? 'bg-[#007AFF] text-white' : 
                        o.status === 'CANCELLED' ? 'bg-[#E30000] text-white' : 
                        'bg-[#28A745] text-white'
                      }`}
                    >
                      <option value="PENDING" className="bg-white text-black">PENDING</option>
                      <option value="PROCESSING" className="bg-white text-black">PROCESSING</option>
                      <option value="SHIPPED" className="bg-white text-black">SHIPPED</option>
                      <option value="DELIVERED" className="bg-white text-black">DELIVERED</option>
                      <option value="CANCELLED" className="bg-white text-black">CANCELLED</option>
                    </select>
                  </td>

                  <td className="py-5 px-4 text-right">
                    <button onClick={() => handleDelete(o.id)} className="p-3 bg-red-50 text-red-500 hover:bg-[#E30000] hover:text-white rounded-xl transition-colors">
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminOrders;