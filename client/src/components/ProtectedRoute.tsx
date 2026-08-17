import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';

/**
 * Gate for pages that need a logged-in user.
 *
 * Only /admin was guarded before; /account, /cart and /checkout rendered for
 * anyone and relied on each page checking localStorage by hand — Checkout did,
 * Account did not.
 */
const ProtectedRoute = () => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const location = useLocation();

  if (!isAuthenticated) {
    // Remember where they were headed so login can send them back instead of
    // dumping them on the home page.
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
