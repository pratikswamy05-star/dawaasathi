import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useEffect } from 'react';
import { toast, useToasts } from '../store/toast';

export default function Toaster() {
  const { toasts, dismiss } = useToasts();
  // Speech helpers announce when a language has no voice on this device (instead of staying silent).
  useEffect(() => {
    const onMissing = (e: Event) =>
      toast.info(`🔇 No ${(e as CustomEvent<string>).detail} voice on this browser — the text is shown on screen. Open the app in Microsoft Edge for Indian-language voices.`);
    window.addEventListener('voice-missing', onMissing);
    return () => window.removeEventListener('voice-missing', onMissing);
  }, []);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.kind === 'error' ? 'alert' : 'status'}
          className={`animate-slide-down pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border p-4 shadow-lift backdrop-blur ${
            t.kind === 'success' ? 'border-ok-600/30 bg-ok-50 text-ok-700' : t.kind === 'error' ? 'border-bad-600/30 bg-bad-50 text-bad-700' : 'border-navy-600/20 bg-navy-50 text-navy-800'
          }`}
        >
          {t.kind === 'success' ? <CheckCircle2 aria-hidden /> : t.kind === 'error' ? <XCircle aria-hidden /> : <Info aria-hidden />}
          <p className="flex-1 font-semibold">{t.text}</p>
          <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="rounded p-1 hover:bg-black/5">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}
