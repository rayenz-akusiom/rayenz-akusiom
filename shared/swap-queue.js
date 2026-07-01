(function (global) {
   'use strict';

   var SQ = global.SwapQueue || (global.SwapQueue = {});

   var SWAP_IN = 'New Set In';
   var SWAP_OUT = 'New Set Out';

   function deriveSwapQueue(deck) {
      if (!deck.deck_snapshot || !Array.isArray(deck.deck_snapshot.cards)) {
         return null;
      }
      var newSetIn = [];
      var newSetOut = [];
      var metadataFlags = [];
      deck.deck_snapshot.cards.forEach(function (card) {
         var primary = card.primary_category || (card.categories && card.categories[0]);
         var cats = card.categories || [];
         if (primary === SWAP_IN) {
            newSetIn.push(card);
         }
         if (primary === SWAP_OUT) {
            newSetOut.push(card);
         }
         if (cats.indexOf(SWAP_IN) >= 0 && primary !== SWAP_IN) {
            metadataFlags.push(card.name + ' (primary: ' + primary + ')');
         }
         if (cats.indexOf(SWAP_OUT) >= 0 && primary !== SWAP_OUT) {
            metadataFlags.push(card.name + ' (primary: ' + primary + ')');
         }
      });
      return {
         new_set_in: newSetIn,
         new_set_out: newSetOut,
         metadata_flags: metadataFlags,
         fetched_at: deck.deck_snapshot.fetched_at || null
      };
   }

   function swapQueueHasName(cards, name) {
      return (cards || []).some(function (c) { return c.name === name; });
   }

   function hasMaybeboardOnlySwapQueue(snapshot) {
      if (!snapshot || !Array.isArray(snapshot.cards)) {
         return false;
      }
      var hasPrimaryInOut = false;
      var hasMaybeboardInOut = false;
      snapshot.cards.forEach(function (card) {
         var primary = card.primary_category || (card.categories && card.categories[0]);
         var cats = card.categories || [];
         if (primary === SWAP_IN || primary === SWAP_OUT) {
            hasPrimaryInOut = true;
         }
         if (cats.indexOf('Maybeboard') >= 0 &&
            (cats.indexOf(SWAP_IN) >= 0 || cats.indexOf(SWAP_OUT) >= 0)) {
            hasMaybeboardInOut = true;
         }
      });
      return hasMaybeboardInOut && !hasPrimaryInOut;
   }

   SQ.SWAP_IN = SWAP_IN;
   SQ.SWAP_OUT = SWAP_OUT;
   SQ.deriveSwapQueue = deriveSwapQueue;
   SQ.swapQueueHasName = swapQueueHasName;
   SQ.hasMaybeboardOnlySwapQueue = hasMaybeboardOnlySwapQueue;
})(window);
