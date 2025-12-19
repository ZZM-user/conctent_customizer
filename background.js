import { doesUrlMatchRule, normalizeRules } from "./shared/ruleMatcher.js";

const RULES_KEY = "rules";
const STORAGE_METHOD_KEY = "storageMethod"; // local or sync

// 获取当前使用的存储方式，默认为local
const getCurrentStorageMethod = async () => {
  const stored = await chrome.storage.local.get({ [STORAGE_METHOD_KEY]: "local" });
  return stored[STORAGE_METHOD_KEY];
};

// 设置存储方式
const setStorageMethod = (method) => {
  return chrome.storage.local.set({ [STORAGE_METHOD_KEY]: method });
};

const getRulesFromStorage = async () => {
  const storageMethod = await getCurrentStorageMethod();
  let stored;
  
  if (storageMethod === "sync") {
    try {
      stored = await chrome.storage.sync.get({ [RULES_KEY]: [] });
    } catch (error) {
      // 如果sync存储不可用，回退到local存储
      console.warn("Sync storage unavailable, falling back to local storage:", error);
      stored = await chrome.storage.local.get({ [RULES_KEY]: [] });
    }
  } else {
    stored = await chrome.storage.local.get({ [RULES_KEY]: [] });
  }
  
  return normalizeRules(stored[RULES_KEY]);
};

const persistRules = async (rules) => {
  const storageMethod = await getCurrentStorageMethod();
  
  if (storageMethod === "sync") {
    try {
      await chrome.storage.sync.set({ [RULES_KEY]: rules });
    } catch (error) {
      // 如果sync存储不可用，回退到local存储
      console.warn("Sync storage unavailable, falling back to local storage:", error);
      await chrome.storage.local.set({ [RULES_KEY]: rules });
    }
  } else {
    await chrome.storage.local.set({ [RULES_KEY]: rules });
  }
};

const broadcastRulesUpdated = async () => {
  const tabs = await chrome.tabs.query({});
  await Promise.all(
    tabs.map(
      (tab) => {
        return new Promise((resolve) => {
          if (!tab.id) {
            resolve();
            return;
          }

          chrome.tabs.sendMessage(tab.id, { type: "RULES_UPDATED" }, () => {
            if (chrome.runtime.lastError) {
              // No-op: the tab may not have a content script.
            }
            resolve();
          });
        })
      }
    )
  );
};

const handleGetRulesForUrl = async (url) => {
  const rules = await getRulesFromStorage();
  const activeRules = rules.filter((rule) => doesUrlMatchRule(url, rule));
  return {
    rules,
    activeRules
  };
};

const handleToggleRule = async (ruleId, enabled) => {
  const rules = await getRulesFromStorage();
  let didUpdate = false;

  const nextRules = rules.map((rule) => {
    if (rule.id === ruleId) {
      didUpdate = true;
      return {
        ...rule,
        enabled
      };
    }
    return rule;
  });

  if (didUpdate) {
    await persistRules(nextRules);
  }

  return { success: didUpdate };
};

// 处理存储方式变更
const handleChangeStorageMethod = async (method) => {
  if (method !== "local" && method !== "sync") {
    return { success: false, error: "Invalid storage method" };
  }

  // 获取当前规则
  const rules = await getRulesFromStorage();
  
  // 设置新的存储方式
  await setStorageMethod(method);
  
  // 用新方式保存规则
  await persistRules(rules);
  
  // 通知所有标签页更新
  await broadcastRulesUpdated();
  
  return { success: true };
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || !message.type) {
    return undefined;
  }

  if (message.type === "GET_RULES_FOR_URL") {
    handleGetRulesForUrl(message.url)
      .then((result) => sendResponse({ success: true, ...result }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === "SET_RULE_ENABLED") {
    handleToggleRule(message.ruleId, message.enabled)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === "CHANGE_STORAGE_METHOD") {
    handleChangeStorageMethod(message.method)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  if (message.type === "PERSIST_RULES") {
    persistRules(message.rules)
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  if (message.type === "GET_STORAGE_METHOD") {
    getCurrentStorageMethod()
      .then((method) => sendResponse({ success: true, method }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  return undefined;
});

// 监听存储变化
chrome.storage.onChanged.addListener((changes, areaName) => {
  // 监听规则变化
  if ((areaName === "local" || areaName === "sync") && changes[RULES_KEY]) {
    broadcastRulesUpdated();
  }
  
  // 监听存储方式变化
  if (areaName === "local" && changes[STORAGE_METHOD_KEY]) {
    broadcastRulesUpdated();
  }
});