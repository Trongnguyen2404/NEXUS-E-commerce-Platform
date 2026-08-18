import { Link } from 'react-router-dom';
import { Home, Search } from 'lucide-react';

// 404 page.
const NotFound = () => (
  <div className="min-h-[70vh] flex items-center justify-center px-6">
    <div className="max-w-md w-full text-center">
      <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-brand mb-4">
        Error 404
      </p>

      <h1 className="text-6xl font-black tracking-tighter mb-6">
        Page not found
      </h1>

      <p className="text-sm font-medium text-gray-500 mb-10 leading-relaxed">
        The page you are looking for was moved, removed, or never existed.
      </p>

      <div className="flex flex-col sm:flex-row gap-3">
        <Link
          to="/"
          className="flex-1 bg-black text-white py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-gray-800 transition-all flex items-center justify-center space-x-2"
        >
          <Home size={16} />
          <span>Homepage</span>
        </Link>

        <Link
          to="/products"
          className="flex-1 bg-[#F5F5F7] text-black py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-gray-200 transition-all flex items-center justify-center space-x-2"
        >
          <Search size={16} />
          <span>Browse products</span>
        </Link>
      </div>
    </div>
  </div>
);

export default NotFound;
