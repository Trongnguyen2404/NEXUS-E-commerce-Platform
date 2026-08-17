import { useState, useEffect } from 'react';
import { Loader2, Plus, Trash2, Edit3, X, Box, Layers } from 'lucide-react';
import { toast } from 'react-toastify';
import axiosClient, { getErrorMessage } from '../api/axiosClient';
import ImageUpload from '../components/ImageUpload';
import VariantManager from '../components/VariantManager';
import type { Category, PageResponse, PaginatedResponse, Product } from '../types/api';

const AdminProducts = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null); // NẾU CÓ ID LÀ ĐANG EDIT
  const [managingVariants, setManagingVariants] = useState<Product | null>(null);
  
  // Form State
  const [formData, setFormData] = useState({
    name: '', sku: '', price: '', stock: '', categoryId: '', imageUrl: '', description: ''
  });

  const fetchData = async () => {
    try {
      const [prodRes, catRes] = await Promise.all([
        axiosClient.get<PaginatedResponse<Product>>('/products', { params: { limit: 100 } }),
        axiosClient.get<PageResponse<Category>>('/categories')
      ]);
      setProducts(prodRes?.data || []);
      setCategories(Array.isArray(catRes?.data) ? catRes.data : []);
    } catch (e) {
      toast.error(getErrorMessage(e, 'Error loading data'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // Auto SKU
  useEffect(() => {
    if (!editingId && formData.name && !formData.sku.includes('-')) {
      const autoSku = formData.name.toUpperCase().replace(/[^A-Z0-9\s]/g, '').replace(/\s+/g, '-');
      setFormData(prev => ({ ...prev, sku: autoSku }));
    }
  }, [formData.name, editingId]);

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

  // MỞ FORM EDIT: Đổ dữ liệu cũ vào Form
  const openEditModal = (product: Product) => {
    setEditingId(product.id);
    setFormData({
      name: product.name || '',
      sku: product.sku || '',
      price: product.price ? String(product.price) : '',
      stock: product.stock !== undefined ? String(product.stock) : '',
      categoryId: product.categoryId || '', // Lấy ID danh mục
      imageUrl: product.imageUrl || '',
      description: product.description || ''
    });
    setIsModalOpen(true);
  };

  // MỞ FORM CREATE: Xóa trắng Form
  const openCreateModal = () => {
    setEditingId(null);
    setFormData({ name: '', sku: '', price: '', stock: '', categoryId: '', imageUrl: '', description: '' });
    setIsModalOpen(true);
  };

  // XỬ LÝ SUBMIT (Gộp cả CREATE và UPDATE)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.categoryId) { toast.error("Please select a category!"); return; }

    setIsSubmitting(true);
    try {
      const payload = {
        ...formData,
        price: Number(formData.price),
        stock: Number(formData.stock),
      };

      if (editingId) {
        // GỌI API UPDATE
        await axiosClient.patch(`/products/${editingId}`, payload);
        toast.success('Product updated successfully!');
      } else {
        // GỌI API CREATE
        await axiosClient.post('/products', payload);
        toast.success('Product created successfully!');
      }

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
        
        {/* HEADER */}
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

        {/* BẢNG SẢN PHẨM */}
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
                      <img src={p.imageUrl ?? ''} alt="" className="max-w-full max-h-full object-contain brightness-[1.02] contrast-[1.05]" />
                    </div>
                    <span className="font-bold text-sm uppercase text-black max-w-[200px] truncate">{p.name}</span>
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
                    {/* NÚT OPTIONS (biến thể) */}
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
                    {/* NÚT EDIT */}
                    <button onClick={() => openEditModal(p)} className="p-3 bg-[#F5F5F7] text-gray-600 hover:bg-black hover:text-white rounded-xl transition-colors">
                      <Edit3 size={16} />
                    </button>
                    {/* NÚT XÓA */}
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

      {/* MODAL THÊM / SỬA SẢN PHẨM */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}></div>
          <div className="bg-white rounded-[2.5rem] w-full max-w-4xl relative z-10 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            
            <div className="p-8 border-b border-gray-200 flex justify-between items-center bg-[#F5F5F7]">
              <div className="flex items-center space-x-3">
                <Box className="text-black" size={24} />
                <h2 className="text-2xl font-black uppercase tracking-tight text-black">{editingId ? 'Edit Product' : 'Create Product'}</h2>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-2 bg-gray-200 hover:bg-red-500 hover:text-white rounded-full transition-colors"><X size={20} /></button>
            </div>

            <div className="p-8 overflow-y-auto">
              <form id="product-form" onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-12 gap-8">
                {/* Các Input (Giữ nguyên như cũ) */}
                <div className="md:col-span-8 space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Product Name <span className="text-red-500">*</span></label>
                    <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full bg-[#F5F5F7] border-2 border-transparent focus:border-black rounded-2xl p-4 text-sm font-bold text-black outline-none transition-all" />
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest">SKU Code <span className="text-red-500">*</span></label>
                      <input required type="text" value={formData.sku} onChange={e => setFormData({...formData, sku: e.target.value})} className="w-full bg-[#F5F5F7] border-2 border-transparent focus:border-black rounded-2xl p-4 text-sm font-bold text-black outline-none transition-all" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Category <span className="text-red-500">*</span></label>
                      <select required value={formData.categoryId} onChange={e => setFormData({...formData, categoryId: e.target.value})} className="w-full bg-[#F5F5F7] border-2 border-transparent focus:border-black rounded-2xl p-4 text-sm font-bold text-black outline-none transition-all cursor-pointer">
                        <option value="" disabled>-- Select a category --</option>
                        {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Price ($) <span className="text-red-500">*</span></label>
                      <input required type="number" step="0.01" min="0" value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})} className="w-full bg-[#F5F5F7] border-2 border-transparent focus:border-black rounded-2xl p-4 text-sm font-bold text-black outline-none transition-all" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Stock <span className="text-red-500">*</span></label>
                      <input required type="number" min="0" value={formData.stock} onChange={e => setFormData({...formData, stock: e.target.value})} className="w-full bg-[#F5F5F7] border-2 border-transparent focus:border-black rounded-2xl p-4 text-sm font-bold text-black outline-none transition-all" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Description</label>
                    <textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full bg-[#F5F5F7] border-2 border-transparent focus:border-black rounded-2xl p-4 text-sm font-bold text-black outline-none h-28 resize-none" />
                  </div>
                </div>

                <div className="md:col-span-4">
                  <ImageUpload
                    value={formData.imageUrl}
                    onChange={(url) => setFormData({ ...formData, imageUrl: url })}
                    folder="products"
                    label="Product image"
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
          // Variants change the product's reported price and stock, so the
          // table behind the modal has to be refetched.
          onChanged={fetchData}
        />
      )}
    </div>
  );
};

export default AdminProducts;