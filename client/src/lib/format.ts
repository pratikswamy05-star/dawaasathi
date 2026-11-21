export const timeOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export const dateOf = (iso: string) => {
  const d = iso.length === 10 ? new Date(`${iso}T00:00:00`) : new Date(iso);
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
};

export const dateTimeOf = (iso: string) =>
  new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export const pctText = (p: number | null | undefined) => (p == null ? '—' : `${p}%`);

export const FREQ_LABEL: Record<string, string> = {
  OD: 'Once a day',
  BD: 'Twice a day',
  TDS: 'Three times a day',
  QID: 'Four times a day',
  HS: 'At bedtime',
};
