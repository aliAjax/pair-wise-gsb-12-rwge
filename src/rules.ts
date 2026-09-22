import type {
  Condition,
  FleetState,
  LoanRecord,
  SlotCheck,
  ShiftDef
} from "./types";

/** 规则层：全部为纯函数，不读写 localStorage，不依赖框架 */

export const MIN_FUEL = 30; // 油量低于三成需复核

const OPEN_STATUS: LoanRecord["status"][] = ["借出", "待复核"];

export function isOpen(loan: LoanRecord): boolean {
  return OPEN_STATUS.includes(loan.status);
}

export function openLoans(state: FleetState): LoanRecord[] {
  return state.loans.filter(isOpen);
}

export function findVehicle(state: FleetState, id: string) {
  return state.vehicles.find((v) => v.id === id);
}

export function findDriver(state: FleetState, id: string) {
  return state.drivers.find((d) => d.id === id);
}

export function findShift(state: FleetState, key: string): ShiftDef | undefined {
  return state.shifts.find((s) => s.key === key);
}

/* ---------- 班次时间 ---------- */

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function dayStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** 计算某次借用的实际班次区间（绝对时间），自动处理跨午夜 */
export function shiftRange(shift: ShiftDef, date: Date): { start: Date; end: Date } {
  const start = dayStart(date);
  start.setMinutes(minutes(shift.start));
  const end = dayStart(date);
  end.setMinutes(minutes(shift.end));
  if (minutes(shift.end) <= minutes(shift.start)) end.setDate(end.getDate() + 1);
  return { start, end };
}

export function rangesOverlap(a: { start: Date; end: Date }, b: { start: Date; end: Date }): boolean {
  return a.start < b.end && b.start < a.end;
}

/* ---------- 占用（派生数据，不落地） ---------- */

export interface Occupancy {
  slotId: string;
  vehicleId: string | null; // 柜中钥匙对应车牌；null=空柜
  loanId: string | null; // 占用来源借还单
}

export interface VehicleKey {
  vehicleId: string;
  version: number; // 换锁版本，初始为 1
  slotId: string | null; // null = 在司机手中（未归还/待复核/丢失未处理）
  loanId: string | null;
}

/** 当前生效的换锁次数 => 钥匙版本 */
export function keyVersionOf(state: FleetState, vehicleId: string): number {
  return 1 + state.lockChanges.filter((lc) => lc.vehicleId === vehicleId).length;
}

/** 该车牌当前未终结的借还单（同车未归还前不得再借） */
export function openLoanOfVehicle(state: FleetState, vehicleId: string): LoanRecord | undefined {
  return state.loans.find((l) => l.vehicleId === vehicleId && isOpen(l));
}

/** 某司机在给定班次/日期的重叠借用（重叠班次只能持一把钥匙），可排除指定借还单 */
export function overlappingLoanOfDriver(
  state: FleetState,
  driverId: string,
  shiftKey: string,
  date: Date,
  excludeLoanId?: string
): LoanRecord | undefined {
  const target = findShift(state, shiftKey);
  if (!target) return undefined;
  const targetRange = shiftRange(target, date);
  return state.loans.find((l) => {
    if (l.id === excludeLoanId || l.driverId !== driverId || !isOpen(l)) return false;
    const shift = findShift(state, l.shiftKey);
    if (!shift) return false;
    return rangesOverlap(targetRange, shiftRange(shift, new Date(l.borrowedAt)));
  });
}

/** 钥匙当前位置：换锁入柜优先，其次未终结借用=在司机手，否则回固定柜位 */
export function keyLocationOf(state: FleetState, vehicleId: string): VehicleKey {
  const version = keyVersionOf(state, vehicleId);
  const vehicle = findVehicle(state, vehicleId);
  const latestChange = [...state.lockChanges]
    .reverse()
    .find((lc) => lc.vehicleId === vehicleId);
  const openLoan = openLoanOfVehicle(state, vehicleId);
  if (latestChange && (!openLoan || latestChange.createdAt > openLoan.borrowedAt)) {
    return { vehicleId, version, slotId: latestChange.slotId, loanId: null };
  }
  if (openLoan) {
    return { vehicleId, version, slotId: null, loanId: openLoan.id };
  }
  return { vehicleId, version, slotId: vehicle?.homeSlot ?? null, loanId: null };
}

