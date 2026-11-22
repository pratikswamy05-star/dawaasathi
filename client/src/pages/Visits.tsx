import { CheckCircle2, DoorClosed, MapPin, Phone, Route } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorText } from '../api/client';
import { Badge, Button, EmptyState, ErrorState, PageHeader, Spinner, StatCard } from '../components/ui';
import { useApi } from '../hooks/useApi';
import { dateOf } from '../lib/format';
import { toast } from '../store/toast';
import type { VisitItem } from '../types';

interface VisitsData {
  date: string;
  visits: VisitItem[];
  counts: { total: number; urgent: number; done: number };
}

function VisitCard({ v, onDone }: { v: VisitItem; onDone: () => void }) {
  const [note, setNote] = useState(v.today?.note ?? '');
  const [busy, setBusy] = useState<string | null>(null);
  const mark = async (status: 'visited' | 'not_home') => {
    setBusy(status);
    try {
      await api('/visits', { method: 'POST', body: { patientId: v.patientId, status, note } });
      toast.success(status === 'visited' ? `Visit to ${v.name} saved — family informed` : `Marked: ${v.name} not at home`);
      onDone();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  const done = v.today?.status === 'visited';
  return (
    <li className={`card card-hover border-l-8 ${done ? 'border-l-ok-600 opacity-80' : v.urgent ? 'border-l-bad-600' : 'border-l-warn-500'}`}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <Link to={`/patients/${v.patientId}`} className="text-2xl font-extrabold text-navy-900 hover:underline">
            {v.name}
          </Link>
          <p className="text-slate-600">
            {v.age ? `${v.age} y · ` : ''}
            {v.village} · Last visit: {v.lastVisit ? dateOf(v.lastVisit) : 'never'}
          </p>
        </div>
        {done ? (
          <Badge tone="green">✅ Visited today</Badge>
        ) : v.today?.status === 'not_home' ? (
          <Badge tone="amber">🚪 Not at home</Badge>
        ) : v.urgent ? (
          <Badge tone="red">Visit first</Badge>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {v.reasons.map((r) => (
          <Badge key={r.code + r.text} tone={r.tone}>
            {r.text}
          </Badge>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {v.phone && (
          <a href={`tel:${v.phone}`} className="inline-flex min-h-[44px] items-center gap-1 rounded-xl border-2 border-slate-200 px-3 font-bold text-navy-800 hover:border-teal-500">
            <Phone className="h-4 w-4" aria-hidden /> Call
          </a>
        )}
        {v.caregiverPhone && (
          <a href={`tel:${v.caregiverPhone}`} className="inline-flex min-h-[44px] items-center gap-1 rounded-xl border-2 border-slate-200 px-3 font-bold text-navy-800 hover:border-teal-500">
            <Phone className="h-4 w-4" aria-hidden /> {v.caregiverName ?? 'Family'}
          </a>
        )}
        <a href={v.mapsUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-[44px] items-center gap-1 rounded-xl border-2 border-slate-200 px-3 font-bold text-navy-800 hover:border-teal-500">
          <MapPin className="h-4 w-4" aria-hidden /> Directions
        </a>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input className="input min-h-[44px] flex-1" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Visit note (e.g. BP checked, medicines sorted)" aria-label={`Visit note for ${v.name}`} />
        <Button variant="success" onClick={() => void mark('visited')} loading={busy === 'visited'}>
          <CheckCircle2 className="h-4 w-4" aria-hidden /> Visited
        </Button>
        <Button variant="ghost" onClick={() => void mark('not_home')} loading={busy === 'not_home'}>
          <DoorClosed className="h-4 w-4" aria-hidden /> Not at home
        </Button>
      </div>
    </li>
  );
}

/** ASHA worker's plan for today: who to visit first, grouped by village. */
export default function Visits() {
  const { data, loading, error, reload } = useApi<VisitsData>('/visits', { poll: 60_000, cacheKey: 'asha-visits' });
  const [hideDone, setHideDone] = useState(false);

  const villages = useMemo(() => {
    const m = new Map<string, VisitItem[]>();
    for (const v of data?.visits ?? []) {
      if (hideDone && v.today?.status === 'visited') continue;
      const list = m.get(v.village) ?? [];
      list.push(v);
      m.set(v.village, list);
    }
    // Village with the most urgent patient first.
    return [...m.entries()].sort((a, b) => Math.max(...b[1].map((x) => x.priority)) - Math.max(...a[1].map((x) => x.priority)));
  }, [data, hideDone]);

  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorState message={error.message} onRetry={reload} />;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <PageHeader title="Today's visits" subtitle={`${dateOf(data.date)} · most urgent first, grouped by village`} />
      <div className="stagger grid gap-4 sm:grid-cols-3">
        <StatCard label="Patients" value={data.counts.total} icon={<Route aria-hidden />} />
        <StatCard label="Visit first" value={data.counts.urgent} tone="red" icon={<MapPin aria-hidden />} />
        <StatCard label="Visited today" value={data.counts.done} tone="green" icon={<CheckCircle2 aria-hidden />} />
      </div>
      <label className="flex items-center gap-2 font-semibold">
        <input type="checkbox" className="h-5 w-5" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} /> Hide visited
      </label>
      {!villages.length ? (
        <EmptyState title="No visits left for today 🎉" />
      ) : (
        villages.map(([village, list]) => (
          <section key={village} aria-label={village} className="space-y-3">
            <h2 className="flex items-center gap-2 text-xl font-extrabold">
              <MapPin className="h-5 w-5 text-teal-600" aria-hidden /> {village}
              <span className="text-base font-semibold text-slate-500">· {list.length}</span>
            </h2>
            <ul className="stagger space-y-3">
              {list.map((v) => (
                <VisitCard key={v.patientId} v={v} onDone={() => void reload()} />
              ))}
            </ul>
          </section>
        ))
      )}
      <p className="text-sm text-slate-500">Order: HELP requests, high readings, missed doses, refills, risk, then routine visits. A 7-day streak is a chance to praise the patient.</p>
    </div>
  );
}
