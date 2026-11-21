/** Straight-line distance between two points on Earth, in kilometres (haversine formula). */
export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Monthly saving if the patient buys the generic instead of the brand (prices are per strip of 10). */
export function monthlySaving(brandPer10: number | null, genericPer10: number | null, unitsPerDay: number): number | null {
  if (brandPer10 == null || genericPer10 == null || unitsPerDay <= 0) return null;
  const perMonth = (unitsPerDay * 30) / 10;
  return Math.max(0, Math.round((brandPer10 - genericPer10) * perMonth));
}
