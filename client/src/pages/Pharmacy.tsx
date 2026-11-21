import { Clock, LocateFixed, MapPin, Navigation, Search } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, Spinner } from '../components/ui';
import { useApi } from '../hooks/useApi';
import { useT } from '../i18n';
import { useAuth } from '../store/auth';
import type { PatientSummary, PharmacyResponse } from '../types';

const KIND = {
  jan_aushadhi: { label: 'Jan Aushadhi (generic, low price)', tone: 'green' as const },
  phc: { label: 'Government – free medicines', tone: 'navy' as const },
  private: { label: 'Private medical shop', tone: 'slate' as const },
};

export default function Pharmacy() {
  const { t } = useT();
  const role = useAuth((s) => s.user!.role);
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locMsg, setLocMsg] = useState<string | null>(null);
  const [kind, setKind] = useState('');
  const [patientId, setPatientId] = useState('');
  const { data: pts } = useApi<{ patients: PatientSummary[] }>(role === 'patient' ? null : '/patients');

  const qs = new URLSearchParams();
  if (loc) {
    qs.set('lat', loc.lat.toFixed(4));
    qs.set('lng', loc.lng.toFixed(4));
  }
  if (kind) qs.set('kind', kind);
  if (patientId) qs.set('patientId', patientId);
  const { data, loading, error, reload } = useApi<PharmacyResponse>(`/pharmacies?${qs.toString()}`, { cacheKey: `pharmacies-${qs.toString()}` });

  const locate = () => {
    if (!navigator.geolocation) return setLocMsg('Location is not available on this device.');
    setLocMsg('Finding your location…');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLoc({ lat: p.coords.latitude, lng: p.coords.longitude });
        setLocMsg(null);
      },
      () => setLocMsg('Location permission was not given. Showing distances from your village instead.'),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader title={`💊 ${t('pharmacy')}`} subtitle={t('pharmacyHelp')} />

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <Button variant="secondary" onClick={locate}>
            <LocateFixed className="h-5 w-5" aria-hidden /> Use my location
          </Button>
          <label>
            <span className="label">Show</span>
            <select className="input w-auto" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">All</option>
              <option value="jan_aushadhi">Jan Aushadhi only</option>
              <option value="phc">Government (free)</option>
              <option value="private">Private shops</option>
            </select>
          </label>
          {role !== 'patient' && (
            <label>
              <span className="label">Savings for patient</span>
              <select className="input w-auto" value={patientId} onChange={(e) => setPatientId(e.target.value)}>
                <option value="">—</option>
                {pts?.patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {data && (
            <a href={data.searchUrl} target="_blank" rel="noreferrer" className="ml-auto inline-flex min-h-[48px] items-center gap-2 rounded-xl border-2 border-slate-300 px-4 font-bold text-navy-800 hover:bg-navy-50">
              <Search className="h-5 w-5" aria-hidden /> Search real Kendras on Google Maps
            </a>
          )}
        </div>
        {locMsg && <p className="mt-2 text-slate-600">{locMsg}</p>}
      </Card>

      {loading && !data ? (
        <Spinner />
      ) : error && !data ? (
        <ErrorState message={error.message} onRetry={reload} />
      ) : data ? (
        <>
          {data.savings.length > 0 && (
            <Card title={<span className="text-xl">💰 Money you could save every month</span>}>
              <p className="text-4xl font-extrabold text-ok-700">₹{data.totalMonthlySaving}</p>
              <p className="text-slate-600">by buying the same medicines as generics at a Jan Aushadhi Kendra (or free at the PHC).</p>
              <table className="mt-3 w-full text-left">
                <thead>
                  <tr className="border-b text-sm text-slate-500">
                    <th className="py-1">Medicine</th>
                    <th>Brand / 10</th>
                    <th>Generic / 10</th>
                    <th>Save / month</th>
                  </tr>
                </thead>
                <tbody>
                  {data.savings.map((s) => (
                    <tr key={s.medicationName} className="border-b border-slate-100">
                      <td className="py-2 font-semibold">
                        {s.medicationName}
                        {s.genericName && <span className="block text-sm font-normal text-slate-500">Ask for: {s.genericName}</span>}
                      </td>
                      <td>₹{s.brandPrice}</td>
                      <td className="font-bold text-ok-700">₹{s.genericPrice}</td>
                      <td className="font-bold">₹{s.perMonth ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-sm text-slate-500">Same active ingredient and strength. Show this list at the counter. Do not switch without telling your doctor or ASHA.</p>
            </Card>
          )}

          <Card title={`Nearest to ${data.origin.label}`}>
            {!data.pharmacies.length ? (
              <EmptyState title="No pharmacies found" />
            ) : (
              <ul className="space-y-3">
                {data.pharmacies.map((ph) => (
                  <li key={ph.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-4">
                    <div className="min-w-[200px] flex-1">
                      <p className="text-lg font-bold">{ph.name}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                        <Badge tone={KIND[ph.kind].tone}>{KIND[ph.kind].label}</Badge>
                        {ph.address && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-4 w-4" aria-hidden /> {ph.address}
                          </span>
                        )}
                        {ph.open_hours && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-4 w-4" aria-hidden /> {ph.open_hours}
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-2xl font-extrabold text-navy-800">{ph.distanceKm} km</p>
                    <a href={ph.directionsUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-navy-800 px-4 font-bold text-white hover:bg-navy-700">
                      <Navigation className="h-5 w-5" aria-hidden /> Directions
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Generic price list (per 10 tablets)">
            <div className="grid gap-x-6 sm:grid-cols-2">
              {data.prices.map((m) => (
                <div key={m.id} className="flex items-center justify-between border-b border-slate-100 py-2">
                  <span className="font-semibold">{m.name}</span>
                  <span>
                    <span className="text-slate-400 line-through">₹{m.brand_price}</span> <span className="font-bold text-ok-700">₹{m.generic_price}</span>
                  </span>
                </div>
              ))}
            </div>
          </Card>
          <p className="text-sm text-slate-500">ℹ️ {data.note}</p>
        </>
      ) : null}
    </div>
  );
}
