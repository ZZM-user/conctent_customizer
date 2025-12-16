import {
  MATCH_TYPES,
  createRuleId,
  normalizeRules,
  sanitizeRule
} from "./shared/ruleMatcher.js";

const RULES_KEY = "rules";
const MATCH_TYPE_LABELS = {
  exact: "精确匹配",
  contains: "包含路径",
  wildcard: "通配符",
  regex: "正则表达式"
};

const ruleTableBody = document.getElementById("rules-table-body");
const ruleCountEl = document.getElementById("rule-count");
const emptyStateEl = document.getElementById("rules-empty");
const form = document.getElementById("rule-form");
const formTitle = document.getElementById("form-title");
const cancelEditBtn = document.getElementById("cancel-edit");
const nameInput = document.getElementById("rule-name");
const patternInput = document.getElementById("rule-pattern");
const matchTypeInput = document.getElementById("rule-match-type");
const ignoreCaseInput = document.getElementById("rule-ignore-case");
const enabledInput = document.getElementById("rule-enabled");
const textReplacementList = document.getElementById("text-replacements");
const imageReplacementList = document.getElementById("image-replacements");
const addTextBtn = document.getElementById("add-text-replacement");
const addImageBtn = document.getElementById("add-image-replacement");
const exportBtn = document.getElementById("export-rules");
const importBtn = document.getElementById("import-rules");
const importInput = document.getElementById("import-input");
const statusOutput = document.getElementById("status");

const state = {
  rules: [],
  editingId: null
};

const setStatus = (message, isError = false) => {
  statusOutput.textContent = message;
  statusOutput.classList.toggle("error", isError);
};

const fetchRules = async () => {
  const stored = await chrome.storage.local.get({ [RULES_KEY]: [] });
  state.rules = normalizeRules(stored[RULES_KEY]);
  return state.rules;
};

const persistRules = () => chrome.storage.local.set({ [RULES_KEY]: state.rules });

const ensurePatternValid = () => {
  const value = matchTypeInput.value;
  if (!MATCH_TYPES.includes(value)) {
    matchTypeInput.value = "wildcard";
  }
};

const isRegexValid = (pattern) => {
  try {
    new RegExp(pattern);
    return true;
  } catch (error) {
    return false;
  }
};

const createReplacementRow = (type, entry = {}) => {
  const row = document.createElement("div");
  row.className = "replacement-row";
  row.dataset.type = type;

  const title = document.createElement("header");
  const label = document.createElement("strong");
  label.textContent = type === "text" ? "文本替换" : "图片替换";

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.textContent = "删除";
  removeBtn.className = "secondary";
  removeBtn.addEventListener("click", () => row.remove());

  title.append(label, removeBtn);
  row.appendChild(title);

  if (type === "text") {
    row.appendChild(
      makeInput("查找内容", entry.find ?? "", "find", "原始文本或模式")
    );
    row.appendChild(
      makeInput(
        "替换为",
        entry.replace ?? "",
        "replace",
        "新的显示文本"
      )
    );
    row.appendChild(makeToggleRow(entry, ["useRegex", "caseSensitive"]));
  } else {
    row.appendChild(
      makeInput(
        "目标图片 URL 或模式",
        entry.match ?? "",
        "match",
        "https://example.com/logo.png"
      )
    );
    row.appendChild(
      makeInput(
        "替换为",
        entry.replace ?? "",
        "replace",
        "https://cdn.example.com/logo.svg"
      )
    );
    row.appendChild(makeToggleRow(entry, ["useRegex"]));
  }

  return row;
};

const makeInput = (labelText, value, field, placeholder) => {
  const wrapper = document.createElement("label");
  wrapper.textContent = labelText;
  const input = document.createElement("input");
  input.type = "text";
  input.value = value;
  input.placeholder = placeholder;
  input.dataset.field = field;
  wrapper.appendChild(input);
  return wrapper;
};

const makeToggleRow = (entry, keys) => {
  const container = document.createElement("div");
  container.className = "controls";

  keys.forEach((key) => {
    const label = document.createElement("label");
    label.className = "checkbox";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.dataset.field = key;
    input.checked = Boolean(entry[key]);
    label.appendChild(input);
    label.appendChild(document.createTextNode(formatKeyLabel(key)));
    container.appendChild(label);
  });

  return container;
};

