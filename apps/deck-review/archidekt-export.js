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

   function formatImportLine(quantity, name, setCode, collectorNumber, category) {
      var line = quantity + 'x ' + name;
      if (setCode && collectorNumber) {
         line += ' (' + String(setCode).toLowerCase() + ') ' + collectorNumber;
      } else if (setCode) {
         line += ' (' + String(setCode).toLowerCase() + ')';
      }
      if (category) {
         line += ' `' + category + '`';
      }
      return line;
   }

   function appendAcceptedSwapLines(lines, accepted) {
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
               IN_CATEGORY
            ));
         }
         if (decision.card_out && decision.card_out.name) {
            lines.push(formatImportLine(
               decision.card_out.quantity || qty,
               decision.card_out.name,
               decision.card_out.set_code,
               decision.card_out.collector_number,
               OUT_CATEGORY
            ));
         }
      });
   }

   function buildImportTextForDeck(accepted) {
      var lines = [];
      appendAcceptedSwapLines(lines, accepted);
      return lines.join('\n');
   }

   function buildTargetAcceptedSwaps(accepted) {
      return (accepted || []).filter(function (d) {
         return d && d.swap_categories !== false;
      });
   }

   function deckReviewComplete(suggestions, getDecisionFn) {
      var list = suggestions || [];
      if (!list.length) {
         return { complete: true, reviewed: 0, total: 0 };
      }
      var reviewed = 0;
      for (var i = 0; i < list.length; i++) {
         var d = getDecisionFn(list[i].suggestion_id);
         if (!d || !d.status) {
            return { complete: false, reviewed: reviewed, total: list.length };
         }
         reviewed++;
      }
      return { complete: true, reviewed: reviewed, total: list.length };
   }

   function buildFullDeckImport(deck, accepted) {
      var snapshot = deck && deck.deck_snapshot;
      if (!snapshot || !Array.isArray(snapshot.cards)) {
         return '';
      }
      var lines = [];
      snapshot.cards.forEach(function (card) {
         var primary = card.primary_category || (card.categories && card.categories[0]);
         if (primary === IN_CATEGORY || primary === OUT_CATEGORY) {
            return;
         }
         if (!card.name) {
            return;
         }
         lines.push(formatImportLine(
            card.quantity || 1,
            card.name,
            card.set_code,
            card.collector_number,
            primary
         ));
      });
      appendAcceptedSwapLines(lines, accepted);
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
