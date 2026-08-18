import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'react-toastify';
import axiosClient, { getErrorMessage } from '../api/axiosClient';
import ImageUpload from './ImageUpload';
import type { ProductVariant } from '../types/api';

// Props for the variant manager.
interface Props {
  productId: string;
  productName: string;

  basePrice: number;
  onClose: () => void;

  onChanged: () => void;
}

const EMPTY = {
  sku: '',
  optionsText: 'Size: M, Color: Black',
  price: '',
  stock: '',
  imageUrl: '',
};

const field =
  'w-full bg-surface-muted border-2 border-transparent focus:border-black rounded-2xl py-3 px-4 text-sm font-medium outline-none transition-all';
const label = 'block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2';

// Parses the comma separated 'Name: Value' text into an options object.
const parseOptions = (text: string): Record<string, string> => {
  const options: Record<string, string> = {};

  for (const pair of text.split(',')) {
    const [name, ...rest] = pair.split(':');
    const value = rest.join(':').trim();
    if (!name?.trim() || !value) {
      throw new Error(`Could not read "${pair.trim()}". Use the form  Size: M, Color: Black`);
    }
    options[name.trim()] = value;
  }

  if (Object.keys(options).length === 0) throw new Error('Add at least one option');
  return options;
};

// Modal for adding, editing and deleting a product's options.
const VariantManager = ({ productId, productName, basePrice, onClose, onChanged }: Props) => {
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setVariants(await axiosClient.get<ProductVariant[]>(`/products/${productId}/variants`));
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to load variants'));
    } finally {
      setIsLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();

    let options: Record<string, string>;
    try {
      options = parseOptions(form.optionsText);
    } catch (error) {
      toast.error((error as Error).message);
      return;
    }

    setIsSubmitting(true);
    try {
      await axiosClient.post<ProductVariant>(`/products/${productId}/variants`, {
        sku: form.sku.trim(),
        options,
        stock: Number(form.stock),

        ...(form.price ? { price: Number(form.price) } : {}),

        ...(form.imageUrl ? { imageUrl: form.imageUrl } : {}),
      });

      toast.success('Variant added');
      setForm(EMPTY);
      await load();
      onChanged();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not add the variant'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStock = async (variant: ProductVariant, stock: number) => {
    try {
      await axiosClient.patch<ProductVariant>(`/variants/${variant.id}`, { stock });
      await load();
      onChanged();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not update stock'));
    }
  };

  const handleDelete = async (variant: ProductVariant) => {
    if (!window.confirm(`Delete "${variant.label}"?`)) return;

    try {
      const res = await axiosClient.delete<{ message: string }>(`/variants/${variant.id}`);
      toast.success(res.message);
      await load();
      onChanged();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not delete the variant'));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="bg-white rounded-[2.5rem] w-full max-w-3xl relative z-10 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="p-8 border-b border-gray-200 flex justify-between items-center bg-surface-muted shrink-0">
          <div className="min-w-0">
            <h2 className="text-2xl font-black uppercase tracking-tight truncate">Options</h2>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-500 mt-1 truncate">
              {productName}
            </p>
          </div>
          <button onClick={onClose} className="p-2 bg-gray-200 hover:bg-state-danger hover:text-white rounded-full transition-colors shrink-0">
            <X size={20} />
          </button>
        </div>

        <div className="p-8 overflow-y-auto">
          {variants.length > 0 && (
            <p className="text-xs font-medium text-brand-ink bg-brand-soft rounded-xl px-4 py-3 mb-6">
              While this product has options, its own price and stock are ignored — customers buy
              against the rows below.
            </p>
          )}

          {isLoading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="animate-spin text-gray-300" size={28} />
            </div>
          ) : variants.length === 0 ? (
            <p className="text-sm font-medium text-gray-400 py-8 text-center">
              No options yet. This product sells on its own price and stock.
            </p>
          ) : (
            <div className="overflow-x-auto mb-8">
              <table className="w-full text-left border-collapse min-w-[560px]">
                <thead>
                  <tr className="border-b-2 border-black">
                    <th className="py-3 px-3 text-[10px] font-black uppercase tracking-widest">Option</th>
                    <th className="py-3 px-3 text-[10px] font-black uppercase tracking-widest">SKU</th>
                    <th className="py-3 px-3 text-[10px] font-black uppercase tracking-widest text-right">Price</th>
                    <th className="py-3 px-3 text-[10px] font-black uppercase tracking-widest text-center">Stock</th>
                    <th className="py-3 px-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {variants.map((variant) => (
                    <tr key={variant.id} className={variant.isActive ? '' : 'opacity-50'}>
                      <td className="py-3 px-3">
                        <span className="text-sm font-black uppercase">{variant.label}</span>
                        {!variant.isActive && (
                          <span className="ml-2 text-[9px] font-black uppercase tracking-widest bg-state-neutral-soft text-state-neutral px-2 py-0.5 rounded">
                            Inactive
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-xs font-bold text-gray-500">{variant.sku}</td>
                      <td className="py-3 px-3 text-sm font-bold text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        ${variant.price.toFixed(2)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <input
                          type="number"
                          min={0}
                          defaultValue={variant.stock}
                          aria-label={`Stock for ${variant.label}`}

                          onBlur={(e) => {
                            const next = Number(e.target.value);
                            if (next !== variant.stock) handleStock(variant, next);
                          }}
                          className="w-20 bg-surface-muted rounded-lg py-2 px-3 text-sm font-bold text-center outline-none focus:ring-2 focus:ring-black"
                        />
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() => handleDelete(variant)}
                          aria-label={`Delete ${variant.label}`}
                          className="p-2.5 bg-state-danger-soft text-state-danger hover:bg-state-danger hover:text-white rounded-xl transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <form onSubmit={handleAdd} className="border-t border-gray-200 pt-8 space-y-4">
            <h3 className="text-sm font-black uppercase tracking-widest">Add an option</h3>

            <div>
              <label htmlFor="optionsText" className={label}>Options</label>
              <input
                id="optionsText"
                required
                value={form.optionsText}
                onChange={(e) => setForm({ ...form, optionsText: e.target.value })}
                className={field}
              />
              <p className="mt-2 text-[11px] font-medium text-gray-400">
                Comma separated, each as <code>Name: Value</code> — e.g. <code>Size: M, Color: Black</code>
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="sku" className={label}>SKU</label>
                <input id="sku" required value={form.sku} placeholder="TEE-M-BLACK"
                  onChange={(e) => setForm({ ...form, sku: e.target.value.toUpperCase() })}
                  className={field} />
              </div>
              <div>
                <label htmlFor="price" className={label}>
                  Price <span className="text-gray-300">(optional)</span>
                </label>
                <input id="price" type="number" min="0" step="0.01" value={form.price}
                  placeholder={basePrice.toFixed(2)}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  className={field} />
              </div>
              <div>
                <label htmlFor="stock" className={label}>Stock</label>
                <input id="stock" required type="number" min="0" step="1" value={form.stock}
                  onChange={(e) => setForm({ ...form, stock: e.target.value })}
                  className={field} />
              </div>
            </div>

            <ImageUpload
              value={form.imageUrl}
              onChange={(url) => setForm({ ...form, imageUrl: url })}
              folder="variants"
              label="Image (optional — falls back to the product photo)"
            />

            <button type="submit" disabled={isSubmitting}
              className="bg-black text-white px-8 py-3.5 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-gray-800 transition-all disabled:opacity-50 flex items-center gap-2">
              {isSubmitting ? <Loader2 className="animate-spin" size={14} /> : <Plus size={14} />}
              Add option
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default VariantManager;
