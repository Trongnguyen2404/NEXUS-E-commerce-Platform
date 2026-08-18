import { useState, useEffect } from 'react';
import { Loader2, Trash2, Users, Shield, User } from 'lucide-react';
import { toast } from 'react-toastify';
import axiosClient, { getErrorMessage } from '../api/axiosClient';
import { useAuthStore } from '../store/useAuthStore';
import type { User as ApiUser } from '../types/api';

// Admin screen listing registered users.
const AdminUsers = () => {
  const [usersList, setUsersList] = useState<ApiUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const currentUser = useAuthStore(state => state.user);

  const fetchUsers = async () => {
    try {
      const res = await axiosClient.get<ApiUser[]>('/users');
      setUsersList(Array.isArray(res) ? res : []);
    } catch {
      toast.error('Failed to load users');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleDelete = async (id: string) => {
    if (id === currentUser?.id) {
      toast.error("You cannot delete yourself!");
      return;
    }
    if (!window.confirm('Delete this user? This action cannot be undone.')) return;
    try {
      await axiosClient.delete(`/users/${id}`);
      toast.success('User deleted');
      fetchUsers();
    } catch (e) {
      toast.error(getErrorMessage(e, 'Delete failed'));
    }
  };

  if (isLoading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin" size={40} /></div>;

  return (
    <div className="min-h-screen bg-[#EDEDF0] py-12 px-4 sm:px-8">
      <div className="max-w-[1200px] mx-auto">

        <div className="bg-white rounded-[2rem] p-8 sm:p-10 mb-8 border border-gray-300 shadow-sm flex justify-between items-end">
          <div>
            <h1 className="text-4xl sm:text-5xl font-black uppercase tracking-tighter text-black">Members</h1>
            <p className="text-gray-500 text-[10px] font-black uppercase tracking-[0.4em] mt-2">Manage Store Users</p>
          </div>
          <div className="bg-black text-white px-6 py-3 rounded-xl font-black uppercase text-xs tracking-widest flex items-center space-x-2">
            <Users size={16} /> <span>{usersList.length} Total</span>
          </div>
        </div>

        <div className="bg-white rounded-[2.5rem] p-6 sm:p-10 border border-gray-300 shadow-sm overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="border-b-2 border-black">
                <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest text-black">User Info</th>
                <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest text-black">Role</th>
                <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest text-black">Joined Date</th>
                <th className="py-4 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {usersList.map(u => (
                <tr key={u.id} className="hover:bg-[#F5F5F7] transition-all">
                  <td className="py-5 px-4 flex items-center space-x-4">
                    <div className="w-12 h-12 bg-[#EDEDF0] rounded-full flex items-center justify-center border border-gray-300">
                      <User size={20} className="text-gray-500" />
                    </div>
                    <div>
                      <p className="font-bold text-sm uppercase text-black">{u.firstName} {u.lastName}</p>
                      <p className="text-xs font-bold text-gray-500">{u.email}</p>
                    </div>
                  </td>
                  <td className="py-5 px-4">
                    <span className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest ${u.role === 'ADMIN' ? 'bg-black text-white' : 'bg-gray-200 text-black'}`}>
                      {u.role === 'ADMIN' && <Shield size={10} className="inline mr-1 mb-0.5" />}
                      {u.role}
                    </span>
                  </td>
                  <td className="py-5 px-4 text-xs font-bold text-gray-600">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="py-5 px-4 text-right">
                    <button 
                      onClick={() => handleDelete(u.id)} 
                      disabled={u.id === currentUser?.id}
                      className="p-3 bg-state-danger-soft text-state-danger hover:bg-state-danger hover:text-white rounded-xl transition-colors disabled:opacity-30 disabled:hover:bg-state-danger-soft disabled:hover:text-state-danger"
                    >
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

export default AdminUsers;