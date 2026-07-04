(function (global) {
   'use strict';

   var ROUTE_KEY = 'rayenz-hub-route';
   var REVIEW_PREFIX = 'rayenz-deck-review-';
   var ORDER_RECONCILE_SETTINGS_KEY = 'rayenz-order-reconcile-settings';
   var ORDER_RECONCILE_PROGRESS_PREFIX = 'rayenz-order-reconcile-';

   function getItem(key) {
      try {
         return localStorage.getItem(key);
      } catch (e) {
         return null;
      }
   }

   function setItem(key, value) {
      try {
         localStorage.setItem(key, value);
      } catch (e) {
         /* ignore */
      }
   }

   function getLastRoute() {
      return getItem(ROUTE_KEY) || '#/dailies';
   }

   function setLastRoute(route) {
      setItem(ROUTE_KEY, route);
   }

   function reviewFileKey(fileId) {
      return REVIEW_PREFIX + fileId;
   }

   function loadReviewProgress(fileId) {
      var raw = getItem(reviewFileKey(fileId));
      if (!raw) {
         return { decisions: {}, currentDeckId: null, currentSuggestionIndex: {} };
      }
      try {
         return JSON.parse(raw);
      } catch (e) {
         return { decisions: {}, currentDeckId: null, currentSuggestionIndex: {} };
      }
   }

   function saveReviewProgress(fileId, progress) {
      setItem(reviewFileKey(fileId), JSON.stringify(progress));
   }

   function fileIdFromMeta(meta) {
      return (meta.set_code || 'unknown') + '-' + (meta.generated_at || 'undated');
   }

   var DEFAULT_ORDER_RECONCILE_SETTINGS = {
      stagingDeckUrl: 'https://archidekt.com/decks/8667017',
      registrySource: 'folder',
      folderUrl: 'https://archidekt.com/folders/81998',
      customDeckUrls: ''
   };

   function loadOrderReconcileSettings() {
      var raw = getItem(ORDER_RECONCILE_SETTINGS_KEY);
      if (!raw) {
         return Object.assign({}, DEFAULT_ORDER_RECONCILE_SETTINGS);
      }
      try {
         return Object.assign({}, DEFAULT_ORDER_RECONCILE_SETTINGS, JSON.parse(raw));
      } catch (e) {
         return Object.assign({}, DEFAULT_ORDER_RECONCILE_SETTINGS);
      }
   }

   function saveOrderReconcileSettings(settings) {
      setItem(ORDER_RECONCILE_SETTINGS_KEY, JSON.stringify(settings || {}));
   }

   function orderReconcileSessionKey(sessionId) {
      return ORDER_RECONCILE_PROGRESS_PREFIX + (sessionId || 'default');
   }

   function loadOrderReconcileProgress(sessionId) {
      var raw = getItem(orderReconcileSessionKey(sessionId));
      if (!raw) {
         return { decisions: {}, assignments: [], needsReview: [], copies: [], acquiredCards: [], activeDeckId: null, phase: 'input', completedDecks: {} };
      }
      try {
         return JSON.parse(raw);
      } catch (e) {
         return { decisions: {}, assignments: [], needsReview: [], copies: [], acquiredCards: [], activeDeckId: null, phase: 'input', completedDecks: {} };
      }
   }

   function saveOrderReconcileProgress(sessionId, progress) {
      setItem(orderReconcileSessionKey(sessionId), JSON.stringify(progress || {}));
   }

   var DECK_SUGGEST_SETTINGS_KEY = 'rayenz-deck-suggest-settings';
   var DEFAULT_DECK_SUGGEST_SETTINGS = {
      folderUrl: 'https://archidekt.com/folders/81998',
      setCodes: 'MSH,MSC,MAR',
      deckLoadTab: null,
      customDeckUrls: '',
      pasteDeckImport: '',
      pasteDeckName: '',
      pasteDeckUrl: '',
      rulesDebug: false
   };

   function loadDeckSuggestSettings() {
      var raw = getItem(DECK_SUGGEST_SETTINGS_KEY);
      if (!raw) {
         return Object.assign({}, DEFAULT_DECK_SUGGEST_SETTINGS);
      }
      try {
         return Object.assign({}, DEFAULT_DECK_SUGGEST_SETTINGS, JSON.parse(raw));
      } catch (e) {
         return Object.assign({}, DEFAULT_DECK_SUGGEST_SETTINGS);
      }
   }

   function saveDeckSuggestSettings(settings) {
      setItem(DECK_SUGGEST_SETTINGS_KEY, JSON.stringify(settings || {}));
   }

   var SET_POOL_CACHE_PREFIX = 'rayenz-deck-suggest-set-pool-';
   var REVIEW_HANDOFF_KEY = 'rayenz-deck-suggest-review-handoff';

   function normalizeSetCodesKey(codes) {
      return (codes || []).map(function (c) {
         return String(c).trim().toUpperCase();
      }).filter(Boolean).sort().join(',');
   }

   function setPoolCacheKey(codesKey) {
      return SET_POOL_CACHE_PREFIX + codesKey;
   }

   function saveSetPoolCache(codesKey, scope) {
      if (!codesKey || !scope || scope.complete !== true) {
         return false;
      }
      try {
         setItem(setPoolCacheKey(codesKey), JSON.stringify(scope));
         return true;
      } catch (e) {
         return false;
      }
   }

   function loadSetPoolCache(codesKey) {
      if (!codesKey) {
         return null;
      }
      var raw = getItem(setPoolCacheKey(codesKey));
      if (!raw) {
         return null;
      }
      try {
         var scope = JSON.parse(raw);
         if (!scope || scope.complete !== true) {
            return null;
         }
         return scope;
      } catch (e) {
         return null;
      }
   }

   function clearSetPoolCache(codesKey) {
      if (!codesKey) {
         return;
      }
      try {
         localStorage.removeItem(setPoolCacheKey(codesKey));
      } catch (e) {
         /* ignore */
      }
   }

   function saveMemoryReviewHandoff(payload) {
      try {
         global.__hubReviewHandoff = payload;
         return true;
      } catch (e) {
         return false;
      }
   }

   function consumeMemoryReviewHandoff() {
      var payload = global.__hubReviewHandoff;
      delete global.__hubReviewHandoff;
      return payload || null;
   }

   function saveReviewHandoff(payload) {
      var memoryOk = saveMemoryReviewHandoff(payload);
      try {
         sessionStorage.setItem(REVIEW_HANDOFF_KEY, JSON.stringify(payload || {}));
         return true;
      } catch (e) {
         return memoryOk;
      }
   }

   function consumeReviewHandoff() {
      var memory = consumeMemoryReviewHandoff();
      if (memory) {
         try {
            sessionStorage.removeItem(REVIEW_HANDOFF_KEY);
         } catch (e) {
            /* ignore */
         }
         return memory;
      }
      try {
         var raw = sessionStorage.getItem(REVIEW_HANDOFF_KEY);
         if (!raw) {
            return null;
         }
         sessionStorage.removeItem(REVIEW_HANDOFF_KEY);
         return JSON.parse(raw);
      } catch (e) {
         return null;
      }
   }

   var DAILIES_SETTINGS_KEY = 'rayenz-dailies-settings';
   var DEFAULT_DAILIES_SETTINGS = {
      faerieQuest: 'illusen',
      schools: {
         swashbuckling: true,
         'mystery-island': true,
         'secret-ninja': true,
         'lab-ray': true,
         'kitchen-quests': true,
         'healing-springs': true,
         battledome: true,
         'faerie-quests': true
      },
      magmaPoolLocalTime: '14:47',
      magmaPoolBufferMinutes: 15,
      itemdbApiKey: ''
   };

   function loadDailiesSettings() {
      var raw = getItem(DAILIES_SETTINGS_KEY);
      if (!raw) {
         return Object.assign({}, DEFAULT_DAILIES_SETTINGS, {
            schools: Object.assign({}, DEFAULT_DAILIES_SETTINGS.schools)
         });
      }
      try {
         var parsed = JSON.parse(raw);
         return Object.assign({}, DEFAULT_DAILIES_SETTINGS, parsed, {
            schools: Object.assign({}, DEFAULT_DAILIES_SETTINGS.schools, parsed.schools || {})
         });
      } catch (e) {
         return Object.assign({}, DEFAULT_DAILIES_SETTINGS, {
            schools: Object.assign({}, DEFAULT_DAILIES_SETTINGS.schools)
         });
      }
   }

   function saveDailiesSettings(settings) {
      setItem(DAILIES_SETTINGS_KEY, JSON.stringify(settings || {}));
   }

   global.HubStorage = {
      getLastRoute: getLastRoute,
      setLastRoute: setLastRoute,
      loadReviewProgress: loadReviewProgress,
      saveReviewProgress: saveReviewProgress,
      fileIdFromMeta: fileIdFromMeta,
      loadOrderReconcileSettings: loadOrderReconcileSettings,
      saveOrderReconcileSettings: saveOrderReconcileSettings,
      loadOrderReconcileProgress: loadOrderReconcileProgress,
      saveOrderReconcileProgress: saveOrderReconcileProgress,
      loadDeckSuggestSettings: loadDeckSuggestSettings,
      saveDeckSuggestSettings: saveDeckSuggestSettings,
      normalizeSetCodesKey: normalizeSetCodesKey,
      saveSetPoolCache: saveSetPoolCache,
      loadSetPoolCache: loadSetPoolCache,
      clearSetPoolCache: clearSetPoolCache,
      saveReviewHandoff: saveReviewHandoff,
      consumeReviewHandoff: consumeReviewHandoff,
      consumeMemoryReviewHandoff: consumeMemoryReviewHandoff,
      loadDailiesSettings: loadDailiesSettings,
      saveDailiesSettings: saveDailiesSettings
   };
})(window);
