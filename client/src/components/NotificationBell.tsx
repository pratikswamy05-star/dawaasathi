import { Bell } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import { dateTimeOf } from '../lib/format';
import { showNotification } from '../lib/speech';
import type { Notification } from '../types';

/** In-app notifications (polled) + a browser notification for anything new. */
export default function NotificationBell() {
  const { data, reload } = useApi<{ notifications: Notification[]; unread: number }>('/notifications', { poll: 30_000 });
  const [open, setOpen] = useState(false);
  const seen = useRef<number | null>(null);

  useEffect(() => {
    if (!data) return;
    const newest = data.notifications[0];
    if (seen.current !== null && newest && newest.id > seen.current && !newest.read_at) void showNotification(newest.title, newest.body);
    seen.current = newest?.id ?? 0;
  }, [data]);

  const markAll = async () => {
    await api('/notifications/read-all', { method: 'POST' }).catch(() => undefined);
    void reload();
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-12 w-12 items-center justify-center rounded-xl hover:bg-navy-50"
        aria-label={`Notifications${data?.unread ? `, ${data.unread} unread` : ''}`}
        aria-expanded={open}
      >
        <Bell aria-hidden />
        {!!data?.unread && (
          <span className="absolute right-1 top-1 min-w-[20px] rounded-full bg-bad-600 px-1 text-center text-xs font-bold text-white">{data.unread}</span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 max-w-[90vw] rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b p-3">
            <p className="font-bold">Notifications</p>
            <button className="text-sm font-semibold text-navy-600 hover:underline" onClick={markAll}>
              Mark all read
            </button>
          </div>
          <ul className="max-h-96 divide-y overflow-y-auto">
            {!data?.notifications.length && <li className="p-4 text-slate-500">No notifications yet</li>}
            {data?.notifications.map((n) => (
              <li key={n.id} className={`p-3 ${n.read_at ? '' : 'bg-navy-50'}`}>
                <p className="font-semibold">{n.title}</p>
                <p className="text-sm text-slate-700">{n.body}</p>
                <p className="mt-1 text-xs text-slate-500">{dateTimeOf(n.created_at)}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
