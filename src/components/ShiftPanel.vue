<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import type { HandoverBlocker, ShiftInfo } from "../data/types";
import { handoverBlockers } from "../rules/keyRules";
import { useKeyCabinetStore } from "../stores/keyCabinet";

const store = useKeyCabinetStore();

const sortedShifts = computed(() =>
  [...store.shifts].sort((a, b) => b.openedAt.localeCompare(a.openedAt))
);

const selectedId = ref<string>("");
const selected = computed<ShiftInfo | undefined>(() =>
  sortedShifts.value.find((shift) => shift.id === (selectedId.value || sortedShifts.value[0]?.id))
);

const blockers = computed<HandoverBlocker[]>(() =>
  selected.value ? handoverBlockers(store.db, selected.value) : []
);

const operator = reactive({ name: "" });
const closeError = ref("");

function fmtTime(iso?: string) {
  return iso ? new Date(iso).toLocaleString("zh-CN", { hour12: false }) : "—";
}

function doClose() {
  if (!selected.value) return;
  closeError.value = store.closeShift(selected.value.id, operator.name) ?? "";
  if (!closeError.value) operator.name = "";
}
</script>

<template>
  <section class="panel">
    <div class="toolbar">
      <h2>班次交接核对</h2>
      <select v-model="selectedId">
        <option v-for="shift in sortedShifts" :key="shift.id" :value="shift.id">
          {{ shift.date }} {{ shift.kind }}（{{ shift.status === "open" ? "进行中" : "已关班" }}）
        </option>
      </select>
    </div>

    <template v-if="selected">
      <p class="shift-meta">
        开班：{{ fmtTime(selected.openedAt) }} ·
        关班：{{ fmtTime(selected.closedAt) }} ·
        关班人：{{ selected.closedBy ?? "—" }}
      </p>

      <table class="blocker-table">
        <thead>
          <tr><th>车牌</th><th>柜位</th><th>司机</th><th>阻塞原因</th></tr>
        </thead>
        <tbody>
          <tr v-if="blockers.length === 0">
            <td colspan="4" class="all-clear">逐柜核对通过：无遗漏、无错位、车辆任务均已结束，可以关班</td>
          </tr>
          <tr v-for="(blocker, index) in blockers" :key="`${blocker.plate}-${index}`">
            <td>{{ blocker.plate }}</td>
            <td>{{ blocker.slot }}</td>
            <td>{{ blocker.driver }}</td>
            <td class="reason-cell">{{ blocker.reason }}</td>
          </tr>
        </tbody>
      </table>

      <div v-if="selected.status === 'open'" class="close-bar">
        <input v-model="operator.name" placeholder="交班人姓名" />
        <button type="button" class="small" :disabled="blockers.length > 0" @click="doClose">
          逐柜核对无误，关班
        </button>
        <span v-if="blockers.length > 0" class="form-hint">存在 {{ blockers.length }} 项阻塞，不能关班</span>
      </div>
      <p v-if="closeError" class="form-error">{{ closeError }}</p>
    </template>
    <div v-else class="empty">暂无班次，请先在「借出登记」中开班</div>
  </section>
</template>
