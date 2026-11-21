/**
 * Offline dose recording: confirmations go into an IndexedDB queue and are sent to /api/doses/sync
 * when the connection returns. The server applies them idempotently.
 */
import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { toast } from '../store/toast';
import { idbAll, idbDel, idbKeys, idbSet } from './idb';

export interface QueuedConfirm {
  doseId: number;
  status: 'taken' | 'missed';
  method: 'button' | 'voice' | 'caregiver' | 'asha';
  confirmedAt: string;
  clientId: string;
}

export async function queueConfirm(item: Omit<QueuedConfirm, 'clientId' | 'confirmedAt'>) {
  const full: QueuedConfirm = { ...item, confirmedAt: new Date().toISOString(), clientId: `${item.doseId}-${Date.now()}` };
  await idbSet('queue', `dose-${item.doseId}`, full); // latest answer per dose wins
  window.dispatchEvent(new Event('queue-changed'));
}

export async function pendingCount() {
  return (await idbKeys('queue')).length;
}

let flushing = false;

export async function flushQueue(): Promise<number> {
  if (flushing || !navigator.onLine) return 0;
  flushing = true;
  try {
    const items = await idbAll<QueuedConfirm>('queue');
    if (!items.length) return 0;
    const { results } = await api<{ results: { doseId: number; ok: boolean }[] }>('/doses/sync', { method: 'POST', body: { items } });
    // Remove everything the server processed (ok or permanently rejected) so the queue can't get stuck.
    for (const r of results) await idbDel('queue', `dose-${r.doseId}`);
    window.dispatchEvent(new Event('queue-changed'));
    const synced = results.filter((r) => r.ok).length;
    if (synced) toast.success(`${synced} offline update(s) synced`);
    window.dispatchEvent(new Event('data-synced'));
    return synced;
  } catch {
    return 0;
  } finally {
    flushing = false;
  }
}

export function initOfflineSync() {
  window.addEventListener('online', () => void flushQueue());
  setInterval(() => void flushQueue(), 60_000);
  void flushQueue();
}

export function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

export function usePendingSync() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const update = () => void pendingCount().then(setN).catch(() => setN(0));
    update();
    window.addEventListener('queue-changed', update);
    return () => window.removeEventListener('queue-changed', update);
  }, []);
  return n;
}
