import { FastForward, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { api, errorText } from '../api/client';
import { useApi } from '../hooks/useApi';
import { timeOf } from '../lib/format';
import { toast } from '../store/toast';

interface Health {
  demoMode: boolean;
  serverTime: string;
  clockOffsetMinutes: number;
}

/** Demo-only: move the server clock forward to show reminders → missed → caregiver/ASHA alerts live. */
export default function DemoPanel() {
  const { data, reload } = useApi<Health>('/health', { poll: 30_000 });
  const [open, setOpen] = useState(false);
  if (!data?.demoMode) return null;

  const call = async (path: string, body?: unknown) => {
    try {
      await api(path, { method: 'POST', body });
      await reload();
      window.dispatchEvent(new Event('data-synced'));
      toast.info('Demo clock updated');
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  return (
    <div className="fixed bottom-24 left-4 z-30 md:bottom-6">
      {open ? (
        <div className="w-64 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
          <p className="font-bold">Demo clock</p>
          <p className="text-sm text-slate-600">
            Server time {timeOf(data.serverTime)} {data.clockOffsetMinutes ? `(+${data.clockOffsetMinutes} min)` : ''}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {[10, 30, 60, 180].map((m) => (
              <button key={m} onClick={() => call('/demo/advance', { minutes: m })} className="flex min-h-[44px] items-center justify-center gap-1 rounded-lg border border-slate-300 font-semibold hover:bg-navy-50">
                <FastForward className="h-4 w-4" aria-hidden /> +{m >= 60 ? `${m / 60}h` : `${m}m`}
              </button>
            ))}
          </div>
          <button onClick={() => call('/demo/reset-clock')} className="mt-2 flex min-h-[44px] w-full items-center justify-center gap-1 rounded-lg border border-slate-300 font-semibold hover:bg-navy-50">
            <RotateCcw className="h-4 w-4" aria-hidden /> Reset to real time
          </button>
          <button onClick={() => setOpen(false)} className="mt-2 w-full text-sm text-slate-500 hover:underline">
            Hide
          </button>
        </div>
      ) : (
        <button onClick={() => setOpen(true)} className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold shadow">
          🎭 Demo
        </button>
      )}
    </div>
  );
}
