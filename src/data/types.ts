// 数据层：领域模型定义。只做类型与常量，不含规则与存储逻辑。

/** 借还单状态 */
export type LoanStatus = "active" | "returned" | "pending_review" | "lost";

/** 钥匙实时状态（由借还链推导，不落库） */
export type KeyState = "available" | "out" | "pending_review" | "lost";

/** 班次类型 */
export type ShiftKind = "早班" | "中班" | "晚班";

/** 车辆与柜位（一辆车固定一个柜位） */
export interface Vehicle {
  id: string;
  plate: string;
  slot: string;
  /** 进行中的调度任务，null 表示空闲 */
  activeTask: string | null;
}

/** 班次 */
export interface ShiftInfo {
  id: string;
  /** 班次开始日期，YYYY-MM-DD；晚班跨天到次日 */
  date: string;
  kind: ShiftKind;
  status: "open" | "closed";
  openedAt: string;
  closedAt?: string;
  closedBy?: string;
}

/** 借还记录（借还链，只追加不删除） */
export interface Loan {
  id: string;
  vehicleId: string;
  /** 借出时的钥匙版本，换锁后旧版本记录不再占用钥匙 */
  keyVersion: number;
  driver: string;
  shiftId: string;
  startMileage: number;
  borrowedAt: string;
  status: LoanStatus;
  // 归还登记
  endMileage?: number;
  fuelPercent?: number;
  condition?: string;
  returnedSlot?: string;
  returnedAt?: string;
  /** 待复核原因，复核通过后清空 */
  reviewReasons?: string[];
  reviewedAt?: string;
  // 丢失登记
  lostReason?: string;
  lostAt?: string;
}

/** 换锁记录（丢失只能新建，旧借还链保留） */
export interface LockChange {
  id: string;
  vehicleId: string;
  reason: string;
  changedAt: string;
  /** 换锁后启用的新钥匙版本 */
  newKeyVersion: number;
}

/** 交接核对阻塞项 */
export interface HandoverBlocker {
  plate: string;
  slot: string;
  driver: string;
  reason: string;
}

/** 本地存储结构（带版本号，保证刷新后数据一致） */
export interface KeyDB {
  version: number;
  vehicles: Vehicle[];
  shifts: ShiftInfo[];
  loans: Loan[];
  lockChanges: LockChange[];
}

export const LOAN_STATUS_LABEL: Record<LoanStatus, string> = {
  active: "借出中",
  returned: "已归还",
  pending_review: "待复核",
  lost: "已丢失",
};

export const KEY_STATE_LABEL: Record<KeyState, string> = {
  available: "在柜",
  out: "借出中",
  pending_review: "待复核",
  lost: "已丢失",
};
