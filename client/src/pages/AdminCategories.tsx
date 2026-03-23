import { useState, useEffect } from 'react';
import { Loader2, Plus, Trash2, Edit3, X, Image as ImageIcon, Layers } from 'lucide-react';
import { toast } from 'react-toastify';
import axiosClient from '../api/axiosClient';

const AdminCategories = () => {
  const [categories, setCategories] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({ name: '', description: '', imageUrl: '' });

  const fetchData = async () => {
    try {
      const res: any = await axiosClient.get('/categories');
      setCategories(Array.isArray(res?.data) ? res.data : (res || []));
    } catch (e: any) {
      toast.error('Error loading categories');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this category? Products inside it must be removed first.')) return;
    try {
      await axiosClient.delete(`/categories/${id}`);
      toast.success('Category deleted');
      fetchData();
    } catch (e: any) {
      const msg = Array.isArray(e.message) ? e.message[0] : (e.message || 'Cannot delete category containing products.');
      toast.error(msg);
    }
  };

  const openEditModal = (cat: any) => {
    setEditingId(cat.id);
    setFormData({ name: cat.name || '', description: cat.description || '', imageUrl: cat.imageUrl || '' });
    setIsModalOpen(true);
  };

  const openCreateModal = () => {
    setEditingId(null);
    setFormData({ name: '', description: '', imageUrl: '' });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (editingId) {
        await axiosClient.patch(`/categories/${editingId}`, formData);
        toast.success('Category updated!');
      } else {
        await axiosClient.post('/categories', formData);
        toast.success('Category created!');
      }
      setIsModalOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Action failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin" size={40} /></div>;

  return (
    <div className="min-h-screen bg-[#EDEDF0] py-12 px-4 sm:px-8">
      <div className="max-w-[1000px] mx-auto">
        
        {/* HEADER */}
        <div className="bg-white rounded-[2rem] p-8 sm:p-10 mb-8 border border-gray-300 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6">
          <div>
            <h1 className="text-4xl sm:text-5xl font-black uppercase tracking-tighter text-black">Categories</h1>
            <p className="text-gray-500 text-[10px] font-black uppercase tracking-[0.4em] mt-2">Manage Store Sections</p>
          </div>
          <button onClick={openCreateModal} className="bg-black text-white px-8 py-4 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] hover:bg-gray-800 transition-all flex items-center space-x-2">
            <Plus size={16} /> <span>New Category</span>
          </button>
        </div>

        {/* LIST CATEGORIES */}
        <div className="bg-white rounded-[2.5rem] p-6 sm:p-10 border border-gray-300 shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b-2 border-black">
                <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest text-black">Category Name</th>
                <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest text-black text-center">Items Inside</th>
                <th className="py-4 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {categories.map(cat => (
                <tr key={cat.id} className="hover:bg-[#F5F5F7] transition-all">
                  <td className="py-5 px-4 flex items-center space-x-5">
                    <div className="w-16 h-16 bg-[#F5F5F7] rounded-2xl flex items-center justify-center p-2 border border-gray-200 shrink-0">
                      {cat.imageUrl ? (
                        <img src={cat.imageUrl} className="max-w-full max-h-full object-contain brightness-[1.02] contrast-[1.05]" style={{ imageRendering: 'webkit-optimize-contrast' as any }} />
                      ) : <Layers className="text-gray-300" size={24} />}
                    </div>
                    <div>
                      <p className="font-black text-sm uppercase text-black">{cat.name}</p>
                      <p className="text-xs text-gray-400 font-medium truncate max-w-xs mt-1">{cat.slug}</p>
                    </div>
                  </td>
                  <td className="py-5 px-4 text-center">
                    <span className="bg-[#EDEDF0] text-black px-4 py-2 rounded-xl text-[10px] font-black">{cat.productCount || 0}</span>
                  </td>
                  <td className="py-5 px-4 text-right space-x-2">
                    <button onClick={() => openEditModal(cat)} className="p-3 bg-[#F5F5F7] text-gray-600 hover:bg-black hover:text-white rounded-xl transition-colors">
                      <Edit3 size={16} />
                    </button>
                    <button onClick={() => handleDelete(cat.id)} className="p-3 bg-red-50 text-red-500 hover:bg-[#E30000] hover:text-white rounded-xl transition-colors">
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}></div>
          
          {/* Mở rộng Modal thành max-w-4xl để chứa 2 cột */}
          <div className="bg-white rounded-[2.5rem] w-full max-w-4xl relative z-10 shadow-2xl overflow-hidden flex flex-col">
            <div className="p-8 border-b border-gray-200 flex justify-between items-center bg-[#F5F5F7]">
              <h2 className="text-2xl font-black uppercase tracking-tight text-black">{editingId ? 'Edit Category' : 'New Category'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2 bg-gray-200 hover:bg-red-500 hover:text-white rounded-full"><X size={20} /></button>
            </div>
            
            <div className="p-8">
              <form id="cat-form" onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-12 gap-8">
                
                {/* CỘT TRÁI: NHẬP THÔNG TIN */}
                <div className="md:col-span-7 space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Name <span className="text-red-500">*</span></label>
                    <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full bg-[#F5F5F7] border-2 border-transparent focus:border-black rounded-2xl p-4 text-sm font-bold text-black outline-none transition-all" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Description</label>
                    <textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full bg-[#F5F5F7] border-2 border-transparent focus:border-black rounded-2xl p-4 text-sm font-bold text-black outline-none h-32 resize-none" />
                  </div>
                </div>

                {/* CỘT PHẢI: PREVIEW ẢNH GIỐNG PRODUCT */}
                <div className="md:col-span-5 space-y-6 flex flex-col">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Image URL</label>
                    <div className="relative">
                      <ImageIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                      <input type="text" value={formData.imageUrl} onChange={e => setFormData({...formData, imageUrl: e.target.value})} className="w-full bg-[#F5F5F7] border-2 border-transparent focus:border-black rounded-2xl p-4 pl-12 text-sm font-bold text-black outline-none" />
                    </div>
                  </div>
                  
                  {/* Khu vực hiện ảnh */}
                  <div className="flex-1 bg-[#F5F5F7] rounded-3xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center p-4 relative overflow-hidden min-h-[200px]">
                    {formData.imageUrl ? (
                      <img src={formData.imageUrl} alt="Preview" className="max-w-full max-h-full object-contain brightness-[1.02] contrast-[1.05]" style={{ imageRendering: 'webkit-optimize-contrast' as any }} onError={(e) => { (e.target as any).src = 'https://placehold.co/400x400?text=Invalid+Image'; }} />
                    ) : (
                      <div className="text-center text-gray-400">
                        <ImageIcon size={48} className="mx-auto mb-2 opacity-50" />
                        <p className="text-[10px] font-black uppercase tracking-widest">No Image</p>
                      </div>
                    )}
                  </div>
                </div>

              </form>
            </div>
            
            <div className="p-6 border-t border-gray-200 flex justify-end space-x-4 bg-white">
              <button type="button" onClick={() => setIsModalOpen(false)} className="px-8 py-4 bg-[#F5F5F7] text-black rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-gray-200">Cancel</button>
              <button form="cat-form" type="submit" disabled={isSubmitting} className="px-10 py-4 bg-black text-white rounded-xl font-black uppercase text-[10px] tracking-[0.2em] hover:bg-gray-800 disabled:opacity-50">
                {isSubmitting ? 'Saving...' : 'Save Category'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminCategories;