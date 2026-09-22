<script setup lang="ts">
import { reactive, ref } from "vue";
import { store } from "../store";
import { ZONES } from "../schema";
import { driverName, plateOf } from "../format";

const taskForm = reactive({
  vehicleId: "",
  driverId: "",
  zone: ZONES[0],
  title: "",
  notes: ""
});
const taskErrors = ref<string[]>([]);

function submitTask() {
  taskErrors.value = [];
  const result = store.addTask({ ...taskForm });
  if (!result.ok) {
    taskErrors.value = result.errors;
    return;
  }
  taskForm.title = "";
  taskForm.notes = "";
}

const vehicleForm = reactive({ plate: "", zone: ZONES[0], homeSlot: "" });
const vehicleErrors = ref<string[]>([]);
function submitVehicle() {
  vehicleErrors.value = [];
  const result = store.addVehicle({ ...vehicleForm });
  if (!result.ok) vehicleErrors.value = result.errors;
  else {
    vehicleForm.plate = "";
    vehicleForm.homeSlot = "";
  }
}

const driverNameInput = ref("");
const driverErrors = ref<string[]>([]);
function submitDriver() {
  driverErrors.value = [];
  const result = store.addDriver(driverNameInput.value);
  if (!result.ok) driverErrors.value = result.errors;
  else driverNameInput.value = "";
}
</script>

<template>
  <div class="two-col">
    <form class="panel" @submit.prevent="submitTask">
      <h2>新增配送任务</h2>
      <div class="form-grid">
        <label>
          车牌号
          <select v-model="taskForm.vehicleId" required>
            <option value="">请选择</option>
            <option v-for="v in store.state.vehicles" :key="v.id" :value="v.id">
              {{ v.plate }}（{{ v.homeSlot }}）
            </option>
          </select>
        </label>
        <label>
          司机
          <select v-model="taskForm.driverId" required>
            <option value="">请选择</option>
            <option v-for="d in store.state.drivers" :key="d.id" :value="d.id">{{ d.name }}</option>
          </select>
        </label>
        <label>
          配送区域
          <select v-model="taskForm.zone">
            <option v-for="z in ZONES" :key="z" :value="z">{{ z }}</option>
          </select>
        </label>
        <label>
          配送任务
          <input v-model="taskForm.title" placeholder="如：商超补货" required />
        </label>
        <label>
          备注
          <textarea v-model="taskForm.notes" placeholder="填写处理说明或现场备注" />
        </label>
        <button type="submit">分配任务</button>
        <ul v-if="taskErrors.length" class="error-list">
          <li v-for="(e, i) in taskErrors" :key="i">{{ e }}</li>
        </ul>
      </div>
    </form>

    <section class="list-panel">
      <div class="toolbar">
        <h2>任务列表</h2>
      </div>
      <div class="record-grid">
        <div v-if="store.state.tasks.length === 0" class="empty">暂无任务</div>
        <article v-for="t in store.state.tasks" :key="t.id" class="record">
          <div class="record-head">
            <p class="record-title">
              {{ plateOf(store.state, t.vehicleId) }}
              <span class="sub">/ {{ driverName(store.state, t.driverId) }}</span>
            </p>
            <span class="status" :class="{
              'badge-已归还': t.status === '已完成',
              'badge-借出': t.status === '执行中'
            }">{{ t.status }}</span>
          </div>
          <div class="details">
            <span>区域：{{ t.zone }}</span>
            <span>任务：{{ t.title }}</span>
          </div>
          <p class="note">{{ t.notes }}</p>
          <div class="actions">
            <button type="button" @click="store.flowTask(t.id)">流转状态</button>
            <button type="button" class="danger" @click="store.removeTask(t.id)">删除</button>
          </div>
        </article>
      </div>
    </section>
  </div>

  <div class="two-col admin-row">
    <form class="panel" @submit.prevent="submitVehicle">
      <h2>新增车辆</h2>
      <div class="form-grid">
        <label>
          车牌号
          <input v-model="vehicleForm.plate" placeholder="如 沪E-99K1" required />
        </label>
        <label>
          配送区域
          <select v-model="vehicleForm.zone">
            <option v-for="z in ZONES" :key="z" :value="z">{{ z }}</option>
          </select>
        </label>
        <label>
          固定柜位
          <select v-model="vehicleForm.homeSlot" required>
            <option value="">请选择柜位</option>
            <option
              v-for="s in store.state.slots.filter((slot) => !store.state.vehicles.some((v) => v.homeSlot === slot))"
              :key="s"
              :value="s"
            >
              {{ s }}
            </option>
          </select>
        </label>
        <button type="submit" class="secondary">新增车辆</button>
        <ul v-if="vehicleErrors.length" class="error-list">
          <li v-for="(e, i) in vehicleErrors" :key="i">{{ e }}</li>
        </ul>
      </div>
    </form>

    <form class="panel" @submit.prevent="submitDriver">
      <h2>新增司机</h2>
      <div class="form-grid">
        <label>
          司机姓名
          <input v-model="driverNameInput" placeholder="如 何琳" required />
        </label>
        <button type="submit" class="secondary">新增司机</button>
        <ul v-if="driverErrors.length" class="error-list">
          <li v-for="(e, i) in driverErrors" :key="i">{{ e }}</li>
        </ul>
        <div class="chip-row">
          <span v-for="d in store.state.drivers" :key="d.id" class="tag">{{ d.name }}</span>
        </div>
      </div>
    </form>
  </div>
</template>
