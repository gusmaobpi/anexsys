export function balanceProduction(due: number[], capacity: number[]): number[] {
  const load = due.map((value) => Math.max(0, value));
  for (let index = 0; index < load.length; index += 1) {
    const cap = Math.max(0, capacity[index] ?? 0);
    if (load[index] > cap) {
      const overflow = load[index] - cap;
      if (index + 1 < load.length) {
        load[index] = cap;
        load[index + 1] += overflow;
      }
    } else if (load[index] < cap) {
      let spare = cap - load[index];
      for (let later = index + 1; later < load.length && spare > 0; later += 1) {
        const take = Math.min(spare, load[later]);
        load[later] -= take;
        load[index] += take;
        spare -= take;
      }
    }
  }
  return load;
}
