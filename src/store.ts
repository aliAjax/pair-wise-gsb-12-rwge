import { reactive } from "vue";
import type {
  Condition,
  FleetState,
  HandoverRecord,
  LockChange,
  LoanRecord,
  SlotCheck
} from "./types";
import { SCHEMA_VERSION, createSeedState } from "./schema";
import { storage } from "./storage";
import {
  checkBorrow,
  checkConsistency,
  checkLockChange,
  evaluateHandover,
  evaluateReturn,
  findVehicle,
  keyVersionOf
} from "./rules";

/**
 * 状态层：组合 数据(schema) / 规则(rules) / 存储(storage)。
 * 框架依赖只出现在这里；rules、storage、schema 均与 Vue 无关。
 */

function loadInitial(): FleetState {
  const { state } = storage.load();
  if (state) {
    // 刷新后补齐结构字段，保证各集合始终可用
    return {
      ...createSeedState(),
      ...state,
      schema: SCHEMA_VERSION
    };
  }
  return createSeedState();
}

export const state = reactive<FleetState>(loadInitial());

function commit() {
  state.rev += 1;
  storage.save(state);
}

export interface ActionResult {
  ok: boolean;
  errors: string[];
}

function uid(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export const store = {
  state,

  /* ---------- 借用 ---------- */
  borrow(input: {
    vehicleId: string;
    driverId: string;
    shiftKey: string;
    startMileage: number;
    date: Date;
  }): ActionResult {
    const errors = checkBorrow(state, input);
    if (errors.length) return { ok: false, errors };
    const vehicle = findVehicle(state, input.vehicleId)!;
    const loan: LoanRecord = {
      id: uid("l"),
      vehicleId: input.vehicleId,
      driverId: input.driverId,
      shiftKey: input.shiftKey,
      slotId: vehicle.homeSlot,
      keyVersion: keyVersionOf(state, vehicle.id),
      startMileage: input.startMileage,
      borrowedAt: input.date.toISOString(),
      endMileage: null,
      fuel: null,
      condition: null,
      returnNotes: "",
      returnedAt: null,
      status: "借出",
      reviewReasons: [],
      lockChangeId: null
    };
    state.loans.unshift(loan);
    commit();
    return { ok: true, errors: [] };
  },

  /* ---------- 归还 ---------- */
  returnLoan(
    loanId: string,
    input: {
      endMileage: number | null;
      fuel: number | null;
      condition: Condition | null;
      returnNotes: string;
    }
  ): ActionResult {
    const loan = state.loans.find((l) => l.id === loanId);
    if (!loan) return { ok: false, errors: ["借还单不存在"] };
    if (loan.status !== "借出") {
      return { ok: false, errors: ["当前状态不可登记归还"] };
    }
    const result = evaluateReturn(loan, input);
    if (result.errors.length) return { ok: false, errors: result.errors };
    loan.endMileage = input.endMileage;
    loan.fuel = input.fuel;
    loan.condition = input.condition;
    loan.returnNotes = input.returnNotes;
    loan.returnedAt = new Date().toISOString();
    loan.status = result.status; // 已归还 / 待复核（复核前仍占钥匙）
    loan.reviewReasons = result.reviewReasons;
    commit();
    return { ok: true, errors: result.reviewReasons };
  },

  /** 复核：补录/修正后重新判定；通过即归还入柜，否则继续占钥匙 */
  reviewLoan(
    loanId: string,
    input: {
      endMileage: number | null;
      fuel: number | null;
      condition: Condition | null;
      returnNotes: string;
    }
  ): ActionResult {
    const loan = state.loans.find((l) => l.id === loanId);
    if (!loan) return { ok: false, errors: ["借还单不存在"] };
    if (loan.status !== "待复核") return { ok: false, errors: ["该单据不在待复核状态"] };
    const result = evaluateReturn(loan, input);
    if (result.errors.length) return { ok: false, errors: result.errors };
    loan.endMileage = input.endMileage;
    loan.fuel = input.fuel;
    loan.condition = input.condition;
    loan.returnNotes = input.returnNotes;
    loan.status = result.status;
    loan.reviewReasons = result.reviewReasons;
    if (result.status === "已归还") {
      if (!loan.returnedAt) loan.returnedAt = new Date().toISOString();
    }
    commit();
    return { ok: true, errors: result.reviewReasons };
  },

  /* ---------- 丢失换锁：只能新建带原因的换锁记录，旧借还链保留 ---------- */
  registerLoss(input: {
    vehicleId: string;
    reason: string;
    slotId: string;
  }): ActionResult {
    const errors = checkLockChange(state, input.vehicleId, input.reason, input.slotId);
    if (errors.length) return { ok: false, errors };
    const vehicle = findVehicle(state, input.vehicleId)!;
    const fromVersion = keyVersionOf(state, vehicle.id);
    const openLoan = state.loans.find(
      (l) => l.vehicleId === vehicle.id && (l.status === "借出" || l.status === "待复核")
    );
    const lockChange: LockChange = {
      id: uid("lc"),
      vehicleId: vehicle.id,
      fromVersion,
      toVersion: fromVersion + 1,
      reason: input.reason.trim(),
      loanId: openLoan?.id ?? null,
      driverId: openLoan?.driverId ?? null,
      slotId: input.slotId || vehicle.homeSlot,
      createdAt: new Date().toISOString()
    };
    state.lockChanges.unshift(lockChange);
    // 旧借还链保留：仅终结原借还单并关联换锁单，不删除、不改写历史字段
    if (openLoan) {
      openLoan.status = "丢失换锁";
      openLoan.lockChangeId = lockChange.id;
      openLoan.reviewReasons = openLoan.reviewReasons.filter((r) => !r.startsWith("丢失"));
      openLoan.reviewReasons.push(`钥匙丢失，已新建换锁记录（v${fromVersion} → v${fromVersion + 1}）`);
    }
    commit();
    return { ok: true, errors: [] };
  },

  /* ---------- 班次交接 ---------- */
  previewHandover(shiftKey: string, driverId: string, checks: SlotCheck[]) {
    return evaluateHandover(state, shiftKey, driverId, checks);
  },

  closeShift(input: {
    shiftKey: string;
    driverId: string;
    checks: SlotCheck[];
    note: string;
  }): ActionResult {
    const result = evaluateHandover(state, input.shiftKey, input.driverId, input.checks);
    if (!result.canClose) {
      return { ok: false, errors: result.blockers.map((b) => `${b.plate} ${b.slotId}：${b.reason}`) };
    }
    const record: HandoverRecord = {
      id: uid("h"),
      shiftKey: input.shiftKey,
      driverId: input.driverId,
      checks: input.checks.map((c) => ({ ...c })),
      note: input.note,
      createdAt: new Date().toISOString()
    };
    state.handovers.unshift(record);
    commit();
    return { ok: true, errors: [] };
  },

  /* ---------- 调度任务（保留原有车辆调度能力） ---------- */
  addTask(input: {
    vehicleId: string;
    driverId: string;
    zone: string;
    title: string;
    notes: string;
  }): ActionResult {
    if (!input.vehicleId || !input.driverId || !input.title.trim()) {
      return { ok: false, errors: ["车牌、司机和配送任务为必填"] };
    }
    state.tasks.unshift({
      id: uid("t"),
      vehicleId: input.vehicleId,
      driverId: input.driverId,
      zone: input.zone,
      title: input.title.trim(),
      status: "空闲",
      notes: input.notes || "暂无备注",
      createdAt: new Date().toISOString()
    });
    commit();
    return { ok: true, errors: [] };
  },

  flowTask(taskId: string) {
    const task = state.tasks.find((t) => t.id === taskId);
    if (!task) return;
    task.status = task.status === "空闲" ? "执行中" : task.status === "执行中" ? "已完成" : "空闲";
    commit();
  },

  removeTask(taskId: string) {
    state.tasks = state.tasks.filter((t) => t.id !== taskId);
    commit();
  },

  /* ---------- 车辆 / 司机维护 ---------- */
  addVehicle(input: { plate: string; zone: string; homeSlot: string }): ActionResult {
    const plate = input.plate.trim();
    if (!plate) return { ok: false, errors: ["请填写车牌"] };
    if (state.vehicles.some((v) => v.plate === plate)) {
      return { ok: false, errors: ["车牌已存在"] };
    }
    const slot = input.homeSlot || state.slots.find((s) => !state.vehicles.some((v) => v.homeSlot === s)) || "";
    if (!slot) return { ok: false, errors: ["请指定柜位，且柜位不足请先扩展柜位"] };
    if (state.vehicles.some((v) => v.homeSlot === slot)) {
      return { ok: false, errors: [`柜位 ${slot} 已被占用`] };
    }
    state.vehicles.push({
      id: uid("v"),
      plate,
      zone: input.zone,
      homeSlot: slot,
      createdAt: new Date().toISOString()
    });
    commit();
    return { ok: true, errors: [] };
  },

  addDriver(name: string): ActionResult {
    const trimmed = name.trim();
    if (!trimmed) return { ok: false, errors: ["请填写司机姓名"] };
    if (state.drivers.some((d) => d.name === trimmed)) {
      return { ok: false, errors: ["司机已存在"] };
    }
    state.drivers.push({ id: uid("d"), name: trimmed, createdAt: new Date().toISOString() });
    commit();
    return { ok: true, errors: [] };
  },

  /* ---------- 一致性 / 存储 ---------- */
  checkConsistency() {
    return checkConsistency(state);
  },

  reloadFromStorage() {
    const { state: loaded } = storage.load();
    if (loaded) Object.assign(state, loaded);
  },

  resetSeed() {
    Object.assign(state, createSeedState());
    storage.save(state);
  },

  rev() {
    return state.rev;
  }
};

storage.subscribe(() => store.reloadFromStorage());
