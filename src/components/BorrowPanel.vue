<script setup lang="ts">
import { reactive, ref } from "vue";
import { store } from "../store";
import { todayValue } from "../format";

const form = reactive({
  vehicleId: "",
  driverId: "",
  shiftKey: "",
  startMileage: "",
  date: todayValue()
});

const errors = ref<string[]>([]);
const okMessage = ref("");

function submit() {
  errors.value = [];
  okMessage.value = "";
  const result = store.borrow({
    vehicleId: form.vehicleId,
    driverId: form.driverId,
    shiftKey: form.shiftKey,
    startMileage: Number(form.startMileage),
    date: new Date(`${form.date}T09:00:00`)
  });
  if (!result.ok) {
    errors.value = result.errors;
    return;
  }
  okMessage.value = "借出登记成功，钥匙已从柜位取出。";
  form.vehicleId = "";
  form.driverId = "";
  form.shiftKey = "";
  form.startMileage = "";
}
</script>

<template>
  <form class="panel" @submit.prevent="submit">
    <h2>钥匙借出登记</h2>
    <p class="hint">按车牌、司机、班次和起始里程登记。同车未归还前不得再借；同司机重叠班次只能持一把。</p>
    <div class="form-grid">
      <label>
        车牌号
        <select v-model="form.vehicleId" required>
          <option value="">请选择车牌</option>
          <option v-for="v in store.state.vehicles" :key="v.id" :value="v.id">
            {{ v.plate }}（柜位 {{ v.homeSlot }}）
          </option>
        </select>
      </label>
      <label>
        司机
        <select v-model="form.driverId" required>
          <option value="">请选择司机</option>
          <option v-for="d in store.state.drivers" :key="d.id" :value="d.id">{{ d.name }}</option>
        </select>
      </label>
      <label>
        班次
        <select v-model="form.shiftKey" required>
          <option value="">请选择班次</option>
          <option v-for="s in store.state.shifts" :key="s.key" :value="s.key">
            {{ s.label }}（{{ s.start }} - {{ s.end }}）
          </option>
        </select>
      </label>
      <label>
        班次日期
        <input v-model="form.date" type="date" required />
      </label>
      <label>
        起始里程 (km)
        <input v-model="form.startMileage" type="number" min="0" step="1" placeholder="如 45200" required />
      </label>
      <button type="submit">确认借出</button>
      <ul v-if="errors.length" class="error-list">
        <li v-for="(e, i) in errors" :key="i">{{ e }}</li>
      </ul>
      <p v-if="okMessage" class="ok-msg">{{ okMessage }}</p>
    </div>
  </form>
</template>
