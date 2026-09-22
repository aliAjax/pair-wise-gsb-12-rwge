<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { store } from "../store";
import type { Condition, LoanRecord } from "../types";
import { driverName, fmtDateTime, plateOf, shiftLabel } from "../format";

const statusFilter = ref<"全部" | LoanRecord["status"]>("全部");

const filtered = computed(() =>
  statusFilter.value === "全部"
    ? store.state.loans
    : store.state.loans.filter((l) => l.status === statusFilter.value)
);

const STATUSES: Array<LoanRecord["status"]> = ["借出", "待复核", "已归还", "丢失换锁"];

const CONDITIONS: Condition[] = ["正常", "轻微瑕疵", "明显损伤", "其他"];

type FormState = {
  endMileage: string;
  fuel: string;
  condition: "" | Condition;
  returnNotes: string;
};

function blankForm(loan: LoanRecord): FormState {
  return {
    endMileage: loan.endMileage ?? "",
    fuel: loan.fuel ?? "",
    condition: loan.condition ?? "",
    returnNotes: loan.returnNotes ?? ""
  };
}

const openId = ref<string | null>(null);
const form = reactive<FormState>({
  endMileage: "",
  fuel: "",
  condition: "",
  returnNotes: ""
});
const errors = ref<string[]>([]);
const notices = ref<string[]>([]);

function toggle(loan: LoanRecord) {
  if (openId.value === loan.id) {
    openId.value = null;
    return;
  }
  openId.value = loan.id;
  errors.value = [];
  notices.value = [];
  Object.assign(form, blankForm(loan));
}

function payload() {
  return {
    endMileage: form.endMileage === "" ? null : Number(form.endMileage),
    fuel: form.fuel === "" ? null : Number(form.fuel),
    condition: form.condition === "" ? null : form.condition,
    returnNotes: form.returnNotes
  };
}

function submitReturn(loan: LoanRecord) {
  errors.value = [];
  notices.value = [];
  const result = store.returnLoan(loan.id, payload());
  if (!result.ok) {
    errors.value = result.errors;
  } else if (result.errors.length) {
    notices.value = ["已停在待复核：", ...result.errors];
    openId.value = null;
  } else {
    notices.value = ["归还成功，钥匙回柜。"];
    openId.value = null;
  }
}

function submitReview(loan: LoanRecord) {
  errors.value = [];
  notices.value = [];
  const result = store.reviewLoan(loan.id, payload());
  if (!result.ok) {
    errors.value = result.errors;
  } else if (result.errors.length) {
    notices.value = ["复核未通过，仍停在待复核：", ...result.errors];
  } else {
    notices.value = ["复核通过，钥匙回柜，借还单关闭。"];
    openId.value = null;
  }
}

const lossOpenId = ref<string | null>(null);
const lossReason = ref("");
const lossSlot = ref("");
const lossErrors = ref<string[]>([]);

function toggleLoss(loan: LoanRecord) {
  lossOpenId.value = lossOpenId.value === loan.id ? null : loan.id;
  lossReason.value = "";
  lossSlot.value = loan.slotId;
  lossErrors.value = [];
}

function submitLoss(loan: LoanRecord) {
  lossErrors.value = [];
  const result = store.registerLoss({
    vehicleId: loan.vehicleId,
    reason: lossReason.value,
    slotId: lossSlot.value
  });
  if (!result.ok) {
    lossErrors.value = result.errors;
    return;
  }
  lossOpenId.value = null;
}

const noticeKey = ref(0);
function clearNotices() {
  notices.value = [];
  noticeKey.value += 1;
}
</script>

