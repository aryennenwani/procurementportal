import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, ClipboardList, Users, Archive, ShieldAlert, ScrollText,
  Menu, X, LogOut, UserCog, ChevronLeft, KeyRound, Package,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Button, Input } from './Common';
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm">
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
      </div>
    </div>
  );
}

export default function DashboardLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showChangePwd, setShowChangePwd] = useState(false);
  const { manager, logout, isAdmin, isFactoryManager, hasPermission } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const NAV_ITEMS = [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/dashboard/requirements', label: 'Requirements', icon: ClipboardList },
    ...(isFactoryManager ? [] : [{ to: '/dashboard/vendors', label: 'Vendors', icon: Users }]),
    { to: '/dashboard/archive', label: 'Proposal Archive', icon: Archive },
    ...(hasPermission('view_compliance') ? [{ to: '/dashboard/compliance', label: 'Compliance', icon: ShieldAlert }] : []),
    ...(hasPermission('view_audit') ? [{ to: '/dashboard/audit-log', label: 'Audit Log', icon: ScrollText }] : []),
    ...(isAdmin ? [{ to: '/dashboard/items', label: 'Item Master', icon: Package }] : []),
    ...(isAdmin ? [{ to: '/dashboard/managers', label: 'Managers', icon: UserCog }] : []),
  ];

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
          <div className="w-9 h-9 rounded-lg bg-white/15 flex items-center justify-center overflow-hidden">
            <img src="/shivtek-logo.png" alt="Shivtek Spechemi" className="w-7 h-7 object-contain" />
          </div>
        ) : (
          <div className="flex items-center gap-2.5">
            <img src="/shivtek-logo.png" alt="Shivtek Spechemi" className="w-9 h-9 object-contain shrink-0" />
            <div>
              <p className="text-white font-bold text-base leading-tight tracking-tight">Shivtek Spechemi</p>
              <p className="text-blue-200/70 text-xs mt-0.5 font-medium">Procurement Portal</p>
            </div>
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
          onClick={() => setShowChangePwd(true)}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-blue-100/70 hover:bg-white/10 hover:text-white transition-colors"
          title="Change password"
        >
          <KeyRound size={17} />
          {!collapsed && <span>Change password</span>}
        </button>
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
          <div className="flex items-center gap-2">
            <img src="/shivtek-logo.png" alt="Shivtek Spechemi" className="w-6 h-6 object-contain" />
            <p className="font-bold text-[#0B2D71] text-sm">Shivtek Spechemi</p>
          </div>
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

      {showChangePwd && <ChangePasswordModal onClose={() => setShowChangePwd(false)} />}
    </div>
  );
}
