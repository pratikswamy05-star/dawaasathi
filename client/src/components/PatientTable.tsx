import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { pctText } from '../lib/format';
import type { PatientSummary } from '../types';
import { Badge, EmptyState, riskLabel, riskTone, stockDot } from './ui';

type Filter = 'all' | 'high' | 'missed' | 'refill' | 'BP' | 'Diabetes';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'high', label: 'High risk' },
  { key: 'missed', label: 'Missed doses' },
  { key: 'refill', label: 'Refill needed' },
  { key: 'BP', label: 'BP' },
  { key: 'Diabetes', label: 'Diabetes' },
];

const match = (p: PatientSummary, f: Filter) => {
  switch (f) {
    case 'high':
      return p.risk.level === 'high';
    case 'missed':
      return p.missed7d > 0;
    case 'refill':
      return p.refillStatus !== 'safe';
    case 'BP':
    case 'Diabetes':
      return p.conditions.includes(f);
    default:
      return true;
  }
};

/** ASHA / doctor patient table with filters and search. Sorted by safety score (riskiest first). */
export default function PatientTable({ patients }: { patients: PatientSummary[] }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const rows = useMemo(
    () =>
      patients
        .filter((p) => match(p, filter))
        .filter((p) => `${p.name} ${p.village ?? ''}`.toLowerCase().includes(search.trim().toLowerCase()))
        .sort((a, b) => a.risk.score - b.risk.score),
    [patients, filter, search],
  );

  return (
    <div className="card p-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter patients">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              className={`min-h-[40px] rounded-full border px-4 text-sm font-semibold ${filter === f.key ? 'border-navy-800 bg-navy-800 text-white' : 'border-slate-300 bg-white text-navy-800 hover:bg-navy-50'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          className="input ml-auto max-w-xs"
          placeholder="Search name or village"
          value={search}
          maxLength={50}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search patients"
        />
      </div>
      {!rows.length ? (
        <EmptyState title="No patients match this filter" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="table-th">Patient</th>
                <th className="table-th">Condition</th>
                <th className="table-th">Adherence (7d)</th>
                <th className="table-th">Missed (7d)</th>
                <th className="table-th">Refill</th>
                <th className="table-th">Safety score</th>
                <th className="table-th">Risk</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((p) => (
                <tr key={p.id} className="hover:bg-navy-50/50">
                  <td className="table-td">
                    <Link to={`/patients/${p.id}`} className="font-bold text-navy-800 underline-offset-2 hover:underline">
                      {p.name}
                    </Link>
                    <p className="text-sm text-slate-500">
                      {p.age ? `${p.age} y · ` : ''}
                      {p.village}
                    </p>
                  </td>
                  <td className="table-td">{p.conditions.join(' + ') || '—'}</td>
                  <td className="table-td font-semibold">{pctText(p.adherence7d)}</td>
                  <td className="table-td">
                    <span className={p.missed7d >= 3 ? 'font-bold text-bad-700' : ''}>{p.missed7d}</span>
                    {p.missedToday > 0 && <span className="ml-2 text-sm text-bad-700">({p.missedToday} today)</span>}
                  </td>
                  <td className="table-td whitespace-nowrap">
                    {stockDot(p.refillStatus)} {p.refillDaysLeft == null ? '—' : `${p.refillDaysLeft} days`}
                  </td>
                  <td className="table-td font-bold">{p.risk.score}</td>
                  <td className="table-td">
                    <Badge tone={riskTone(p.risk.level)}>{riskLabel(p.risk.level)}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
