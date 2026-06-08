import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
import api from '../api/client';

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const ref = useRef(null);

  const load = async () => {
    try {
      const { data } = await api.get('/notifications');
      setNotifications(data.notifications);
      setUnreadCount(data.unread_count);
    } catch {
      /* notifications are non-critical; fail silently */
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const onOpen = () => {
    setOpen((o) => !o);
  };

  const markAllRead = async () => {
    try {
      await api.post('/notifications/mark-all-read');
      setNotifications((list) => list.map((n) => ({ ...n, read: 1 })));
      setUnreadCount(0);
    } catch {
      /* non-critical */
    }
  };

  const markRead = async (n) => {
    if (n.read) return;
    try {
      await api.patch(`/notifications/${n.id}/read`);
      setNotifications((list) => list.map((x) => (x.id === n.id ? { ...x, read: 1 } : x)));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      /* non-critical */
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={onOpen}
        className="relative p-2 rounded-lg text-gray-500 hover:text-[#1C1C1E] hover:bg-gray-100 transition-colors"
        aria-label="Notifications"
      >
        <Bell size={19} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-600 text-white text-[10px] font-semibold flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-[28rem] overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-lg z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <p className="font-semibold text-[#1C1C1E] text-sm">Notifications</p>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs font-medium text-[#B8962E] hover:text-[#8f7322]">
                Mark all as read
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">You're all caught up.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {notifications.map((n) => {
                const content = (
                  <div
                    onClick={() => markRead(n)}
                    className={`px-4 py-3 text-sm cursor-pointer transition-colors ${n.read ? 'bg-white' : 'bg-[#B8962E]/5'} hover:bg-gray-50`}
                  >
                    <div className="flex items-start gap-2">
                      {!n.read && <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#B8962E] shrink-0" />}
                      <div className="min-w-0">
                        <p className={`text-[#1C1C1E] ${n.read ? '' : 'font-medium'}`}>{n.title}</p>
                        <p className="text-gray-500 text-xs mt-0.5">{n.body}</p>
                        <p className="text-gray-400 text-[11px] mt-1">{n.created_at_ist}</p>
                      </div>
                    </div>
                  </div>
                );
                return n.target_type === 'requirement' && n.target_id ? (
                  <Link key={n.id} to={`/dashboard/requirements/${n.target_id}`} onClick={() => setOpen(false)}>
                    {content}
                  </Link>
                ) : (
                  <div key={n.id}>{content}</div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
