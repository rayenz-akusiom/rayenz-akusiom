(function (global) {
   'use strict';

   var SC = global.ScryfallCache || (global.ScryfallCache = {});

   var printCache = {};

   async function fetchPrintings(cardName, options) {
      var opts = options || {};
      var cacheKey = String(cardName || '').toLowerCase();
      if (printCache[cacheKey]) {
         return printCache[cacheKey];
      }
      var url = 'https://api.scryfall.com/cards/search?q=' +
         encodeURIComponent('!"' + cardName + '"') + '&unique=prints&order=released';
      var resp = await fetch(url);
      if (!resp.ok) {
         if (opts.defaultScryfallId) {
            var single = await fetch('https://api.scryfall.com/cards/' + opts.defaultScryfallId);
            if (single.ok) {
               var one = await single.json();
               printCache[cacheKey] = [one];
               return printCache[cacheKey];
            }
         }
         throw new Error('Scryfall lookup failed for ' + cardName);
      }
      var json = await resp.json();
      var prints = json.data || [];
      printCache[cacheKey] = prints;
      return prints;
   }

   SC.printCache = printCache;
   SC.fetchPrintings = fetchPrintings;
})(window);
