import { useEffect, useState, useCallback } from 'react';
import { Search, Trash2, ChevronLeft, ChevronRight, Loader2, Inbox, X } from 'lucide-react';
import { toast } from 'react-toastify';
import axiosClient from '../api/axiosClient';

// ── Types ────────────────────────────────────────────────────────────────────
type ContactStatus = 'PENDING' | 'READ' | 'REPLIED';

interface Contact {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: ContactStatus;
}

interface Meta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ── Config ───────────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<ContactStatus, { label: string; cls: string }> = {
  PENDING: { label: 'Pending', cls: 'bg-amber-100 text-amber-700' },
  READ:    { label: 'Read',    cls: 'bg-gray-100  text-gray-500'  },
  REPLIED: { label: 'Replied', cls: 'bg-green-100 text-green-700' },
};

const AVATAR_COLORS = [
  'bg-violet-500', 'bg-blue-500', 'bg-rose-500',
  'bg-amber-500',  'bg-teal-500', 'bg-pink-500',
];

const getInitials    = (name: string) =>
  name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();

const getAvatarColor = (id: string) =>
  AVATAR_COLORS[id.charCodeAt(id.length - 1) % AVATAR_COLORS.length];

// ── Component ─────────────────────────────────────────────────────────────────
const AdminContacts = () => {
  const [contacts, setContacts]   = useState<Contact[]>([]);
  const [meta, setMeta]           = useState<Meta | null>(null);
  const [search, setSearch]       = useState('');
  const [page, setPage]           = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [modal, setModal]         = useState<Contact | null>(null);
  const [updating, setUpdating]   = useState(false);

  // ── Fetch ────────────────────────────────────────────────────────────────
  const fetchContacts = useCallback(async () => {
    setIsLoading(true);
    try {
      const res: any = await axiosClient.get('/contacts', {
        params: { search, page, limit: 10 },
      });
      setContacts(res?.data?.data ?? res?.data ?? []);
      setMeta(res?.data?.meta ?? res?.meta ?? null);
    } catch {
      toast.error('Failed to load contacts');
    } finally {
      setIsLoading(false);
    }
  }, [search, page]);

  useEffect(() => {
    const t = setTimeout(fetchContacts, 400);
    return () => clearTimeout(t);
  }, [fetchContacts]);

  // ── Mở modal → tự đổi PENDING → READ ────────────────────────────────────
  const openModal = async (contact: Contact) => {
    setModal(contact);
    if (contact.status === 'PENDING') {
      try {
        await axiosClient.patch(`/contacts/${contact.id}`, { status: 'READ' });
        const updated = { ...contact, status: 'READ' as ContactStatus };
        setContacts(prev => prev.map(c => c.id === contact.id ? updated : c));
        setModal(updated);
      } catch { /* silent */ }
    }
  };

  // ── Đổi status ───────────────────────────────────────────────────────────
  const handleStatusChange = async (newStatus: ContactStatus) => {
    if (!modal || updating) return;
    setUpdating(true);
    try {
      await axiosClient.patch(`/contacts/${modal.id}`, { status: newStatus });
      toast.success('Status updated');
      const updated = { ...modal, status: newStatus };
      setModal(updated);
      setContacts(prev => prev.map(c => c.id === modal.id ? updated : c));
    } catch {
      toast.error('Failed to update');
    } finally {
      setUpdating(false);
    }
  };

  // ── Xóa ──────────────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this message?')) return;
    try {
      await axiosClient.delete(`/contacts/${id}`);
      toast.success('Deleted');
      setModal(null);
      fetchContacts();
    } catch {
      toast.error('Failed to delete');
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#EDEDF0] py-10 px-4 sm:px-8">
      <div className="max-w-[1400px] mx-auto space-y-6">

        {/* ── Header ── */}
        <div className="bg-white rounded-[2rem] px-8 py-7 border border-gray-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl sm:text-5xl font-black uppercase tracking-tighter text-black">Inbox</h1>
            <p className="text-gray-400 text-[10px] font-black uppercase tracking-[0.4em] mt-1">
              {meta?.total ?? 0} messages total
            </p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
            <input
              type="text"
              placeholder="Search name, email, subject…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="w-full bg-[#F5F5F7] rounded-2xl py-3 pl-11 pr-4 text-sm font-semibold text-black outline-none border-2 border-transparent focus:border-black transition-all"
            />
          </div>
        </div>

        {/* ── Table ── */}
        <div className="bg-white rounded-[2.5rem] border border-gray-200 shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="h-80 flex items-center justify-center">
              <Loader2 className="animate-spin text-gray-300" size={32} />
            </div>
          ) : contacts.length === 0 ? (
            <div className="h-80 flex flex-col items-center justify-center gap-3 text-gray-300">
              <Inbox size={48} strokeWidth={1.5} />
              <p className="text-xs font-black uppercase tracking-widest">No messages found</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[600px]">
                  <thead>
                    <tr className="border-b-2 border-black">
                      <th className="py-4 px-6 text-[10px] font-black uppercase tracking-widest">Sender</th>
                      <th className="py-4 px-6 text-[10px] font-black uppercase tracking-widest">Subject</th>
                      <th className="py-4 px-6 text-[10px] font-black uppercase tracking-widest text-center">Status</th>
                      <th className="py-4 px-6" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {contacts.map(c => (
                      <tr
                        key={c.id}
                        onClick={() => openModal(c)}
                        className="hover:bg-[#F5F5F7] cursor-pointer transition-all group"
                      >
                        {/* Sender */}
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white text-xs font-black shrink-0 ${getAvatarColor(c.id)}`}>
                              {getInitials(c.name)}
                            </div>
                            <div>
                              <p className={`text-sm ${c.status === 'PENDING' ? 'font-black text-black' : 'font-semibold text-gray-700'}`}>
                                {c.name}
                              </p>
                              <p className="text-[11px] text-gray-400 font-medium">{c.email}</p>
                            </div>
                          </div>
                        </td>

                        {/* Subject */}
                        <td className="py-4 px-6 max-w-xs">
                          <p className={`text-sm truncate ${c.status === 'PENDING' ? 'font-bold text-black' : 'font-medium text-gray-600'}`}>
                            {c.status === 'PENDING' && (
                              <span className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-2 mb-0.5 shrink-0" />
                            )}
                            {c.subject}
                          </p>
                        </td>

                        {/* Status */}
                        <td className="py-4 px-6 text-center">
                          <span className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest ${STATUS_CONFIG[c.status].cls}`}>
                            {STATUS_CONFIG[c.status].label}
                          </span>
                        </td>

                        {/* Delete */}
                        <td className="py-4 px-6 text-right">
                          <button
                            onClick={e => { e.stopPropagation(); handleDelete(c.id); }}
                            className="p-2.5 bg-red-50 text-red-400 hover:bg-red-500 hover:text-white rounded-xl transition-all opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {meta && meta.totalPages > 1 && (
                <div className="flex items-center justify-center gap-1 p-6 border-t border-gray-100">
                  <button
                    disabled={page === 1}
                    onClick={() => setPage(p => p - 1)}
                    className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-[#F5F5F7] disabled:opacity-30 transition-all"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  {[...Array(meta.totalPages)].map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setPage(i + 1)}
                      className={`w-9 h-9 rounded-xl text-xs font-black transition-all ${
                        page === i + 1 ? 'bg-black text-white' : 'text-gray-500 hover:bg-[#F5F5F7]'
                      }`}
                    >
                      {i + 1}
                    </button>
                  ))}
                  <button
                    disabled={page === meta.totalPages}
                    onClick={() => setPage(p => p + 1)}
                    className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-[#F5F5F7] disabled:opacity-30 transition-all"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ══ Modal ══════════════════════════════════════════════════════════════ */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setModal(null)}
          />

          {/* Card */}
          <div className="relative bg-white rounded-[2.5rem] w-full max-w-xl shadow-2xl z-10 flex flex-col max-h-[88vh] overflow-hidden">

            {/* Modal header */}
            <div className="flex items-center justify-between px-8 py-6 bg-[#F5F5F7] border-b border-gray-200">
              <div className="flex items-center gap-4">
                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-white font-black text-sm shrink-0 ${getAvatarColor(modal.id)}`}>
                  {getInitials(modal.name)}
                </div>
                <div>
                  <p className="font-black text-black">{modal.name}</p>
                  <p className="text-xs text-gray-400 font-medium">{modal.email}</p>
                </div>
              </div>
              <button
                onClick={() => setModal(null)}
                className="p-2 bg-white hover:bg-gray-200 rounded-full transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Subject */}
            <div className="px-8 py-5 border-b border-gray-100">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Subject</p>
              <p className="text-lg font-black text-black">{modal.subject}</p>
            </div>

            {/* Message */}
            <div className="px-8 py-6 overflow-y-auto flex-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Message</p>
              <div className="bg-[#F5F5F7] rounded-2xl p-5">
                <p className="text-sm text-gray-700 leading-relaxed font-medium whitespace-pre-wrap">
                  {modal.message}
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="px-8 py-5 border-t border-gray-100 flex flex-wrap items-center justify-between gap-4">
              {/* Status buttons */}
              <div className="flex items-center gap-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mr-1">Status</p>
                {(['PENDING', 'READ', 'REPLIED'] as ContactStatus[]).map(s => (
                  <button
                    key={s}
                    disabled={updating}
                    onClick={() => handleStatusChange(s)}
                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border-2 disabled:opacity-50 ${
                      modal.status === s
                        ? `${STATUS_CONFIG[s].cls} border-transparent ring-2 ring-offset-1 ring-black/10`
                        : 'bg-white border-gray-200 text-gray-400 hover:border-gray-400 hover:text-gray-700'
                    }`}
                  >
                    {STATUS_CONFIG[s].label}
                  </button>
                ))}
              </div>

              {/* Delete */}
              <button
                onClick={() => handleDelete(modal.id)}
                className="flex items-center gap-2 px-5 py-2.5 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all"
              >
                <Trash2 size={14} />
                Delete
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};

export default AdminContacts;