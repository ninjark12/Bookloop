// adapters.js — site-specific chapter detection
// Loaded before content.js; defines the global ADAPTERS object.
// Each adapter exposes:
//   detect()       -> { chapter: number, seriesName: string } | null
//   getSeriesKey() -> string | null   (stable key for chrome.storage)

var ADAPTERS = {

  // ----------------------------------------------------------------
  // MangaDex  https://mangadex.org/chapter/{uuid}/{page}
  // Title format: "Series Name - Ch. 42 | MangaDex"
  // ----------------------------------------------------------------
  "mangadex.org": {
    detect: function () {
      if (!location.pathname.startsWith("/chapter/")) return null;

      var titleMatch = document.title.match(/Ch\.\s*([\d.]+)/i);
      if (!titleMatch) return null;
      var chapter = parseFloat(titleMatch[1]);
      if (isNaN(chapter)) return null;

      var seriesName = document.title.split(" - ")[0].trim() || "Unknown";
      return { chapter: chapter, seriesName: seriesName };
    },
    getSeriesKey: function () {
      // Prefer the manga UUID from the breadcrumb link (/manga/{uuid} or /title/{uuid})
      var link = document.querySelector('a[href*="/manga/"], a[href*="/title/"]');
      if (link) {
        var m = (link.getAttribute("href") || "").match(/\/(manga|title)\/([a-f0-9-]{36})/i);
        if (m) return "mangadex:" + m[2];
      }
      // Fallback: series name from title
      var name = document.title.split(" - ")[0].trim();
      return name ? "mangadex:" + name.toLowerCase() : null;
    }
  },

  // ----------------------------------------------------------------
  // Webtoon  https://www.webtoons.com/en/{genre}/{series}/episode-{n}/viewer
  // ----------------------------------------------------------------
  "www.webtoons.com": {
    detect: function () {
      var epMatch = location.pathname.match(/\/episode-(\d+)\//);
      if (!epMatch) return null;
      var chapter = parseInt(epMatch[1], 10);
      if (isNaN(chapter)) return null;

      var slugMatch = location.pathname.match(/\/[^/]+\/([^/]+)\/episode-/);
      var seriesName = slugMatch
        ? slugMatch[1].replace(/-/g, " ")
        : document.title.split("|")[0].trim();

      return { chapter: chapter, seriesName: seriesName };
    },
    getSeriesKey: function () {
      var m = location.pathname.match(/\/[^/]+\/([^/]+)\/episode-/);
      return m ? "webtoon:" + m[1] : null;
    }
  },

  // ----------------------------------------------------------------
  // MangaPlus  https://mangaplus.shueisha.co.jp/viewer/{chapterId}
  // Title format: "Series Name #42 | MANGA Plus"
  // ----------------------------------------------------------------
  "mangaplus.shueisha.co.jp": {
    detect: function () {
      if (!location.pathname.startsWith("/viewer/")) return null;

      var numMatch = document.title.match(/#(\d+)/);
      if (!numMatch) return null;
      var chapter = parseInt(numMatch[1], 10);
      if (isNaN(chapter)) return null;

      var seriesName = document.title.split("#")[0].trim() || "Unknown";
      return { chapter: chapter, seriesName: seriesName };
    },
    getSeriesKey: function () {
      var name = document.title.split("#")[0].trim();
      return name ? "mangaplus:" + name.toLowerCase() : null;
    }
  },

  // ----------------------------------------------------------------
  // Tapas  https://tapas.io/series/{slug}/episodes/{episodeId}
  // Title format: "Series Name EP. 42 - Tapas"
  // ----------------------------------------------------------------
  "tapas.io": {
    detect: function () {
      var pathMatch = location.pathname.match(/\/series\/([^/]+)\/episodes\/\d+/);
      if (!pathMatch) return null;

      var epMatch = document.title.match(/EP\.\s*(\d+)/i);
      if (!epMatch) return null;
      var chapter = parseInt(epMatch[1], 10);
      if (isNaN(chapter)) return null;

      var seriesName = pathMatch[1].replace(/-/g, " ");
      return { chapter: chapter, seriesName: seriesName };
    },
    getSeriesKey: function () {
      var m = location.pathname.match(/\/series\/([^/]+)/);
      return m ? "tapas:" + m[1] : null;
    }
  }

};
