/**
 * Match text read from a medicine strip photo (OCR, often noisy) to known medicines.
 * Uses whole words with small spelling tolerance, so "GLYC0MET" or "Metfornin" still match.
 */
export interface MedForMatch {
  id: number;
  name: string;
  ingredients: string[];
  strength?: string | null;
}

export interface PillMatch {
  id: number;
  name: string;
  score: number;
  matchedWords: string[];
  strengthMatched: boolean;
}

export function normalizeOcr(text: string) {
  return text
    .toLowerCase()
    .replace(/(?<=[a-z])0(?=[a-z])/g, 'o') // OCR: a zero between letters is usually the letter o
    .replace(/(?<=[a-z])1(?=[a-z])/g, 'l') // …and a one between letters is usually l
    .replace(/[^a-z0-9./\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

const tolerance = (w: string) => (w.length >= 9 ? 2 : w.length >= 5 ? 1 : 0);

function wordFound(word: string, tokens: string[]) {
  if (word.length < 4) return false;
  return tokens.some((t) => t === word || (Math.abs(t.length - word.length) <= 2 && levenshtein(t, word) <= tolerance(word)));
}

/** Words that identify a medicine: alphabetic parts of the brand name + active ingredients. */
function keyWords(m: MedForMatch) {
  const nameWords = m.name
    .toLowerCase()
    .split(/[\s/-]+/)
    .filter((w) => /^[a-z]{4,}$/.test(w));
  return { nameWords, ingredients: m.ingredients.map((i) => i.toLowerCase()) };
}

export function matchMedicines(text: string, meds: MedForMatch[], limit = 3): PillMatch[] {
  const norm = normalizeOcr(text);
  if (!norm) return [];
  const tokens = norm.split(/[\s./-]+/).filter(Boolean);
  const numbers = new Set(norm.match(/\d+(\.\d+)?/g) ?? []);
  const out: PillMatch[] = [];
  for (const m of meds) {
    const { nameWords, ingredients } = keyWords(m);
    const matched: string[] = [];
    let score = 0;
    for (const w of nameWords)
      if (wordFound(w, tokens)) {
        matched.push(w);
        score += 3; // brand / name word is the strongest signal
      }
    for (const w of ingredients)
      if (!matched.includes(w) && wordFound(w, tokens)) {
        matched.push(w);
        score += 2;
      }
    if (!score) continue;
    const nums = (m.strength ?? m.name).match(/\d+(\.\d+)?/g) ?? [];
    const strengthMatched = nums.length > 0 && nums.every((n) => numbers.has(n));
    if (strengthMatched) score += 2;
    out.push({ id: m.id, name: m.name, score, matchedWords: matched, strengthMatched });
  }
  return out.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, limit);
}
