import { STORAGE_KEY } from "./constants.js";
import { normalizeState } from "./drafts.js";

function hasChromeStorage() {
  return typeof chrome !== "undefined" && Boolean(chrome.storage?.local);
}

function areaGet(key) {
  if (hasChromeStorage()) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(key, (result) => {
        const error = chrome.runtime?.lastError;
        if (error) reject(new Error(error.message));
        else resolve(result?.[key]);
      });
    });
  }
  try {
    const raw = localStorage.getItem(key);
    return Promise.resolve(raw ? JSON.parse(raw) : undefined);
  } catch {
    return Promise.resolve(undefined);
  }
}

function areaSet(key, value) {
  if (hasChromeStorage()) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ [key]: value }, () => {
        const error = chrome.runtime?.lastError;
        if (error) reject(new Error(error.message));
        else resolve();
      });
    });
  }
  localStorage.setItem(key, JSON.stringify(value));
  return Promise.resolve();
}

export async function loadQueue() {
  const stored = await areaGet(STORAGE_KEY);
  return normalizeState(stored);
}

export async function saveQueue(drafts) {
  const state = normalizeState({ version: 1, drafts });
  await areaSet(STORAGE_KEY, { version: 1, drafts: state.drafts });
  return state;
}
