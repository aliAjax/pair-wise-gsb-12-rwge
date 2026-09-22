<script setup lang="ts">
import BorrowPanel from "./components/BorrowPanel.vue";
import KeyCabinetGrid from "./components/KeyCabinetGrid.vue";
import LoansPanel from "./components/LoansPanel.vue";
import LockHistoryPanel from "./components/LockHistoryPanel.vue";
import ShiftPanel from "./components/ShiftPanel.vue";
</script>

<template>
  <main class="app">
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">车辆调度 · 钥匙柜管理</p>
          <h1>钥匙柜借还与班次交接</h1>
          <p class="subtitle">
            钥匙按车牌、司机、班次和起始里程登记；同车未归还前不得再借，同司机重叠班次只能持一把。
            归还缺项、里程倒挂或油量低于三成停在待复核，复核前仍占钥匙；逐柜核对无遗漏、无错位、任务结束后方可关班。
          </p>
        </div>
        <div class="stack">
          <span class="tag">Vue3</span>
          <span class="tag">TypeScript</span>
          <span class="tag">Pinia</span>
          <span class="tag">本地存储</span>
        </div>
      </header>

      <KeyCabinetGrid />

      <section class="workspace">
        <BorrowPanel />
        <LoansPanel />
      </section>

      <section class="workspace single">
        <ShiftPanel />
      </section>

      <section class="workspace single">
        <LockHistoryPanel />
      </section>

      <footer class="footnote">
        数据保存在浏览器 localStorage，刷新后钥匙状态、借还记录、占用与换锁版本保持一致。
      </footer>
    </div>
  </main>
</template>