/** 逐柜占用：同一时刻一个柜位至多一把钥匙 */
export function cabinetOccupancy(state: FleetState): Occupancy[] {
  const map = new Map<string, Occupancy>();
  for (const slot of state.slots) map.set(slot, { slotId: slot, vehicleId: null, loanId: null });
  const locations = state.vehicles.map((v) => keyLocationOf(state, v.id));
  for (const loc of locations) {
    if (!loc.slotId) continue;
    const slot = map.get(loc.slotId);
    if (slot && !slot.vehicleId) {
      slot.vehicleId = loc.vehicleId;
      slot.loanId = loc.loanId;
    }
  }
  return [...map.values()];
}

/* ---------- 借出 ---------- */

export interface BorrowInput {
  vehicleId: string;
  driverId: string;
  shiftKey: string;
  startMileage: number;
  date: Date;
}

export function checkBorrow(state: FleetState, input: BorrowInput): string[] {
  const errors: string[] = [];
  const vehicle = findVehicle(state, input.vehicleId);
  const driver = findDriver(state, input.driverId);
  const shift = findShift(state, input.shiftKey);
  if (!vehicle) errors.push("请选择车牌");
  if (!driver) errors.push("请选择司机");
  if (!shift) errors.push("请选择班次");
  if (!Number.isFinite(input.startMileage) || input.startMileage < 0) {
    errors.push("请录入有效的起始里程");
  }
  if (vehicle) {
    const blocking = openLoanOfVehicle(state, vehicle.id);
    if (blocking) {
      const holder = findDriver(state, blocking.driverId)?.name ?? "未知司机";
      const reason = blocking.status === "待复核" ? "上一把待复核，复核前仍占钥匙" : "钥匙尚未归还";
      errors.push(`该车钥匙已被借出（${holder}·${findShift(state, blocking.shiftKey)?.label ?? blocking.shiftKey}，${reason}），不得再借`);
    }
  }
  if (driver && shift) {
    const overlap = overlappingLoanOfDriver(state, driver.id, shift.key, input.date);
    if (overlap) {
      const plate = findVehicle(state, overlap.vehicleId)?.plate ?? "未知车牌";
      errors.push(
        `该司机在重叠班次已持有 ${plate} 的钥匙（${findShift(state, overlap.shiftKey)?.label ?? overlap.shiftKey}），重叠班次只能持一把`
      );
    }
  }
  return errors;
}

/* ---------- 归还 ---------- */

export interface ReturnInput {
  endMileage: number | null;
  fuel: number | null;
  condition: Condition | null;
  returnNotes: string;
}

/** 校验归还：缺项、里程倒挂、油量低于三成 => 待复核；复核前仍占钥匙 */
export function evaluateReturn(loan: LoanRecord, input: ReturnInput): {
  status: LoanRecord["status"];
  reviewReasons: string[];
  errors: string[]; // 无法受理的硬错误
} {
  const errors: string[] = [];
  if (input.endMileage !== null && (!Number.isFinite(input.endMileage) || input.endMileage < 0)) {
    errors.push("结束里程无效");
  }
  if (input.fuel !== null && (input.fuel < 0 || input.fuel > 100)) {
    errors.push("油量须为 0-100 的百分比");
  }
  if (errors.length > 0) return { status: loan.status, reviewReasons: loan.reviewReasons, errors };

  const reasons: string[] = [];
  if (input.endMileage === null || input.fuel === null || input.condition === null) {
    const missing: string[] = [];
    if (input.endMileage === null) missing.push("结束里程");
    if (input.fuel === null) missing.push("油量");
    if (input.condition === null) missing.push("车况");
    reasons.push(`缺项：${missing.join("、")} 未录入`);
  }
  if (input.endMileage !== null && input.endMileage < loan.startMileage) {
    reasons.push(`里程倒挂：结束里程 ${input.endMileage} 小于起始里程 ${loan.startMileage}`);
  }
  if (input.fuel !== null && input.fuel < MIN_FUEL) {
    reasons.push(`油量低于三成：${input.fuel}%`);
  }
  return {
    status: reasons.length > 0 ? "待复核" : "已归还",
    reviewReasons: reasons,
    errors: []
  };
}

