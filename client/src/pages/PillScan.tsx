import { Camera, Keyboard, ScanLine, Sparkles, Volume2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { api, errorText } from '../api/client';
import { Badge, Button, Card, EmptyState, PageHeader } from '../components/ui';
import { useApi } from '../hooks/useApi';
import { useT } from '../i18n';
import { speak } from '../lib/speech';
import { useAuth } from '../store/auth';
import type { PatientSummary, ScanResult } from '../types';

/* Tesseract.js (free, open-source OCR) is loaded from a CDN only when needed — no install, no API key. */
type TesseractGlobal = {
  recognize: (img: HTMLCanvasElement | string, lang: string, opts?: { logger?: (m: { status: string; progress: number }) => void }) => Promise<{ data: { text: string } }>;
};
declare global {
  interface Window {
    Tesseract?: TesseractGlobal;
  }
}
const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';

function loadTesseract(): Promise<TesseractGlobal> {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = TESSERACT_URL;
    s.async = true;
    s.onload = () => (window.Tesseract ? resolve(window.Tesseract) : reject(new Error('OCR did not load')));
    s.onerror = () => reject(new Error('Could not load the text reader. Check the internet, or type the name instead.'));
    document.head.appendChild(s);
  });
}

/** Shrink big camera photos (faster OCR) and boost contrast with greyscale. */
function prepareImage(file: File): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      const ctx = c.getContext('2d')!;
      ctx.filter = 'grayscale(1) contrast(1.4)';
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c);
    };
    img.onerror = () => reject(new Error('Could not open this photo'));
    img.src = URL.createObjectURL(file);
  });
}

const SAMPLES = ['GLYCOMET 500\nMetformin Hydrochloride Tablets IP 500 mg', 'TELMA-AM\nTelmisartan & Amlodipine Tablets 40/5', 'Ecosprin 75 Aspirin Gastro-resistant Tablets IP 75 mg'];

const STATUS: Record<ScanResult['status'], { tone: 'green' | 'red' | 'amber' | 'slate'; text: string }> = {
  prescribed: { tone: 'green', text: '✅ On your prescription' },
  duplicate: { tone: 'red', text: '⛔ Same medicine already prescribed' },
  not_prescribed: { tone: 'amber', text: '⚠️ Not on the prescription' },
  unknown: { tone: 'slate', text: 'Medicine found' },
};

