<script setup lang="ts">
import { reactive, ref } from "vue";
import type { ShiftKind } from "../data/types";
import { useKeyCabinetStore } from "../stores/keyCabinet";

const store = useKeyCabinetStore();

const SHIFT_KINDS: readonly ShiftKind[] = ["早班", "中班", "晚班"] as const;

const form = reactive({
  vehicleId: "",
  shiftId: "",
  driver: "",
  startMileage: null as number | null,
});

const error = ref("");
const today = new Date().toISOString().slice(0, 10);

function submit() {
  if (!form.vehicleId) {
    error.value = "请选择车牌";
    return;
  }
  if (!form.shiftId) {
    error.value = "请选择班次";
    return;
  }
  const result = store.borrow({
    vehicleId: form.vehicleId,
    shiftId: form.shiftId,
    driver: form.driver,
    startMileage: form.startMileage ?? NaN,
  });
  if (result) {
    error.value = result;
    return;
  }
  error.value = "";
  form.vehicleId = "";
  form.shiftId = "";
  form.driver = "";
  form.startMileage = null;
}

const newShift = reactive({ date: today, kind: "早班" as ShiftKind });
const shiftError = ref("");
const showShiftForm = ref(false);

function openShift() {
  shiftError.value = store.openShift(newShift.date, newShift.kind) ?? "";
  if (!shiftError.value) showShiftForm.value = false;
}
</script>

<template>
  <section class="panel">
    <h2>钥匙借出登记</h2>
    <form class="form-grid" @submit.prevent="submit">
      <label>
        车牌
        <select v-model="form.vehicleId">
          <option value="">请选择车辆</option>
          <option v-for="vehicle in store.vehicles" :key="vehicle.id" :value="vehicle.id">
            {{ vehicle.plate }}（柜位 {{ vehicle.slot }}）
          </option>
        </select>
      </label>
      <label>
        司机
        <input v-model="form.driver" placeholder="司机姓名" />
      </label>
      <label>
        班次
        <select v-model="form.shiftId">
          <option value="">请选择班次</option>
          <option v-for="shift in store.openShifts" :key="shift.id" :value="shift.id">
            {{ shift.date }} {{ shift.kind }}
          </option>
        </select>
      </label>
      <label>
        起始里程 (km)
        <input v-model.number="form.startMileage" type="number" min="0" step="1" placeholder="例如 52300" />
      </label>
      <p v-if="error" class="form-error">{{ error }}</p>
      <button type="submit">登记借出</button>
    </form>

    <div class="sub-block">
      <button type="button" class="secondary small" @click="showShiftForm = !showShiftForm">
        {{ showShiftForm ? "收起" : "开新班次" }}
      </button>
      <div v-if="showShiftForm" class="inline-form">
        <input v-model="newShift.date" type="date" />
        <select v-model="newShift.kind">
          <option v-for="kind in SHIFT_KINDS" :key="kind" :value="kind">{{ kind }}</option>
        </select>
        <button type="button" class="small" @click="openShift">开班</button>
      </div>
      <p v-if="shiftError" class="form-error">{{ shiftError }}</p>
    </div>
  </section>
</template>
