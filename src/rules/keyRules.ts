// 规则层：纯函数，覆盖借还约束、里程油量校验、占钥推导与班次交接核对。
// 不直接读写 localStorage，也不依赖 Vue。
import type {
  HandoverBlocker,
  KeyDB,
  KeyState,
  Loan,
  ShiftInfo,
  ShiftKind,
  Vehicle,
} from "../data/types";

/** 班次对应的时间区间（含交接重叠时段，晚班跨天到次日） */
const SHIFT_RANGE: Record<ShiftKind, [number, number]> = {
  早班: [6, 14],
  中班: [13, 22],
  晚班: [21, 31],
};

export function shiftsOverlap(a: ShiftInfo, b: ShiftInfo): boolean {
  const startA = new Date(`${a.date}T00:00:00`).getTime();
  const startB = new Date(`${b.date}T00:00:00`).getTime();
  const [as, ae] = SHIFT_RANGE[a.kind];
  const [bs, be] = SHIFT_RANGE[b.kind];
  return startA + as * 3600_000 < startB + be * 3600_000 &&
    startB + bs * 3600_000 < startA + ae * 3600_000;
}

/** 当前有效钥匙版本：每次换锁 +1，初始为 1 */
export function currentKeyVersion(db: KeyDB, vehicleId: string): number {
  const changes = db.lockChanges
    .filter((change) => change.vehicleId === vehicleId)
    .sort((a, b) => b.newKeyVersion - a.newKeyVersion);
  return changes[0]?.newKeyVersion ?? 1;
}

/** 仍然占用钥匙的借还单：借出中/待复核，且钥匙版本未失效（旧链换锁后不再占用） */
export function occupyingLoans(db: KeyDB, vehicleId?: string): Loan[] {
  return db.loans.filter((loan) => {
    if (loan.status !== "active" && loan.status !== "pending_review") return false;
    if (vehicleId && loan.vehicleId !== vehicleId) return false;
    return loan.keyVersion === currentKeyVersion(db, loan.vehicleId);
  });
}

/** 钥匙实时状态：在柜 / 借出中 / 待复核 / 已丢失 */
export function keyState(db: KeyDB, vehicleId: string): KeyState {
  const active = occupyingLoans(db, vehicleId);
  const pending = active.find((loan) => loan.status === "pending_review");
  if (pending) return "pending_review";
  if (active.length) return "out";
  const version = currentKeyVersion(db, vehicleId);
  const latest = [...db.loans]
    .filter((loan) => loan.vehicleId === vehicleId && loan.keyVersion === version)
    .sort((a, b) => b.borrowedAt.localeCompare(a.borrowedAt))[0];
  if (latest?.status === "lost") return "lost";
  return "available";
}

export function getVehicle(db: KeyDB, vehicleId: string): Vehicle | undefined {
  return db.vehicles.find((vehicle) => vehicle.id === vehicleId);
}

export function getShift(db: KeyDB, shiftId: string): ShiftInfo | undefined {
  return db.shifts.find((shift) => shift.id === shiftId);
}

/** 同车未归还前不得再借 */
export function vehicleBlockReason(db: KeyDB, vehicleId: string): string | null {
  const state = keyState(db, vehicleId);
  if (state === "out") return "该车上一把钥匙尚未归还";
  if (state === "pending_review") return "该车归还记录停在待复核，复核前仍占钥匙";
  if (state === "lost") return "该车钥匙已报失，请先完成换锁";
  return null;
}

/** 同司机重叠班次只能持一把钥匙 */
export function driverBlockReason(
  db: KeyDB,
  driver: string,
  shiftId: string
): string | null {
  const target = getShift(db, shiftId);
  if (!driver.trim() || !target) return null;
  const conflict = occupyingLoans(db).find((loan) => {
    if (loan.driver.trim() !== driver.trim()) return false;
    const other = getShift(db, loan.shiftId);
    return other ? shiftsOverlap(other, target) : false;
  });
  if (conflict) {
    const vehicle = getVehicle(db, conflict.vehicleId);
    const shift = getShift(db, conflict.shiftId);
    return `司机在重叠班次（${shift?.date ?? ""} ${shift?.kind ?? ""}）已持 ${vehicle?.plate ?? "车辆"} 钥匙`;
  }
  return null;
}

export interface ReturnInput {
  endMileage: number | null;
  fuelPercent: number | null;
  condition: string;
  returnedSlot: string;
}

/** 归还校验：缺项 / 里程倒挂 / 油量低于三成 → 待复核（复核前仍占钥匙） */
export function reviewReasons(loan: Loan, input: ReturnInput): string[] {
  const reasons: string[] = [];
  if (input.endMileage === null || Number.isNaN(input.endMileage)) {
    reasons.push("缺少结束里程");
  } else if (input.endMileage < loan.startMileage) {
    reasons.push(`结束里程 ${input.endMileage} 小于起始里程 ${loan.startMileage}（里程倒挂）`);
  }
  if (input.fuelPercent === null || Number.isNaN(input.fuelPercent)) {
    reasons.push("缺少油量");
  } else if (input.fuelPercent < 30) {
    reasons.push(`油量 ${input.fuelPercent}% 低于三成`);
  }
  if (!input.condition.trim()) reasons.push("缺少车况登记");
  return reasons;
}

/** 逐柜核对：钥匙遗漏、错位或车辆任务未结束时不能关班 */
export function handoverBlockers(db: KeyDB, shift: ShiftInfo): HandoverBlocker[] {
  const blockers: HandoverBlocker[] = [];

  for (const vehicle of db.vehicles) {
    // 本班次该柜的借还单（最新一条）
    const loans = db.loans
      .filter((loan) => loan.vehicleId === vehicle.id && loan.shiftId === shift.id)
      .sort((a, b) => b.borrowedAt.localeCompare(a.borrowedAt));
    const loan = loans[0];

    // 1) 钥匙遗漏：无论占用来自哪个班次，钥匙不在柜且未复核通过即不能关班
    const occupiers = occupyingLoans(db, vehicle.id);
    const occupier = occupiers[0];
    if (occupier) {
      const occupierShift = getShift(db, occupier.shiftId);
      const shiftHint = occupierShift ? `${occupierShift.date} ${occupierShift.kind} · ` : "";
      blockers.push({
        plate: vehicle.plate,
        slot: vehicle.slot,
        driver: occupier.driver,
        reason:
          occupier.status === "pending_review"
            ? `${shiftHint}钥匙已交回但记录待复核，复核前仍占钥匙`
            : `${shiftHint}钥匙遗漏：尚未归还到柜`,
      });
    }

    // 2) 错位：本班次归还时放入的柜位与登记柜位不一致
    if (
      loan &&
      loan.returnedAt &&
      loan.returnedSlot &&
      loan.returnedSlot !== vehicle.slot &&
      loan.keyVersion === currentKeyVersion(db, vehicle.id)
    ) {
      blockers.push({
        plate: vehicle.plate,
        slot: vehicle.slot,
        driver: loan.driver,
        reason: `钥匙错位：归还入柜 ${loan.returnedSlot}，应为 ${vehicle.slot}`,
      });
    }

    // 3) 车辆任务未结束
    if (vehicle.activeTask) {
      blockers.push({
        plate: vehicle.plate,
        slot: vehicle.slot,
        driver: occupier?.driver ?? "—",
        reason: `车辆任务未结束：${vehicle.activeTask}`,
      });
    }
  }

  return blockers;
}

export function canCloseShift(db: KeyDB, shift: ShiftInfo): boolean {
  return handoverBlockers(db, shift).length === 0;
}
