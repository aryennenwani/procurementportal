import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, ClipboardList, Users, Archive, ShieldAlert, ScrollText,
  Menu, X, LogOut, ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import NotificationBell from './NotificationBell';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/dashboard/requirements', label: 'Requirements', icon: ClipboardList },
  { to: '/dashboard/vendors', label: 'Vendors', icon: Users },
  { to: '/dashboard/archive', label: 'Proposal Archive', icon: Archive },
  { to: '/dashboard/compliance', label: 'Compliance', icon: ShieldAlert },
  { to: '/dashboard/audit-log', label: 'Audit Log', icon: ScrollText },
];

export default function DashboardLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { manager, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const onLogout = () => {
    logout();
    toast.info('You have been signed out.');
    navigate('/login');
  };

  const linkClasses = ({ isActive }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
      isActive ? 'bg-[#B8962E]/15 text-[#B8962E]' : 'text-gray-300 hover:bg-white/5 hover:text-white'
    }`;

  const SidebarContent = () => (
    <>
      <div className={`flex items-center gap-2.5 px-3 mb-6 ${collapsed ? 'justify-center' : ''}`}>
        <div className="w-9 h-9 rounded-lg bg-[#B8962E]/15 flex items-center justify-center shrink-0">
          <ShieldCheck className="text-[#B8962E]" size={18} />
        </div>
        {!collapsed && (
          <div className="leading-tight">
            <p className="text-white font-semibold text-sm">Procurement</p>
            <p className="text-gray-400 text-xs">Manager Portal</p>
          </div>
        )}
      </div>
      <nav className="flex-1 space-y-1 px-2">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={linkClasses} onClick={() => setMobileOpen(false)}>
            <item.icon size={18} className="shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>
      <div className="px-2 mt-4 border-t border-white/10 pt-4">
        {!collapsed && (
          <div className="px-3 mb-2">
            <p className="text-white text-sm font-medium truncate">{manager?.name}</p>
            <p className="text-gray-400 text-xs truncate">{manager?.email}</p>
          </div>
        )}
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
        >
          <LogOut size={18} />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Desktop sidebar */}
      <aside className={`hidden md:flex flex-col bg-[#1C1C1E] transition-all duration-200 ${collapsed ? 'w-[76px]' : 'w-64'} py-5 shrink-0`}>
        <SidebarContent />
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="mx-2 mt-3 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
        >
          <Menu size={16} />
          {!collapsed && <span>Collapse</span>}
        </button>
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-[#1C1C1E] py-5 flex flex-col">
            <button onClick={() => setMobileOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white">
              <X size={20} />
            </button>
            <SidebarContent />
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200">
          <button onClick={() => setMobileOpen(true)} className="text-[#1C1C1E]">
            <Menu size={22} />
          </button>
          <p className="font-semibold text-[#1C1C1E]">Procurement Portal</p>
          <NotificationBell />
        </header>
        <div className="hidden md:flex items-center justify-end px-6 lg:px-8 py-3 bg-white border-b border-gray-200">
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
