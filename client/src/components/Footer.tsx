import { Link } from 'react-router-dom';

const SHOP_LINKS = [
  { to: '/products', label: 'All products' },
  { to: '/categories', label: 'Categories' },
  { to: '/cart', label: 'Your bag' },
];

const ACCOUNT_LINKS = [
  { to: '/account', label: 'Your account' },
  { to: '/login', label: 'Sign in' },
  { to: '/register', label: 'Create account' },
];

const Footer = () => (
  // No top margin: every page already ends with its own bottom padding, and
  // stacking the two left a screenful of dead space above the footer.
  <footer className="border-t border-gray-200 bg-white">
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-10">

        <div className="col-span-2 md:col-span-1">
          <Link to="/" className="text-2xl font-black tracking-tighter text-black">
            NEXUS<span className="text-brand">.</span>
          </Link>
          <p className="mt-4 text-sm font-medium text-gray-500 leading-relaxed max-w-xs">
            Premium electronics and audio, shipped fast.
          </p>
        </div>

        <div>
          <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400 mb-5">
            Shop
          </h3>
          <ul className="space-y-3">
            {SHOP_LINKS.map((link) => (
              <li key={link.to}>
                <Link
                  to={link.to}
                  className="text-sm font-semibold text-black hover:text-brand-ink transition-colors"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400 mb-5">
            Account
          </h3>
          <ul className="space-y-3">
            {ACCOUNT_LINKS.map((link) => (
              <li key={link.to}>
                <Link
                  to={link.to}
                  className="text-sm font-semibold text-black hover:text-brand-ink transition-colors"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400 mb-5">
            Support
          </h3>
          <ul className="space-y-3">
            <li>
              <Link
                to="/contact"
                className="text-sm font-semibold text-black hover:text-brand-ink transition-colors"
              >
                Contact us
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="mt-14 pt-8 border-t border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-4">
        <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
          © {new Date().getFullYear()} Nexus. All rights reserved.
        </p>
        <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
          Secured by Stripe
        </p>
      </div>
    </div>
  </footer>
);

export default Footer;
