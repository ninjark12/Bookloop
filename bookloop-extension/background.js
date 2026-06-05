// background.js — Manifest V3 service worker
// Minimal: no persistent state needed here since content.js and popup.js
// communicate directly via chrome.storage and chrome.tabs.sendMessage.

chrome.runtime.onInstalled.addListener(function () {
  console.log("Bookloop extension installed.");
});
