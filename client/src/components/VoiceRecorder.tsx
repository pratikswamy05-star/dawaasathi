import { Mic, Square, Trash2, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api, errorText } from '../api/client';
import { toast } from '../store/toast';
import { Button } from './ui';

const MAX_SECONDS = 30;

const blobToBase64 = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(new Error('Could not read the recording'));
    r.readAsDataURL(b);
  });

/** Record a short voice reminder (max 30 s) in the browser and upload it. */
export default function VoiceRecorder({
  patientId,
  prescriptionId,
  language,
  hint,
  onSaved,
}: {
  patientId: number;
  prescriptionId: number | null;
  language?: string;
  hint: string;
  onSaved: () => void;
}) {
  const [state, setState] = useState<'idle' | 'recording' | 'recorded'>('idle');
  const [seconds, setSeconds] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const rec = useRef<MediaRecorder | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const started = useRef(0);
  const supported = typeof window !== 'undefined' && 'MediaRecorder' in window && !!navigator.mediaDevices?.getUserMedia;

  useEffect(
    () => () => {
      if (tick.current) clearInterval(tick.current);
      rec.current?.stream.getTracks().forEach((tr) => tr.stop());
      if (url) URL.revokeObjectURL(url);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const stop = () => {
    if (rec.current && rec.current.state !== 'inactive') rec.current.stop();
    if (tick.current) clearInterval(tick.current);
  };

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const preferred = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find((m) => MediaRecorder.isTypeSupported?.(m));
      const r = new MediaRecorder(stream, preferred ? { mimeType: preferred, audioBitsPerSecond: 32000 } : undefined);
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop());
        const b = new Blob(chunks, { type: r.mimeType || preferred || 'audio/webm' });
        setBlob(b);
        setUrl(URL.createObjectURL(b));
        setSeconds(Math.max(1, Math.round((Date.now() - started.current) / 1000)));
        setState('recorded');
      };
      rec.current = r;
      started.current = Date.now();
      r.start();
      setSeconds(0);
      setState('recording');
      tick.current = setInterval(() => {
        const s = Math.round((Date.now() - started.current) / 1000);
        setSeconds(s);
        if (s >= MAX_SECONDS) stop();
      }, 250);
    } catch {
      toast.error('Microphone permission is needed to record. Allow the microphone in the browser and try again.');
    }
  };

  const discard = () => {
    if (url) URL.revokeObjectURL(url);
    setBlob(null);
    setUrl(null);
    setState('idle');
  };

  const save = async () => {
    if (!blob) return;
    setSaving(true);
    try {
      const audio = await blobToBase64(blob);
      await api(`/patients/${patientId}/reminders/voice`, {
        method: 'POST',
        body: { prescriptionId, language, audio, mime: (blob.type || 'audio/webm').replace(/\s+/g, ''), durationSec: Math.min(60, Math.max(1, seconds)) },
      });
      toast.success('Voice reminder saved. It will play at medicine time.');
      discard();
      onSaved();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  if (!supported) return <p className="text-sm text-warn-700">Recording is not supported in this browser. Use Chrome or Edge.</p>;

  return (
    <div className="rounded-xl border border-dashed border-slate-300 p-3">
      <p className="mb-2 text-sm text-slate-600">💡 {hint}</p>
      {state === 'idle' && (
        <Button variant="secondary" onClick={start}>
          <Mic className="h-5 w-5 text-bad-600" aria-hidden /> Record voice message
        </Button>
      )}
      {state === 'recording' && (
        <div className="flex flex-wrap items-center gap-3" role="status">
          <span className="flex items-center gap-2 font-bold text-bad-700">
            <span className="h-3 w-3 animate-pulse rounded-full bg-bad-600" aria-hidden /> Recording… {seconds}s / {MAX_SECONDS}s
          </span>
          <Button variant="danger" onClick={stop}>
            <Square className="h-4 w-4" aria-hidden /> Stop
          </Button>
        </div>
      )}
      {state === 'recorded' && url && (
        <div className="space-y-2">
          <audio src={url} controls className="w-full" />
          <div className="flex flex-wrap gap-2">
            <Button onClick={save} loading={saving}>
              <Upload className="h-4 w-4" aria-hidden /> Save ({seconds}s)
            </Button>
            <Button variant="ghost" onClick={discard} disabled={saving}>
              <Trash2 className="h-4 w-4" aria-hidden /> Record again
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
