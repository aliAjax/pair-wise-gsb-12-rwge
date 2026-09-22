<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { store } from "./store";
import { keyLocationOf, openLoans } from "./rules";
import BorrowPanel from "./components/BorrowPanel.vue";
import LoanList from "./components/LoanList.vue";
import CabinetView from "./components/CabinetView.vue";
import HandoverPanel from "./components/HandoverPanel.vue";
import LockChangePanel from "./components/LockChangePanel.vue";
import DispatchPanel from "./components/DispatchPanel.vue";

type TabKey = "dispatch" | "borrow" | "cabinet" | "handover" | "locks";

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "cabinet", label: "钥匙柜总览" },
  { key: "borrow", label: "借出 / 借还" },
  { key: "handover", label: "班次交接" },
  { key: "locks", label: "丢失换锁" },
  { key: "dispatch", label: "车辆调度" }
];

const activeTab = ref<TabKey>("cabinet");

const metrics = computed(() => {
  const locations = store.state.vehicles.map((v) => keyLocationOf(store.state, v.id));
  const inCabinet = locations.filter((l) => l.slotId !== null).length;
  const loans = openLoans(store.state);
  const borrowing = loans.filter((l) => l.status === "借出").length;
  const reviewing = loans.filter((l) => l.status === "待复核").length;
  return [
    { label: "在柜钥匙", value: inCabinet },
    { label: "借出中", value: borrowing },
    { label: "待复核（仍占钥匙）", value: reviewing },
    { label: "累计换锁", value: store.state.lockChanges.length }
  ];
});

// 刷新后一致性自检：钥匙、借还、占用、换锁版本
const consistencyIssues = ref(store.checkConsistency());
watch(
  () => store.state.rev,
  () => {
    consistencyIssues.value = store.checkConsistency();
  }
);

const showReset = ref(false);
function resetSeed() {
  store.resetSeed();
  showReset.value = false;
  activeTab.value = "cabinet";
}
</script>

<template>
  <main class="app">
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">物流行业前端最小闭环</p>
          <h1>车辆调度 · 钥匙柜借还与班次交接</h1>
          <p class="subtitle">
            按车牌、司机、班次和起始里程登记借钥；同车未还不重借、同司机重叠班次只持一把。
            归还校验里程、油量与车况，异常停待复核；交接逐柜核对，阻塞项不清除不能关班；
            丢失只建换锁记录，旧链保留。数据存于本地 localStorage。
          </p>
        </div>
        <div class="stack">
          <span class="tag">Vue3</span>
          <span class="tag">TypeScript</span>
          <span class="tag">本地存储</span>
          <span class="tag rev-tag">一致性版本 rev-{{ store.state.rev }}</span>
        </div>
      </header>

      <section v-if="consistencyIssues.length" class="consistency-banner">
        <strong>刷新一致性自检发现 {{ consistencyIssues.length }} 项问题：</strong>
        <ul>
          <li v-for="(issue, i) in consistencyIssues" :key="i" :class="issue.level">
            [{{ issue.level === "error" ? "错误" : "提醒" }}] {{ issue.message }}
          </li>
        </ul>
      </section>

      <section class="metrics">
        <article v-for="m in metrics" :key="m.label" class="metric">
          <span>{{ m.label }}</span>
          <strong>{{ m.value }}</strong>
        </article>
      </section>

      <nav class="tabs">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          type="button"
          class="tab"
          :class="{ active: activeTab === tab.key }"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
        </button>
      </nav>

      <section class="tab-body">
        <CabinetView v-if="activeTab === 'cabinet'" />

        <div v-else-if="activeTab === 'borrow'" class="workspace">
          <BorrowPanel />
          <LoanList />
        </div>

        <HandoverPanel v-else-if="activeTab === 'handover'" />

        <LockChangePanel v-else-if="activeTab === 'locks'" />

        <DispatchPanel v-else-if="activeTab === 'dispatch'" />
      </section>

      <footer class="footer">
        <button type="button" class="secondary mini" @click="showReset = !showReset">
          重置为演示数据
        </button>
        <span v-if="showReset" class="reset-confirm">
          确认清空当前本地数据并恢复演示数据？
          <button type="button" class="danger mini" @click="resetSeed">确认重置</button>
          <button type="button" class="secondary mini" @click="showReset = false">取消</button>
        </span>
      </footer>
    </div>
  </main>
</template>
