// 存储层：仅负责 localStorage 的读写与结构兜底，不包含业务规则。
import { createSeedDB, DB_VERSION, STORAGE_KEY } from "../data/seed";
import type { KeyDB } from "../data/types";

function normalize(raw: unknown): KeyDB {
  const seed = createSeedDB();
  if (!raw || typeof raw !== "object") return seed;
  const db = raw as Partial<KeyDB>;
  return {
    version: typeof db.version === "number" ? db.version : DB_VERSION,
    vehicles: Array.isArray(db.vehicles) ? db.vehicles : seed.vehicles,
    shifts: Array.isArray(db.shifts) ? db.shifts : seed.shifts,
    loans: Array.isArray(db.loans) ? db.loans : seed.loans,
    lockChanges: Array.isArray(db.lockChanges) ? db.lockChanges : seed.lockChanges,
  };
}

export function loadDB(): KeyDB {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const seed = createSeedDB();
    saveDB(seed);
    return seed;
  }
  try {
    return normalize(JSON.parse(raw));
  } catch {
    return createSeedDB();
  }
}

export function saveDB(db: KeyDB): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}