export default function PillScan() {
  const { t, lang } = useT();
  const role = useAuth((s) => s.user!.role);
  const { data: pts } = useApi<{ patients: PatientSummary[] }>(role === 'patient' ? null : '/patients');
  const [patientId, setPatientId] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<ScanResult[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const match = async (raw: string) => {
    setErr(null);
    if (!raw.trim()) return setErr('No text found. Try a closer, brighter photo, or type the name.');
    try {
      const r = await api<{ results: ScanResult[] }>('/scan/match', { method: 'POST', body: { text: raw, patientId: patientId ? Number(patientId) : undefined } });
      setResults(r.results);
      if (role === 'patient')
        speak(r.results.length ? `${r.results[0].name}. ${STATUS[r.results[0].status].text.replace(/[^\p{L}\p{N}\s]/gu, '')}. ${r.results[0].note}` : 'Medicine not recognised. Please ask your ASHA worker.', lang);
    } catch (e) {
      setErr(errorText(e));
    }
  };

  const onPhoto = async (file: File | undefined) => {
    if (!file) return;
    setErr(null);
    setResults(null);
    setPreview(URL.createObjectURL(file));
    setBusy(true);
    setProgress(0);
    try {
      setStatus('Loading text reader…');
      const T = await loadTesseract();
      const canvas = await prepareImage(file);
      setStatus('Reading the strip…');
      const r = await T.recognize(canvas, 'eng', {
        logger: (m) => {
          if (m.status === 'recognizing text') setProgress(Math.round(m.progress * 100));
        },
      });
      const found = r.data.text.trim();
      setText(found);
      setStatus(null);
      await match(found);
    } catch (e) {
      setStatus(null);
      setErr(errorText(e));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title={`📷 ${t('scanMedicine')}`} subtitle={t('scanHelp')} />

      {role !== 'patient' && (
        <Card>
          <label className="block">
            <span className="label">Check against this patient's prescriptions (optional)</span>
            <select className="input" value={patientId} onChange={(e) => setPatientId(e.target.value)}>
              <option value="">— No patient —</option>
              {pts?.patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </Card>
      )}

      <Card>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void onPhoto(e.target.files?.[0])} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Button size="xl" onClick={() => fileRef.current?.click()} loading={busy}>
            <Camera aria-hidden /> Take / choose photo
          </Button>
          <Button size="xl" variant="secondary" disabled={busy} onClick={() => void match(text)}>
            <Keyboard aria-hidden /> Check typed name
          </Button>
        </div>
        {status && (
          <div className="mt-4" role="status">
            <p className="font-semibold">{status}</p>
            <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-slate-200">
              <div className="h-full bg-navy-600 transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
        {preview && <img src={preview} alt="Medicine photo" className="mt-4 max-h-56 rounded-xl border object-contain" />}
        <label className="mt-4 block">
          <span className="label">Text read from the strip (you can correct it or type the name)</span>
          <textarea className="input min-h-[90px] py-3" value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Glycomet 500" />
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1 text-sm font-semibold text-slate-500">
            <Sparkles className="h-4 w-4" aria-hidden /> Demo samples:
          </span>
          {SAMPLES.map((s) => (
            <button
              key={s}
              type="button"
              className="rounded-full border border-slate-300 px-3 py-1 text-sm hover:bg-navy-50"
              onClick={() => {
                setText(s);
                setPreview(null);
                void match(s);
              }}
            >
              {s.split('\n')[0].split(' ').slice(0, 2).join(' ')}
            </button>
          ))}
        </div>
        {err && (
          <p className="field-error mt-3 text-base" role="alert">
            {err}
          </p>
        )}
      </Card>

      {results && (
        <Card title={<span className="flex items-center gap-2"><ScanLine aria-hidden /> Result</span>}>
          {!results.length ? (
            <EmptyState title="Medicine not recognised">Try a clearer photo of the printed name, type the name, or ask your ASHA worker.</EmptyState>
          ) : (
            <ul className="space-y-3">
              {results.map((r, i) => (
                <li key={r.id} className={`rounded-xl border p-4 ${i === 0 ? 'border-2 border-navy-600' : 'border-slate-200'}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-2xl font-extrabold">{r.name}</p>
                    <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].text}</Badge>
                    <Badge tone="slate">match: {r.confidence}</Badge>
                    {i === 0 && (
                      <button type="button" className="ml-auto flex items-center gap-1 font-semibold text-navy-600" onClick={() => speak(`${r.name}. ${r.note}`, lang)}>
                        <Volume2 className="h-5 w-5" aria-hidden /> {t('hearReminder')}
                      </button>
                    )}
                  </div>
                  <p className="mt-1 text-slate-700">
                    Contains: <strong>{r.ingredients.join(' + ')}</strong> {r.strength && `· ${r.strength}`} · {r.category}
                  </p>
                  {r.note && <p className={`mt-2 text-lg font-semibold ${r.status === 'duplicate' ? 'text-bad-700' : r.status === 'not_prescribed' ? 'text-warn-700' : 'text-ok-700'}`}>{r.note}</p>}
                  {r.instructions && <p className="mt-1 text-slate-600">ℹ️ {r.instructions}</p>}
                  {r.genericPrice != null && r.brandPrice != null && (
                    <p className="mt-2 rounded-lg bg-ok-50 p-2 text-ok-700">
                      💰 Generic ({r.genericName}) at Jan Aushadhi: about ₹{r.genericPrice} per 10 tablets vs ₹{r.brandPrice} for the brand (sample prices).
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-sm text-slate-500">The scan only identifies the medicine. Never start, stop or change a medicine without the doctor.</p>
        </Card>
      )}
    </div>
  );
}
