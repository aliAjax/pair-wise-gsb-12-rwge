// 状态层：Pinia store，把规则层与存储层接到页面上。
// 所有写操作先过规则校验，成功后立即落库，保证刷新后钥匙/借还/占用/换锁版本一致。
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type {
  KeyDB,
  Loan,
  LockChange,
  ShiftInfo,
  ShiftKind,
  Vehicle,
} from "../data/types";
import {
  canCloseShift,
  currentKeyVersion,
  driverBlockReason,
  getShift,
  getVehicle,
  keyState,
  occupyingLoans,
  reviewReasons,
  vehicleBlockReason,
  type ReturnInput,
} from "../rules/keyRules";
import { loadDB, saveDB } from "../storage/localStore";

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useKeyCabinetStore = defineStore("keyCabinet", () => {
  const db = ref<KeyDB>(loadDB());

  function persist() {
    saveDB(db.value);
  }

  // ---- 派生状态 ----
  const vehicles = computed(() => db.value.vehicles);
  const loans = computed(() => db.value.loans);
  const shifts = computed(() => db.value.shifts);
  const lockChanges = computed(() => db.value.lockChanges);
  const openShifts = computed(() => db.value.shifts.filter((shift) => shift.status === "open"));
  const occupiedCount = computed(() => occupyingLoans(db.value).length);

  function keyStateOf(vehicleId: string) {
    return keyState(db.value, vehicleId);
  }

  function keyVersionOf(vehicleId: string) {
    return currentKeyVersion(db.value, vehicleId);
  }

  function vehicleOf(vehicleId: string): Vehicle | undefined {
    return getVehicle(db.value, vehicleId);
  }

  function shiftOf(shiftId: string): ShiftInfo | undefined {
    return getShift(db.value, shiftId);
  }

  function loanOf(loanId: string): Loan | undefined {
    return db.value.loans.find((loan) => loan.id === loanId);
  }

  // ---- 借出 ----
  function borrow(input: {
    vehicleId: string;
    driver: string;
    shiftId: string;
    startMileage: number;
  }): string | null {
    const vehicle = getVehicle(db.value, input.vehicleId);
    if (!vehicle) return "车辆不存在";
    const shift = getShift(db.value, input.shiftId);
    if (!shift) return "班次不存在";
    if (shift.status === "closed") return "该班次已关班，不能借出";
    if (!input.driver.trim()) return "请填写司机";
    if (input.startMileage === null || Number.isNaN(input.startMileage) || input.startMileage < 0) {
      return "请填写合法的起始里程";
    }
    const vehicleBlock = vehicleBlockReason(db.value, input.vehicleId);
    if (vehicleBlock) return vehicleBlock;
    const driverBlock = driverBlockReason(db.value, input.driver, input.shiftId);
    if (driverBlock) return driverBlock;

    db.value.loans.push({
      id: uid("loan"),
      vehicleId: input.vehicleId,
      keyVersion: currentKeyVersion(db.value, input.vehicleId),
      driver: input.driver.trim(),
      shiftId: input.shiftId,
      startMileage: input.startMileage,
      borrowedAt: new Date().toISOString(),
      status: "active",
    });
    persist();
    return null;
  }

  // ---- 归还（缺项 / 里程倒挂 / 油量低于三成 → 待复核，仍占钥匙） ----
  function returnKey(loanId: string, input: ReturnInput): string | null {
    const loan = loanOf(loanId);
    if (!loan) return "借还单不存在";
    if (loan.status !== "active") return "该借还单不在借出状态";
    if (!input.returnedSlot.trim()) return "请选择归还柜位";

    const reasons = reviewReasons(loan, input);
    loan.endMileage = input.endMileage ?? undefined;
    loan.fuelPercent = input.fuelPercent ?? undefined;
    loan.condition = input.condition.trim() || undefined;
    loan.returnedSlot = input.returnedSlot.trim();
    loan.returnedAt = new Date().toISOString();
    if (reasons.length) {
      loan.status = "pending_review";
      loan.reviewReasons = reasons;
    } else {
      loan.status = "returned";
      loan.reviewReasons = undefined;
    }
    persist();
    return null;
  }

  // ---- 复核通过：解除占钥 ----
  function approveReview(loanId: string): string | null {
    const loan = loanOf(loanId);
    if (!loan) return "借还单不存在";
    if (loan.status !== "pending_review") return "该借还单不在待复核状态";
    loan.status = "returned";
    loan.reviewedAt = new Date().toISOString();
    loan.reviewReasons = undefined;
    persist();
    return null;
  }

  // ---- 丢失 + 换锁：只能新建记录，旧借还链保留 ----
  function reportLostAndChangeLock(loanId: string, reason: string): string | null {
    const loan = loanOf(loanId);
    if (!loan) return "借还单不存在";
    if (loan.status !== "active" && loan.status !== "pending_review") {
      return "只有借出中或待复核的钥匙才能报失";
    }
    if (!reason.trim()) return "请填写丢失原因";

    loan.status = "lost";
    loan.lostReason = reason.trim();
    loan.lostAt = new Date().toISOString();

    const change: LockChange = {
      id: uid("lock"),
      vehicleId: loan.vehicleId,
      reason: reason.trim(),
      changedAt: new Date().toISOString(),
      newKeyVersion: currentKeyVersion(db.value, loan.vehicleId) + 1,
    };
    db.value.lockChanges.push(change);
    persist();
    return null;
  }

  // ---- 班次 ----
  function openShift(date: string, kind: ShiftKind): string | null {
    if (!date) return "请选择班次日期";
    const duplicated = db.value.shifts.find(
      (shift) => shift.date === date && shift.kind === kind && shift.status === "open"
    );
    if (duplicated) return "该班次已在进行中";
    db.value.shifts.push({
      id: uid("shift"),
      date,
      kind,
      status: "open",
      openedAt: new Date().toISOString(),
    });
    persist();
    return null;
  }

  function closeShift(shiftId: string, operator: string): string | null {
    const shift = getShift(db.value, shiftId);
    if (!shift) return "班次不存在";
    if (shift.status === "closed") return "该班次已关班";
    if (!canCloseShift(db.value, shift)) return "交接核对未通过，不能关班";
    shift.status = "closed";
    shift.closedAt = new Date().toISOString();
    shift.closedBy = operator.trim() || "值班员";
    persist();
    return null;
  }

  // ---- 车辆任务 ----
  function setVehicleTask(vehicleId: string, task: string | null): void {
    const vehicle = getVehicle(db.value, vehicleId);
    if (!vehicle) return;
    vehicle.activeTask = task && task.trim() ? task.trim() : null;
    persist();
  }

  return {
    db,
    vehicles,
    loans,
    shifts,
    lockChanges,
    openShifts,
    occupiedCount,
    keyStateOf,
    keyVersionOf,
    vehicleOf,
    shiftOf,
    loanOf,
    borrow,
    returnKey,
    approveReview,
    reportLostAndChangeLock,
    openShift,
    closeShift,
    setVehicleTask,
  };
});
