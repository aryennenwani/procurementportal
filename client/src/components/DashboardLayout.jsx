import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, ClipboardList, Users, Archive, ShieldAlert, ScrollText,
  Menu, X, LogOut, UserCog, ChevronLeft, KeyRound, Package, FileCheck2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Button, Input, Modal } from './Common';
import NotificationBell from './NotificationBell';
import api, { apiErrorMessage } from '../api/client';

function ChangePasswordModal({ onClose }) {
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setErrors({});
    if (form.new_password !== form.confirm_password) {
      setErrors({ confirm_password: 'Passwords do not match.' });
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/auth/change-password', {
        current_password: form.current_password,
        new_password: form.new_password,
      });
      toast.success('Password changed successfully.');
      onClose();
    } catch (err) {
      if (err.response?.status === 400 && err.response.data?.details) {
        const fieldErrors = {};
        err.response.data.details.forEach((d) => { fieldErrors[d.path] = d.msg; });
        setErrors(fieldErrors);
      } else {
        toast.error(apiErrorMessage(err, 'Could not change password.'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal onClose={onClose} className="w-full max-w-sm">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <h2 className="font-semibold text-[#1E2B4A] text-lg">Change password</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
      </div>
      <form onSubmit={onSubmit} className="p-6 space-y-4">
        <Input
          label="Current password"
          type="password"
          required
          value={form.current_password}
          onChange={set('current_password')}
          error={errors.current_password}
          placeholder="Enter current password"
        />
        <Input
          label="New password"
          type="password"
          required
          value={form.new_password}
          onChange={set('new_password')}
          error={errors.new_password}
          placeholder="Minimum 8 characters"
        />
        <Input
          label="Confirm new password"
          type="password"
          required
          value={form.confirm_password}
          onChange={set('confirm_password')}
          error={errors.confirm_password}
          placeholder="Repeat new password"
        />
        <div className="flex justify-end gap-3 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="gold" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save password'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function initials(name = '') {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
}

export default function DashboardLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showChangePwd, setShowChangePwd] = useState(false);
  const { manager, logout, isAdmin, isFactoryManager, hasPermission } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const NAV_SECTIONS = [
    {
      label: 'Operations',
      items: [
        { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, end: true },
        { to: '/dashboard/requirements', label: 'Requirements', icon: ClipboardList },
        ...(isFactoryManager ? [] : [
          { to: '/dashboard/vendors', label: 'Vendors', icon: Users },
          { to: '/dashboard/purchase-orders', label: 'Purchase Orders', icon: FileCheck2 },
        ]),
        { to: '/dashboard/archive', label: 'Proposal Archive', icon: Archive },
      ],
    },
    {
      label: 'Governance',
      items: [
        ...(hasPermission('view_compliance') ? [{ to: '/dashboard/compliance', label: 'Compliance', icon: ShieldAlert }] : []),
        ...(hasPermission('view_audit') ? [{ to: '/dashboard/audit-log', label: 'Audit Log', icon: ScrollText }] : []),
      ],
    },
    {
      label: 'Administration',
      items: [
        ...(isAdmin ? [{ to: '/dashboard/items', label: 'Item Master', icon: Package }] : []),
        ...(isAdmin ? [{ to: '/dashboard/managers', label: 'Managers', icon: UserCog }] : []),
      ],
    },
  ].filter((s) => s.items.length > 0);

  const PAGE_TITLES = [
    ['/dashboard/requirements', 'Requirements'],
    ['/dashboard/vendors', 'Vendors'],
    ['/dashboard/purchase-orders', 'Purchase Orders'],
    ['/dashboard/archive', 'Proposal Archive'],
    ['/dashboard/compliance', 'Compliance'],
    ['/dashboard/audit-log', 'Audit Log'],
    ['/dashboard/items', 'Item Master'],
    ['/dashboard/managers', 'Managers'],
  ];
  const pageTitle = PAGE_TITLES.find(([prefix]) => location.pathname.startsWith(prefix))?.[1] || 'Dashboard';
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const onLogout = () => {
    logout();
    toast.info('You have been signed out.');
    navigate('/login');
  };

  const linkClasses = ({ isActive }) =>
    `group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
      isActive
        ? 'bg-white/[0.13] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
        : 'text-blue-100/70 hover:bg-white/[0.07] hover:text-white'
    }`;

  const SidebarContent = () => (
    <>
      {/* Brand */}
      <div className={`px-4 mb-6 ${collapsed ? 'flex justify-center' : ''}`}>
        {collapsed ? (
          <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center overflow-hidden p-1 shadow-lg shadow-black/20">
            <img src="/shivtek-icon.png" alt="Shivtek Spechemi" className="w-full h-full object-contain" />
          </div>
        ) : (
          <div>
            <div className="bg-white rounded-lg px-3 py-2 inline-block shadow-lg shadow-black/20">
              <img src="/shivtek-logo.png" alt="Shivtek Spechemi Industries Ltd" className="h-9 object-contain" />
            </div>
            <p className="text-blue-200/60 text-[11px] mt-2 font-semibold tracking-[0.14em] uppercase">Procurement Portal</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 space-y-4 overflow-y-auto">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            {!collapsed && (
              <p className="px-3 mb-1.5 text-[10px] font-bold tracking-[0.16em] uppercase text-blue-200/40">
                {section.label}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={linkClasses}
                  onClick={() => setMobileOpen(false)}
                  title={collapsed ? item.label : undefined}
                >
                  {({ isActive }) => (
                    <>
                      {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-gradient-to-b from-[#7EA6FF] to-[#4D7EF2]" />}
                      <item.icon size={17} className="shrink-0" />
                      {!collapsed && <span>{item.label}</span>}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-2 mt-4 border-t border-white/10 pt-3 space-y-0.5">
        {!collapsed && (
          <div className="flex items-center gap-2.5 px-3 py-2 mb-1">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#4D7EF2] to-[#1A56D6] flex items-center justify-center text-white text-xs font-bold shrink-0 ring-2 ring-white/10">
              {initials(manager?.name)}
            </div>
            <div className="min-w-0">
              <p className="text-white text-sm font-semibold truncate leading-tight">{manager?.name}</p>
              <p className="text-blue-200/50 text-[11px] truncate">{manager?.email}</p>
            </div>
          </div>
        )}
        <button
          onClick={() => setShowChangePwd(true)}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-blue-100/60 hover:bg-white/[0.07] hover:text-white transition-colors"
          title="Change password"
        >
          <KeyRound size={16} />
          {!collapsed && <span>Change password</span>}
        </button>
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-blue-100/60 hover:bg-white/[0.07] hover:text-white transition-colors"
          title="Sign out"
        >
          <LogOut size={16} />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex">
      {/* Desktop sidebar */}
      <aside
        className={`hidden md:flex flex-col sidebar-gradient transition-all duration-200 ${collapsed ? 'w-[68px]' : 'w-[248px]'} py-5 shrink-0 relative shadow-[4px_0_24px_-12px_rgba(7,22,64,0.5)]`}
      >
        <SidebarContent />
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="absolute -right-3 top-8 w-6 h-6 rounded-full bg-white border border-gray-200 shadow-md flex items-center justify-center text-gray-400 hover:text-[#0B2D71] hover:border-[#1A56D6]/40 transition-colors z-10"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <ChevronLeft size={13} className={`transition-transform duration-200 ${collapsed ? 'rotate-180' : ''}`} />
        </button>
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-[#0A1A3F]/60 backdrop-blur-[2px] animate-fade-in" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-[248px] sidebar-gradient py-5 flex flex-col shadow-2xl">
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
        <header className="md:hidden flex items-center justify-between px-4 py-3 bg-white/90 backdrop-blur border-b border-[#E3EAF7] shadow-sm sticky top-0 z-30">
          <button onClick={() => setMobileOpen(true)} className="text-[#0B2D71]">
            <Menu size={22} />
          </button>
          <div className="flex items-center gap-2">
            <img src="/shivtek-icon.png" alt="Shivtek Spechemi" className="w-6 h-6 object-contain" />
            <p className="font-bold text-[#0B2D71] text-sm">Shivtek Spechemi</p>
          </div>
          <NotificationBell />
        </header>

        {/* Desktop top bar */}
        <div className="hidden md:flex items-center justify-between px-6 lg:px-8 py-3 bg-white/80 backdrop-blur border-b border-[#E3EAF7] sticky top-0 z-30">
          <div>
            <p className="text-sm font-bold text-[#101C3B] leading-tight">{pageTitle}</p>
            <p className="text-[11px] text-[#8A97B5]">{today}</p>
          </div>
          <NotificationBell />
        </div>

        <main className="flex-1 overflow-y-auto">
          <div key={location.pathname} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 animate-page-in">
            <Outlet />
          </div>
        </main>
      </div>

      {showChangePwd && <ChangePasswordModal onClose={() => setShowChangePwd(false)} />}
    </div>
  );
}
