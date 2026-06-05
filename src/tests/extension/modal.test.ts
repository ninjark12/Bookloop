// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const adaptersSource = readFileSync(
  resolve(__dirname, "../../../bookloop-extension/adapters.js"),
  "utf-8"
);
const contentSource = readFileSync(
  resolve(__dirname, "../../../bookloop-extension/content.js"),
  "utf-8"
);

// ----------------------------------------------------------------
// Shared mock state — lives in test code's scope (= jsdom window in
// vitest jsdom env). The chrome mock below closes over these objects,
// so reads/writes from both test code and the extension scripts touch
// the same in-memory values.
// ----------------------------------------------------------------

interface BlMocks {
  localStore: Record<string, unknown>;
  sessionStore: Record<string, unknown>;
  sessionSetCalls: Record<string, unknown>[];
  localSetCalls: Record<string, unknown>[];
}

let _blMocks: BlMocks;

function blMocks(): BlMocks {
  return _blMocks;
}

function resetMocks() {
  _blMocks = {
    localStore: {},
    sessionStore: {},
    sessionSetCalls: [],
    localSetCalls: [],
  };
}

// Install the chrome mock onto window so extension scripts that reference
// the bare `chrome` global find it. Indirect eval exposes the var through
// the same global scope, so `chrome` inside content.js resolves here.
function installChromeMock() {
  (window as unknown as Record<string, unknown>).chrome = {
    storage: {
      local: {
        get: function (keys: string | string[], cb: (r: Record<string, unknown>) => void) {
          const result: Record<string, unknown> = {};
          (Array.isArray(keys) ? keys : [keys]).forEach((k) => {
            if (_blMocks.localStore[k] !== undefined) result[k] = _blMocks.localStore[k];
          });
          cb(result);
        },
        set: function (data: Record<string, unknown>) {
          _blMocks.localSetCalls.push(data);
          Object.assign(_blMocks.localStore, data);
        },
        remove: function (keys: string | string[]) {
          (Array.isArray(keys) ? keys : [keys]).forEach((k) => {
            delete _blMocks.localStore[k];
          });
        },
      },
      session: {
        get: function (keys: string | string[], cb: (r: Record<string, unknown>) => void) {
          const result: Record<string, unknown> = {};
          (Array.isArray(keys) ? keys : [keys]).forEach((k) => {
            if (_blMocks.sessionStore[k] !== undefined) result[k] = _blMocks.sessionStore[k];
          });
          cb(result);
        },
        set: function (data: Record<string, unknown>) {
          _blMocks.sessionSetCalls.push(data);
          Object.assign(_blMocks.sessionStore, data);
        },
      },
    },
    runtime: {
      onMessage: { addListener: function () {} },
      lastError: null,
    },
  };
}

function loadScripts() {
  // Indirect eval runs in the global scope (= jsdom window) so:
  // - `var ADAPTERS` in adapters.js becomes window.ADAPTERS
  // - content.js IIFE sees chrome, ADAPTERS, document, location as globals
  // eslint-disable-next-line no-eval
  (0, eval)(adaptersSource);
  // eslint-disable-next-line no-eval
  (0, eval)(contentSource);
}

function setMangaDexChapterPage(chapter = 5) {
  Object.defineProperty(window, "location", {
    value: {
      hostname: "mangadex.org",
      pathname: "/chapter/test-uuid/1",
      href: "https://mangadex.org/chapter/test-uuid/1",
    },
    writable: true,
    configurable: true,
  });
  document.title = `Test Manga - Ch. ${chapter} | MangaDex`;
}

