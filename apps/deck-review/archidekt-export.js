(function (global) {
   'use strict';

   var MANIFEST_VERSION = '1.0';
   var IN_CATEGORY = 'New Set In';
   var OUT_CATEGORY = 'New Set Out';

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

   function buildImportTextForDeck(accepted) {
      var lines = [];
      accepted.forEach(function (decision) {
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
      return lines.join('\n');
   }

   function buildApplyManifest(fileMeta, decksAccepted) {
      return {
         apply_manifest_version: MANIFEST_VERSION,
         generated_at: new Date().toISOString(),
         set_code: fileMeta.set_code,
         set_name: fileMeta.set_name,
         decks: Object.keys(decksAccepted).map(function (deckId) {
            var items = decksAccepted[deckId];
            if (!items.length) {
               return null;
            }
            return {
               deck_id: deckId,
               archidekt_deck_id: items[0].archidekt_deck_id,
               archidekt_url: items[0].archidekt_url,
               operations: items.map(function (d) {
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
         }).filter(Boolean)
      };
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
      parseDeckId: parseDeckId,
      formatImportLine: formatImportLine,
      buildImportTextForDeck: buildImportTextForDeck,
      buildApplyManifest: buildApplyManifest,
      copyText: copyText
   };
})(window);
