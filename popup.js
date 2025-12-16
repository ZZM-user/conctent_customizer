import { doesUrlMatchRule } from "./shared/ruleMatcher.js";

const MATCH_TYPE_LABELS = {
  exact: "精确匹配",
  contains: "包含路径",
  wildcard: "通配符",
  regex: "正则表达式"
};

const ruleListEl = document.getElementById("rule-list");
const activeCountEl = document.getElementById("active-count");
const noRulesEl = document.getElementById("no-rules");
const statusEl = document.getElementById("popup-status");
const currentUrlEl = document.getElementById("current-url");
const toggleAllBtn = document.getElementById("toggle-all");
const openOptionsBtn = document.getElementById("open-options");
const quickCreateBtn = document.getElementById("quick-create");

const state = {
  tab: null,
  url: "",
  matchingRules: [],
  allRules: []
};

const setStatus = (message, isError = false) => {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
};

const getActiveTab = () =>
  chrome.tabs
    .query({ active: true, currentWindow: true })
    .then((tabs) => tabs[0]);

const fetchMatchingRules = async () => {
  if (!state.url) {
    state.matchingRules = [];
    renderRules();
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({
      type: "GET_RULES_FOR_URL",
      url: state.url
    });

    if (!response?.success) {
      throw new Error(response?.error || "Unable to get rules.");
    }

    state.allRules = response.rules || [];
    state.matchingRules = state.allRules.filter((rule) =>
      doesUrlMatchRule(state.url, rule)
    );
    renderRules();
  } catch (error) {
    console.error(error);
    setStatus("无法获取规则，请稍后重试。", true);
  }
};

const renderRules = () => {
  ruleListEl.innerHTML = "";

  if (!state.matchingRules.length) {
    noRulesEl.classList.remove("hidden");
    activeCountEl.textContent = "已启用 0 / 0";
    toggleAllBtn.disabled = true;
    toggleAllBtn.textContent = "禁用该页所有匹配规则";
    return;
  }

  toggleAllBtn.disabled = false;
  noRulesEl.classList.add("hidden");

  let activeCount = 0;
  state.matchingRules.forEach((rule) => {
    if (rule.enabled) {
      activeCount += 1;
    }

    const item = document.createElement("li");
    item.className = "rule-card";

    const info = document.createElement("div");
    info.className = "info";
    const title = document.createElement("h3");
    title.textContent = rule.name || "未命名规则";
    const details = document.createElement("p");
    const matchLabel = MATCH_TYPE_LABELS[rule.matchType] || rule.matchType;
    details.textContent = `${matchLabel} - ${rule.urlPattern}`;
    info.append(title, details);

    const toggleLabel = document.createElement("label");
    toggleLabel.className = "toggle";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.dataset.ruleId = rule.id;
    checkbox.checked = Boolean(rule.enabled);
    const toggleStatus = document.createElement("span");
    toggleStatus.textContent = rule.enabled ? "开启" : "关闭";
    toggleLabel.append(checkbox, toggleStatus);

    item.append(info, toggleLabel);
    ruleListEl.appendChild(item);
  });

  activeCountEl.textContent = `已启用 ${activeCount} / ${state.matchingRules.length}`;
  toggleAllBtn.textContent = activeCount > 0 ? "禁用该页所有匹配规则" : "启用该页所有匹配规则";
};

const setRuleEnabled = async (ruleId, enabled, options = {}) => {
  const { checkbox, silent } = options;
  const target = state.matchingRules.find((rule) => rule.id === ruleId);
  if (!target) {
    return false;
  }
  if (target.enabled === enabled) {
    return true;
  }

  try {
    const response = await chrome.runtime.sendMessage({
      type: "SET_RULE_ENABLED",
      ruleId,
      enabled
    });
    if (!response?.success) {
      throw new Error(response?.error || "Failed to update rule.");
    }
    if (target) {
      target.enabled = enabled;
    }
    renderRules();
    if (!silent) {
      setStatus(`规则已${enabled ? "启用" : "禁用"}。`);
    }
    return true;
  } catch (error) {
    console.error(error);
    if (checkbox) {
      checkbox.checked = !enabled;
    }
    setStatus("更新规则失败，请稍后重试。", true);
    return false;
  }
};

const handleToggleChange = (event) => {
  const checkbox = event.target.closest("input[data-rule-id]");
  if (!checkbox) {
    return;
  }
  setRuleEnabled(checkbox.dataset.ruleId, checkbox.checked, { checkbox });
};

const toggleAll = async () => {
  if (!state.matchingRules.length) {
    return;
  }
  const shouldEnable = !state.matchingRules.some((rule) => rule.enabled);
  const updates = state.matchingRules.map((rule) =>
    setRuleEnabled(rule.id, shouldEnable, { silent: true })
  );
  const results = await Promise.all(updates);
  if (results.every(Boolean)) {
    setStatus(
      shouldEnable
        ? "已启用该页全部匹配规则。"
        : "已禁用该页全部匹配规则。"
    );
  } else {
    setStatus("部分规则更新失败，请重试。", true);
  }
};

const openOptions = () => {
  chrome.runtime.openOptionsPage();
};

const openQuickCreate = () => {
  if (!state.url) {
    setStatus("当前标签页地址不可用，无法快速创建。", true);
    return;
  }
  const url = chrome.runtime.getURL(
    `options.html?createFor=${encodeURIComponent(state.url)}`
  );
  chrome.tabs.create({ url });
};

const init = async () => {
  try {
    state.tab = await getActiveTab();
    state.url = state.tab?.url || "";
    currentUrlEl.textContent = state.url || "不可用";
    quickCreateBtn.disabled = !state.url;
    await fetchMatchingRules();
  } catch (error) {
    console.error(error);
    setStatus("无法读取当前标签页。", true);
  }
};

ruleListEl.addEventListener("change", handleToggleChange);
toggleAllBtn.addEventListener("click", toggleAll);
openOptionsBtn.addEventListener("click", openOptions);
quickCreateBtn.addEventListener("click", openQuickCreate);

init();
