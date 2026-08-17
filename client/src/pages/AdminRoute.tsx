import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';

const AdminRoute = () => {
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  // Store chỉ lưu `response.user`, nên role luôn nằm phẳng ở user.role —
  // không còn phải dò thêm user.user.role như trước.
  if (!isAuthenticated || user?.role !== 'ADMIN') {
    // Đá văng ra trang chủ
    return <Navigate to="/" replace />;
  }

  // Nếu đúng là ADMIN thì cho qua
  return <Outlet />;
};

export default AdminRoute;