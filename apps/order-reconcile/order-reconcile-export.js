(function (global) {
   'use strict';

   var IN_CATEGORY = 'New Set In';
   var OUT_CATEGORY = 'New Set Out';
   var MAYBEBOARD_CATEGORY = 'Maybeboard';
   var Export = global.ArchidektExport;

   function isCubeDeck(deck) {
      return /cube/i.test(String(deck && deck.deck_name || ''));
   }

   function normalizeColorLetter(c) {
      switch (String(c || '').trim().toLowerCase()) {
         case 'w':
         case 'white':
            return 'W';
         case 'u':
         case 'blue':
            return 'U';
         case 'b':
         case 'black':
            return 'B';
         case 'r':
         case 'red':
            return 'R';
         case 'g':
         case 'green':
            return 'G';
         default:
            return null;
      }
   }

   function cubeColorCategory(colorIdentity) {
      var normalized = (colorIdentity || []).map(normalizeColorLetter).filter(Boolean);
      if (!normalized.length) {
         return 'Colorless';
      }
      if (normalized.length === 1) {
         switch (normalized[0]) {
            case 'W': return 'White';
            case 'U': return 'Blue';
            case 'B': return 'Black';
            case 'R': return 'Red';
            case 'G': return 'Green';
            default: return 'Colorless';
         }
      }
      if (normalized.length === 2) {
         var sorted = normalized.slice().sort();
         var pair = sorted.join('');
         switch (pair) {
            case 'UW': return 'Azorius';
            case 'UB': return 'Dimir';
            case 'BR': return 'Rakdos';
            case 'RG': return 'Gruul';
            case 'BG': return 'Golgari';
            case 'UR': return 'Izzet';
            case 'RW': return 'Boros';
            case 'GW': return 'Selesnya';
            case 'WB': return 'Orzhov';
            case 'UG': return 'Simic';
            default: return null;
         }
      }
      return null;
   }

   function resolveCubeDestinationCategory(snapshot, colorIdentity) {
      var suggested = cubeColorCategory(colorIdentity);
      if (!suggested) {
         return '';
      }
      var cats = deckCategories(snapshot);
      return cats.indexOf(suggested) >= 0 ? suggested : '';
   }

   function deriveMaybeboard(snapshot) {
      if (!snapshot || !Array.isArray(snapshot.cards)) {
         return [];
      }
      return snapshot.cards.filter(function (card) {
         var primary = card.primary_category || (card.categories && card.categories[0]);
         return primary === MAYBEBOARD_CATEGORY;
      });
   }

   function maybeboardSlotKey(deckId, slotIndex, cardName) {
      return deckId + ':mb:' + slotIndex + ':' + cardName;
   }

   function cardFaces(name) {
      return String(name || '').toLowerCase().split('//')
         .map(function (s) { return s.trim(); })
         .filter(Boolean);
   }

   function namesMatch(a, b) {
      if (String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()) {
         return true;
      }
      var fa = cardFaces(a);
      var fb = cardFaces(b);
      return fa.some(function (x) { return fb.indexOf(x) >= 0; });
   }

   function deriveSwapQueue(snapshot) {
      if (!snapshot || !Array.isArray(snapshot.cards)) {
         return { new_set_in: [], new_set_out: [], metadata_flags: [] };
      }
      var newSetIn = [];
      var newSetOut = [];
      var metadataFlags = [];
      snapshot.cards.forEach(function (card) {
         var primary = card.primary_category || (card.categories && card.categories[0]);
         var cats = card.categories || [];
         if (primary === IN_CATEGORY) {
            newSetIn.push(card);
         }
         if (primary === OUT_CATEGORY) {
            newSetOut.push(card);
         }
         if (cats.indexOf(IN_CATEGORY) >= 0 && primary !== IN_CATEGORY) {
            metadataFlags.push(card.name + ' (primary: ' + primary + ')');
         }
         if (cats.indexOf(OUT_CATEGORY) >= 0 && primary !== OUT_CATEGORY) {
            metadataFlags.push(card.name + ' (primary: ' + primary + ')');
         }
      });
      return { new_set_in: newSetIn, new_set_out: newSetOut, metadata_flags: metadataFlags };
   }

   function pairSwapSlots(newSetIn, newSetOut) {
      var pairs = [];
      for (var i = 0; i < newSetIn.length; i++) {
         pairs.push({ in: newSetIn[i], out: newSetOut[i] || null, index: i });
      }
      return pairs;
   }

   function deckCategories(snapshot) {
      var cats = {};
      (snapshot.cards || []).forEach(function (card) {
         var primary = card.primary_category || (card.categories && card.categories[0]);
         if (!primary || primary === IN_CATEGORY || primary === OUT_CATEGORY) {
            return;
         }
         cats[primary] = true;
      });
      return Object.keys(cats).sort();
   }

   function cardKey(name, setCode, collectorNumber) {
      return [name, (setCode || '').toLowerCase(), collectorNumber || ''].join('|');
   }

   function cloneEntry(card) {
      return {
         name: card.name,
         set_code: card.set_code || null,
         collector_number: card.collector_number || null,
         quantity: card.quantity || 1,
         primary_category: card.primary_category || null
      };
   }

   function buildMainDeckPool(snapshot) {
      var pool = [];
      (snapshot.cards || []).forEach(function (card) {
         var primary = card.primary_category || (card.categories && card.categories[0]);
         if (primary === IN_CATEGORY || primary === OUT_CATEGORY) {
            return;
         }
         if (!card.name) {
            return;
         }
         pool.push(cloneEntry(card));
      });
      return pool;
   }

   function addToLineMap(map, entry, category, qty) {
      if (qty <= 0) {
         return;
      }
      var key = cardKey(entry.name, entry.set_code, entry.collector_number) + '|' + (category || '');
      if (!map[key]) {
         map[key] = {
            name: entry.name,
            set_code: entry.set_code,
            collector_number: entry.collector_number,
            category: category,
            quantity: 0
         };
      }
      map[key].quantity += qty;
   }

   function deductFromLineMap(map, cut, qty) {
      var remaining = qty || cut.quantity || 1;
      var keys = Object.keys(map);
      for (var i = 0; i < keys.length && remaining > 0; i++) {
         var row = map[keys[i]];
         if (row.name !== cut.name) {
            continue;
         }
         if (cut.set_code && row.set_code && row.set_code !== cut.set_code) {
            continue;
         }
         if (cut.collector_number && row.collector_number && row.collector_number !== cut.collector_number) {
            continue;
         }
         var take = Math.min(row.quantity, remaining);
         row.quantity -= take;
         remaining -= take;
         if (row.quantity <= 0) {
            delete map[keys[i]];
         }
      }
      return remaining;
   }

   function lineMapToImportLines(map, categorySettings) {
      var lines = [];
      Object.keys(map).forEach(function (key) {
         var row = map[key];
         if (row.quantity > 0) {
            lines.push(Export.formatImportLine(
               row.quantity,
               row.name,
               row.set_code,
               row.collector_number,
               row.category,
               categorySettings
            ));
         }
      });
      return lines;
   }

   function fulfilledSlotKey(deckId, slotIndex, inName) {
      return deckId + ':' + slotIndex + ':' + inName;
   }

   function buildReconcileDeckImport(deckId, snapshot, acceptedItems, allDeckItems) {
      if (!snapshot) {
         return '';
      }
      var queue = deriveSwapQueue(snapshot);
      var fulfilledSlotKeys = {};
      (acceptedItems || []).forEach(function (item) {
         if (item.status === 'accepted') {
            fulfilledSlotKeys[item.slot_key] = true;
         }
      });

      var pool = buildMainDeckPool(snapshot);
      var categorySettings = snapshot.category_settings || null;
      var mainMap = {};

      pool.forEach(function (entry) {
         if (entry.quantity > 0) {
            addToLineMap(mainMap, entry, entry.primary_category, entry.quantity);
         }
      });

      (acceptedItems || []).forEach(function (item) {
         if (item.status !== 'accepted' || !item.accepted) {
            return;
         }
         var a = item.accepted;
         addToLineMap(mainMap, {
            name: a.card_in.name,
            set_code: a.card_in.set_code,
            collector_number: a.card_in.collector_number
         }, a.destination_category, a.quantity || 1);

         if (a.card_out && a.card_out.name) {
            deductFromLineMap(mainMap, a.card_out, a.quantity || 1);
         }

         if (item.is_cube && item.maybeboard_entry) {
            deductFromLineMap(mainMap, item.maybeboard_entry, a.quantity || 1);
         }
      });

      var inMap = {};
      var outMap = {};
      pairSwapSlots(queue.new_set_in, queue.new_set_out).forEach(function (pair) {
         var slotKey = fulfilledSlotKey(deckId, pair.index, pair.in.name);
         if (fulfilledSlotKeys[slotKey]) {
            return;
         }
         addToLineMap(inMap, pair.in, IN_CATEGORY, pair.in.quantity || 1);
         if (pair.out) {
            addToLineMap(outMap, pair.out, OUT_CATEGORY, pair.out.quantity || 1);
         }
      });

      var lines = lineMapToImportLines(mainMap, categorySettings)
         .concat(lineMapToImportLines(outMap, categorySettings))
         .concat(lineMapToImportLines(inMap, categorySettings));
      return lines.join('\n');
   }

   function buildStagingCleanupImport(snapshot, removals) {
      if (!snapshot) {
         return '';
      }
      var categorySettings = snapshot.category_settings || null;
      var map = {};
      (snapshot.cards || []).forEach(function (card) {
         addToLineMap(map, card, card.primary_category, card.quantity || 1);
      });

      (removals || []).forEach(function (rem) {
         deductFromLineMap(map, rem, rem.quantity || 1);
      });

      return lineMapToImportLines(map, categorySettings).join('\n');
   }

   function deckReconcileComplete(items, getDecisionFn) {
      var list = items || [];
      if (!list.length) {
         return { complete: true, reviewed: 0, total: 0 };
      }
      var reviewed = 0;
      for (var i = 0; i < list.length; i++) {
         var d = getDecisionFn(list[i].item_id);
         if (!d || !d.status) {
            return { complete: false, reviewed: reviewed, total: list.length };
         }
         reviewed++;
      }
      return { complete: true, reviewed: reviewed, total: list.length };
   }

   function summarizeDeck(deckId, snapshot, acceptedItems) {
      if (!snapshot) {
         return { ins: [], outs: [], remainingIn: [], remainingOut: [] };
      }
      var queue = deriveSwapQueue(snapshot);
      var fulfilledSlotKeys = {};
      var ins = [];
      var outs = [];
      (acceptedItems || []).forEach(function (item) {
         if (item.status !== 'accepted' || !item.accepted) {
            return;
         }
         if (item.slot_key) {
            fulfilledSlotKeys[item.slot_key] = true;
         }
         var a = item.accepted;
         ins.push({
            name: a.card_in.name,
            set_code: a.card_in.set_code,
            collector_number: a.card_in.collector_number,
            finish: a.card_in.finish || null,
            category: a.destination_category
         });
         if (a.card_out && a.card_out.name) {
            outs.push({
               name: a.card_out.name,
               set_code: a.card_out.set_code,
               collector_number: a.card_out.collector_number
            });
         }
      });
      var remainingIn = [];
      var remainingOut = [];
      pairSwapSlots(queue.new_set_in, queue.new_set_out).forEach(function (pair) {
         var slotKey = fulfilledSlotKey(deckId, pair.index, pair.in.name);
         if (fulfilledSlotKeys[slotKey]) {
            return;
         }
         remainingIn.push(pair.in);
         if (pair.out) {
            remainingOut.push(pair.out);
         }
      });
      return { ins: ins, outs: outs, remainingIn: remainingIn, remainingOut: remainingOut };
   }

   global.OrderReconcileExport = {
      IN_CATEGORY: IN_CATEGORY,
      OUT_CATEGORY: OUT_CATEGORY,
      MAYBEBOARD_CATEGORY: MAYBEBOARD_CATEGORY,
      isCubeDeck: isCubeDeck,
      cubeColorCategory: cubeColorCategory,
      resolveCubeDestinationCategory: resolveCubeDestinationCategory,
      deriveMaybeboard: deriveMaybeboard,
      maybeboardSlotKey: maybeboardSlotKey,
      cardFaces: cardFaces,
      namesMatch: namesMatch,
      deriveSwapQueue: deriveSwapQueue,
      pairSwapSlots: pairSwapSlots,
      deckCategories: deckCategories,
      fulfilledSlotKey: fulfilledSlotKey,
      buildReconcileDeckImport: buildReconcileDeckImport,
      buildStagingCleanupImport: buildStagingCleanupImport,
      deckReconcileComplete: deckReconcileComplete,
      summarizeDeck: summarizeDeck
   };
})(window);
