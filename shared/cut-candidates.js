(function (global) {
   'use strict';

   var CC = global.CutCandidates || (global.CutCandidates = {});
   var deriveSwapQueue = global.SwapQueue.deriveSwapQueue;
   var optionKey = global.HubUtils.optionKey;

   var PROTECTED_CATEGORIES = { Commander: true, Lieutenant: true, Lieutenants: true };
   var SWAP_IN = 'New Set In';
   var SWAP_OUT = 'New Set Out';

   function resolveSnapshot(snapshotOrDeck) {
      if (!snapshotOrDeck) {
         return null;
      }
      if (snapshotOrDeck.deck_snapshot) {
         return snapshotOrDeck.deck_snapshot;
      }
      return snapshotOrDeck;
   }

   function cardPrimary(card) {
      return card.primary_category || (card.categories && card.categories[0]);
   }

   function buildExcludeMap(options) {
      if (options.excludeCategories) {
         return options.excludeCategories;
      }
      var excluded = {};
      excluded[SWAP_IN] = true;
      excluded[SWAP_OUT] = true;
      Object.keys(PROTECTED_CATEGORIES).forEach(function (key) {
         excluded[key] = true;
      });
      if (options.excludeMaybeboard) {
         excluded.Maybeboard = true;
      }
      return excluded;
   }

   function addOption(seen, options, card, primary) {
      if (!card || !card.name) {
         return;
      }
      var opt = {
         name: card.name,
         quantity: 1,
         set_code: card.set_code,
         collector_number: card.collector_number,
         primary_category: primary !== undefined ? primary : cardPrimary(card)
      };
      var key = optionKey(opt);
      if (seen[key]) {
         return;
      }
      seen[key] = true;
      options.push(opt);
   }

   function scanMainDeck(snapshot, excluded, categoryFilter, seen, options) {
      var before = options.length;
      (snapshot.cards || []).forEach(function (card) {
         var primary = cardPrimary(card);
         if (primary && excluded[primary]) {
            return;
         }
         if (categoryFilter && primary !== categoryFilter) {
            return;
         }
         addOption(seen, options, card, primary);
      });
      return options.length - before;
   }

   function addOutQueue(snapshot, seen, options, outCategory) {
      var queue = deriveSwapQueue({ deck_snapshot: snapshot });
      if (!queue) {
         return;
      }
      (queue.new_set_out || []).forEach(function (card) {
         addOption(seen, options, card, outCategory || SWAP_OUT);
      });
   }

   function buildCutCandidates(snapshotOrDeck, options) {
      options = options || {};
      var snapshot = resolveSnapshot(snapshotOrDeck);
      if (!snapshot || !Array.isArray(snapshot.cards)) {
         return [];
      }

      var excluded = buildExcludeMap(options);
      var seen = {};
      var result = [];

      if (options.includeOutQueue) {
         addOutQueue(snapshot, seen, result, options.outQueueCategory);
      }

      var mainAdded = scanMainDeck(snapshot, excluded, options.categoryFilter || null, seen, result);

      if (options.outQueueFallback && mainAdded === 0) {
         addOutQueue(snapshot, seen, result, options.outQueueCategory || SWAP_OUT);
      }

      if (options.extraCards && options.extraCards.length) {
         options.extraCards.forEach(function (card) {
            addOption(seen, result, card, card.primary_category);
         });
      }

      if (options.sortByName) {
         result.sort(function (a, b) {
            return a.name.localeCompare(b.name);
         });
      }

      return result;
   }

   CC.PROTECTED_CATEGORIES = PROTECTED_CATEGORIES;
   CC.SWAP_IN = SWAP_IN;
   CC.SWAP_OUT = SWAP_OUT;
   CC.buildCutCandidates = buildCutCandidates;
})(window);
