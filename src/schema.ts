import type { FleetState, ShiftDef } from "./types";

export const SCHEMA_VERSION = 1;

export const DEFAULT_SHIFTS: ShiftDef[] = [
  { key: "morning", label: "早班", start: "06:00", end: "14:00" },
  { key: "day", label: "常白班", start: "08:30", end: "17:30" },
  { key: "middle", label: "中班", start: "14:00", end: "22:00" },
  { key: "night", label: "晚班", start: "22:00", end: "06:00" }
];

export const ZONES = ["城北", "城东", "城南"] as const;

function isoDaysAgo(days: number, hour = 9): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, 15, 0, 0);
  return d.toISOString();
}

function isoToday(hour: number): string {
  const d = new Date();
  d.setHours(hour, 5, 0, 0);
  return d.toISOString();
}

/** 初始数据：车辆（含固定柜位）、司机、柜位、任务、历史借还链、一条待复核 */
export function createSeedState(): FleetState {
  return {
    schema: SCHEMA_VERSION,
    rev: 6,
    vehicles: [
      { id: "v1", plate: "沪A-82L6", zone: "城北", homeSlot: "A01", createdAt: isoDaysAgo(30) },
      { id: "v2", plate: "沪B-73K9", zone: "城东", homeSlot: "A02", createdAt: isoDaysAgo(28) },
      { id: "v3", plate: "沪C-15D2", zone: "城南", homeSlot: "A03", createdAt: isoDaysAgo(20) },
      { id: "v4", plate: "沪D-62F8", zone: "城东", homeSlot: "B01", createdAt: isoDaysAgo(12) }
    ],
    drivers: [
      { id: "d1", name: "董飞", createdAt: isoDaysAgo(30) },
      { id: "d2", name: "周航", createdAt: isoDaysAgo(28) },
      { id: "d3", name: "林楠", createdAt: isoDaysAgo(20) }
    ],
    shifts: DEFAULT_SHIFTS,
    slots: ["A01", "A02", "A03", "B01", "B02", "B03"],
    tasks: [
      {
        id: "t1",
        vehicleId: "v1",
        driverId: "d1",
        zone: "城北",
        title: "商超补货",
        status: "空闲",
        notes: "可立即派车",
        createdAt: isoDaysAgo(2)
      },
      {
        id: "t2",
        vehicleId: "v2",
        driverId: "d2",
        zone: "城东",
        title: "医药配送",
        status: "执行中",
        notes: "预计17:30返回",
        createdAt: isoToday(8)
      }
    ],
    loans: [
      {
        id: "l1",
        vehicleId: "v1",
        driverId: "d1",
        shiftKey: "morning",
        slotId: "A01",
        keyVersion: 1,
        startMileage: 45200,
        borrowedAt: isoDaysAgo(1, 7),
        endMileage: 45268,
        fuel: 62,
        condition: "正常",
        returnNotes: "车况正常",
        returnedAt: isoDaysAgo(1, 13),
        status: "已归还",
        reviewReasons: [],
        lockChangeId: null
      },
      {
        id: "l2",
        vehicleId: "v2",
        driverId: "d2",
        shiftKey: "morning",
        slotId: "A02",
        keyVersion: 1,
        startMileage: 48210,
        borrowedAt: isoToday(6),
        endMileage: null,
        fuel: null,
        condition: null,
        returnNotes: "",
        returnedAt: null,
        status: "借出",
        reviewReasons: [],
        lockChangeId: null
      },
      {
        id: "l3",
        vehicleId: "v3",
        driverId: "d3",
        shiftKey: "day",
        slotId: "A03",
        keyVersion: 1,
        startMileage: 31050,
        borrowedAt: isoDaysAgo(0, 9),
        endMileage: 30996,
        fuel: 22,
        condition: "轻微瑕疵",
        returnNotes: "右后门有划痕",
        returnedAt: isoDaysAgo(0, 17),
        status: "待复核",
        reviewReasons: ["里程倒挂：结束里程 30996 小于起始里程 31050", "油量低于三成：22%"],
        lockChangeId: null
      }
    ],
    lockChanges: [],
    handovers: []
  };
}
