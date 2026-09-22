// 数据模型定义：车辆、司机、班次、任务、借还链、换锁记录、交接核对

export type ShiftKey = string;

export interface Vehicle {
  id: string;
  plate: string; // 车牌
  zone: string; // 配送区域
  homeSlot: string; // 固定柜位
  createdAt: string;
}

export interface Driver {
  id: string;
  name: string; // 司机姓名
  createdAt: string;
}

/** 班次时间段（跨午夜时 start > end） */
export interface ShiftDef {
  key: ShiftKey;
  label: string;
  start: string; // HH:MM
  end: string; // HH:MM，跨午夜时小于 start
}

export type TaskStatus = "空闲" | "执行中" | "已完成";

export interface Task {
  id: string;
  vehicleId: string;
  driverId: string;
  zone: string;
  title: string; // 配送任务
  status: TaskStatus;
  notes: string;
  createdAt: string;
}

/** 借还状态：借出 / 已归还 / 待复核 / 丢失换锁 */
export type LoanStatus = "借出" | "已归还" | "待复核" | "丢失换锁";

/** 车辆状况 */
export type Condition = "正常" | "轻微瑕疵" | "明显损伤" | "其他";

export interface LoanRecord {
  id: string;
  vehicleId: string;
  driverId: string;
  shiftKey: ShiftKey;
  slotId: string; // 借出时所在柜位
  keyVersion: number; // 借出时钥匙版本（换锁后递增）
  startMileage: number; // 起始里程
  borrowedAt: string;
  // 归还信息（归还前为空）
  endMileage: number | null; // 结束里程
  fuel: number | null; // 油量百分比 0-100
  condition: Condition | null; // 车况
  returnNotes: string;
  returnedAt: string | null;
  status: LoanStatus;
  /** 待复核原因（缺项 / 里程倒挂 / 油量低于三成），复核通过后清空 */
  reviewReasons: string[];
  /** 复核前仍占钥匙；换锁关单时记录关联的换锁单 */
  lockChangeId: string | null;
  // 归还登记时未处理的字段占位（缺项时保留空值，便于复核补录）
}

/** 换锁记录：丢失只能新建带原因的换锁记录，旧借还链保留 */
export interface LockChange {
  id: string;
  vehicleId: string;
  fromVersion: number;
  toVersion: number;
  reason: string;
  loanId: string | null; // 关联的原借还记录（可能为空：柜面盘亏直接登记）
  driverId: string | null;
  slotId: string | null; // 换锁后钥匙入柜位置
  createdAt: string;
}

/** 逐柜核对结果 */
export interface SlotCheck {
  slotId: string;
  foundVehicleId: string | null; // 柜内实际钥匙车牌；空柜为 null
}

/** 班次交接关班记录 */
export interface HandoverRecord {
  id: string;
  shiftKey: ShiftKey;
  driverId: string; // 交班司机
  checks: SlotCheck[];
  note: string;
  createdAt: string;
}

export interface FleetState {
  schema: number;
  /** 一致性版本号：任何变更（借还/占用/换锁）后递增，刷新后用于核对 */
  rev: number;
  vehicles: Vehicle[];
  drivers: Driver[];
  shifts: ShiftDef[];
  slots: string[];
  tasks: Task[];
  loans: LoanRecord[];
  lockChanges: LockChange[];
  handovers: HandoverRecord[];
}
