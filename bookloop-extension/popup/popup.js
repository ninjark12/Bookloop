// popup.js — book linking UI
// Calls Bookloop's /api/books/search with credentials so the user's session
// cookie is included. Works because bookloop-abb1.vercel.app is listed in
// host_permissions, which lets Chrome/Firefox bypass CORS for extension pages.

var BOOKLOOP_URL = "https://bookloop-abb1.vercel.app";

// ----------------------------------------------------------------
// View helpers
// ----------------------------------------------------------------

function showView(id) {
  ["view-unsupported", "view-no-chapter", "view-main"].forEach(function (v) {
    document.getElementById(v).classList.add("hidden");
  });
  document.getElementById(id).classList.remove("hidden");
}

function setStatus(msg, isError) {
  var el = document.getElementById("search-status");
  el.textContent = msg;
  el.className = "search-status" + (isError ? " error" : "");
  el.classList.toggle("hidden", !msg);
}

function clearResults() {
  var list = document.getElementById("search-results");
  list.innerHTML = "";
  list.classList.add("hidden");
}

// ----------------------------------------------------------------
// Storage helpers
// ----------------------------------------------------------------

function getLink(seriesKey, cb) {
  chrome.storage.local.get([seriesKey], function (result) {
    cb(result[seriesKey] || null);
  });
}

function saveLink(seriesKey, bookId, bookTitle) {
  var entry = {};
  entry[seriesKey] = { bookId: bookId, bookTitle: bookTitle };
  chrome.storage.local.set(entry);
}

function removeLink(seriesKey) {
  chrome.storage.local.remove([seriesKey]);
}

// ----------------------------------------------------------------
// Linked book section
// ----------------------------------------------------------------

function renderLinkedBook(bookTitle) {
  var section = document.getElementById("linked-section");
  var titleEl = document.getElementById("linked-title");
  var labelEl = document.getElementById("search-label");

  if (bookTitle) {
    titleEl.textContent = bookTitle;
    section.classList.remove("hidden");
    labelEl.textContent = "Change linked book";
  } else {
    section.classList.add("hidden");
    labelEl.textContent = "Link a book";
  }
}

// ----------------------------------------------------------------
// Search
// ----------------------------------------------------------------

function searchBooks(query, cb) {
  var url = BOOKLOOP_URL + "/api/books/search?q=" + encodeURIComponent(query.trim());
  fetch(url, { credentials: "include" })
    .then(function (res) {
      if (res.status === 401) {
        cb(null, "Please log in to Bookloop first.");
        return;
      }
      if (!res.ok) {
        cb(null, "Search failed. Try again.");
        return;
      }
      return res.json();
    })
    .then(function (data) {
      if (!data) return;
      cb(data.results || [], null);
    })
    .catch(function () {
      cb(null, "Could not reach Bookloop. Check your connection.");
    });
}

function renderResults(results, seriesKey) {
  var list = document.getElementById("search-results");
  list.innerHTML = "";

  if (results.length === 0) {
    setStatus("No results found.", false);
    list.classList.add("hidden");
    return;
  }

  setStatus("", false);
  list.classList.remove("hidden");

  results.forEach(function (book) {
    var li = document.createElement("li");
    li.className = "result-item";

    var titleEl = document.createElement("div");
    titleEl.className = "result-title";
    titleEl.textContent = book.title;

    var authorEl = document.createElement("div");
    authorEl.className = "result-author";
    authorEl.textContent = book.author;

    li.appendChild(titleEl);
    li.appendChild(authorEl);

    li.addEventListener("click", function () {
      // book.id is null for Open Library results (not yet in our DB).
      // We only link books that are already in the user's Bookloop library
      // (i.e. have a real UUID id). If it's an OL result, prompt the user
      // to add it to their library first.
      if (!book.id) {
        setStatus("Add this book to your Bookloop library first, then link it here.", false);
        return;
      }
      saveLink(seriesKey, book.id, book.title);
      renderLinkedBook(book.title);
      clearResults();
      setStatus("Linked!", false);
      setTimeout(function () { setStatus("", false); }, 1500);
    });

    list.appendChild(li);
  });
}

// ----------------------------------------------------------------
// Init — ask content script for series info, then render
// ----------------------------------------------------------------

function init() {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    var tab = tabs[0];
    if (!tab || !tab.id) {
      showView("view-unsupported");
      return;
    }

    chrome.tabs.sendMessage(tab.id, { type: "GET_SERIES_INFO" }, function (response) {
      // If the content script isn't injected (unsupported page), response is undefined
      if (chrome.runtime.lastError || !response || !response.supported) {
        showView("view-unsupported");
        return;
      }

      if (!response.seriesKey || !response.seriesName) {
        document.getElementById("site-label").textContent =
          "Navigate to a chapter to link a book.";
        showView("view-no-chapter");
        return;
      }

      document.getElementById("series-name").textContent = response.seriesName;
      showView("view-main");

      var seriesKey = response.seriesKey;

      // Load any existing link for this series
      getLink(seriesKey, function (linked) {
        renderLinkedBook(linked ? linked.bookTitle : null);
      });

      // Unlink button
      document.getElementById("btn-unlink").addEventListener("click", function () {
        removeLink(seriesKey);
        renderLinkedBook(null);
        setStatus("Unlinked.", false);
        setTimeout(function () { setStatus("", false); }, 1500);
      });

      // Search button
      document.getElementById("btn-search").addEventListener("click", function () {
        var query = document.getElementById("search-input").value.trim();
        if (!query) return;

        var btn = document.getElementById("btn-search");
        btn.disabled = true;
        btn.textContent = "Searching...";
        clearResults();
        setStatus("", false);

        searchBooks(query, function (results, err) {
          btn.disabled = false;
          btn.textContent = "Search";
          if (err) {
            setStatus(err, true);
            return;
          }
          renderResults(results, seriesKey);
        });
      });

      // Allow Enter key in search input
      document.getElementById("search-input").addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          document.getElementById("btn-search").click();
        }
      });
    });
  });
}

document.addEventListener("DOMContentLoaded", init);
