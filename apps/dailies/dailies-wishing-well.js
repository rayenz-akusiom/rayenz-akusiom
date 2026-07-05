(function (global) {

   'use strict';

   /*
    * Wishing Well automation — normalized localStorage state.
    *
    * Key: rayenz-wishing-well-state
    * Shape: { formatVersion, periodKey, wish, donation, lastWishCount, status, lastError, updatedAt }
    *
    * Legacy keys (migrated on load): rayenz-wishing-well-wish, -donation, -period
    */

   var WISHING_STATE_KEY = 'rayenz-wishing-well-state';
   var WISHING_STATE_FORMAT = 1;
   var WISHING_WISH_KEY = 'rayenz-wishing-well-wish';
   var WISHING_DONATION_KEY = 'rayenz-wishing-well-donation';
   var WISHING_PERIOD_KEY = 'rayenz-wishing-well-period';
   var WISHING_MAX = 7;

   function storageGet(key) {
      try {
         return global.localStorage ? global.localStorage.getItem(key) : null;
      } catch (err) {
         return null;
      }
   }

   function storageSet(key, value) {
      try {
         if (global.localStorage) {
            global.localStorage.setItem(key, value);
         }
      } catch (err) {
         /* ignore */
      }
   }

   function getNstDate() {
      return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
   }

   function getWishingPeriodKey() {
      var nst = getNstDate();
      var y = nst.getFullYear();
      var m = nst.getMonth();
      var d = nst.getDate();
      var hour = nst.getHours();
      var slot;

      if (hour >= 8 && hour < 20) {
         slot = 'day';
      } else {
         slot = 'night';
         if (hour < 8) {
            var prev = new Date(nst);
            prev.setDate(prev.getDate() - 1);
            y = prev.getFullYear();
            m = prev.getMonth();
            d = prev.getDate();
         }
      }

      return y + '-' + m + '-' + d + '-' + slot;
   }

   function emptyState(periodKey) {
      return {
         formatVersion: WISHING_STATE_FORMAT,
         periodKey: periodKey || getWishingPeriodKey(),
         wish: '',
         donation: 21,
         lastWishCount: null,
         status: 'idle',
         lastError: null,
         updatedAt: 0
      };
   }

   function migrateLegacyState(periodKey) {
      var wish = storageGet(WISHING_WISH_KEY) || '';
      var donationRaw = storageGet(WISHING_DONATION_KEY);
      var donation = donationRaw ? parseInt(donationRaw, 10) : 21;
      var legacyPeriod = storageGet(WISHING_PERIOD_KEY);
      var status = legacyPeriod === periodKey ? 'complete' : 'idle';
      try {
         if (global.localStorage) {
            global.localStorage.removeItem(WISHING_WISH_KEY);
            global.localStorage.removeItem(WISHING_DONATION_KEY);
            global.localStorage.removeItem(WISHING_PERIOD_KEY);
         }
      } catch (err) {
         /* ignore */
      }
      return {
         formatVersion: WISHING_STATE_FORMAT,
         periodKey: periodKey,
         wish: wish,
         donation: isNaN(donation) ? 21 : donation,
         lastWishCount: null,
         status: status,
         lastError: null,
         updatedAt: Date.now()
      };
   }

   function loadWishingWellState() {
      var periodKey = getWishingPeriodKey();
      var raw = storageGet(WISHING_STATE_KEY);
      var state = null;
      if (raw) {
         try {
            state = JSON.parse(raw);
         } catch (err) {
            state = null;
         }
      }
      if (!state || state.formatVersion !== WISHING_STATE_FORMAT) {
         state = migrateLegacyState(periodKey);
         saveWishingWellState(state);
         return state;
      }
      if (state.periodKey !== periodKey) {
         var prevWish = state.wish;
         var prevDonation = state.donation;
         state = emptyState(periodKey);
         state.wish = prevWish || '';
         state.donation = prevDonation || 21;
         saveWishingWellState(state);
      }
      return state;
   }

   function saveWishingWellState(state) {
      state.updatedAt = Date.now();
      storageSet(WISHING_STATE_KEY, JSON.stringify(state));
   }

   function isWishingPeriodComplete(state) {
      state = state || loadWishingWellState();
      return state.status === 'complete' && state.periodKey === getWishingPeriodKey();
   }

   function markWishingPeriodComplete(state) {
      state = state || loadWishingWellState();
      state.periodKey = getWishingPeriodKey();
      state.status = 'complete';
      state.lastError = null;
      saveWishingWellState(state);
   }

   function updateWishingPreferences(wish, donation) {
      var state = loadWishingWellState();
      if (wish != null && String(wish).trim()) {
         state.wish = String(wish).trim();
      }
      if (donation != null && !isNaN(donation)) {
         state.donation = donation;
      }
      saveWishingWellState(state);
   }

   function parseWishCount(html) {
      var match = html.match(/Wish Count:\s*(\d+)/i);
      if (match) {
         return parseInt(match[1], 10);
      }
      if (/process_wishing|Make a Wish/i.test(html)) {
         return WISHING_MAX;
      }
      return null;
   }

   function parseWishingForm(html) {
      var doc = new DOMParser().parseFromString(html, 'text/html');
      var form = doc.querySelector('form[action*="process_wishing"]');
      if (!form) {
         return null;
      }

      var data = {};
      var fields = form.querySelectorAll('input[name], select[name], textarea[name]');
      for (var i = 0; i < fields.length; i++) {
         var field = fields[i];
         if (field.type === 'submit' || field.type === 'button') {
            if (field.name) {
               data[field.name] = field.value;
            }
            continue;
         }
         if (field.type === 'radio' || field.type === 'checkbox') {
            if (field.checked) {
               data[field.name] = field.value;
            }
            continue;
         }
         data[field.name] = field.value;
      }

      return data;
   }

   function parseWishingError(html) {
      if (/do not have enough/i.test(html)) {
         return 'Not enough Neopoints for that donation.';
      }
      if (/must donate at least 21|minimum of 21/i.test(html)) {
         return 'Donation must be at least 21 NP.';
      }
      if (/already made|seven wishes|7 wishes|no more wishes/i.test(html)) {
         return 'Already submitted the maximum wishes for this period.';
      }
      if (/Oops|error|invalid/i.test(html) && html.length < 5000) {
         var plain = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
         if (plain.length > 0 && plain.length < 200) {
            return plain;
         }
      }
      return null;
   }

   function evaluateWishingPost(response, beforeCount) {
      var html = response.text || '';
      var url = response.url || '';

      if (/Thanks for your donation|Thank you for your donation/i.test(html)) {
         return { ok: true, error: null, wishCount: parseWishCount(html) };
      }
      if (/[?&]thanks=/i.test(url)) {
         return { ok: true, error: null, wishCount: parseWishCount(html) };
      }

      var afterCount = parseWishCount(html);
      if (afterCount !== null && beforeCount !== null && afterCount > beforeCount) {
         return { ok: true, error: null, wishCount: afterCount };
      }

      return {
         ok: false,
         error: parseWishingError(html) || 'Unexpected response from Wishing Well.',
         wishCount: afterCount
      };
   }

   function buildWishingPayload(formData, wishText, donation) {
      var payload = Object.assign({}, formData, {
         donation: String(donation),
         wish: wishText
      });
      if ('amount' in formData) {
         payload.amount = String(donation);
      }
      return payload;
   }

   function encodeForm(data) {
      return Object.keys(data).map(function (key) {
         return encodeURIComponent(key) + '=' + encodeURIComponent(data[key]);
      }).join('&');
   }

   function recordWishingOutcome(state, outcome) {
      if (outcome.wishCount != null) {
         state.lastWishCount = outcome.wishCount;
      }
      if (outcome.ok) {
         state.lastError = null;
         state.status = outcome.wishCount >= WISHING_MAX ? 'complete' : 'idle';
      } else {
         state.status = 'error';
         state.lastError = outcome.error;
      }
      saveWishingWellState(state);
      console.info('[Dailies Wishing Well] state', JSON.stringify(state));
      return state;
   }

   global.DailiesWishingWell = {
      WISHING_MAX: WISHING_MAX,
      getWishingPeriodKey: getWishingPeriodKey,
      loadWishingWellState: loadWishingWellState,
      saveWishingWellState: saveWishingWellState,
      isWishingPeriodComplete: isWishingPeriodComplete,
      markWishingPeriodComplete: markWishingPeriodComplete,
      updateWishingPreferences: updateWishingPreferences,
      parseWishCount: parseWishCount,
      parseWishingForm: parseWishingForm,
      parseWishingError: parseWishingError,
      evaluateWishingPost: evaluateWishingPost,
      buildWishingPayload: buildWishingPayload,
      encodeForm: encodeForm,
      recordWishingOutcome: recordWishingOutcome
   };

})(window);
