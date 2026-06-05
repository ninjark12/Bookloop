// content.js — injected into supported reading sites
// Depends on ADAPTERS defined in adapters.js (loaded first).

(function () {
  "use strict";

  var BOOKLOOP_URL = "https://bookloop-abb1.vercel.app";
  var MODAL_DELAY_MS = 8000;

  var modalTimer = null;
  var lastUrl = location.href;
  var lastChapter = null;

  // ----------------------------------------------------------------
  // Storage helpers
  // ----------------------------------------------------------------

  function getLinkedBook(seriesKey, cb) {
    chrome.storage.local.get([seriesKey], function (result) {
      cb(result[seriesKey] || null);
    });
  }

  function wasChapterDismissed(chapter, cb) {
    var key = "dismissed:" + location.hostname + ":" + chapter;
    chrome.storage.session.get([key], function (result) {
      cb(!!result[key]);
    });
  }

  function markChapterDismissed(chapter) {
    var key = "dismissed:" + location.hostname + ":" + chapter;
    chrome.storage.session.set({ [key]: true });
  }

  // ----------------------------------------------------------------
  // Modal
  // ----------------------------------------------------------------

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function removeModal() {
    var el = document.getElementById("bookloop-modal");
    if (el) el.remove();
    if (modalTimer) {
      clearTimeout(modalTimer);
      modalTimer = null;
    }
  }

  function showModal(bookTitle, chapter, bookId) {
    removeModal();

    var modal = document.createElement("div");
    modal.id = "bookloop-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-label", "Bookloop journal prompt");

    modal.innerHTML =
      '<div class="bl-inner">' +
        '<div class="bl-header">' +
          '<span class="bl-logo">Bookloop</span>' +
          '<button class="bl-close" aria-label="Close">&times;</button>' +
        "</div>" +
        '<div class="bl-body">' +
          '<p class="bl-book">' + escapeHtml(bookTitle) + "</p>" +
          '<p class="bl-prompt">Chapter ' + escapeHtml(chapter) + " done. Write a reflection?</p>" +
        "</div>" +
        '<div class="bl-actions">' +
          '<button class="bl-btn-primary" id="bl-write-now">Write now</button>' +
          '<button class="bl-btn-secondary" id="bl-later">Maybe later</button>' +
        "</div>" +
      "</div>";

    document.body.appendChild(modal);

    // Trigger CSS enter animation
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        modal.classList.add("bl-visible");
      });
    });

    document.getElementById("bl-write-now").addEventListener("click", function () {
      var url = BOOKLOOP_URL + "/journal/" + encodeURIComponent(bookId) +
        "?chapter=" + encodeURIComponent(chapter) + "&source=extension";
      window.open(url, "_blank", "noopener,noreferrer");
      markChapterDismissed(chapter);
      removeModal();
    });

    document.getElementById("bl-later").addEventListener("click", function () {
      markChapterDismissed(chapter);
      removeModal();
    });

    modal.querySelector(".bl-close").addEventListener("click", removeModal);
  }

  // ----------------------------------------------------------------
  // Chapter change handler
  // ----------------------------------------------------------------

  function onPageChange() {
    var adapter = ADAPTERS[location.hostname];
    if (!adapter) return;

    var detected = adapter.detect();
    if (!detected) return;
    if (detected.chapter === lastChapter) return;
    lastChapter = detected.chapter;

    var seriesKey = adapter.getSeriesKey();
    if (!seriesKey) return;

    getLinkedBook(seriesKey, function (linked) {
      if (!linked) return;

      wasChapterDismissed(detected.chapter, function (dismissed) {
        if (dismissed) return;

        removeModal();
        modalTimer = setTimeout(function () {
          showModal(linked.bookTitle, detected.chapter, linked.bookId);
        }, MODAL_DELAY_MS);
      });
    });
  }

  // ----------------------------------------------------------------
  // Listen for messages from the popup (series info request)
  // ----------------------------------------------------------------

  chrome.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
    if (msg.type === "GET_SERIES_INFO") {
      var adapter = ADAPTERS[location.hostname];
      if (!adapter) {
        sendResponse({ supported: false });
        return true;
      }
      var seriesKey = adapter.getSeriesKey();
      var detected = adapter.detect();
      sendResponse({
        supported: true,
        seriesKey: seriesKey,
        seriesName: detected ? detected.seriesName : null,
        chapter: detected ? detected.chapter : null,
      });
      return true;
    }
  });

  // ----------------------------------------------------------------
  // SPA URL-change watcher
  // ----------------------------------------------------------------

  var urlObserver = new MutationObserver(function () {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      lastChapter = null; // reset so same chapter on new page triggers again
      onPageChange();
    }
  });
  urlObserver.observe(document.documentElement, { subtree: true, childList: true });

  // Initial check (page loaded directly on a chapter URL)
  onPageChange();
})();
