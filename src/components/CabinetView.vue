<script setup lang="ts">
import { computed } from "vue";
import { store } from "../store";
import { cabinetOccupancy, keyLocationOf } from "../rules";
import { driverName, plateOf } from "../format";

const occupancy = computed(() => cabinetOccupancy(store.state));

const vehicleRows = computed(() =>
  store.state.vehicles.map((v) => {
    const loc = keyLocationOf(store.state, v.id);
    const open = store.state.loans.find(
      (l) => l.vehicleId === v.id && (l.status === "借出" || l.status === "待复核")
    );
    return { vehicle: v, loc, open };
  })
);
</script>

<template>
  <section class="list-panel">
    <div class="toolbar">
      <h2>钥匙柜占用</h2>
      <p class="hint">占用与换锁版本均由借还链派生：刷新后钥匙、借还、占用、换锁版本保持一致。</p>
    </div>

    <div class="cabinet-grid">
      <article v-for="o in occupancy" :key="o.slotId" class="slot" :class="{ empty: !o.vehicleId }">
        <header>{{ o.slotId }}</header>
        <template v-if="o.vehicleId">
          <strong>{{ plateOf(store.state, o.vehicleId) }}</strong>
          <span class="slot-state">在柜</span>
        </template>
        <template v-else>
          <strong class="muted">空柜</strong>
          <span class="slot-state">—</span>
        </template>
      </article>
    </div>

    <h3 class="table-title">每把钥匙当前位置与版本</h3>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>车牌</th>
            <th>固定柜位</th>
            <th>当前位置</th>
            <th>钥匙版本</th>
            <th>持钥司机/状态</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in vehicleRows" :key="row.vehicle.id">
            <td>{{ row.vehicle.plate }}</td>
            <td>{{ row.vehicle.homeSlot }}</td>
            <td>
              <template v-if="row.loc.slotId">柜位 {{ row.loc.slotId }}</template>
              <template v-else>司机手中</template>
            </td>
            <td>
              <span class="version">v{{ row.loc.version }}</span>
            </td>
            <td v-if="row.open">
              <span :class="['badge-' + row.open.status]">{{ row.open.status }}</span>
              {{ driverName(store.state, row.open.driverId) }}
            </td>
            <td v-else>在柜可借</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
