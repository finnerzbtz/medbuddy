import catalogue from '@/generated/medication-names.json';

export interface MedicationSuggestion {
  name: string;
  previous: boolean;
  similarSpelling: boolean;
}
export function normaliseMedicationName(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
// Optimal string alignment counts adjacent swapped letters as one edit.
function spellingDistance(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
    }
  return rows[a.length][b.length];
}
const known = catalogue.names.map(({ name }) => ({ name, key: normaliseMedicationName(name) }));
export function suggestMedicationNames(
  value: string,
  previousNames: readonly string[] = [],
): MedicationSuggestion[] {
  const query = normaliseMedicationName(value);
  if (query.length < 2 || query.length > 80) return [];
  const entries = new Map(known.map((entry) => [entry.key, { ...entry, previous: false }]));
  for (const name of previousNames) {
    const clean = name.trim(),
      key = normaliseMedicationName(clean);
    if (key && clean.length <= 80) entries.set(key, { name: clean, key, previous: true });
  }
  const matches: (MedicationSuggestion & { rank: number })[] = [];
  for (const entry of entries.values()) {
    const words = entry.key.split(' ');
    let rank =
      entry.key === query
        ? 0
        : entry.key.startsWith(query)
          ? 1
          : words.some((word) => word.startsWith(query))
            ? 2
            : query.length >= 3 && entry.key.includes(query)
              ? 3
              : Infinity;
    let similarSpelling = false;
    if (!Number.isFinite(rank) && query.length >= 4) {
      const allowance = query.length >= 8 ? 2 : 1;
      const candidates = [entry.key, ...words];
      let distance = allowance + 1;
      for (const candidate of candidates) {
        if (candidate.length < query.length - allowance) continue;
        for (
          let size = Math.max(1, query.length - allowance);
          size <= query.length + allowance;
          size++
        ) {
          distance = Math.min(distance, spellingDistance(query, candidate.slice(0, size)));
        }
      }
      if (distance <= allowance) {
        rank = 4 + distance;
        similarSpelling = true;
      }
    }
    if (Number.isFinite(rank))
      matches.push({ name: entry.name, previous: entry.previous, similarSpelling, rank });
  }
  return matches
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        Number(b.previous) - Number(a.previous) ||
        a.name.localeCompare(b.name, 'en-GB'),
    )
    .slice(0, 5)
    .map(({ name, previous, similarSpelling }) => ({ name, previous, similarSpelling }));
}
