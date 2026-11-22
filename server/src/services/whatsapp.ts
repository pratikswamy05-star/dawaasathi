import { now } from '../clock';
import { config } from '../config';
import { one, q } from '../db';
import { fmt12, hhmmOf, localDate } from '../domain/time';
import { recipientUserIds } from './access';

type Lang = 'en' | 'kn' | 'hi';
interface Missed { name: string; at: Date }

const fmtWhen = (d: Date) => `${localDate(d).slice(8, 10)}/${localDate(d).slice(5, 7)} ${fmt12(hhmmOf(d))}`;

/** Caregiver-facing WhatsApp text. Never suggests an extra / double dose. */
export function whatsappText(lang: Lang, patient: string, missed: Missed[], hours: number) {
  const list = missed.map((m) => `• ${m.name} – ${fmtWhen(m.at)}`).join('\n');
  const n = missed.length;
  const t = {
    en: [
      `⚠️ *DawaaSathi alert*`,
      `${patient} has missed *${n} medicine doses* in the last ${hours} hours:`,
      list,
      `Please call or visit ${patient} today and help with the routine.`,
      `❗ Do NOT give the missed doses together or a double dose. Ask the doctor if unsure. Emergency: 108`,
    ],
    kn: [
      `⚠️ *ದವಾ ಸಾಥಿ ಎಚ್ಚರಿಕೆ*`,
      `${patient} ಕಳೆದ ${hours} ಗಂಟೆಗಳಲ್ಲಿ *${n} ಡೋಸ್ ಔಷಧಿ* ತಪ್ಪಿಸಿದ್ದಾರೆ:`,
      list,
      `ದಯವಿಟ್ಟು ಇಂದು ${patient} ಅವರಿಗೆ ಕರೆ ಮಾಡಿ ಅಥವಾ ಭೇಟಿ ನೀಡಿ.`,
      `❗ ತಪ್ಪಿದ ಡೋಸ್‌ಗಳನ್ನು ಒಟ್ಟಿಗೆ ಅಥವಾ ಡಬಲ್ ಡೋಸ್ ಕೊಡಬೇಡಿ. ಸಂಶಯವಿದ್ದರೆ ವೈದ್ಯರನ್ನು ಕೇಳಿ. ತುರ್ತು: 108`,
    ],
    hi: [
      `⚠️ *दवा साथी अलर्ट*`,
      `${patient} ने पिछले ${hours} घंटों में *${n} खुराक* छोड़ी हैं:`,
      list,
      `कृपया आज ${patient} को फ़ोन करें या मिलने जाएँ।`,
      `❗ छूटी हुई खुराक एक साथ या दोगुनी खुराक न दें। संदेह हो तो डॉक्टर से पूछें। आपातकाल: 108`,
    ],
  }[lang];
  return t.join('\n');
}

export const whatsappMode = () => (config.whatsapp.twilioSid && config.whatsapp.twilioToken && config.whatsapp.twilioFrom ? 'twilio' : 'demo');

export const waLink = (phone: string, body: string) => `https://wa.me/91${String(phone).replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(body)}`;

/** Sends through Twilio's WhatsApp API (server-side only). Returns the message id. */
async function sendTwilio(phone: string, body: string): Promise<string> {
  const { twilioSid, twilioToken, twilioFrom } = config.whatsapp;
  const to = `whatsapp:+91${String(phone).replace(/\D/g, '').slice(-10)}`;
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ From: twilioFrom, To: to, Body: body }).toString(),
  });
  const data = (await r.json().catch(() => ({}))) as { sid?: string; message?: string };
  if (!r.ok || !data.sid) throw new Error(data.message || `Twilio error ${r.status}`);
  return data.sid;
}

/**
 * If the patient missed MORE THAN 2 doses (threshold) in the last N hours, message every
 * caregiver on WhatsApp once per day. Safe to call often (scheduler tick, each missed dose).
 */
export async function checkWhatsAppMisses(patientId: number): Promise<number> {
  const { missThreshold, windowHours } = config.whatsapp;
  const since = new Date(now().getTime() - windowHours * 3600_000).toISOString();
  const rows = await q(
    `select m.name, d.scheduled_at from dose_logs d
       join prescriptions p on p.id = d.prescription_id join medications m on m.id = p.medication_id
     where d.patient_id = $1 and d.status = 'missed' and d.scheduled_at >= $2 and d.scheduled_at <= $3
     order by d.scheduled_at`,
    [patientId, since, now().toISOString()],
  );
  if (rows.length < missThreshold) return 0;
  const patient = await one('select name from patients where id = $1', [patientId]);
  const uids = await recipientUserIds(patientId, 'caregiver');
  if (!uids.length) return 0;
  const users = await q(`select id, phone, language from users where id in (${uids.map(Number).join(',')}) and active`);
  const missed = rows.map((r) => ({ name: String(r.name), at: new Date(r.scheduled_at) }));
  let sent = 0;
  for (const u of users) {
    const lang = (['en', 'kn', 'hi'].includes(u.language) ? u.language : 'en') as Lang;
    const body = whatsappText(lang, patient?.name ?? 'Patient', missed, windowHours);
    const key = `wa-miss-${patientId}-${u.id}-${localDate(now())}`;
    const row = await one(
      `insert into whatsapp_messages (patient_id, user_id, phone, body, reason, status, dedupe_key)
       values ($1, $2, $3, $4, $5, 'preview', $6) on conflict (dedupe_key) do nothing returning id`,
      [patientId, u.id, u.phone, body, `${missed.length} missed doses in ${windowHours} h`, key],
    );
    if (!row) continue; // already messaged today
    sent++;
    await q('insert into notifications (user_id, type, title, body) values ($1, $2, $3, $4)', [
      u.id,
      'repeated_miss',
      '💬 WhatsApp alert',
      `${patient?.name} missed ${missed.length} doses in ${windowHours} hours. WhatsApp message ${whatsappMode() === 'twilio' ? 'sent' : 'ready to send'}.`,
    ]);
    if (whatsappMode() === 'twilio') {
      try {
        const sid = await sendTwilio(u.phone, body);
        await q(`update whatsapp_messages set status = 'sent', provider_id = $2 where id = $1`, [row.id, sid]);
      } catch (e) {
        await q(`update whatsapp_messages set status = 'failed', error = $2 where id = $1`, [row.id, String((e as Error).message).slice(0, 300)]);
      }
    }
  }
  return sent;
}