const formatKeyLabel = (key) => {
  switch (key) {
    case "useRegex":
      return "使用正则表达式";
    case "caseSensitive":
      return "区分大小写";
    default:
      return key;
  }
};

const addTextRow = (entry = {}) => {
  textReplacementList.appendChild(createReplacementRow("text", entry));
};

const addImageRow = (entry = {}) => {
  imageReplacementList.appendChild(createReplacementRow("image", entry));
};

const resetReplacementLists = () => {
  textReplacementList.innerHTML = "";
  imageReplacementList.innerHTML = "";
  addTextRow();
  addImageRow();
};

const gatherReplacements = (container, fields, requiredField) =>
  Array.from(container.querySelectorAll(".replacement-row")).reduce(
    (result, row) => {
      const entry = {};
      fields.forEach((field) => {
        const input = row.querySelector(`[data-field="${field}"]`);
        if (!input) {
          return;
        }
        if (input.type === "checkbox") {
          entry[field] = input.checked;
        } else {
          entry[field] = input.value.trim();
        }
      });

      const hasContent = fields.some((field) => {
        if (field === "useRegex" || field === "caseSensitive") {
          return false;
        }
        return Boolean(entry[field]);
      });

      if (hasContent) {
        if (requiredField && !entry[requiredField]) {
          return result;
        }
        result.push(entry);
      }
      return result;
    },
    []
  );

const loadIntoForm = (rule) => {
  formTitle.textContent = "编辑规则";
  cancelEditBtn.hidden = false;
  state.editingId = rule.id;

  nameInput.value = rule.name ?? "";
  patternInput.value = rule.urlPattern ?? "";
  matchTypeInput.value = MATCH_TYPES.includes(rule.matchType)
    ? rule.matchType
    : "wildcard";
  enabledInput.checked = Boolean(rule.enabled);
  ignoreCaseInput.checked = rule.ignoreCase !== false;

  textReplacementList.innerHTML = "";
  imageReplacementList.innerHTML = "";
  rule.textReplacements.forEach((entry) => addTextRow(entry));
  rule.imageReplacements.forEach((entry) => addImageRow(entry));

  if (rule.textReplacements.length === 0) {
    addTextRow();
  }
  if (rule.imageReplacements.length === 0) {
    addImageRow();
  }
};

const resetForm = () => {
  form.reset();
  state.editingId = null;
  formTitle.textContent = "创建规则";
  cancelEditBtn.hidden = true;
  resetReplacementLists();
  ensurePatternValid();
  ignoreCaseInput.checked = true;
};

const renderRuleTable = () => {
  ruleTableBody.innerHTML = "";

  state.rules.forEach((rule) => {
    const row = document.createElement("tr");

    const nameCell = document.createElement("td");
    nameCell.textContent = rule.name || "未命名规则";

    const patternCell = document.createElement("td");
    patternCell.textContent = rule.urlPattern || "";

    const matchCell = document.createElement("td");
    matchCell.textContent = MATCH_TYPE_LABELS[rule.matchType] || rule.matchType;

    const statusCell = document.createElement("td");
    const statusChip = document.createElement("span");
    statusChip.className = `chip ${rule.enabled ? "active" : "disabled"}`;
    statusChip.textContent = rule.enabled ? "已启用" : "已禁用";
    statusCell.appendChild(statusChip);

    const actionsCell = document.createElement("td");
    const editBtn = document.createElement("button");
    editBtn.textContent = "编辑";
    editBtn.dataset.action = "edit";
    editBtn.dataset.id = rule.id;
    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "删除";
    deleteBtn.className = "secondary";
    deleteBtn.dataset.action = "delete";
    deleteBtn.dataset.id = rule.id;
    actionsCell.append(editBtn, deleteBtn);

    row.append(nameCell, patternCell, matchCell, statusCell, actionsCell);
    ruleTableBody.appendChild(row);
  });

  emptyStateEl.style.display = state.rules.length ? "none" : "block";
  ruleCountEl.textContent = `共 ${state.rules.length} 条`;
};

