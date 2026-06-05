// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

// Inject adapters.js as a <script> element so that top-level `var` declarations
// become window properties — the same way content scripts behave in Chrome/Firefox.
const adaptersSource = readFileSync(
  resolve(__dirname, "../../../bookloop-extension/adapters.js"),
  "utf-8"
);

type AdapterMap = {
  [host: string]: {
    detect(): { chapter: number; seriesName: string } | null;
    getSeriesKey(): string | null;
  };
};

function adapters(): AdapterMap {
  return (window as unknown as { ADAPTERS: AdapterMap }).ADAPTERS;
}

function loadAdapters() {
  // Indirect eval runs in the global scope (= jsdom window in vitest jsdom env),
  // so `var ADAPTERS = {}` at the top level becomes window.ADAPTERS — visible to
  // both the adapter methods (which use bare `location`/`document`) and test code.
  // eslint-disable-next-line no-eval
  (0, eval)(adaptersSource);
}

// ----------------------------------------------------------------
// MangaDex
// ----------------------------------------------------------------
describe("ADAPTERS[mangadex.org]", () => {
  beforeEach(() => {
    loadAdapters();
    Object.defineProperty(window, "location", {
      value: { hostname: "mangadex.org", pathname: "/chapter/some-uuid/1", href: "" },
      writable: true,
      configurable: true,
    });
  });

  it("detects chapter number from title", () => {
    document.title = "One Piece - Ch. 1089 | MangaDex";
    const result = adapters()["mangadex.org"].detect();
    expect(result).not.toBeNull();
    expect(result!.chapter).toBe(1089);
    expect(result!.seriesName).toBe("One Piece");
  });

  it("detects decimal chapter numbers", () => {
    document.title = "Berserk - Ch. 364.5 | MangaDex";
    const result = adapters()["mangadex.org"].detect();
    expect(result!.chapter).toBe(364.5);
  });

  it("returns null when not on a chapter page", () => {
    Object.defineProperty(window, "location", {
      value: { hostname: "mangadex.org", pathname: "/title/some-uuid", href: "" },
      writable: true,
      configurable: true,
    });
    document.title = "One Piece | MangaDex";
    expect(adapters()["mangadex.org"].detect()).toBeNull();
  });

  it("returns null when title has no chapter pattern", () => {
    document.title = "MangaDex";
    expect(adapters()["mangadex.org"].detect()).toBeNull();
  });

  it("getSeriesKey falls back to title-based key when no breadcrumb link", () => {
    document.title = "One Piece - Ch. 1 | MangaDex";
    document.body.innerHTML = "";
    const key = adapters()["mangadex.org"].getSeriesKey();
    expect(key).toBe("mangadex:one piece");
  });

  it("getSeriesKey prefers manga UUID from breadcrumb link", () => {
    const uuid = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    document.body.innerHTML = `<a href="/manga/${uuid}/one-piece">One Piece</a>`;
    const key = adapters()["mangadex.org"].getSeriesKey();
    expect(key).toBe(`mangadex:${uuid}`);
  });
});

// ----------------------------------------------------------------
// Webtoon
// ----------------------------------------------------------------
describe("ADAPTERS[www.webtoons.com]", () => {
  beforeEach(() => {
    loadAdapters();
  });

  it("detects episode number from URL", () => {
    Object.defineProperty(window, "location", {
      value: { hostname: "www.webtoons.com", pathname: "/en/drama/lore-olympus/episode-42/viewer", href: "" },
      writable: true,
      configurable: true,
    });
    document.title = "Lore Olympus | Webtoon";
    const result = adapters()["www.webtoons.com"].detect();
    expect(result!.chapter).toBe(42);
    expect(result!.seriesName).toBe("lore olympus");
  });

  it("returns null when not on an episode page", () => {
    Object.defineProperty(window, "location", {
      value: { hostname: "www.webtoons.com", pathname: "/en/drama/lore-olympus/list", href: "" },
      writable: true,
      configurable: true,
    });
    expect(adapters()["www.webtoons.com"].detect()).toBeNull();
  });

  it("getSeriesKey returns the series slug", () => {
    Object.defineProperty(window, "location", {
      value: { hostname: "www.webtoons.com", pathname: "/en/drama/lore-olympus/episode-1/viewer", href: "" },
      writable: true,
      configurable: true,
    });
    expect(adapters()["www.webtoons.com"].getSeriesKey()).toBe("webtoon:lore-olympus");
  });
});

// ----------------------------------------------------------------
// MangaPlus
// ----------------------------------------------------------------
describe("ADAPTERS[mangaplus.shueisha.co.jp]", () => {
  beforeEach(() => {
    loadAdapters();
    Object.defineProperty(window, "location", {
      value: { hostname: "mangaplus.shueisha.co.jp", pathname: "/viewer/1009910", href: "" },
      writable: true,
      configurable: true,
    });
  });

  it("detects chapter number from title hash", () => {
    document.title = "One Piece #1089 | MANGA Plus";
    const result = adapters()["mangaplus.shueisha.co.jp"].detect();
    expect(result!.chapter).toBe(1089);
    expect(result!.seriesName).toBe("One Piece");
  });

  it("returns null when not on a viewer page", () => {
    Object.defineProperty(window, "location", {
      value: { hostname: "mangaplus.shueisha.co.jp", pathname: "/titles/100020", href: "" },
      writable: true,
      configurable: true,
    });
    expect(adapters()["mangaplus.shueisha.co.jp"].detect()).toBeNull();
  });

  it("returns null when title has no hash chapter number", () => {
    document.title = "MANGA Plus";
    expect(adapters()["mangaplus.shueisha.co.jp"].detect()).toBeNull();
  });

  it("getSeriesKey is based on series name", () => {
    document.title = "One Piece #1 | MANGA Plus";
    expect(adapters()["mangaplus.shueisha.co.jp"].getSeriesKey()).toBe("mangaplus:one piece");
  });
});

// ----------------------------------------------------------------
// Tapas
// ----------------------------------------------------------------
describe("ADAPTERS[tapas.io]", () => {
  beforeEach(() => {
    loadAdapters();
  });

  it("detects episode number from title", () => {
    Object.defineProperty(window, "location", {
      value: { hostname: "tapas.io", pathname: "/series/some-series/episodes/12345", href: "" },
      writable: true,
      configurable: true,
    });
    document.title = "Some Series EP. 7 - Tapas";
    const result = adapters()["tapas.io"].detect();
    expect(result!.chapter).toBe(7);
  });

  it("returns null when not on an episode page", () => {
    Object.defineProperty(window, "location", {
      value: { hostname: "tapas.io", pathname: "/series/some-series", href: "" },
      writable: true,
      configurable: true,
    });
    expect(adapters()["tapas.io"].detect()).toBeNull();
  });

  it("getSeriesKey returns the series slug", () => {
    Object.defineProperty(window, "location", {
      value: { hostname: "tapas.io", pathname: "/series/my-cool-series/episodes/99", href: "" },
      writable: true,
      configurable: true,
    });
    expect(adapters()["tapas.io"].getSeriesKey()).toBe("tapas:my-cool-series");
  });
});
