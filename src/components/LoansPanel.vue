<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { LOAN_STATUS_LABEL, type LoanStatus } from "../data/types";
import { useKeyCabinetStore } from "../stores/keyCabinet";

const store = useKeyCabinetStore();

const filter = ref<"all" | "open" | "pending">("open");

const shown = computed(() => {
  const list = [...store.loans].sort((a, b) => b.borrowedAt.localeCompare(a.borrowedAt));
  if (filter.value === "open") return list.filter((loan) => loan.status === "active");
  if (filter.value === "pending") return list.filter((loan) => loan.status === "pending_review");
  return list;
});

type ReturnForm = {
  endMileage: number | null;
  fuelPercent: number | null;
  condition: string;
  returnedSlot: string;
};

function blankReturn(): ReturnForm {
  return { endMileage: null, fuelPercent: null, condition: "", returnedSlot: "" };
}

const returnForms = reactive<Record<string, ReturnForm>>({});
const returnErrors = reactive<Record<string, string>>({});

function formOf(loanId: string): ReturnForm {
  if (!returnForms[loanId]) returnForms[loanId] = blankReturn();
  return returnForms[loanId];
}

function doReturn(loanId: string) {
  const form = formOf(loanId);
  const err = store.returnKey(loanId, { ...form });
  if (err) returnErrors[loanId] = err;
  else {
    delete returnErrors[loanId];
    returnForms[loanId] = blankReturn();
  }
}

// 报失换锁
const lostReason = reactive<Record<string, string>>({});
const lostErrors = reactive<Record<string, string>>({});

function doReportLost(loanId: string) {
  const err = store.reportLostAndChangeLock(loanId, lostReason[loanId] ?? "");
  if (err) lostErrors[loanId] = err;
  else {
    lostReason[loanId] = "";
    delete lostErrors[loanId];
  }
}

function doApprove(loanId: string) {
  store.approveReview(loanId);
}

function statusClass(status: LoanStatus) {
  return `loan-status-${status}`;
}

function fmtTime(iso?: string) {
  return iso ? new Date(iso).toLocaleString("zh-CN", { hour12: false }) : "—";
}
</script>

<template>
  <section class="panel">
    <div class="toolbar">
      <h2>借还记录</h2>
      <div class="tab-group">
        <button type="button" class="small" :class="{ ghost: filter !== 'open' }" @click="filter = 'open'">借出中</button>
        <button type="button" class="small" :class="{ ghost: filter !== 'pending' }" @click="filter = 'pending'">待复核</button>
        <button type="button" class="small" :class="{ ghost: filter !== 'all' }" @click="filter = 'all'">全部</button>
      </div>
    </div>

    <div v-if="shown.length === 0" class="empty">暂无匹配的借还记录</div>

    <article v-for="loan in shown" :key="loan.id" class="loan-card" :class="statusClass(loan.status)">
      <header class="loan-head">
        <div>
          <p class="loan-title">
            {{ store.vehicleOf(loan.vehicleId)?.plate ?? "未知车辆" }}
            <span class="loan-slot">柜 {{ store.vehicleOf(loan.vehicleId)?.slot }}</span>
            <span class="key-ver">借出时钥匙 v{{ loan.keyVersion }}</span>
          </p>
          <p class="loan-sub">{{ loan.driver }} · {{ store.shiftOf(loan.shiftId)?.date }} {{ store.shiftOf(loan.shiftId)?.kind }} · {{ fmtTime(loan.borrowedAt) }}</p>
        </div>
        <span class="loan-status">{{ LOAN_STATUS_LABEL[loan.status] }}</span>
      </header>

      <div class="loan-readouts">
        <span>起始里程：{{ loan.startMileage }} km</span>
        <span v-if="loan.endMileage !== undefined">结束里程：{{ loan.endMileage }} km</span>
        <span v-if="loan.fuelPercent !== undefined">油量：{{ loan.fuelPercent }}%</span>
        <span v-if="loan.condition">车况：{{ loan.condition }}</span>
        <span v-if="loan.returnedSlot">归还柜位：{{ loan.returnedSlot }}</span>
        <span v-if="loan.returnedAt">归还时间：{{ fmtTime(loan.returnedAt) }}</span>
        <span v-if="loan.reviewedAt">复核时间：{{ fmtTime(loan.reviewedAt) }}</span>
        <span v-if="loan.lostReason">丢失原因：{{ loan.lostReason }}</span>
      </div>

      <div v-if="loan.status === 'active'" class="loan-form">
        <div class="return-grid">
          <label>结束里程
            <input v-model.number="formOf(loan.id).endMileage" type="number" min="0" placeholder="km" />
          </label>
          <label>油量 (%)
            <input v-model.number="formOf(loan.id).fuelPercent" type="number" min="0" max="100" placeholder="0-100" />
          </label>
          <label>车况
            <input v-model="formOf(loan.id).condition" placeholder="如：外观正常 / 右前剐蹭" />
          </label>
          <label>归还柜位
            <select v-model="formOf(loan.id).returnedSlot">
              <option value="">请核对柜位</option>
              <option v-for="vehicle in store.vehicles" :key="vehicle.id" :value="vehicle.slot">
                {{ vehicle.slot }}（{{ vehicle.plate }}）
              </option>
            </select>
          </label>
        </div>
        <div class="actions">
          <button type="button" class="small" @click="doReturn(loan.id)">登记归还</button>
          <input v-model="lostReason[loan.id]" class="lost-input" placeholder="丢失原因（报失将自动换锁）" />
          <button type="button" class="danger small" @click="doReportLost(loan.id)">报失并换锁</button>
        </div>
        <p v-if="returnErrors[loan.id]" class="form-error">{{ returnErrors[loan.id] }}</p>
        <p v-if="lostErrors[loan.id]" class="form-error">{{ lostErrors[loan.id] }}</p>
      </div>

      <div v-else-if="loan.status === 'pending_review'" class="review-block">
        <ul class="reasons">
          <li v-for="reason in loan.reviewReasons" :key="reason">{{ reason }}</li>
        </ul>
        <div class="actions">
          <button type="button" class="small" @click="doApprove(loan.id)">复核通过并归还入柜</button>
          <input v-model="lostReason[loan.id]" class="lost-input" placeholder="确认丢失原因（自动换锁）" />
          <button type="button" class="danger small" @click="doReportLost(loan.id)">报失并换锁</button>
        </div>
        <p v-if="lostErrors[loan.id]" class="form-error">{{ lostErrors[loan.id] }}</p>
      </div>
    </article>
  </section>
</template>
