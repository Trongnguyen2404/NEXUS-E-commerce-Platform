import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'react-toastify';
import axiosClient, { getErrorMessage } from '../api/axiosClient';
import type { Address } from '../types/api';

// Props for the address form.
interface Props {
  address?: Address;
  onSaved: (address: Address) => void;
  onCancel: () => void;
}

const field =
  'w-full bg-surface-muted border-2 border-transparent focus:border-black rounded-2xl py-3.5 px-5 text-sm font-medium outline-none transition-all';
const label = 'block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2';

// Form for creating or editing a shipping address.
const AddressForm = ({ address, onSaved, onCancel }: Props) => {
  const [form, setForm] = useState({
    fullName: address?.fullName ?? '',
    phone: address?.phone ?? '',
    line1: address?.line1 ?? '',
    line2: address?.line2 ?? '',
    city: address?.city ?? '',
    state: address?.state ?? '',
    postalCode: address?.postalCode ?? '',
    country: address?.country ?? 'VN',
    isDefault: address?.isDefault ?? false,
  });
  const [isSaving, setIsSaving] = useState(false);

  const set = (key: keyof typeof form) => (value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      const payload = {
        ...form,
        line2: form.line2.trim() || undefined,
        state: form.state.trim() || undefined,
      };

      const saved = address
        ? await axiosClient.patch<Address>(`/addresses/${address.id}`, payload)
        : await axiosClient.post<Address>('/addresses', payload);

      toast.success(address ? 'Address updated.' : 'Address saved.');
      onSaved(saved);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not save the address.'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-3xl p-6 sm:p-8 space-y-5">
      <h3 className="text-sm font-black uppercase tracking-widest">
        {address ? 'Edit address' : 'New address'}
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="fullName" className={label}>Full name</label>
          <input id="fullName" required maxLength={120} value={form.fullName}
            onChange={(e) => set('fullName')(e.target.value)} className={field} />
        </div>
        <div>
          <label htmlFor="phone" className={label}>Phone</label>
          <input id="phone" required value={form.phone} placeholder="0901234567"
            onChange={(e) => set('phone')(e.target.value)} className={field} />
        </div>
      </div>

      <div>
        <label htmlFor="line1" className={label}>Street address</label>
        <input id="line1" required maxLength={200} value={form.line1} placeholder="123 Le Loi"
          onChange={(e) => set('line1')(e.target.value)} className={field} />
      </div>

      <div>
        <label htmlFor="line2" className={label}>
          Apartment, suite <span className="text-gray-300">(optional)</span>
        </label>
        <input id="line2" maxLength={200} value={form.line2}
          onChange={(e) => set('line2')(e.target.value)} className={field} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label htmlFor="city" className={label}>City</label>
          <input id="city" required maxLength={100} value={form.city}
            onChange={(e) => set('city')(e.target.value)} className={field} />
        </div>
        <div>
          <label htmlFor="state" className={label}>
            District <span className="text-gray-300">(optional)</span>
          </label>
          <input id="state" maxLength={100} value={form.state}
            onChange={(e) => set('state')(e.target.value)} className={field} />
        </div>
        <div>
          <label htmlFor="postalCode" className={label}>Postal code</label>
          <input id="postalCode" required maxLength={20} value={form.postalCode}
            onChange={(e) => set('postalCode')(e.target.value)} className={field} />
        </div>
      </div>

      <div>
        <label htmlFor="country" className={label}>Country</label>
        <input id="country" maxLength={60} value={form.country}
          onChange={(e) => set('country')(e.target.value)} className={field} />
      </div>

      <label className="flex items-center gap-3 cursor-pointer">
        <input type="checkbox" checked={form.isDefault}
          onChange={(e) => set('isDefault')(e.target.checked)}
          className="h-4 w-4 rounded accent-black cursor-pointer" />
        <span className="text-sm font-medium">Use as my default shipping address</span>
      </label>

      <div className="flex flex-wrap gap-3 pt-2">
        <button type="submit" disabled={isSaving}
          className="bg-black text-white px-8 py-3.5 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-gray-800 transition-all disabled:opacity-50 flex items-center gap-2">
          {isSaving && <Loader2 className="animate-spin" size={14} />}
          {address ? 'Save changes' : 'Save address'}
        </button>
        <button type="button" onClick={onCancel}
          className="bg-surface-muted text-black px-8 py-3.5 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-gray-200 transition-all">
          Cancel
        </button>
      </div>
    </form>
  );
};

export default AddressForm;
