import { Link } from 'react-router-dom';
import { CreditCard, Lock, Package, RotateCcw } from 'lucide-react';

const LINK_GROUPS = [
  {
    title: 'Shop',
    links: [
      { to: '/products', label: 'All products' },
      { to: '/categories', label: 'Categories' },
      { to: '/cart', label: 'Your bag' },
      { to: '/wishlist', label: 'Saved items' },
    ],
  },
  {
    title: 'Account',
    links: [
      { to: '/account', label: 'Your account' },
      { to: '/login', label: 'Sign in' },
      { to: '/register', label: 'Create account' },
      { to: '/forgot-password', label: 'Reset password' },
    ],
  },
  {
    title: 'Support',
    links: [
      { to: '/contact', label: 'Contact us' },
      { to: '/products', label: 'Track an order' },
      { to: '/contact', label: 'Returns' },
      { to: '/contact', label: 'Warranty' },
    ],
  },
];

const BADGES = [
  { icon: Package, label: 'Free shipping over $100' },
  { icon: RotateCcw, label: '30-day returns' },
  { icon: Lock, label: 'Encrypted checkout' },
  { icon: CreditCard, label: 'Secured by Stripe' },
];

// Site footer with the reassurance strip and sitemap.
const Footer = () => (
  <footer className="border-t border-gray-200 bg-white">
    {/* A reassurance strip above the sitemap — the old footer ended the page on
        four bare link columns. */}
    <div className="border-b border-gray-100 bg-surface-muted">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 grid grid-cols-2 lg:grid-cols-4 gap-5">
        {BADGES.map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-center gap-2.5">
            <Icon size={16} strokeWidth={1.75} className="text-black shrink-0" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-gray-600">
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>

    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-10">

        <div className="col-span-2">
          <Link to="/" className="text-2xl font-black tracking-tighter text-black">
            NEXUS<span className="text-brand">.</span>
          </Link>
          <p className="mt-4 text-sm font-medium text-gray-500 leading-relaxed max-w-xs">
            Premium electronics and audio, engineered for people who work with their gear every
            day. Shipped fast, backed for two years.
          </p>
          <a
            href="mailto:support@nexusstore.vn"
            className="mt-6 inline-block text-sm font-bold text-black hover:text-brand-ink transition-colors"
          >
            support@nexusstore.vn
          </a>
        </div>

        {LINK_GROUPS.map((group) => (
          <div key={group.title}>
            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400 mb-5">
              {group.title}
            </h3>
            <ul className="space-y-3">
              {group.links.map((link) => (
                <li key={`${group.title}-${link.label}`}>
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
        ))}
      </div>

      <div className="mt-14 pt-8 border-t border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-4">
        <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
          © {new Date().getFullYear()} Nexus. All rights reserved.
        </p>
        <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
          Built with care in Ho Chi Minh City
        </p>
      </div>
    </div>
  </footer>
);

export default Footer;