/** 复核：复核员补齐/修正数据后重新判定 */
export function evaluateReview(loan: LoanRecord, input: ReturnInput) {
  return evaluateReturn(loan, input);
}

/* ---------- 丢失换锁 ---------- */

export function checkLockChange(
  state: FleetState,
  vehicleId: string,
  reason: string,
  slotId?: string
): string[] {
  const errors: string[] = [];
  const vehicle = findVehicle(state, vehicleId);
  if (!vehicle) {
    errors.push("请选择车牌");
  } else {
    const targetSlot = slotId || vehicle.homeSlot;
    if (!state.slots.includes(targetSlot)) {
      errors.push("新钥匙入柜柜位不存在");
    } else {
      // 同柜位不允许放两把钥匙；本车原钥匙若仍占固定柜位则允许落回固定柜位（覆盖语义由换锁取代）
      const occupant = state.vehicles.find((v) => {
        if (v.id === vehicle.id) return false;
        return keyLocationOf(state, v.id).slotId === targetSlot;
      });
      if (occupant) {
        errors.push(`柜位 ${targetSlot} 已被 ${occupant.plate} 的钥匙占用`);
      }
    }
  }
  if (!reason.trim()) errors.push("必须填写丢失/换锁原因");
  return errors;
}

/* ---------- 班次交接：逐柜核对 ---------- */

export interface HandoverBlocker {
  plate: string;
  slotId: string; // 期望柜位（固定柜位）
  driver: string; // 持钥/任务司机
  reason: string;
}

export interface HandoverResult {
  blockers: HandoverBlocker[];
  canClose: boolean;
}

/**
 * 逐柜核对。checks 为柜面实盘（柜位 -> 实际在柜的车牌，空柜传 null）。
 * 阻塞条件：
 *  1) 钥匙遗漏：应在柜但实盘为空；
 *  2) 钥匙错位：柜内钥匙车牌与固定柜位不符；
 *  3) 车辆任务未结束（执行中）；
 *  4) 仍有未终结借还单（含待复核，复核前仍占钥匙）。
 */
export function evaluateHandover(
  state: FleetState,
  shiftKey: string,
  driverId: string,
  checks: SlotCheck[]
): HandoverResult {
  const blockers: HandoverBlocker[] = [];
  const checkMap = new Map(checks.map((c) => [c.slotId, c.foundVehicleId]));
  // 同一车牌被多个柜位盘到：除固定柜位外都算错位
  const foundSlotsByVehicle = new Map<string, string[]>();
  for (const c of checks) {
    if (c.foundVehicleId) {
      const list = foundSlotsByVehicle.get(c.foundVehicleId) ?? [];
      list.push(c.slotId);
      foundSlotsByVehicle.set(c.foundVehicleId, list);
    }
  }

  for (const vehicle of state.vehicles) {
    const loc = keyLocationOf(state, vehicle.id);
    const found = checkMap.get(vehicle.homeSlot) ?? null;
    const openLoan = openLoanOfVehicle(state, vehicle.id);
    const activeTask = state.tasks.find(
      (t) => t.vehicleId === vehicle.id && t.status === "执行中"
    );

    const inCabinet = loc.slotId !== null;

    if (inCabinet) {
      // 钥匙应在柜：逐柜核对实盘
      if (found !== vehicle.id) {
        if (found === null) {
          blockers.push({
            plate: vehicle.plate,
            slotId: vehicle.homeSlot,
            driver: openLoan ? findDriver(state, openLoan.driverId)?.name ?? "未知" : "—",
            reason: "钥匙遗漏：柜位实盘为空，钥匙未在指定柜位"
          });
        } else {
          blockers.push({
            plate: vehicle.plate,
            slotId: vehicle.homeSlot,
            driver: "—",
            reason: `钥匙错位：该柜位实盘为 ${findVehicle(state, found)?.plate ?? "未知车牌"}`
          });
        }
      } else {
        // 车牌对得上，但同一把钥匙是否又被错放进别的柜
        const alsoIn = (foundSlotsByVehicle.get(vehicle.id) ?? []).filter((s) => s !== vehicle.homeSlot);
        if (alsoIn.length > 0) {
          blockers.push({
            plate: vehicle.plate,
            slotId: vehicle.homeSlot,
            driver: "—",
            reason: `钥匙错位：同一车牌同时出现在柜位 ${alsoIn.join("、")}`
          });
        }
      }
    } else if (openLoan) {
      // 钥匙在司机手中
      const holder = findDriver(state, openLoan.driverId)?.name ?? "未知司机";
      const detail =
        openLoan.status === "待复核" ? "归还单停留在待复核，复核前仍占钥匙" : "借还单未归还";
      blockers.push({
        plate: vehicle.plate,
        slotId: vehicle.homeSlot,
        driver: holder,
        reason: `钥匙遗漏：${holder} 持钥未入柜（${detail}）`
      });
    }

    if (activeTask) {
      blockers.push({
        plate: vehicle.plate,
        slotId: vehicle.homeSlot,
        driver: findDriver(state, activeTask.driverId)?.name ?? "未知司机",
        reason: "车辆任务未结束：配送任务仍为执行中"
      });
    }
  }

  // 实盘出现了系统中不存在的车牌
  for (const c of checks) {
    if (c.foundVehicleId && !findVehicle(state, c.foundVehicleId)) {
      blockers.push({
        plate: "未知车牌",
        slotId: c.slotId,
        driver: "—",
        reason: "柜位实盘车牌在系统中不存在"
      });
    }
  }

  void shiftKey;
  void driverId;
  return { blockers, canClose: blockers.length === 0 };
}

