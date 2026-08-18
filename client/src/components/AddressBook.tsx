import { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, MapPin, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { toast } from 'react-toastify';
import axiosClient, { getErrorMessage } from '../api/axiosClient';
import AddressForm from './AddressForm';
import type { Address } from '../types/api';

// Props for the address picker.
interface Props {
  
  selectedId?: string | null;
  onSelect?: (address: Address) => void;
}

// Lists saved addresses and lets the user pick, add, edit or delete one.
const AddressBook = ({ selectedId, onSelect }: Props) => {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editing, setEditing] = useState<Address | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const isPicker = typeof onSelect === 'function';

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const list = await axiosClient.get<Address[]>('/addresses');
      setAddresses(list);

      
      if (isPicker && !selectedId && list.length > 0) {
        onSelect?.(list.find((a) => a.isDefault) ?? list[0]);
      }
    } catch (error) {
      console.error('Failed to load addresses:', error);
    } finally {
      setIsLoading(false);
    }
    
    
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPicker, onSelect]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSaved = async (saved: Address) => {
    setEditing(null);
    setIsAdding(false);
    await load();
    if (isPicker) onSelect?.(saved);
  };

  const handleDelete = async (address: Address) => {
    if (!window.confirm(`Delete the address for ${address.fullName}?`)) return;

    try {
      await axiosClient.delete(`/addresses/${address.id}`);
      toast.success('Address deleted.');
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not delete the address.'));
    }
  };

  const handleSetDefault = async (address: Address) => {
    try {
      await axiosClient.patch<Address>(`/addresses/${address.id}/default`);
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not set the default address.'));
    }
  };

  if (isLoading) {
    return (
      <div className="py-12 flex justify-center">
        <Loader2 className="animate-spin text-gray-300" size={28} />
      </div>
    );
  }

  if (editing) {
    return <AddressForm address={editing} onSaved={handleSaved} onCancel={() => setEditing(null)} />;
  }

  return (
    <div className="space-y-4">
      {addresses.length === 0 && !isAdding && (
        <div className="bg-surface-muted rounded-3xl p-10 text-center">
          <MapPin className="mx-auto text-gray-300 mb-4" size={32} />
          <p className="text-sm font-medium text-gray-500">
            No saved addresses yet.
          </p>
        </div>
      )}

      {addresses.map((address) => {
        const isSelected = isPicker && selectedId === address.id;

        return (
          <div
            key={address.id}
            onClick={isPicker ? () => onSelect?.(address) : undefined}
            className={`rounded-3xl border p-6 transition-all ${
              isPicker ? 'cursor-pointer' : ''
            } ${
              isSelected
                ? 'border-black bg-white ring-1 ring-black'
                : 'border-gray-200 bg-white hover:border-gray-400'
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className="text-sm font-black uppercase">{address.fullName}</span>
                  {address.isDefault && (
                    <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest bg-brand-soft text-brand-ink px-2 py-1 rounded-md">
                      <Star size={10} fill="currentColor" />
                      Default
                    </span>
                  )}
                  {isSelected && (
                    <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest bg-black text-white px-2 py-1 rounded-md">
                      <Check size={10} />
                      Selected
                    </span>
                  )}
                </div>

                <p className="text-sm text-gray-600 leading-relaxed">
                  {address.line1}
                  {address.line2 ? `, ${address.line2}` : ''}
                  <br />
                  {[address.state, address.city, address.postalCode, address.country]
                    .filter(Boolean)
                    .join(', ')}
                </p>
                <p className="text-xs font-bold text-gray-400 mt-1.5">{address.phone}</p>
              </div>

              <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                {!address.isDefault && (
                  <button type="button" onClick={() => handleSetDefault(address)}
                    aria-label="Set as default"
                    className="p-2.5 text-gray-300 hover:text-brand-ink transition-colors">
                    <Star size={16} />
                  </button>
                )}
                <button type="button" onClick={() => setEditing(address)}
                  aria-label="Edit address"
                  className="p-2.5 text-gray-400 hover:text-black transition-colors">
                  <Pencil size={16} />
                </button>
                <button type="button" onClick={() => handleDelete(address)}
                  aria-label="Delete address"
                  className="p-2.5 text-gray-300 hover:text-state-danger transition-colors">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {isAdding ? (
        <AddressForm onSaved={handleSaved} onCancel={() => setIsAdding(false)} />
      ) : (
        <button type="button" onClick={() => setIsAdding(true)}
          className="w-full border-2 border-dashed border-gray-300 rounded-3xl py-5 text-xs font-black uppercase tracking-widest text-gray-500 hover:border-black hover:text-black transition-all flex items-center justify-center gap-2">
          <Plus size={16} />
          Add a new address
        </button>
      )}
    </div>
  );
};

export default AddressBook;
