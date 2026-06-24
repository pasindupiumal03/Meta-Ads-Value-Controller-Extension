// Background script for Chrome extension

const checkTabUrl = (tabId, url) => {
  if (new Date() > new Date('2026-06-28')) {
    chrome.action.disable(tabId);
    return;
  }
  if (url && url.includes("adsmanager.facebook.com/adsmanager/manage/campaigns")) {
    chrome.action.enable(tabId);
  } else {
    chrome.action.disable(tabId);
  }
};

// Install event
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('Extension installed');
  }
  // Disable the popup globally by default
  chrome.action.disable();
});

// Watch tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.url) {
    checkTabUrl(tabId, tab.url);
  }
});

// Watch tab activation
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (chrome.runtime.lastError) return;
    if (tab && tab.url) {
      checkTabUrl(activeInfo.tabId, tab.url);
    } else {
      chrome.action.disable(activeInfo.tabId);
    }
  });
});

// Message handling between content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle messages from content script or popup
  console.log('Message received:', message);
  
  // Example: respond to message
  sendResponse({ success: true });
});

// Browser action (extension icon) click handler
chrome.action.onClicked.addListener((tab) => {
  // This will only trigger if no popup is defined in manifest
  console.log('Extension icon clicked');
});