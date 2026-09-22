import { createApp } from "vue";
import "./styles.css";
import App from "./App.vue";

// 不引入额外 UI 依赖：数据(schema/types)、规则(rules)、存储(storage)、页面(components) 分层
createApp(App).mount("#root");
