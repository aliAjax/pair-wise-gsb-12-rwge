<script setup lang="ts">
import { computed } from "vue";
import { KEY_STATE_LABEL } from "../data/types";
import { useKeyCabinetStore } from "../stores/keyCabinet";
import { occupyingLoans } from "../rules/keyRules";

const store = useKeyCabinetStore();

const metric = computed(() => {
  const total = store.vehicles.length;
  const states = store.vehicles.map((vehicle) => store.keyStateOf(vehicle.id));
  const out = states.filter((state) => state === "out").length;
  const pending = states.filter((state) => state === "pending_review").length;
  const lost = states.filter((state) => state === "lost").length;
  return { total, out, pending, lost, occupied: store.occupiedCount };
});

const occupiedByVehicle = computed(() => {
  const map = new Map<string, ReturnType<typeof occupyingLoans>[number]>();
  for (const loan of occupyingLoans(store.db)) map.set(loan.vehicleId, loan);
  return map;
});

function saveTask(vehicleId: string, event: Event) {
  const value = (event.target as HTMLInputElement).value;
  store.setVehicleTask(vehicleId, value);
}
</script>

<template>
  <section class="panel">
    <h2>钥匙柜总览</h2>
    <div class="metric-row">
      <div class="mini-metric"><span>柜位/钥匙</span><strong>{{ metric.total }}</strong></div>
      <div class="mini-metric"><span>借出中</span><strong>{{ metric.out }}</strong></div>
      <div class="mini-metric warn"><span>待复核（仍占钥）</span><strong>{{ metric.pending }}</strong></div>
      <div class="mini-metric danger"><span>已丢失</span><strong>{{ metric.lost }}</strong></div>
    </div>

    <div class="cabinet-grid">
      <article v-for="vehicle in store.vehicles" :key="vehicle.id" class="slot-card" :class="`state-${store.keyStateOf(vehicle.id)}`">
        <header>
          <span class="slot-no">{{ vehicle.slot }}</span>
          <span class="key-badge">钥匙 v{{ store.keyVersionOf(vehicle.id) }}</span>
        </header>
        <p class="plate">{{ vehicle.plate }}</p>
        <p class="key-state">{{ KEY_STATE_LABEL[store.keyStateOf(vehicle.id)] }}</p>
        <dl v-if="occupiedByVehicle.get(vehicle.id)" class="holder">
          <dt>持钥司机</dt><dd>{{ occupiedByVehicle.get(vehicle.id)!.driver }}</dd>
        </dl>
        <div class="task-line">
          <input
            :value="vehicle.activeTask ?? ''"
            placeholder="车辆任务（空=已结束）"
            @change="saveTask(vehicle.id, $event)"
          />
          <button
            type="button"
            class="secondary small"
            :disabled="!vehicle.activeTask"
            @click="store.setVehicleTask(vehicle.id, null)"
          >结束任务</button>
        </div>
      </article>
    </div>
  </section>
</template>
