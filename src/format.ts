import type { FleetState } from "./types";

export function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtDate(iso: string): string {
  return fmtDateTime(iso).slice(0, 10);
}

export function todayValue(): string {
  return fmtDateTime(new Date().toISOString()).slice(0, 10);
}

export function shiftLabel(state: FleetState, key: string): string {
  return state.shifts.find((s) => s.key === key)?.label ?? key;
}

export function plateOf(state: FleetState, id: string | null): string {
  if (!id) return "—";
  return state.vehicles.find((v) => v.id === id)?.plate ?? "已删除车辆";
}

export function driverName(state: FleetState, id: string | null): string {
  if (!id) return "—";
  return state.drivers.find((d) => d.id === id)?.name ?? "已删除司机";
}
