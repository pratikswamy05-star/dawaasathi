import { Database, RefreshCw, Table2 } from 'lucide-react';
import { useState } from 'react';
import { Button, Card, ErrorState, PageHeader, Spinner } from '../../components/ui';
import { useApi } from '../../hooks/useApi';

interface TableList { tables: { name: string; rows: number }[] }
interface TableRows { name: string; columns: string[]; rows: Record<string, unknown>[]; total: number; hidden: number }

function cell(v: unknown) {
  if (v === null || v === undefined) return <span className="text-slate-400">—</span>;
  if (typeof v === 'boolean') return v ? '✔' : '✘';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return s.length > 60 ? `${s.slice(0, 60)}…` : s;
}

/** Read-only look inside the real PostgreSQL tables (admin only). */
export default function DatabaseViewer() {
  const list = useApi<TableList>('/admin/db/tables');
  const [table, setTable] = useState('dose_logs');
  const rows = useApi<TableRows>(`/admin/db/tables/${table}?limit=50`);
  const refresh = () => { void list.reload(); void rows.reload(); };

  if (list.loading && !list.data) return <Spinner />;
  if (list.error && !list.data) return <ErrorState message={list.error.message} onRetry={list.reload} />;
  const tables = list.data?.tables ?? [];
  const totalRows = tables.reduce((s, t) => s + t.rows, 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Database viewer" subtitle={`PostgreSQL · ${tables.length} tables · ${totalRows} rows · read-only`} />
      <div className="flex flex-wrap gap-2">
        {tables.map((t) => (
          <button key={t.name} onClick={() => setTable(t.name)}
            className={`inline-flex min-h-[44px] items-center gap-2 rounded-xl border-2 px-3 font-bold transition ${table === t.name ? 'border-teal-600 bg-teal-50 text-teal-800' : 'border-slate-200 text-navy-800 hover:border-teal-400'}`}>
            <Table2 className="h-4 w-4" aria-hidden /> {t.name}
            <span className="rounded-full bg-slate-100 px-2 text-sm text-slate-600">{t.rows}</span>
          </button>
        ))}
      </div>
      <Card title={`${table} — newest ${rows.data?.rows.length ?? 0} of ${rows.data?.total ?? 0} rows`}>
        <div className="mb-3 flex items-center gap-3">
          <Button variant="secondary" onClick={refresh}><RefreshCw className="h-4 w-4" aria-hidden /> Refresh</Button>
          {!!rows.data?.hidden && <span className="text-sm text-slate-500">🔒 Passwords hidden</span>}
        </div>
        {rows.loading && !rows.data ? <Spinner /> : rows.error ? <ErrorState message={rows.error.message} onRetry={rows.reload} /> : rows.data && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead><tr>{rows.data.columns.map((c) => <th key={c} className="whitespace-nowrap border-b-2 border-slate-200 px-2 py-2 font-bold text-navy-800">{c}</th>)}</tr></thead>
              <tbody>
                {rows.data.rows.map((r, i) => (
                  <tr key={i} className="odd:bg-slate-50">
                    {rows.data!.columns.map((c) => <td key={c} className="whitespace-nowrap px-2 py-1.5 font-mono text-xs">{cell(r[c])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.data.rows.length && <p className="p-4 text-slate-500">This table is empty.</p>}
          </div>
        )}
      </Card>
      <p className="flex items-center gap-2 text-sm text-slate-500"><Database className="h-4 w-4" aria-hidden /> Live data from the server's database. Viewing only — nothing can be changed here. Dummy demo data.</p>
    </div>
  );
}