/* ---------- 刷新后一致性核对 ---------- */

export interface ConsistencyIssue {
  level: "error" | "warn";
  message: string;
}

/** 钥匙、借还、占用与换锁版本的一致性自检（刷新后执行） */
export function checkConsistency(state: FleetState): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];

  // 1) 同车至多一把未终结钥匙
  for (const v of state.vehicles) {
    const opens = state.loans.filter((l) => l.vehicleId === v.id && isOpen(l));
    if (opens.length > 1) {
      issues.push({ level: "error", message: `${v.plate} 同时存在 ${opens.length} 条未终结借还单` });
    }
  }

  // 2) 借用时记录的钥匙版本不得超过当前版本（旧链保留，只可能更旧）
  for (const loan of state.loans) {
    const current = keyVersionOf(state, loan.vehicleId);
    if (loan.keyVersion > current) {
      issues.push({
        level: "error",
        message: `借还单 ${loan.id} 的钥匙版本 ${loan.keyVersion} 高于当前版本 ${current}`
      });
    }
  }

  // 3) 换锁版本连续递增
  for (const v of state.vehicles) {
    const changes = state.lockChanges.filter((lc) => lc.vehicleId === v.id);
    changes.forEach((lc, i) => {
      if (lc.toVersion !== i + 2 || lc.fromVersion !== i + 1) {
        issues.push({ level: "error", message: `${v.plate} 换锁记录 ${lc.id} 版本链不连续` });
      }
      if (!lc.reason.trim()) {
        issues.push({ level: "error", message: `${v.plate} 换锁记录 ${lc.id} 缺少换锁原因` });
      }
    });
  }

  // 4) 占用唯一：一个柜位至多一把在柜钥匙
  const slotOwners = new Map<string, string>();
  for (const v of state.vehicles) {
    const loc = keyLocationOf(state, v.id);
    if (!loc.slotId) continue;
    const owner = slotOwners.get(loc.slotId);
    if (owner) {
      issues.push({
        level: "error",
        message: `柜位 ${loc.slotId} 同时出现两把钥匙（${owner}、${v.plate}）`
      });
    } else {
      slotOwners.set(loc.slotId, v.plate);
    }
  }

  // 5) 待复核单必须带原因且仍占钥匙
  for (const loan of state.loans) {
    if (loan.status === "待复核" && loan.reviewReasons.length === 0) {
      issues.push({ level: "warn", message: `借还单 ${loan.id} 处于待复核但未记录原因` });
    }
  }

  // 6) 引用完整性
  for (const loan of state.loans) {
    if (!findVehicle(state, loan.vehicleId)) {
      issues.push({ level: "error", message: `借还单 ${loan.id} 引用了已不存在的车辆` });
    }
    if (!findDriver(state, loan.driverId)) {
      issues.push({ level: "warn", message: `借还单 ${loan.id} 引用了已不存在的司机` });
    }
  }

  return issues;
}
