import { useState, useEffect, useCallback } from 'react';
import { Loader2, Trash2, Package } from 'lucide-react';
import { toast } from 'react-toastify';
import axiosClient, { getErrorMessage } from '../api/axiosClient';
import Select from '../components/Select';
import type { SelectOption } from '../components/Select';
import Pagination from '../components/Pagination';
import type { Order, OrderStatus, PageResponse } from '../types/api';


const STATUS_STYLES: Record<OrderStatus, string> = {
  PENDING: 'bg-state-warning-soft text-state-warning',
  PROCESSING: 'bg-state-info-soft text-state-info',
  SHIPPED: 'bg-brand-soft text-brand-ink',
  DELIVERED: 'bg-state-success-soft text-state-success',
  CANCELLED: 'bg-state-danger-soft text-state-danger',
};


const STATUS_OPTIONS: SelectOption<OrderStatus>[] = [
  { value: 'PENDING', label: 'Pending', dotClassName: 'bg-state-warning' },
  { value: 'PROCESSING', label: 'Processing', dotClassName: 'bg-state-info' },
  { value: 'SHIPPED', label: 'Shipped', dotClassName: 'bg-brand' },
  { value: 'DELIVERED', label: 'Delivered', dotClassName: 'bg-state-success' },
  { value: 'CANCELLED', label: 'Cancelled', dotClassName: 'bg-state-danger' },
];

const PAGE_SIZE = 10;

// Admin screen for reviewing orders and changing their status.
const AdminOrders = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await axiosClient.get<PageResponse<Order>>('/orders/admin/all', {
        params: { page, limit: PAGE_SIZE },
      });
      setOrders(Array.isArray(res?.data) ? res.data : []);
      setTotal(res?.total ?? 0);
    } catch {
      toast.error('Failed to load orders');
    } finally {
      setIsLoading(false);
    }
  }, [page]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  
  const handleStatusChange = async (id: string, newStatus: OrderStatus) => {
    try {
      await axiosClient.patch(`/orders/admin/${id}`, { status: newStatus });
      toast.success('Order status updated!');
      fetchOrders();
    } catch (e) {
      toast.error(getErrorMessage(e, 'Update failed'));
    }
  };

  
  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this order?')) return;
    try {
      await axiosClient.delete(`/orders/admin/${id}`);
      toast.success('Order deleted');
      fetchOrders();
    } catch (e) {
      toast.error(getErrorMessage(e, 'Delete failed'));
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
          {/* The whole count, not just this page's rows. */}
          <div className="bg-black text-white px-6 py-3 rounded-xl font-black uppercase text-xs tracking-widest">
            {total} Total
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
                  
                  <td className="py-5 px-4 text-center">
                    <Select
                      value={o.status}
                      onChange={(next) => handleStatusChange(o.id, next)}
                      options={STATUS_OPTIONS}
                      ariaLabel={`Status for order ${o.orderNumber}`}
                      className={`inline-flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest outline-none cursor-pointer border-2 border-transparent focus-visible:border-black transition-all ${STATUS_STYLES[o.status] ?? STATUS_STYLES.PENDING}`}
                    />
                  </td>

                  <td className="py-5 px-4 text-right">
                    <button onClick={() => handleDelete(o.id)} className="p-3 bg-state-danger-soft text-state-danger hover:bg-state-danger hover:text-white rounded-xl transition-colors">
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <Pagination
            page={page}
            totalPages={Math.ceil(total / PAGE_SIZE)}
            total={total}
            onChange={setPage}
            label="orders"
          />
        </div>
      </div>
    </div>
  );
};

export default AdminOrders;