<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { store } from "../store";
import type { HandoverBlocker, SlotCheck } from "../types";
import { keyLocationOf } from "../rules";
import { driverName, fmtDateTime, shiftLabel } from "../format";

const shiftKey = ref(store.state.shifts[0]?.key ?? "");
const driverId = ref(store.state.drivers[0]?.id ?? "");
const note = ref("");

/** 柜面实盘：每个柜位实际找到的车牌；空柜请选“空柜” */
const found = reactive<Record<string, string>>({});

function initializeChecks() {
  for (const slot of store.state.slots) {
    if (found[slot] === undefined) found[slot] = "";
  }
}
initializeChecks();

const checks = computed<SlotCheck[]>(() =>
  store.state.slots.map((slot) => ({
    slotId: slot,
    foundVehicleId: found[slot] || null
  }))
);

const rows = computed(() =>
  store.state.vehicles.map((v) => {
    const loc = keyLocationOf(store.state, v.id);
    const selected = found[v.homeSlot] || null;
    const match = selected === v.id;
    const openLoan = store.state.loans.find(
      (l) => l.vehicleId === v.id && (l.status === "借出" || l.status === "待复核")
    );
    const activeTask = store.state.tasks.find((t) => t.vehicleId === v.id && t.status === "执行中");
    return { vehicle: v, loc, selected, match, openLoan, activeTask };
  })
);

const preview = computed<{ blockers: HandoverBlocker[]; canClose: boolean }>(() =>
  store.previewHandover(shiftKey.value, driverId.value, checks.value)
);

const errors = ref<string[]>([]);
const closedMsg = ref("");

function close() {
  errors.value = [];
  closedMsg.value = "";
  const result = store.closeShift({
    shiftKey: shiftKey.value,
    driverId: driverId.value,
    checks: checks.value,
    note: note.value
  });
  if (!result.ok) {
    errors.value = result.errors;
    return;
  }
  closedMsg.value = "班次已关闭，交接核对记录已保存。";
  note.value = "";
}

const showHistory = ref(false);
</script>

<template>
  <section class="list-panel">
    <div class="toolbar">
      <h2>班次交接 · 逐柜核对</h2>
      <button type="button" class="secondary" @click="showHistory = !showHistory">
        {{ showHistory ? "收起关班记录" : "查看关班记录" }}
      </button>
    </div>

    <form class="handover-head" @submit.prevent>
      <label>
        交班班次
        <select v-model="shiftKey">
          <option v-for="s in store.state.shifts" :key="s.key" :value="s.key">{{ s.label }}</option>
        </select>
      </label>
      <label>
        交班司机
        <select v-model="driverId">
          <option v-for="d in store.state.drivers" :key="d.id" :value="d.id">{{ d.name }}</option>
        </select>
      </label>
      <label class="grow">
        交接备注
        <input v-model="note" placeholder="如：全部钥匙在位，注意 v3 待复核划痕" />
      </label>
    </form>

    <p v-if="closedMsg" class="ok-msg">{{ closedMsg }}</p>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>固定柜位</th>
            <th>车牌</th>
            <th>系统中钥匙位置</th>
            <th>持钥司机</th>
            <th>柜面实盘</th>
            <th>任务状态</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.vehicle.id" :class="{ rowBad: row.selected !== null && !row.match }">
            <td>{{ row.vehicle.homeSlot }}</td>
            <td>{{ row.vehicle.plate }}</td>
            <td>
              <template v-if="row.loc.slotId">柜位 {{ row.loc.slotId }}（v{{ row.loc.version }}）</template>
              <template v-else><span class="badge-借出">在司机手中</span></template>
            </td>
            <td>{{ row.openLoan ? driverName(store.state, row.openLoan.driverId) : "—" }}</td>
            <td>
              <select v-model="found[row.vehicle.homeSlot]">
                <option value="">空柜</option>
                <option
                  v-for="v in store.state.vehicles"
                  :key="v.id"
                  :value="v.id"
                >
                  {{ v.plate }}
                </option>
              </select>
            </td>
            <td>
              <span v-if="row.activeTask" class="badge-借出">执行中</span>
              <span v-else>已结束/空闲</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <section class="blocker-box">
      <h3>阻塞核对（{{ preview.blockers.length }}）</h3>
      <div v-if="preview.canClose" class="all-clear">
        钥匙、柜位、任务全部核对一致，可以关班。
      </div>
      <div v-else class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>车牌</th>
              <th>柜位</th>
              <th>司机</th>
              <th>阻塞原因</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(b, i) in preview.blockers" :key="i">
              <td>{{ b.plate }}</td>
              <td>{{ b.slotId }}</td>
              <td>{{ b.driver }}</td>
              <td class="reason-cell">{{ b.reason }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <ul v-if="errors.length" class="error-list">
        <li v-for="(e, i) in errors" :key="i">{{ e }}</li>
      </ul>
      <div class="actions">
        <button type="button" :disabled="!preview.canClose" @click="close">确认关班</button>
        <span v-if="!preview.canClose" class="hint">存在阻塞项时不能关班。</span>
      </div>
    </section>

    <section v-if="showHistory" class="history-box">
      <h3>关班记录</h3>
      <div v-if="store.state.handovers.length === 0" class="empty">暂无关班记录</div>
      <article v-for="h in store.state.handovers" :key="h.id" class="record">
        <div class="record-head">
          <p class="record-title">{{ shiftLabel(store.state, h.shiftKey) }} · {{ driverName(store.state, h.driverId) }}</p>
          <span class="status">已关班</span>
        </div>
        <div class="details">
          <span>关班时间：{{ fmtDateTime(h.createdAt) }}</span>
          <span>核对柜位数：{{ h.checks.length }}</span>
        </div>
        <p v-if="h.note" class="note">{{ h.note }}</p>
      </article>
    </section>
  </section>
</template>
