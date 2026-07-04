(function (global) {
   'use strict';

   var FREEBIES_DISMISS_PREFIX = 'rayenz-dismiss-freebies-';

   var SEASONAL_OVERRIDE = {
      enabled: false,
      mode: 'all',
      simulateNst: new Date(2025, 11, 15)
   };

   function getNstDate() {
      return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
   }

   function isVonRooActive(nst) {
      if (nst.getMonth() === 9 && nst.getDate() === 31) {
         return true;
      }
      return nst.getHours() === 0;
   }

   function isAltadorCupActive(nst) {
      var month = nst.getMonth();
      var day = nst.getDate();
      if (month === 5 && day >= 22) {
         return true;
      }
      return month === 6 && day <= 14;
   }

   var SEASONAL_EVENTS = [
      {
         id: 'altador-cup',
         name: 'Altador Cup',
         url: 'https://www.neopets.com/altador/colosseum/',
         img: 'https://images.neopets.com/items/toy_altador_cup_gold_whistle.gif',
         note: 'Press tour trivia · sign-ups · tournament through July 14',
         styleClass: 'seasonal-alert--altador',
         kind: 'seasonal',
         isActive: isAltadorCupActive
      },
      {
         id: 'advent',
         name: 'Advent Calendar',
         url: 'https://www.neopets.com/winter/adventcalendar.phtml',
         img: 'https://images.neopets.com/items/fur_mistletoe_wreath.gif',
         note: 'Once per day in December',
         styleClass: 'seasonal-alert--festive',
         kind: 'seasonal',
         isActive: function (nst) { return nst.getMonth() === 11; }
      },
      {
         id: 'deadly-dice',
         name: 'Deadly Dice',
         url: 'https://www.neopets.com/worlds/deadlydice.phtml',
         img: 'https://images.neopets.com/items/plu_von_roo.gif',
         note: 'Midnight hour NST · all day on Halloween',
         styleClass: 'seasonal-alert--midnight',
         kind: 'seasonal',
         isActive: isVonRooActive
      }
   ];

   var TIMED_CARDS = [
      {
         id: 'snowager',
         name: 'Snowager',
         url: 'https://www.neopets.com/winter/snowager.phtml',
         img: 'https://images.neopets.com/items/toy_snowager_plushie.gif',
         note: '6–7am, 2–3pm, 10–11pm NST',
         styleClass: 'seasonal-alert--winter',
         kind: 'timed',
         isActive: function (nst) {
            var h = nst.getHours();
            return h === 6 || h === 14 || h === 22;
         }
      },
      {
         id: 'monthly-freebies',
         name: 'Monthly Freebies',
         url: 'https://www.neopets.com/freebies/',
         img: 'https://images.neopets.com/items/fur_y7_calendar.gif',
         note: 'Once a month',
         styleClass: 'seasonal-alert--festive',
         kind: 'timed',
         dismissOnClick: 'month',
         isActive: function () {
            return !isFreebiesDismissed();
         }
      },
      {
         id: 'magma-pool',
         name: 'Magma Pool',
         url: 'https://www.neopets.com/magma/pool.phtml',
         img: 'https://images.neopets.com/items/bg_magma_pool.gif',
         note: 'Your open window',
         styleClass: 'seasonal-alert--magma',
         kind: 'timed',
         isActive: function (_nst, settings) {
            return isMagmaPoolWindowActive(settings);
         }
      }
   ];

   function monthKey(date) {
      var d = date || new Date();
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
   }

   function isFreebiesDismissed(date) {
      try {
         return localStorage.getItem(FREEBIES_DISMISS_PREFIX + monthKey(date)) === '1';
      } catch (e) {
         return false;
      }
   }

   function dismissFreebies(date) {
      try {
         localStorage.setItem(FREEBIES_DISMISS_PREFIX + monthKey(date), '1');
      } catch (e) {
         /* ignore */
      }
   }

   function parseLocalTime(timeStr) {
      var parts = String(timeStr || '14:47').split(':');
      return {
         hours: parseInt(parts[0], 10) || 0,
         minutes: parseInt(parts[1], 10) || 0
      };
   }

   function isMagmaPoolWindowActive(settings) {
      settings = settings || {};
      var parsed = parseLocalTime(settings.magmaPoolLocalTime);
      var buffer = typeof settings.magmaPoolBufferMinutes === 'number'
         ? settings.magmaPoolBufferMinutes
         : parseInt(settings.magmaPoolBufferMinutes, 10) || 15;
      var now = new Date();
      var target = new Date(now);
      target.setHours(parsed.hours, parsed.minutes, 0, 0);
      var diffMs = Math.abs(now.getTime() - target.getTime());
      return diffMs <= buffer * 60 * 1000;
   }

   function getActiveCards(settings, now) {
      var nst = getNstDate();
      if (SEASONAL_OVERRIDE.enabled && SEASONAL_OVERRIDE.mode === 'simulate') {
         nst = SEASONAL_OVERRIDE.simulateNst;
      }

      var seasonal = SEASONAL_EVENTS.filter(function (event) {
         if (SEASONAL_OVERRIDE.enabled && SEASONAL_OVERRIDE.mode === 'all') {
            return true;
         }
         return event.isActive(nst);
      });

      var timed = TIMED_CARDS.filter(function (card) {
         return card.isActive(nst, settings, now);
      });

      return seasonal.concat(timed);
   }

   function handleCardClick(card) {
      if (card.dismissOnClick === 'month') {
         dismissFreebies();
      }
   }

   function msUntilNextNstMidnight() {
      var nst = getNstDate();
      var next = new Date(nst);
      next.setDate(nst.getDate() + 1);
      next.setHours(0, 0, 0, 0);
      return Math.max(1000, next.getTime() - nst.getTime());
   }

   function msUntilNextNstHour() {
      var nst = getNstDate();
      var next = new Date(nst);
      next.setMinutes(0, 0, 0);
      next.setHours(nst.getHours() + 1);
      return Math.max(1000, next.getTime() - nst.getTime());
   }

   function msUntilNextLocalMinute() {
      var now = new Date();
      var next = new Date(now);
      next.setSeconds(0, 0);
      next.setMinutes(now.getMinutes() + 1);
      return Math.max(1000, next.getTime() - now.getTime());
   }

   global.DailiesTimed = {
      SEASONAL_OVERRIDE: SEASONAL_OVERRIDE,
      getNstDate: getNstDate,
      getActiveCards: getActiveCards,
      handleCardClick: handleCardClick,
      isFreebiesDismissed: isFreebiesDismissed,
      dismissFreebies: dismissFreebies,
      isMagmaPoolWindowActive: isMagmaPoolWindowActive,
      parseLocalTime: parseLocalTime,
      msUntilNextNstMidnight: msUntilNextNstMidnight,
      msUntilNextNstHour: msUntilNextNstHour,
      msUntilNextLocalMinute: msUntilNextLocalMinute
   };
})(window);
