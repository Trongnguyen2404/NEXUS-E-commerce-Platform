import { useEffect, useState } from 'react';
import { Loader2, Percent, Plus, Tag, Trash2, X } from 'lucide-react';
import { toast } from 'react-toastify';
import axiosClient, { getErrorMessage } from '../api/axiosClient';
import type { Coupon, DiscountType } from '../types/api';

const EMPTY_FORM = {
  code: '',
  type: 'PERCENT' as DiscountType,
  value: '',
  minOrderAmount: '',
  maxDiscount: '',
  maxUses: '',
  expiresAt: '',
};

const field =
  'w-full bg-surface-muted border-2 border-transparent focus:border-black rounded-2xl py-3.5 px-5 text-sm font-medium outline-none transition-all';
const label = 'block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2';

const AdminCoupons = () => {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const fetchCoupons = async () => {
    setIsLoading(true);
    try {
      setCoupons(await axiosClient.get<Coupon[]>('/admin/coupons'));
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to load coupons'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCoupons();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Blank optional fields are omitted, not sent as empty strings.
      await axiosClient.post<Coupon>('/admin/coupons', {
        code: form.code.trim(),
        type: form.type,
        value: Number(form.value),
        ...(form.minOrderAmount ? { minOrderAmount: Number(form.minOrderAmount) } : {}),
        ...(form.maxDiscount ? { maxDiscount: Number(form.maxDiscount) } : {}),
        ...(form.maxUses ? { maxUses: Number(form.maxUses) } : {}),
        ...(form.expiresAt ? { expiresAt: new Date(form.expiresAt).toISOString() } : {}),
      });

      toast.success('Coupon created');
      setIsModalOpen(false);
      setForm(EMPTY_FORM);
      fetchCoupons();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not create the coupon'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggle = async (coupon: Coupon) => {
    try {
      await axiosClient.patch<Coupon>(`/admin/coupons/${coupon.id}`, {
        isActive: !coupon.isActive,
      });
      fetchCoupons();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not update the coupon'));
    }
  };

  const handleDelete = async (coupon: Coupon) => {
    if (!window.confirm(`Delete ${coupon.code}?`)) return;

    try {
      // A used coupon is deactivated instead of deleted, so the API's message
      // is shown rather than assuming it was removed.
      const res = await axiosClient.delete<{ message: string }>(`/admin/coupons/${coupon.id}`);
      toast.success(res.message);
      fetchCoupons();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not delete the coupon'));
    }
  };

  const describe = (coupon: Coupon) => {
    const base =
      coupon.type === 'PERCENT' ? `${coupon.value}% off` : `$${coupon.value.toFixed(2)} off`;
    const parts = [base];
    if (coupon.maxDiscount) parts.push(`max $${coupon.maxDiscount.toFixed(2)}`);
    if (coupon.minOrderAmount) parts.push(`min order $${coupon.minOrderAmount.toFixed(2)}`);
    return parts.join(' · ');
  };

  const isExpired = (coupon: Coupon) =>
    !!coupon.expiresAt && new Date(coupon.expiresAt) < new Date();

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="animate-spin" size={40} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-sunken py-12 px-4 sm:px-8">
      <div className="max-w-[1200px] mx-auto space-y-8">

        <div className="bg-white rounded-[2rem] p-8 sm:p-10 border border-gray-300 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6">
          <div>
            <h1 className="text-4xl sm:text-5xl font-black uppercase tracking-tighter text-black">Promo codes</h1>
            <p className="text-gray-500 text-[10px] font-black uppercase tracking-[0.4em] mt-2">
              {coupons.length} codes
            </p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="bg-black text-white px-8 py-4 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] hover:bg-gray-800 transition-all flex items-center gap-2"
          >
            <Plus size={16} /> New code
          </button>
        </div>

        <div className="bg-white rounded-[2.5rem] p-6 sm:p-10 border border-gray-300">
          {coupons.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-3 text-gray-300">
              <Tag size={48} strokeWidth={1.5} />
              <p className="text-xs font-black uppercase tracking-widest">No promo codes yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[760px]">
                <thead>
                  <tr className="border-b-2 border-black">
                    <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest">Code</th>
                    <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest">Discount</th>
                    <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest text-center">Used</th>
                    <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest">Expires</th>
                    <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest text-center">Status</th>
                    <th className="py-4 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {coupons.map((coupon) => (
                    <tr key={coupon.id} className="hover:bg-surface-muted transition-all">
                      <td className="py-4 px-4">
                        <span className="font-black text-sm uppercase tracking-wide">{coupon.code}</span>
                      </td>
                      <td className="py-4 px-4 text-sm font-medium text-gray-600">{describe(coupon)}</td>
                      <td className="py-4 px-4 text-center text-sm font-bold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {coupon.usedCount}{coupon.maxUses ? ` / ${coupon.maxUses}` : ''}
                      </td>
                      <td className="py-4 px-4 text-sm font-medium text-gray-500">
                        {coupon.expiresAt ? new Date(coupon.expiresAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="py-4 px-4 text-center">
                        <button
                          onClick={() => handleToggle(coupon)}
                          className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors ${
                            isExpired(coupon)
                              ? 'bg-state-neutral-soft text-state-neutral'
                              : coupon.isActive
                                ? 'bg-state-success-soft text-state-success'
                                : 'bg-state-warning-soft text-state-warning'
                          }`}
                        >
                          {isExpired(coupon) ? 'Expired' : coupon.isActive ? 'Active' : 'Paused'}
                        </button>
                      </td>
                      <td className="py-4 px-4 text-right">
                        <button
                          onClick={() => handleDelete(coupon)}
                          aria-label={`Delete ${coupon.code}`}
                          className="p-3 bg-state-danger-soft text-state-danger hover:bg-state-danger hover:text-white rounded-xl transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />

          <div className="bg-white rounded-[2.5rem] w-full max-w-lg relative z-10 shadow-2xl overflow-hidden">
            <div className="p-8 border-b border-gray-200 flex justify-between items-center bg-surface-muted">
              <h2 className="text-2xl font-black uppercase tracking-tight">New promo code</h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2 bg-gray-200 hover:bg-state-danger hover:text-white rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-8 space-y-5">
              <div>
                <label htmlFor="code" className={label}>Code</label>
                <input id="code" required value={form.code} placeholder="WELCOME10"
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  className={field} />
                <p className="mt-2 text-[11px] font-medium text-gray-400">
                  3–32 characters. Letters, numbers, dash and underscore only.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="type" className={label}>Type</label>
                  <select id="type" value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value as DiscountType })}
                    className={`${field} cursor-pointer`}>
                    <option value="PERCENT">Percentage</option>
                    <option value="FIXED">Fixed amount</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="value" className={label}>
                    {form.type === 'PERCENT' ? 'Percent off' : 'Amount off'}
                  </label>
                  <div className="relative">
                    <input id="value" required type="number" min="0.01" step="0.01" value={form.value}
                      onChange={(e) => setForm({ ...form, value: e.target.value })}
                      className={field} />
                    <span className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                      {form.type === 'PERCENT' ? <Percent size={14} /> : '$'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="minOrderAmount" className={label}>
                    Min order <span className="text-gray-300">(optional)</span>
                  </label>
                  <input id="minOrderAmount" type="number" min="0" step="0.01" value={form.minOrderAmount}
                    onChange={(e) => setForm({ ...form, minOrderAmount: e.target.value })}
                    className={field} />
                </div>
                <div>
                  <label htmlFor="maxDiscount" className={label}>
                    Max discount <span className="text-gray-300">(optional)</span>
                  </label>
                  <input id="maxDiscount" type="number" min="0" step="0.01" value={form.maxDiscount}
                    disabled={form.type === 'FIXED'}
                    onChange={(e) => setForm({ ...form, maxDiscount: e.target.value })}
                    className={`${field} disabled:opacity-40`} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="maxUses" className={label}>
                    Max uses <span className="text-gray-300">(optional)</span>
                  </label>
                  <input id="maxUses" type="number" min="1" step="1" value={form.maxUses}
                    placeholder="Unlimited"
                    onChange={(e) => setForm({ ...form, maxUses: e.target.value })}
                    className={field} />
                </div>
                <div>
                  <label htmlFor="expiresAt" className={label}>
                    Expires <span className="text-gray-300">(optional)</span>
                  </label>
                  <input id="expiresAt" type="date" value={form.expiresAt}
                    onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                    className={field} />
                </div>
              </div>

              <button type="submit" disabled={isSubmitting}
                className="w-full bg-black text-white py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-gray-800 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                {isSubmitting && <Loader2 className="animate-spin" size={14} />}
                Create code
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminCoupons;
