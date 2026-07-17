(function (global) {
   'use strict';

   function bridgeAvailable() {
      return typeof global.RayenzArchidektBridge !== 'undefined' && global.RayenzArchidektBridge.isAvailable;
   }

   function bridgeApplyAvailable() {
      var bridge = global.RayenzArchidektBridge;
      return !!(bridge && bridge.isAvailable && typeof bridge.stageApply === 'function');
   }

   function optionKey(opt) {
      return [opt.name, opt.set_code || '', opt.collector_number || ''].join('|');
   }

   function sleep(ms) {
      return new Promise(function (resolve) { setTimeout(resolve, ms); });
   }

   function scryfallImageFromId(scryfallId) {
      if (!scryfallId) {
         return '';
      }
      return 'https://api.scryfall.com/cards/' + scryfallId + '?format=image&version=normal';
   }

   function scryfallImageFromPrinting(setCode, collectorNumber) {
      if (!setCode || !collectorNumber) {
         return '';
      }
      return 'https://api.scryfall.com/cards/' + encodeURIComponent(String(setCode).toLowerCase()) + '/' +
         encodeURIComponent(String(collectorNumber)) + '?format=image&version=normal';
   }

   function scryfallImageFromName(name) {
      if (!name) {
         return '';
      }
      return 'https://api.scryfall.com/cards/named?exact=' +
         encodeURIComponent(name) + '&format=image&version=normal';
   }

   function hubDocumentRoot() {
      var entry = document.querySelector(
         'script[type="module"][src*="/assets/"], script[type="module"][src*="/src/hub/"]'
      );
      if (entry && entry.src) {
         var src = entry.src;
         var assetsIdx = src.lastIndexOf('/assets/');
         if (assetsIdx !== -1) {
            return src.slice(0, assetsIdx + 1);
         }
         var hubIdx = src.lastIndexOf('/src/hub/');
         if (hubIdx !== -1) {
            return src.slice(0, hubIdx + 1);
         }
      }
      return (global.location && global.location.origin ? global.location.origin : '') + '/';
   }

   function resolveHubUrl(path) {
      try {
         return new URL(path, hubDocumentRoot()).href;
      } catch (e) {
         return path;
      }
   }

   function ensureCss(href, attrName) {
      if (document.querySelector('link[' + attrName + ']')) {
         return;
      }
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = resolveHubUrl(href);
      link.setAttribute(attrName, '1');
      document.head.appendChild(link);
   }

   function suggestionsExportFilename(data) {
      var meta = data && data.meta || {};
      var setCode = (meta.set_code || 'SET').toUpperCase();
      var date = meta.generated_at || new Date().toISOString().slice(0, 10);
      return setCode + '-' + date + '-rules.json';
   }

   function downloadSuggestionsJson(data) {
      var filename = suggestionsExportFilename(data);
      var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      return filename;
   }

   function isLocalHub() {
      try {
         var host = global.location && global.location.hostname;
         return host === 'localhost' || host === '127.0.0.1';
      } catch (e) {
         return false;
      }
   }

   function mountAppProgress(hostEl, appName) {
      if (!hostEl || !global.HubProgress || typeof global.HubProgress.mount !== 'function') {
         return null;
      }
      return global.HubProgress.mount(hostEl);
   }

   function handoffSnapshotSummary(data) {
      var decks = (data && data.decks) || [];
      var reviewable = decks.filter(function (d) {
         return (d.suggestions || []).length > 0;
      });
      var withSnapshots = reviewable.filter(function (d) {
         return d.deck_snapshot && d.deck_snapshot.cards && d.deck_snapshot.cards.length;
      });
      return {
         reviewable: reviewable.length,
         withSnapshots: withSnapshots.length,
         missingSnapshots: reviewable.length - withSnapshots.length,
         allReady: reviewable.length > 0 && withSnapshots.length === reviewable.length
      };
   }

   global.HubUtils = {
      escapeHtml: global.StringUtils.escapeHtml,
      bridgeAvailable: bridgeAvailable,
      bridgeApplyAvailable: bridgeApplyAvailable,
      optionKey: optionKey,
      sleep: sleep,
      scryfallImageFromId: scryfallImageFromId,
      scryfallImageFromPrinting: scryfallImageFromPrinting,
      scryfallImageFromName: scryfallImageFromName,
      ensureCss: ensureCss,
      resolveHubUrl: resolveHubUrl,
      isLocalHub: isLocalHub,
      mountAppProgress: mountAppProgress,
      suggestionsExportFilename: suggestionsExportFilename,
      downloadSuggestionsJson: downloadSuggestionsJson,
      handoffSnapshotSummary: handoffSnapshotSummary
   };
})(window);
