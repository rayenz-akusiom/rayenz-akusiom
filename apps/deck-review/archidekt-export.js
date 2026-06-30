(function (global) {
   'use strict';

   var MANIFEST_VERSION = '1.1';
   var IN_CATEGORY = 'New Set In';
   var OUT_CATEGORY = 'New Set Out';
   var APPLY_STORAGE_PREFIX = 'rayenz-deck-apply:';

   function parseDeckId(url) {
      var match = String(url || '').match(/archidekt\.com\/decks\/(\d+)/);
      return match ? parseInt(match[1], 10) : null;
   }

   function buildCategorySettings(rawDeck) {
      var map = {};
      (rawDeck.categories || []).forEach(function (cat) {
         if (!cat || !cat.name) {
            return;
         }
         map[cat.name] = {
            includedInDeck: cat.includedInDeck !== false,
            includedInPrice: cat.includedInPrice !== false
         };
      });
      return map;
   }

   function getCategorySettings(categorySettings, category) {
      if (!category || !categorySettings) {
         return null;
      }
      if (categorySettings[category]) {
         return categorySettings[category];
      }
      var lower = category.toLowerCase();
      var keys = Object.keys(categorySettings);
      for (var i = 0; i < keys.length; i++) {
         if (keys[i].toLowerCase() === lower) {
            return categorySettings[keys[i]];
         }
      }
      return null;
   }

   function formatSingleCategoryWithFlags(category, categorySettings) {
      if (!category) {
         return '';
      }
      var bracket = category;
      var settings = getCategorySettings(categorySettings, category);
      if (settings) {
         if (settings.includedInDeck === false) {
            bracket += '{noDeck}';
         }
         if (settings.includedInPrice === false) {
            bracket += '{noPrice}';
         }
      } else if (/^borrowed \(out\)$/i.test(category)) {
         bracket += '{noDeck}{noPrice}';
      } else if (category === IN_CATEGORY || /^maybeboard$/i.test(category)) {
         bracket += '{noDeck}{noPrice}';
      }
      return bracket;
   }

   function normalizeCategories(categories, primaryFallback) {
      var list = Array.isArray(categories) ? categories.slice() : [];
      if (!list.length && primaryFallback) {
         list = [primaryFallback];
      }
      var seen = {};
      var out = [];
      list.forEach(function (cat) {
         if (!cat || seen[cat]) {
            return;
         }
         seen[cat] = true;
         out.push(cat);
      });
      return out;
   }

   function formatCategoriesBracket(categories, name, categorySettings) {
      var cats = normalizeCategories(categories, null);
      if (!cats.length) {
         return '';
      }
      var parts = cats.map(function (cat) {
         return formatSingleCategoryWithFlags(cat, categorySettings);
      }).filter(Boolean);
      if (!parts.length) {
         return '';
      }
      return ' [' + parts.join(',') + ']';
   }

   function formatCategoryBracket(category, name, categorySettings) {
      if (!category) {
         return '';
      }
      return formatCategoriesBracket([category], name, categorySettings);
   }

   function appendCategory(categories, name) {
      return normalizeCategories((categories || []).concat([name]), null);
   }

   function formatFinishToken(finish) {
      if (finish === 'foil') {
         return ' *F*';
      }
      if (finish === 'etched') {
         return ' *E*';
      }
      return '';
   }

   function formatImportLine(quantity, name, setCode, collectorNumber, categories, categorySettings, finish) {
      var line = quantity + 'x ' + name;
      if (setCode && collectorNumber) {
         line += ' (' + String(setCode).toLowerCase() + ') ' + collectorNumber;
      } else if (setCode) {
         line += ' (' + String(setCode).toLowerCase() + ')';
      }
      line += formatFinishToken(finish);
      var cats = Array.isArray(categories)
         ? categories
         : (categories ? [categories] : []);
      line += formatCategoriesBracket(cats, name, categorySettings);
      return line;
   }

   function cardKey(name, setCode, collectorNumber) {
      return [name, (setCode || '').toLowerCase(), collectorNumber || ''].join('|');
   }

   function isBasicLandName(name) {
      return /^(Plains|Island|Swamp|Mountain|Forest|Wastes|Snow-Covered (Plains|Island|Swamp|Mountain|Forest))$/i.test(name || '');
   }

   function clonePoolEntry(card) {
      var primary = card.primary_category || (card.categories && card.categories[0]);
      return {
         name: card.name,
         set_code: card.set_code || null,
         collector_number: card.collector_number || null,
         quantity: card.quantity || 1,
         primary_category: primary,
         categories: card.categories && card.categories.length
            ? card.categories.slice()
            : normalizeCategories([], primary)
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
         pool.push(clonePoolEntry(card));
      });
      return pool;
   }

   function poolEntryMatchesCut(entry, cut, exactOnly) {
      if (entry.name !== cut.name) {
         return false;
      }
      if (exactOnly) {
         var cutSet = (cut.set_code || '').toLowerCase();
         var entrySet = (entry.set_code || '').toLowerCase();
         var cutNum = cut.collector_number || '';
         var entryNum = entry.collector_number || '';
         if (cutSet && entrySet && cutSet !== entrySet) {
            return false;
         }
         if (cutNum && entryNum && cutNum !== entryNum) {
            return false;
         }
         if (cutSet && entrySet && cutNum && entryNum) {
            return true;
         }
         if (cutSet && entrySet && !cutNum && !entryNum) {
            return true;
         }
         return !!(cutSet && entrySet);
      }
      return true;
   }

   function addToLineMap(map, entry, categories, qty) {
      if (qty <= 0) {
         return;
      }
      var cats = normalizeCategories(
         categories,
         entry.primary_category || (entry.categories && entry.categories[0])
      );
      var finishKey = entry.finish || '';
      var key = cardKey(entry.name, entry.set_code, entry.collector_number) + '|' + cats.join(',') + '|' + finishKey;
      if (!map[key]) {
         map[key] = {
            name: entry.name,
            set_code: entry.set_code,
            collector_number: entry.collector_number,
            categories: cats,
            finish: entry.finish || null,
            quantity: 0
         };
      }
      map[key].quantity += qty;
   }

   function deductCutFromPool(pool, cut, outMap) {
      var remaining = cut.quantity || 1;
      var exactOnly = !!(cut.set_code || cut.collector_number);

      function tryDeduct(matchExact) {
         for (var i = 0; i < pool.length && remaining > 0; i++) {
            if (pool[i].quantity <= 0) {
               continue;
            }
            if (!poolEntryMatchesCut(pool[i], cut, matchExact)) {
               continue;
            }
            var take = Math.min(pool[i].quantity, remaining);
            pool[i].quantity -= take;
            addToLineMap(outMap, pool[i], [OUT_CATEGORY], take);
            remaining -= take;
         }
      }

      tryDeduct(true);
      if (remaining > 0 && !exactOnly) {
         tryDeduct(false);
      }

      if (remaining > 0) {
         addToLineMap(outMap, {
            name: cut.name,
            set_code: cut.set_code,
            collector_number: cut.collector_number
         }, [OUT_CATEGORY], remaining);
      }
   }

   function collectSwapOperations(accepted) {
      var ins = [];
      var outs = [];
      (accepted || []).forEach(function (decision) {
         if (!decision.swap_categories) {
            return;
         }
         var qty = decision.quantity || 1;
         var cardIn = decision.card_in || {};
         if (cardIn.name) {
            ins.push({
               name: cardIn.name,
               set_code: cardIn.set_code || null,
               collector_number: cardIn.collector_number || null,
               finish: cardIn.finish || null,
               quantity: qty
            });
         }
         if (decision.card_out && decision.card_out.name) {
            outs.push({
               name: decision.card_out.name,
               set_code: decision.card_out.set_code || null,
               collector_number: decision.card_out.collector_number || null,
               quantity: decision.card_out.quantity || qty
            });
         }
      });
      return { ins: ins, outs: outs };
   }

   function lineMapToImportLines(map, categorySettings) {
      var lines = [];
      Object.keys(map).forEach(function (key) {
         var row = map[key];
         if (row.quantity > 0) {
            lines.push(formatImportLine(
               row.quantity,
               row.name,
               row.set_code,
               row.collector_number,
               row.categories,
               categorySettings,
               row.finish
            ));
         }
      });
      return lines;
   }

   function appendAcceptedSwapLines(lines, accepted, categorySettings) {
      (accepted || []).forEach(function (decision) {
         if (!decision.swap_categories) {
            return;
         }
         var qty = decision.quantity || 1;
         var cardIn = decision.card_in || {};
         if (cardIn.name) {
            lines.push(formatImportLine(
               qty,
               cardIn.name,
               cardIn.set_code,
               cardIn.collector_number,
               [IN_CATEGORY],
               categorySettings,
               cardIn.finish
            ));
         }
         if (decision.card_out && decision.card_out.name) {
            lines.push(formatImportLine(
               decision.card_out.quantity || qty,
               decision.card_out.name,
               decision.card_out.set_code,
               decision.card_out.collector_number,
               [OUT_CATEGORY],
               categorySettings
            ));
         }
      });
   }

   function buildImportTextForDeck(accepted, categorySettings) {
      var lines = [];
      appendAcceptedSwapLines(lines, accepted, categorySettings);
      return lines.join('\n');
   }

   function buildTargetAcceptedSwaps(accepted) {
      return (accepted || []).filter(function (d) {
         return d && d.swap_categories !== false;
      });
   }

   function isReviewComplete(list, idField, getDecisionFn) {
      var items = list || [];
      if (!items.length) {
         return { complete: true, reviewed: 0, total: 0 };
      }
      var reviewed = 0;
      for (var i = 0; i < items.length; i++) {
         var d = getDecisionFn(items[i][idField]);
         if (!d || !d.status) {
            return { complete: false, reviewed: reviewed, total: items.length };
         }
         reviewed++;
      }
      return { complete: true, reviewed: reviewed, total: items.length };
   }

   function deckReviewComplete(suggestions, getDecisionFn) {
      return isReviewComplete(suggestions, 'suggestion_id', getDecisionFn);
   }

   function buildFullDeckImport(deck, accepted) {
      var snapshot = deck && deck.deck_snapshot;
      if (!snapshot || !Array.isArray(snapshot.cards)) {
         return '';
      }
      var ops = collectSwapOperations(accepted);
      var pool = buildMainDeckPool(snapshot);
      var categorySettings = snapshot.category_settings || null;
      var outMap = {};
      var inMap = {};

      ops.outs.forEach(function (cut) {
         deductCutFromPool(pool, cut, outMap);
      });

      ops.ins.forEach(function (add) {
         addToLineMap(inMap, add, [IN_CATEGORY], add.quantity);
      });

      var mainMap = {};
      pool.forEach(function (entry) {
         if (entry.quantity > 0) {
            addToLineMap(mainMap, entry, entry.categories, entry.quantity);
         }
      });

      var lines = lineMapToImportLines(mainMap, categorySettings)
         .concat(lineMapToImportLines(outMap, categorySettings))
         .concat(lineMapToImportLines(inMap, categorySettings));
      return lines.join('\n');
   }

   function buildDeckApplyEntry(deck, accepted) {
      var acceptedSwaps = buildTargetAcceptedSwaps(accepted);
      var importText = buildFullDeckImport(deck, acceptedSwaps);
      if (!importText.trim()) {
         return null;
      }
      var deckId = parseDeckId(deck.archidekt_url);
      return {
         deck_id: deck.deck_id,
         archidekt_deck_id: deckId,
         archidekt_url: deck.archidekt_url,
         import_mode: 'full_deck_replace',
         import_text: importText,
         operations: acceptedSwaps.map(function (d) {
            return {
               suggestion_id: d.suggestion_id,
               action: d.action,
               quantity: d.quantity || 1,
               card_in: d.card_in,
               card_out: d.card_out,
               swap_categories: d.swap_categories !== false
            };
         })
      };
   }

   function buildApplyManifest(fileMeta, decks, acceptedByDeckId) {
      var deckList = decks || [];
      var acceptedMap = acceptedByDeckId || {};
      return {
         apply_manifest_version: MANIFEST_VERSION,
         generated_at: new Date().toISOString(),
         set_code: fileMeta.set_code,
         set_name: fileMeta.set_name,
         decks: deckList.map(function (deck) {
            var accepted = acceptedMap[deck.deck_id] || [];
            return buildDeckApplyEntry(deck, accepted);
         }).filter(Boolean)
      };
   }

   function stageDeckApply(archidektDeckId, importText) {
      if (!archidektDeckId || !importText) {
         throw new Error('Missing deck id or import text');
      }
      var bridge = global.RayenzArchidektBridge;
      if (bridge && typeof bridge.stageApply === 'function') {
         bridge.stageApply(archidektDeckId, importText);
         return;
      }
      throw new Error('Install/update Archidekt Deck Review Bridge userscript to apply from Hub.');
   }

   function getStagedDeckApply(archidektDeckId) {
      var bridge = global.RayenzArchidektBridge;
      if (bridge && typeof bridge.getStagedApply === 'function') {
         return bridge.getStagedApply(archidektDeckId);
      }
      return null;
   }

   function clearStagedDeckApply(archidektDeckId) {
      var bridge = global.RayenzArchidektBridge;
      if (bridge && typeof bridge.clearStagedApply === 'function') {
         bridge.clearStagedApply(archidektDeckId);
      }
   }

   async function copyText(text) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
         await navigator.clipboard.writeText(text);
         return;
      }
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
   }

   global.ArchidektExport = {
      MANIFEST_VERSION: MANIFEST_VERSION,
      IN_CATEGORY: IN_CATEGORY,
      OUT_CATEGORY: OUT_CATEGORY,
      APPLY_STORAGE_PREFIX: APPLY_STORAGE_PREFIX,
      parseDeckId: parseDeckId,
      formatImportLine: formatImportLine,
      formatFinishToken: formatFinishToken,
      formatCategoryBracket: formatCategoryBracket,
      formatCategoriesBracket: formatCategoriesBracket,
      normalizeCategories: normalizeCategories,
      appendCategory: appendCategory,
      buildCategorySettings: buildCategorySettings,
      cardKey: cardKey,
      buildMainDeckPool: buildMainDeckPool,
      addToLineMap: addToLineMap,
      lineMapToImportLines: lineMapToImportLines,
      isReviewComplete: isReviewComplete,
      buildImportTextForDeck: buildImportTextForDeck,
      buildTargetAcceptedSwaps: buildTargetAcceptedSwaps,
      deckReviewComplete: deckReviewComplete,
      buildFullDeckImport: buildFullDeckImport,
      buildDeckApplyEntry: buildDeckApplyEntry,
      buildApplyManifest: buildApplyManifest,
      stageDeckApply: stageDeckApply,
      getStagedDeckApply: getStagedDeckApply,
      clearStagedDeckApply: clearStagedDeckApply,
      copyText: copyText
   };
})(window);
