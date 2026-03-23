import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';

const AdminRoute = () => {
  const { user, isAuthenticated } = useAuthStore();

  // Bắt chuẩn role dù object bị lồng nhau (user.role hoặc user.user.role)
  const userRole = user?.role || user?.user?.role;

  // Bật F12 lên xem dòng này, bạn sẽ biết ngay tại sao nó lỗi lúc trước
  console.log("🔒 Check Quyền Admin:", { isAuthenticated, role: userRole, rawUser: user });

  // Nếu chưa đăng nhập HOẶC role không phải ADMIN (bỏ qua viết hoa/thường)
  if (!isAuthenticated || String(userRole).toUpperCase() !== 'ADMIN') {
    // Đá văng ra trang chủ
    return <Navigate to="/" replace />;
  }

  // Nếu đúng là ADMIN thì cho qua
  return <Outlet />;
};

export default AdminRoute;