<template>
  <section class="list-panel">
    <div class="toolbar">
      <h2>借还记录</h2>
      <div class="filter-tabs">
        <button
          v-for="s in ['全部', ...STATUSES]"
          :key="s"
          type="button"
          class="chip"
          :class="{ active: statusFilter === s }"
          @click="statusFilter = s as typeof statusFilter"
        >
          {{ s }}
        </button>
      </div>
    </div>

    <div v-if="notices.length" :key="noticeKey" class="notice-box">
      <p v-for="(n, i) in notices" :key="i" :class="{ warn: i > 0 || notices[0].includes('待复核') }">{{ n }}</p>
      <button type="button" class="secondary mini" @click="clearNotices">知道了</button>
    </div>

    <div class="record-grid">
      <div v-if="filtered.length === 0" class="empty">暂无匹配的借还单</div>

      <article v-for="loan in filtered" :key="loan.id" class="record" :class="['st-' + loan.status]">
        <div class="record-head">
          <p class="record-title">
            {{ plateOf(store.state, loan.vehicleId) }}
            <span class="sub">/ {{ driverName(store.state, loan.driverId) }} / {{ shiftLabel(store.state, loan.shiftKey) }}</span>
          </p>
          <span class="status" :class="['badge-' + loan.status]">{{ loan.status }}</span>
        </div>

        <div class="details">
          <span>借出柜位：{{ loan.slotId }}</span>
          <span>钥匙版本：v{{ loan.keyVersion }}</span>
          <span>起始里程：{{ loan.startMileage }} km</span>
          <span>结束里程：{{ loan.endMileage ?? "—" }}<template v-if="loan.endMileage !== null"> km</template></span>
          <span>油量：{{ loan.fuel === null ? "—" : loan.fuel + "%" }}</span>
          <span>车况：{{ loan.condition ?? "—" }}</span>
          <span>借出时间：{{ fmtDateTime(loan.borrowedAt) }}</span>
          <span>归还时间：{{ fmtDateTime(loan.returnedAt) }}</span>
        </div>

        <div v-if="loan.reviewReasons.length" class="review-box">
          <strong>待复核原因：</strong>
          <ul>
            <li v-for="(r, i) in loan.reviewReasons" :key="i">{{ r }}</li>
          </ul>
          <p v-if="loan.status === '待复核'" class="occupy-tip">复核未通过前，该钥匙仍占用柜位/持钥状态，车辆与司机均不能再借。</p>
        </div>

        <p v-if="loan.returnNotes" class="note">归还备注：{{ loan.returnNotes }}</p>
        <p v-if="loan.lockChangeId" class="loss-link">已关联换锁记录：{{ loan.lockChangeId }}</p>

        <div class="actions">
          <button v-if="loan.status === '借出'" type="button" @click="toggle(loan)">
            {{ openId === loan.id ? "收起" : "登记归还" }}
          </button>
          <button v-if="loan.status === '待复核'" type="button" class="warn-btn" @click="toggle(loan)">
            {{ openId === loan.id ? "收起复核" : "复核处理" }}
          </button>
          <button
            v-if="loan.status === '借出' || loan.status === '待复核'"
            type="button"
            class="danger"
            @click="toggleLoss(loan)"
          >
            登记丢失换锁
          </button>
        </div>

        <form v-if="openId === loan.id" class="inline-form" @submit.prevent>
          <div class="form-grid">
            <label>
              结束里程 (km)
              <input v-model="form.endMileage" type="number" min="0" step="1" />
            </label>
            <label>
              油量 (%)
              <input v-model="form.fuel" type="number" min="0" max="100" step="1" />
            </label>
            <label>
              车况
              <select v-model="form.condition">
                <option value="">请选择</option>
                <option v-for="c in CONDITIONS" :key="c" :value="c">{{ c }}</option>
              </select>
            </label>
            <label>
              车况/归还备注
              <textarea v-model="form.returnNotes" placeholder="如：右后门有划痕；油量不足已加油" />
            </label>
            <div class="actions">
              <button v-if="loan.status === '借出'" type="button" @click="submitReturn(loan)">提交归还</button>
              <button v-else type="button" class="warn-btn" @click="submitReview(loan)">复核确认</button>
            </div>
            <ul v-if="errors.length" class="error-list">
              <li v-for="(e, i) in errors" :key="i">{{ e }}</li>
            </ul>
            <p class="hint">缺项、里程倒挂或油量低于 30% 将停在“待复核”，复核前仍占钥匙。</p>
          </div>
        </form>

        <form v-if="lossOpenId === loan.id" class="inline-form loss-form" @submit.prevent>
          <div class="form-grid">
            <label>
              丢失/换锁原因（必填）
              <textarea v-model="lossReason" placeholder="如：晚班收车未找到钥匙，疑似遗失" />
            </label>
            <label>
              新钥匙入柜柜位
              <select v-model="lossSlot">
                <option :value="loan.slotId">固定柜位（{{ loan.slotId }}）</option>
                <option v-for="s in store.state.slots.filter((x) => x !== loan.slotId)" :key="s" :value="s">
                  {{ s }}
                </option>
              </select>
            </label>
            <div class="actions">
              <button type="button" class="danger" @click="submitLoss(loan)">确认丢失并新建换锁记录</button>
            </div>
            <ul v-if="lossErrors.length" class="error-list">
              <li v-for="(e, i) in lossErrors" :key="i">{{ e }}</li>
            </ul>
            <p class="hint">旧借还链完整保留，仅终结原单并关联换锁记录，钥匙版本递增。</p>
          </div>
        </form>
      </article>
    </div>
  </section>
</template>
