import { doesUrlMatchRule, normalizeRules } from "./shared/ruleMatcher.js";

const RULES_KEY = "rules";

const getRulesFromStorage = async () => {
  const stored = await chrome.storage.local.get({ [RULES_KEY]: [] });
  return normalizeRules(stored[RULES_KEY]);
};

const persistRules = (rules) => chrome.storage.local.set({ [RULES_KEY]: rules });

const broadcastRulesUpdated = async () => {
  const tabs = await chrome.tabs.query({});
  await Promise.all(
    tabs.map(
      (tab) =>
        new Promise((resolve) => {
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

  return undefined;
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes[RULES_KEY]) {
    broadcastRulesUpdated();
  }
});
