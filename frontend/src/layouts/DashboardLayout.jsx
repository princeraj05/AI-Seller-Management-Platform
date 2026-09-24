import React, { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  Sparkles,
  Store,
  ShoppingCart,
  Boxes,
  Tag,
  RotateCcw,
  Users,
  BarChart3,
  TrendingUp,
  Bell,
  Settings,
  HelpCircle,
  LogOut,
  Search,
  Plus,
  ChevronDown,
  User,
  CreditCard,
  Building2,
  RefreshCw,
  Zap,
  CheckCircle2,
  AlertTriangle,
  X
} from 'lucide-react';
import { mockNotifications } from '../utils/mockData';

export default function DashboardLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [channelsOpen, setChannelsOpen] = useState(true);

  const navItems = [
    { label: 'Dashboard', path: '/', icon: LayoutDashboard },
    { label: 'Products', path: '/products', icon: Package },
    { label: 'AI Studio', path: '/ai-studio', icon: Sparkles, badge: 'New' },
    {
      label: 'Channels',
      path: '/channels',
      icon: Store,
      hasSub: true,
      subItems: [
        { label: 'All Channels', path: '/channels' },
        { label: 'Amazon', path: '/channels/amazon' },
        { label: 'Flipkart', path: '/channels/flipkart' },
        { label: 'Myntra', path: '/channels/myntra' },
        { label: 'My Website', path: '/channels/website' },
        { label: 'Offline Store / POS', path: '/channels/pos' },
      ]
    },
    { label: 'Orders', path: '/orders', icon: ShoppingCart },
    { label: 'Inventory', path: '/inventory', icon: Boxes },
    { label: 'Pricing', path: '/pricing', icon: Tag },
    { label: 'Returns', path: '/returns', icon: RotateCcw },
    { label: 'Customers', path: '/customers', icon: Users },
    { label: 'Analytics', path: '/analytics', icon: BarChart3 },
    { label: 'Trends', path: '/trends', icon: TrendingUp },
    { label: 'Sync Center', path: '/sync-center', icon: RefreshCw },
    { label: 'Notifications', path: '/notifications', icon: Bell, badgeCount: 3 },
    { label: 'Settings', path: '/settings', icon: Settings },
  ];

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex text-slate-800 font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col flex-shrink-0 fixed inset-y-0 left-0 z-30">
        {/* Brand Header */}
        <div className="h-16 flex items-center justify-between px-5 border-b border-slate-100">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-base text-slate-900 tracking-tight block leading-tight">AI Seller</span>
              <span className="text-[10px] text-slate-400 font-medium tracking-wide uppercase block">Management Platform</span>
            </div>
          </Link>
        </div>

        {/* Navigation Links */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);

            if (item.hasSub) {
              return (
                <div key={item.label} className="space-y-1">
                  <button
                    onClick={() => setChannelsOpen(!channelsOpen)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      active ? 'bg-blue-50 text-blue-600' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </div>
                    <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${channelsOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {channelsOpen && (
                    <div className="pl-9 space-y-1">
                      {item.subItems.map((sub) => (
                        <Link
                          key={sub.path}
                          to={sub.path}
                          className={`block px-3 py-2 rounded-md text-xs font-medium transition-colors ${
                            location.pathname === sub.path
                              ? 'bg-blue-100/70 text-blue-700 font-semibold'
                              : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                          }`}
                        >
                          {sub.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${active ? 'bg-white/20 text-white' : 'bg-indigo-100 text-indigo-700'}`}>
                    {item.badge}
                  </span>
                )}
                {item.badgeCount && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500 text-white">
                    {item.badgeCount}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        {/* Upgrade Card & Bottom Actions */}
        <div className="p-3 border-t border-slate-100 space-y-3">
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-4 h-4 text-amber-500 fill-amber-500" />
              <span className="text-xs font-bold text-slate-800">Upgrade to Pro</span>
            </div>
            <p className="text-[11px] text-slate-500 mb-2 leading-relaxed">Unlock advanced AI features, unlimited channels & automation.</p>
            <Link
              to="/settings"
              className="block w-full text-center bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-1.5 rounded-lg shadow-sm transition-colors"
            >
              Upgrade Now
            </Link>
          </div>

          <div className="space-y-1">
            <Link
              to="/help"
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            >
              <HelpCircle className="w-4 h-4" />
              <span>Help & Support</span>
            </Link>
            <button
              onClick={() => navigate('/login')}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium text-rose-600 hover:bg-rose-50 transition-colors text-left"
            >
              <LogOut className="w-4 h-4" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 pl-64 flex flex-col min-w-0">
        {/* Top Navbar */}
        <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between sticky top-0 z-20">
          {/* Search Bar */}
          <div className="relative w-96">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search products, orders, customers..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          {/* Top Right Controls */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600">
              <span>📅 22 Sep 2026 - 28 Sep 2026</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </div>

            {/* Notifications Popover Toggle */}
            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="w-9 h-9 rounded-lg border border-slate-200 hover:bg-slate-50 flex items-center justify-center relative text-slate-600"
              >
                <Bell className="w-4 h-4" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full"></span>
              </button>

              {/* Notifications Popover */}
              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-slate-200 p-4 z-40 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="font-semibold text-xs text-slate-900">Notifications (3)</span>
                    <button onClick={() => setShowNotifications(false)} className="text-slate-400 hover:text-slate-600">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {mockNotifications.map((n) => (
                      <div key={n.id} className="p-2 bg-slate-50 rounded-lg text-xs border border-slate-100">
                        <div className="font-semibold text-slate-800">{n.title}</div>
                        <div className="text-slate-500 text-[11px] mt-0.5">{n.text}</div>
                        <span className="text-[10px] text-slate-400 block mt-1">{n.time}</span>
                      </div>
                    ))}
                  </div>
                  <Link
                    to="/notifications"
                    onClick={() => setShowNotifications(false)}
                    className="block text-center text-xs text-blue-600 font-semibold hover:underline pt-1"
                  >
                    View all notifications
                  </Link>
                </div>
              )}
            </div>

            {/* Quick Add Product Button */}
            <Link
              to="/products/new"
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-2 rounded-lg shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Add Product</span>
            </Link>

            {/* User Profile Menu */}
            <div className="relative">
              <button
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="flex items-center gap-2 pl-2 hover:opacity-80 transition-opacity"
              >
                <div className="w-9 h-9 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center">
                  PR
                </div>
                <div className="text-left hidden md:block">
                  <span className="font-semibold text-xs text-slate-800 block leading-none">Prince Raj</span>
                  <span className="text-[10px] text-slate-400 font-medium block mt-0.5">Seller Account</span>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {/* Profile Dropdown Popover */}
              {showProfileMenu && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-200 py-2 z-40">
                  <div className="px-4 py-2 border-b border-slate-100">
                    <p className="font-bold text-xs text-slate-900">Prince Raj</p>
                    <p className="text-[11px] text-slate-500">prince@seller.com</p>
                  </div>
                  <Link
                    to="/settings"
                    onClick={() => setShowProfileMenu(false)}
                    className="flex items-center gap-2 px-4 py-2 text-xs text-slate-700 hover:bg-slate-50"
                  >
                    <User className="w-4 h-4 text-slate-400" />
                    <span>Profile & Account</span>
                  </Link>
                  <Link
                    to="/settings"
                    onClick={() => setShowProfileMenu(false)}
                    className="flex items-center gap-2 px-4 py-2 text-xs text-slate-700 hover:bg-slate-50"
                  >
                    <CreditCard className="w-4 h-4 text-slate-400" />
                    <span>Billing & Plans</span>
                  </Link>
                  <div className="border-t border-slate-100 mt-1 pt-1">
                    <button
                      onClick={() => navigate('/login')}
                      className="w-full flex items-center gap-2 px-4 py-2 text-xs text-rose-600 font-medium hover:bg-rose-50 text-left"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Logout Account</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Nested Route Page Outlet */}
        <main className="flex-1 p-6 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
