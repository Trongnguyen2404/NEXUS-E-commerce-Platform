import { useState, useEffect } from 'react';
import { Loader2, Plus, Trash2, Edit3, X, Box, Layers } from 'lucide-react';
import { toast } from 'react-toastify';
import axiosClient, { getErrorMessage } from '../api/axiosClient';
import ImageGallery from '../components/ImageGallery';
import { PRODUCT_PLACEHOLDER } from '../components/productPlaceholder';
import Select from '../components/Select';
import VariantManager from '../components/VariantManager';
import type { Category, PageResponse, PaginatedResponse, Product } from '../types/api';

// Admin screen for the product catalogue, images and options.
const AdminProducts = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null); 
  const [managingVariants, setManagingVariants] = useState<Product | null>(null);
  
  
  const EMPTY_FORM = { name: '', sku: '', price: '', stock: '', categoryId: '', description: '', images: [] as string[] };
  const [formData, setFormData] = useState(EMPTY_FORM);

  // True while editing a product whose price and stock are owned by its
  // variants. The list endpoint DERIVES those two fields for such products
  // (price = cheapest active variant, stock = summed variant stock), so the
  // value in the form is a read-only summary — sending it back would write the
  // cheapest variant's price into the base column and silently re-price every
  // variant that inherits it.
  const [variantPriced, setVariantPriced] = useState(false);

  // Set once the admin types their own SKU. The old guard tested whether the
  // SKU contained a dash, but every auto-generated multi-word SKU does, so the
  // very first space froze it: "Nexus Widget Pro" stayed NEXUS-WIDGET.
  const [skuTouched, setSkuTouched] = useState(false);

  const fetchData = async () => {
    try {
      
      
      
      const [live, hidden, catRes] = await Promise.all([
        axiosClient.get<PaginatedResponse<Product>>('/products', { params: { limit: 100 } }),
        axiosClient.get<PaginatedResponse<Product>>('/products', { params: { limit: 100, isActive: false } }),
        axiosClient.get<PageResponse<Category>>('/categories')
      ]);
      setProducts([...(live?.data ?? []), ...(hidden?.data ?? [])]);
      setCategories(Array.isArray(catRes?.data) ? catRes.data : []);
    } catch (e) {
      toast.error(getErrorMessage(e, 'Error loading data'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  
  useEffect(() => {
    if (editingId || skuTouched || !formData.name) return;
    const autoSku = formData.name.toUpperCase().replace(/[^A-Z0-9\s]/g, '').trim().replace(/\s+/g, '-');
    setFormData(prev => (prev.sku === autoSku ? prev : { ...prev, sku: autoSku }));
  }, [formData.name, editingId, skuTouched]);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this product permanently?')) return;
    try {
      await axiosClient.delete(`/products/${id}`);
      toast.success('Product deleted successfully');
      fetchData();
    } catch (e) {
      toast.error(getErrorMessage(e, 'Deletion failed. Product might be in an order.'));
    }
  };

  
  const openEditModal = async (product: Product) => {
    setEditingId(product.id);
    setSkuTouched(true);
    setVariantPriced(product.hasVariants);
    setFormData({
      name: product.name || '',
      sku: product.sku || '',
      price: product.price ? String(product.price) : '',
      stock: product.stock !== undefined ? String(product.stock) : '',
      categoryId: product.categoryId || '', 
      description: product.description || '',
      images: product.imageUrl ? [product.imageUrl] : [],
    });
    setIsModalOpen(true);

    
    
    
    try {
      const full = await axiosClient.get<Product>(`/products/${product.id}`);
      setFormData((prev) => ({ ...prev, images: full.images ?? [] }));
    } catch {
      toast.error('Could not load the full gallery — close and reopen before saving, or you will lose the other images.');
    }
  };

  
  const openCreateModal = () => {
    setEditingId(null);
    setFormData(EMPTY_FORM);
    setSkuTouched(false);
    setVariantPriced(false);
    setIsModalOpen(true);
  };

  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.categoryId) { toast.error("Please select a category!"); return; }

    setIsSubmitting(true);
    try {
      
      
      const { images, price, stock, ...productFields } = formData;
      const payload = {
        ...productFields,
        // Omitted entirely for a variant product: the form only ever held the
        // derived summary, and PATCHing it back would overwrite the base price
        // every inheriting variant is priced from.
        ...(variantPriced ? {} : { price: Number(price), stock: Number(stock) }),
      };

      let productId = editingId;

      if (editingId) {
        await axiosClient.patch(`/products/${editingId}`, payload);
      } else {
        productId = (await axiosClient.post<Product>('/products', payload)).id;
      }

      
      await axiosClient.put(`/products/${productId}/images`, { urls: images });

      toast.success(editingId ? 'Product updated successfully!' : 'Product created successfully!');
      setIsModalOpen(false);
      fetchData();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Action failed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-black" size={40} /></div>;

  return (
    <div className="min-h-screen bg-[#EDEDF0] py-12 px-4 sm:px-8">
      <div className="max-w-[1400px] mx-auto">
        
        <div className="bg-white rounded-[2rem] p-8 sm:p-10 mb-8 border border-gray-300 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6">
          <div>
            <h1 className="text-4xl sm:text-5xl font-black uppercase tracking-tighter text-black">Inventory</h1>
            <p className="text-gray-500 text-[10px] font-black uppercase tracking-[0.4em] mt-2">Manage Store Catalog</p>
          </div>
          <button 
            onClick={openCreateModal}
            className="bg-black text-white px-8 py-4 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] hover:bg-gray-800 transition-all flex items-center space-x-2 shadow-xl shadow-black/10"
          >
            <Plus size={16} /> <span>New Product</span>
          </button>
        </div>

        <div className="bg-white rounded-[2.5rem] p-6 sm:p-10 border border-gray-300 shadow-sm overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="border-b-2 border-black">
                <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest text-black">Product</th>
                <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest text-black">SKU</th>
                <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest text-black">Category</th>
                <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest text-black text-center">Stock</th>
                <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest text-black text-right">Price</th>
                <th className="py-4 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {products.map(p => (
                <tr key={p.id} className="hover:bg-[#F5F5F7] transition-all">
                  <td className="py-4 px-4 flex items-center space-x-4">
                    <div className="w-14 h-14 bg-white rounded-xl border border-gray-200 p-2 flex items-center justify-center shrink-0">
                      <img
                        src={p.imageUrl || PRODUCT_PLACEHOLDER}
                        alt=""
                        className={`max-w-full max-h-full object-contain brightness-[1.02] contrast-[1.05] ${p.isActive ? '' : 'grayscale opacity-60'}`}
                        onError={(e) => { e.currentTarget.src = PRODUCT_PLACEHOLDER; }}
                      />
                    </div>
                    <div className="min-w-0">
                      <span className="block font-bold text-sm uppercase text-black max-w-[200px] truncate">{p.name}</span>
                      {!p.isActive && (
                        <span className="inline-block mt-1 text-[9px] font-black uppercase tracking-widest bg-state-neutral-soft text-state-neutral px-2 py-0.5 rounded">
                          Hidden
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-4 px-4 text-xs font-bold text-gray-500">{p.sku}</td>
                  <td className="py-4 px-4">
                    <span className="bg-gray-200 text-black px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest">{p.category || 'N/A'}</span>
                  </td>
                  <td className="py-4 px-4 text-center">
                    <span className={`px-3 py-1.5 rounded-lg text-[10px] font-black ${
                      p.stock > 10
                        ? 'bg-state-success-soft text-state-success'
                        : p.stock > 0
                          ? 'bg-state-warning-soft text-state-warning'
                          : 'bg-state-danger-soft text-state-danger'
                    }`}>{p.stock}</span>
                  </td>
                  <td className="py-4 px-4 text-right font-black text-sm text-black">${Number(p.price).toFixed(2)}</td>
                  <td className="py-4 px-4 text-right space-x-2 whitespace-nowrap">
                    <button
                      onClick={() => setManagingVariants(p)}
                      title={p.hasVariants ? `${p.variants.length} options` : 'Add options'}
                      className={`p-3 rounded-xl transition-colors ${
                        p.hasVariants
                          ? 'bg-brand-soft text-brand-ink hover:bg-brand hover:text-white'
                          : 'bg-[#F5F5F7] text-gray-600 hover:bg-black hover:text-white'
                      }`}
                    >
                      <Layers size={16} />
                    </button>
                    <button onClick={() => openEditModal(p)} className="p-3 bg-[#F5F5F7] text-gray-600 hover:bg-black hover:text-white rounded-xl transition-colors">
                      <Edit3 size={16} />
                    </button>
                    <button onClick={() => handleDelete(p.id)} className="p-3 bg-state-danger-soft text-state-danger hover:bg-state-danger hover:text-white rounded-xl transition-colors">
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}></div>
          <div className="bg-white rounded-[2.5rem] w-full max-w-4xl relative z-10 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            
            <div className="p-8 border-b border-gray-200 flex justify-between items-center bg-[#F5F5F7]">
              <div className="flex items-center space-x-3">
                <Box className="text-black" size={24} />
                <h2 className="text-2xl font-black uppercase tracking-tight text-black">{editingId ? 'Edit Product' : 'Create Product'}</h2>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-2 bg-gray-200 hover:bg-state-danger hover:text-white rounded-full transition-colors"><X size={20} /></button>
            </div>

            <div className="p-8 overflow-y-auto">
              <form id="product-form" onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-12 gap-8">
                <div className="md:col-span-8 space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Product Name <span className="text-state-danger">*</span></label>
                    <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full bg-[#F5F5F7] border-2 border-transparent focus:border-black rounded-2xl p-4 text-sm font-bold text-black outline-none transition-all" />
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest">SKU Code <span className="text-state-danger">*</span></label>
                      <input required type="text" value={formData.sku} onChange={e => { setSkuTouched(true); setFormData({...formData, sku: e.target.value}); }} className="w-full bg-[#F5F5F7] border-2 border-transparent focus:border-black rounded-2xl p-4 text-sm font-bold text-black outline-none transition-all" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Category <span className="text-state-danger">*</span></label>
                      <Select
                        value={formData.categoryId}
                        onChange={(next) => setFormData({ ...formData, categoryId: next })}
                        options={categories.map(cat => ({ value: cat.id, label: cat.name }))}
                        placeholder="Select a category"
                        ariaLabel="Category"
                        className="w-full inline-flex items-center justify-between gap-3 bg-surface-muted border-2 border-transparent focus-visible:border-black rounded-2xl p-4 text-sm font-bold text-black outline-none transition-all cursor-pointer hover:bg-surface-sunken"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label htmlFor="product-price" className="text-[10px] font-black uppercase text-gray-500 tracking-widest">
                        Price ($) {!variantPriced && <span className="text-state-danger">*</span>}
                      </label>
                      <input id="product-price" required={!variantPriced} disabled={variantPriced} type="number" step="0.01" min="0" value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})} className="w-full bg-[#F5F5F7] border-2 border-transparent focus:border-black rounded-2xl p-4 text-sm font-bold text-black outline-none transition-all disabled:text-gray-400 disabled:cursor-not-allowed" />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="product-stock" className="text-[10px] font-black uppercase text-gray-500 tracking-widest">
                        Stock {!variantPriced && <span className="text-state-danger">*</span>}
                      </label>
                      <input id="product-stock" required={!variantPriced} disabled={variantPriced} type="number" min="0" value={formData.stock} onChange={e => setFormData({...formData, stock: e.target.value})} className="w-full bg-[#F5F5F7] border-2 border-transparent focus:border-black rounded-2xl p-4 text-sm font-bold text-black outline-none transition-all disabled:text-gray-400 disabled:cursor-not-allowed" />
                    </div>
                    {variantPriced && (
                      <p className="col-span-2 -mt-2 text-[10px] font-bold uppercase tracking-widest text-gray-500">
                        Price and stock come from this product's options — edit them under Options.
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="product-description" className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Description</label>
                    <textarea id="product-description" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full bg-[#F5F5F7] border-2 border-transparent focus:border-black rounded-2xl p-4 text-sm font-bold text-black outline-none h-28 resize-none" />
                  </div>
                </div>

                <div className="md:col-span-4">
                  <ImageGallery
                    value={formData.images}
                    onChange={(images) => setFormData({ ...formData, images })}
                    folder="products"
                  />
                </div>
              </form>
            </div>

            <div className="p-6 border-t border-gray-200 bg-white flex justify-end space-x-4">
              <button type="button" onClick={() => setIsModalOpen(false)} className="px-8 py-4 bg-[#F5F5F7] text-black rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-gray-200 transition-colors">Cancel</button>
              <button form="product-form" type="submit" disabled={isSubmitting} className="px-10 py-4 bg-black text-white rounded-xl font-black uppercase text-[10px] tracking-[0.2em] hover:bg-gray-800 transition-all disabled:opacity-50">
                {isSubmitting ? 'Saving...' : (editingId ? 'Update Product' : 'Publish Product')}
              </button>
            </div>
          </div>
        </div>
      )}

      {managingVariants && (
        <VariantManager
          productId={managingVariants.id}
          productName={managingVariants.name}
          basePrice={managingVariants.price}
          onClose={() => setManagingVariants(null)}
          
          
          onChanged={fetchData}
        />
      )}
    </div>
  );
};

export default AdminProducts;