<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { store } from "../store";
import { cabinetOccupancy } from "../rules";
import { driverName, fmtDateTime, plateOf } from "../format";

const vehicleId = ref("");
const reason = ref("");
const slotId = ref("");
const errors = ref<string[]>([]);
const okMsg = ref("");

const occupiedBy = computed(() => {
  const map = new Map<string, string>();
  for (const o of cabinetOccupancy(store.state)) {
    if (o.vehicleId) map.set(o.slotId, o.vehicleId);
  }
  return map;
});

const availableSlots = computed(() => {
  const v = store.state.vehicles.find((x) => x.id === vehicleId.value);
  return store.state.slots.map((slot) => ({
    slot,
    preferred: v ? slot === v.homeSlot : false,
    disabled: occupiedBy.value.has(slot) && occupiedBy.value.get(slot) !== vehicleId.value
  }));
});

watch(vehicleId, (id) => {
  const v = store.state.vehicles.find((x) => x.id === id);
  slotId.value = v?.homeSlot ?? "";
});

function submit() {
  errors.value = [];
  okMsg.value = "";
  const result = store.registerLoss({
    vehicleId: vehicleId.value,
    reason: reason.value,
    slotId: slotId.value
  });
  if (!result.ok) {
    errors.value = result.errors;
    return;
  }
  okMsg.value = "换锁记录已建立，钥匙版本递增，旧借还链保留。";
  vehicleId.value = "";
  reason.value = "";
  slotId.value = "";
}
</script>

<template>
  <div class="two-col">
    <form class="panel" @submit.prevent="submit">
      <h2>丢失登记 / 换锁</h2>
      <p class="hint">
        钥匙丢失不允许删除或改写旧单，只能新建一条带原因的换锁记录；新钥匙版本递增并入柜，旧借还链完整保留。
      </p>
      <div class="form-grid">
        <label>
          车牌
          <select v-model="vehicleId" required>
            <option value="">请选择车牌</option>
            <option v-for="v in store.state.vehicles" :key="v.id" :value="v.id">
              {{ v.plate }}（当前 v{{ 1 + store.state.lockChanges.filter((lc) => lc.vehicleId === v.id).length }}）
            </option>
          </select>
        </label>
        <label>
          换锁原因（必填）
          <textarea v-model="reason" placeholder="如：柜面盘亏、钥匙折断、遗失报案编号……" required />
        </label>
        <label>
          新钥匙入柜柜位
          <select v-model="slotId">
            <option value="">请选择柜位</option>
            <option
              v-for="o in availableSlots"
              :key="o.slot"
              :value="o.slot"
              :disabled="o.disabled"
            >
              {{ o.slot }}<template v-if="o.preferred">（固定柜位）</template><template v-else-if="o.disabled">（已占用）</template>
            </option>
          </select>
        </label>
        <button type="submit" class="danger">建立换锁记录</button>
        <ul v-if="errors.length" class="error-list">
          <li v-for="(e, i) in errors" :key="i">{{ e }}</li>
        </ul>
        <p v-if="okMsg" class="ok-msg">{{ okMsg }}</p>
      </div>
    </form>

    <section class="list-panel">
      <div class="toolbar">
        <h2>换锁记录</h2>
      </div>
      <div v-if="store.state.lockChanges.length === 0" class="empty">暂无换锁记录</div>
      <div class="record-grid">
        <article v-for="lc in store.state.lockChanges" :key="lc.id" class="record st-丢失换锁">
          <div class="record-head">
            <p class="record-title">{{ plateOf(store.state, lc.vehicleId) }}</p>
            <span class="status badge-丢失换锁">v{{ lc.fromVersion }} → v{{ lc.toVersion }}</span>
          </div>
          <div class="details">
            <span>入柜柜位：{{ lc.slotId ?? "—" }}</span>
            <span>责任司机：{{ lc.driverId ? driverName(store.state, lc.driverId) : "盘亏登记" }}</span>
            <span>关联借还单：{{ lc.loanId ?? "无" }}</span>
            <span>登记时间：{{ fmtDateTime(lc.createdAt) }}</span>
          </div>
          <p class="note">原因：{{ lc.reason }}</p>
        </article>
      </div>
    </section>
  </div>
</template>
