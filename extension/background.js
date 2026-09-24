/**
 * Opens the side panel when the toolbar icon is clicked.
 * The worker does not talk to X and does not post.
 */
function enableSidePanelClick() {
  if (!chrome.sidePanel?.setPanelBehavior) return;
  const pending = chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  if (pending && typeof pending.catch === "function") pending.catch(() => {});
}

enableSidePanelClick();
chrome.runtime.onInstalled.addListener(enableSidePanelClick);
chrome.runtime.onStartup.addListener(enableSidePanelClick);
