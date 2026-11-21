/**
 * Optional AI answers for the voice assistant (only when ANTHROPIC_API_KEY is set on the server).
 * The model gets the patient's own medicine list and strict safety rules. Any failure → null (rules answer instead).
 */
import { config } from '../config';
import type { ChatContext, Lang } from '../domain/chatbot';

const LANG_NAME: Record<Lang, string> = { en: 'English', kn: 'Kannada', hi: 'Hindi' };

const SYSTEM = `You are "Saathi", a kind medicine helper for elderly rural patients in India, inside the DawaaSathi app.
STRICT RULES:
- Never diagnose, never name a disease the patient may have, never prescribe, never suggest starting, stopping, changing, skipping or doubling any dose.
- For a missed dose: say not to take a double dose and to ask the doctor or ASHA worker.
- For chest pain, breathlessness, fainting, confusion, very high or low sugar, or any emergency: tell them to call 108 now.
- Only use the medicine list given. If unsure, say "Please ask your doctor or ASHA worker."
- Answer in at most 3 short sentences, simple words, no markdown, in the requested language.`;

export const aiEnabled = () => Boolean(config.ai.apiKey);

export async function aiAnswer(question: string, lang: Lang, ctx: ChatContext): Promise<string | null> {
  if (!aiEnabled()) return null;
  const meds = ctx.prescriptions.map((p) => `${p.name} ${p.dosage ?? ''} at ${p.schedule}, ${p.foodRule} food, ${p.remaining} left`).join('; ') || 'none';
  const today = ctx.today.map((d) => `${d.name} ${d.time} ${d.status}`).join('; ') || 'none';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': config.ai.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: config.ai.model,
        max_tokens: 300,
        system: SYSTEM,
        messages: [
          {
            role: 'user',
            content: `Patient: ${ctx.patientName}\nMedicines: ${meds}\nToday's doses: ${today}\nReply language: ${LANG_NAME[lang]}\nQuestion: ${question.slice(0, 300)}`,
          },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = data.content?.find((c) => c.type === 'text')?.text?.trim();
    return text ? text.slice(0, 600) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
