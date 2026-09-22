import type { FleetState } from "./types";
import { SCHEMA_VERSION } from "./schema";

const STORAGE_KEY = "dfwlfront-3-fleet-keycabinet-v1";

/**
 * 存储层：只负责 FleetState 的读写、解析失败回退与版本判断，
 * 不包含任何业务规则。
 */
export const storage = {
  key: STORAGE_KEY,

  load(): { state: FleetState | null; version: number } {
    if (typeof localStorage === "undefined") return { state: null, version: 0 };
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { state: null, version: 0 };
    try {
      const parsed = JSON.parse(raw) as Partial<FleetState>;
      return {
        state: parsed as FleetState,
        version: typeof parsed.schema === "number" ? parsed.schema : 0
      };
    } catch {
      return { state: null, version: 0 };
    }
  },

  save(state: FleetState): void {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, schema: SCHEMA_VERSION }));
  },

  /** 监听其它标签页的刷新，保持多页签数据一致 */
  subscribe(handler: () => void): () => void {
    if (typeof window === "undefined") return () => {};
    const listener = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) handler();
    };
    window.addEventListener("storage", listener);
    return () => window.removeEventListener("storage", listener);
  }
};
