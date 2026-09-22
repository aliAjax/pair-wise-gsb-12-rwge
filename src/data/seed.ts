// 数据层：首次打开时的演示种子数据。
import type { KeyDB } from "./types";

export const STORAGE_KEY = "dfwlfront-3-keycabinet";
export const DB_VERSION = 1;

export function createSeedDB(): KeyDB {
  const today = new Date().toISOString().slice(0, 11) + "00:00:00.000Z";
  return {
    version: DB_VERSION,
    vehicles: [
      { id: "v-1", plate: "沪A-82L6", slot: "A-01", activeTask: "商超补货" },
      { id: "v-2", plate: "沪B-73K9", slot: "A-02", activeTask: null },
      { id: "v-3", plate: "沪C-51D2", slot: "A-03", activeTask: null },
    ],
    shifts: [
      {
        id: "s-seed-1",
        date: new Date().toISOString().slice(0, 10),
        kind: "早班",
        status: "open",
        openedAt: today,
      },
    ],
    loans: [],
    lockChanges: [],
  };
}
