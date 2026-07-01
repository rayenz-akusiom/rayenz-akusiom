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
      setCodes: 'MSH,MSC,MAR'
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
      saveDeckSuggestSettings: saveDeckSuggestSettings
   };
})(window);
