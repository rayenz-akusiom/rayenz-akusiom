(function (global) {
   'use strict';

   var ROUTE_KEY = 'rayenz-hub-route';
   var REVIEW_PREFIX = 'rayenz-deck-review-';

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

   global.HubStorage = {
      getLastRoute: getLastRoute,
      setLastRoute: setLastRoute,
      loadReviewProgress: loadReviewProgress,
      saveReviewProgress: saveReviewProgress,
      fileIdFromMeta: fileIdFromMeta
   };
})(window);
