// Partial Fisher-Yates: sample without duplicates, without changing the owned list.
export function sampleFarmResidents<T>(pets: readonly T[], limit = 3, random = Math.random): T[] {
  const pool = [...pets];
  const count = Math.min(pool.length, Math.max(0, Math.floor(limit)));
  for (let index = 0; index < count; index++) {
    const other = index + Math.floor(random() * (pool.length - index));
    [pool[index], pool[other]] = [pool[other], pool[index]];
  }
  return pool.slice(0, count);
}
