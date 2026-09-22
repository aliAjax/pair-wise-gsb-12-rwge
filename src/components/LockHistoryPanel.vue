<script setup lang="ts">
import { computed } from "vue";
import { useKeyCabinetStore } from "../stores/keyCabinet";

const store = useKeyCabinetStore();

const history = computed(() =>
  [...store.lockChanges].sort((a, b) => b.changedAt.localeCompare(a.changedAt))
);

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("zh-CN", { hour12: false });
}
</script>

<template>
  <section class="panel">
    <h2>换锁版本记录</h2>
    <p class="form-hint">钥匙丢失只能新建换锁记录并启用新版本，旧借还链保留可查。</p>
    <table v-if="history.length" class="blocker-table">
      <thead>
        <tr><th>车牌</th><th>柜位</th><th>原因</th><th>换锁时间</th><th>新版本</th></tr>
      </thead>
      <tbody>
        <tr v-for="change in history" :key="change.id">
          <td>{{ store.vehicleOf(change.vehicleId)?.plate ?? "—" }}</td>
          <td>{{ store.vehicleOf(change.vehicleId)?.slot ?? "—" }}</td>
          <td class="reason-cell">{{ change.reason }}</td>
          <td>{{ fmtTime(change.changedAt) }}</td>
          <td>v{{ change.newKeyVersion }}</td>
        </tr>
      </tbody>
    </table>
    <div v-else class="empty">暂无换锁记录</div>
  </section>
</template>
