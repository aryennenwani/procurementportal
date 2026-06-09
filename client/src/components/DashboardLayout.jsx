import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, ClipboardList, Users, Archive, ShieldAlert, ScrollText,
  Menu, X, LogOut, UserCog, ChevronLeft,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import NotificationBell from './NotificationBell';

const BASE_NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/dashboard/requirements', label: 'Requirements', icon: ClipboardList },
  { to: '/dashboard/vendors', label: 'Vendors', icon: Users },
  { to: '/dashboard/archive', label: 'Proposal Archive', icon: Archive },
  { to: '/dashboard/compliance', label: 'Compliance', icon: ShieldAlert },
  { to: '/dashboard/audit-log', label: 'Audit Log', icon: ScrollText },
];

const ADMIN_NAV_ITEMS = [
  { to: '/dashboard/managers', label: 'Managers', icon: UserCog },
];

export default function DashboardLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { manager, logout, isAdmin } = useAuth();
  const NAV_ITEMS = isAdmin ? [...BASE_NAV_ITEMS, ...ADMIN_NAV_ITEMS] : BASE_NAV_ITEMS;
  const toast = useToast();
  const navigate = useNavigate();

  const onLogout = () => {
    logout();
    toast.info('You have been signed out.');
    navigate('/login');
  };

  const linkClasses = ({ isActive }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
      isActive
        ? 'bg-white/15 text-white shadow-sm'
        : 'text-blue-100/80 hover:bg-white/10 hover:text-white'
    }`;

  const SidebarContent = () => (
    <>
      {/* Brand */}
      <div className={`px-4 mb-7 ${collapsed ? 'flex justify-center' : ''}`}>
        {collapsed ? (
          <div className="w-9 h-9 rounded-lg bg-white/15 flex items-center justify-center">
            <span className="text-white font-black text-sm">S</span>
          </div>
        ) : (
          <div>
            <p className="text-white font-bold text-base leading-tight tracking-tight">Shivtek Spechemi</p>
            <p className="text-blue-200/70 text-xs mt-0.5 font-medium">Procurement Portal</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 px-2">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={linkClasses}
            onClick={() => setMobileOpen(false)}
          >
            <item.icon size={17} className="shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-2 mt-4 border-t border-white/10 pt-4 space-y-1">
        {!collapsed && (
          <div className="px-3 mb-1">
            <p className="text-white text-sm font-semibold truncate">{manager?.name}</p>
            <p className="text-blue-200/60 text-xs truncate">{manager?.email}</p>
          </div>
        )}
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-blue-100/70 hover:bg-white/10 hover:text-white transition-colors"
        >
          <LogOut size={17} />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-[#F5F8FF] flex">
      {/* Desktop sidebar */}
      <aside
        className={`hidden md:flex flex-col bg-[#0B2D71] transition-all duration-200 ${collapsed ? 'w-[68px]' : 'w-60'} py-5 shrink-0 relative`}
      >
        <SidebarContent />
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="absolute -right-3 top-8 w-6 h-6 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center text-gray-400 hover:text-[#0B2D71] transition-colors z-10"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <ChevronLeft size={13} className={`transition-transform ${collapsed ? 'rotate-180' : ''}`} />
        </button>
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-60 bg-[#0B2D71] py-5 flex flex-col shadow-2xl">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-4 text-blue-200/70 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
            <SidebarContent />
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 shadow-sm">
          <button onClick={() => setMobileOpen(true)} className="text-[#0B2D71]">
            <Menu size={22} />
          </button>
          <p className="font-bold text-[#0B2D71] text-sm">Shivtek Spechemi</p>
          <NotificationBell />
        </header>

        {/* Desktop top bar */}
        <div className="hidden md:flex items-center justify-end px-6 lg:px-8 py-3 bg-white border-b border-gray-100 shadow-sm">
          <NotificationBell />
        </div>

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