const handleTableClick = async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) {
    return;
  }

  const ruleId = button.dataset.id;
  const action = button.dataset.action;
  const rule = state.rules.find((item) => item.id === ruleId);

  if (!rule) {
    return;
  }

  if (action === "edit") {
    loadIntoForm(rule);
  } else if (action === "delete") {
    if (confirm("确定要删除该规则吗？")) {
      state.rules = state.rules.filter((item) => item.id !== ruleId);
      await persistRules();
      renderRuleTable();
      setStatus("规则已删除。");
      if (state.editingId === ruleId) {
        resetForm();
      }
    }
  }
};

const applyPrefillFromQuery = () => {
  const params = new URLSearchParams(window.location.search);
  const createFor = params.get("createFor");
  if (!createFor) {
    return;
  }

  const decoded = decodeURIComponent(createFor);
  patternInput.value = decoded;
  matchTypeInput.value = "exact";
  try {
    const parsed = new URL(decoded);
    nameInput.value = `针对 ${parsed.hostname} 的规则`;
  } catch {
    nameInput.value = `针对 ${decoded} 的规则`;
  }
};

const handleFormSubmit = async (event) => {
  event.preventDefault();
  ensurePatternValid();

  if (!nameInput.value.trim()) {
    setStatus("请输入规则名称。", true);
    return;
  }
  if (!patternInput.value.trim()) {
    setStatus("请填写 URL 模式。", true);
    return;
  }
  if (matchTypeInput.value === "regex" && !isRegexValid(patternInput.value.trim())) {
    setStatus("URL 模式不是合法的正则表达式。", true);
    return;
  }

  const textEntries = gatherReplacements(
    textReplacementList,
    ["find", "replace", "useRegex", "caseSensitive"],
    "find"
  );

  for (const entry of textEntries) {
    if (entry.useRegex && !isRegexValid(entry.find)) {
      setStatus(`无效的文本正则：${entry.find}`, true);
      return;
    }
  }

  const imageEntries = gatherReplacements(
    imageReplacementList,
    ["match", "replace", "useRegex"],
    "match"
  );

  for (const entry of imageEntries) {
    if (entry.useRegex && !isRegexValid(entry.match)) {
      setStatus(`无效的图片正则：${entry.match}`, true);
      return;
    }
  }

  const nextRule = sanitizeRule({
    id: state.editingId ?? createRuleId(),
    name: nameInput.value.trim(),
    urlPattern: patternInput.value.trim(),
    matchType: matchTypeInput.value,
    enabled: enabledInput.checked,
    ignoreCase: ignoreCaseInput.checked,
    textReplacements: textEntries,
    imageReplacements: imageEntries
  });

  const existingIndex = state.rules.findIndex((rule) => rule.id === nextRule.id);
  if (existingIndex > -1) {
    state.rules.splice(existingIndex, 1, nextRule);
  } else {
    state.rules.unshift(nextRule);
  }

  await persistRules();
  renderRuleTable();
  setStatus("规则已保存。");
  resetForm();
};

const handleExport = async () => {
  await fetchRules();
  const blob = new Blob([JSON.stringify(state.rules, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `content-customizer-rules-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
  setStatus("规则已导出。");
};

const handleImport = async (file) => {
  if (!file) {
    return;
  }
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const incoming = Array.isArray(data) ? data : data.rules;
    if (!Array.isArray(incoming)) {
      throw new Error("Invalid file format.");
    }

    const sanitized = normalizeRules(incoming).map((rule) => ({
      ...rule,
      id: createRuleId()
    }));

    state.rules = [...state.rules, ...sanitized];
    await persistRules();
    renderRuleTable();
    setStatus(`已导入 ${sanitized.length} 条规则。`);
  } catch (error) {
    console.error(error);
    setStatus("导入失败，请确认 JSON 内容有效。", true);
  } finally {
    importInput.value = "";
  }
};

const init = async () => {
  await fetchRules();
  renderRuleTable();
  resetReplacementLists();
  applyPrefillFromQuery();
};

ruleTableBody.addEventListener("click", handleTableClick);
form.addEventListener("submit", handleFormSubmit);
cancelEditBtn.addEventListener("click", resetForm);
addTextBtn.addEventListener("click", () => addTextRow());
addImageBtn.addEventListener("click", () => addImageRow());
exportBtn.addEventListener("click", handleExport);
importBtn.addEventListener("click", () => importInput.click());
importInput.addEventListener("change", (event) =>
  handleImport(event.target.files?.[0])
);

init();