// ----------------------------------------------------------------
// Modal rendering
// ----------------------------------------------------------------
describe("modal display", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    resetMocks();
    installChromeMock();
    setMangaDexChapterPage(5);
  });

  it("injects #bookloop-modal into the DOM after the 8-second delay", async () => {
    vi.useFakeTimers();
    blMocks().localStore["mangadex:test manga"] = { bookId: "book-1", bookTitle: "Test Manga" };
    loadScripts();

    expect(document.getElementById("bookloop-modal")).toBeNull();
    vi.advanceTimersByTime(8001);
    await Promise.resolve();
    await Promise.resolve();

    expect(document.getElementById("bookloop-modal")).not.toBeNull();
    vi.useRealTimers();
  });

  it("modal contains the book title and chapter number", async () => {
    vi.useFakeTimers();
    blMocks().localStore["mangadex:test manga"] = { bookId: "book-1", bookTitle: "My Manga" };
    loadScripts();

    vi.advanceTimersByTime(8001);
    await Promise.resolve();
    await Promise.resolve();

    const modal = document.getElementById("bookloop-modal")!;
    expect(modal.innerHTML).toContain("My Manga");
    expect(modal.innerHTML).toContain("5");
    vi.useRealTimers();
  });

  it("does not show the modal when no book is linked to the series", async () => {
    vi.useFakeTimers();
    // localStore is empty — no linked book
    loadScripts();

    vi.advanceTimersByTime(8001);
    await Promise.resolve();
    await Promise.resolve();

    expect(document.getElementById("bookloop-modal")).toBeNull();
    vi.useRealTimers();
  });
});

// ----------------------------------------------------------------
// Dismiss behaviour
// ----------------------------------------------------------------
describe("dismiss", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    resetMocks();
    installChromeMock();
    setMangaDexChapterPage(3);
  });

  it("does not show the modal when the chapter was already dismissed", async () => {
    vi.useFakeTimers();
    blMocks().localStore["mangadex:test manga"] = { bookId: "book-1", bookTitle: "Test Manga" };
    blMocks().sessionStore["dismissed:mangadex.org:3"] = true;
    loadScripts();

    vi.advanceTimersByTime(8001);
    await Promise.resolve();
    await Promise.resolve();

    expect(document.getElementById("bookloop-modal")).toBeNull();
    vi.useRealTimers();
  });

  it("clicking Maybe Later stores the dismissed key in session storage", async () => {
    vi.useFakeTimers();
    blMocks().localStore["mangadex:test manga"] = { bookId: "book-1", bookTitle: "Test Manga" };
    loadScripts();

    vi.advanceTimersByTime(8001);
    await Promise.resolve();
    await Promise.resolve();

    (document.getElementById("bl-later") as HTMLButtonElement).click();

    expect(document.getElementById("bookloop-modal")).toBeNull();
    const key = "dismissed:mangadex.org:3";
    expect(blMocks().sessionSetCalls.some((c) => c[key] === true)).toBe(true);
    vi.useRealTimers();
  });

  it("clicking X closes the modal without storing a dismissed key", async () => {
    vi.useFakeTimers();
    blMocks().localStore["mangadex:test manga"] = { bookId: "book-1", bookTitle: "Test Manga" };
    loadScripts();

    vi.advanceTimersByTime(8001);
    await Promise.resolve();
    await Promise.resolve();

    (document.querySelector(".bl-close") as HTMLButtonElement).click();

    expect(document.getElementById("bookloop-modal")).toBeNull();
    expect(blMocks().sessionSetCalls).toHaveLength(0);
    vi.useRealTimers();
  });
});

// ----------------------------------------------------------------
// Deep link
// ----------------------------------------------------------------
describe("Write now deep link", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    resetMocks();
    installChromeMock();
    setMangaDexChapterPage(10);
  });

  it("opens the correct Bookloop journal URL in a new tab", async () => {
    vi.useFakeTimers();
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    blMocks().localStore["mangadex:test manga"] = { bookId: "book-abc", bookTitle: "Test Manga" };
    loadScripts();

    vi.advanceTimersByTime(8001);
    await Promise.resolve();
    await Promise.resolve();

    (document.getElementById("bl-write-now") as HTMLButtonElement).click();

    expect(openSpy).toHaveBeenCalledWith(
      "https://bookloop-abb1.vercel.app/journal/book-abc?chapter=10&source=extension",
      "_blank",
      "noopener,noreferrer"
    );
    vi.useRealTimers();
  });

  it("marks the chapter dismissed after clicking Write now", async () => {
    vi.useFakeTimers();
    vi.spyOn(window, "open").mockImplementation(() => null);
    blMocks().localStore["mangadex:test manga"] = { bookId: "book-abc", bookTitle: "Test Manga" };
    loadScripts();

    vi.advanceTimersByTime(8001);
    await Promise.resolve();
    await Promise.resolve();

    (document.getElementById("bl-write-now") as HTMLButtonElement).click();

    const key = "dismissed:mangadex.org:10";
    expect(blMocks().sessionSetCalls.some((c) => c[key] === true)).toBe(true);
    vi.useRealTimers();
  });
});
