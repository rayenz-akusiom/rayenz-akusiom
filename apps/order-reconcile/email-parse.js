(function (global) {
   'use strict';

   var FINISH_KEYWORDS = {
      foil: 'foil',
      etched: 'etched',
      nonfoil: 'nonfoil',
      'non-foil': 'nonfoil',
      glossy: 'foil'
   };

   function normalizeFinish(token) {
      if (!token) {
         return null;
      }
      var lower = String(token).toLowerCase().trim();
      return FINISH_KEYWORDS[lower] || (lower.indexOf('foil') >= 0 && lower.indexOf('non') < 0 ? 'foil' : null);
   }

   function parseCardLine(line) {
      var trimmed = String(line || '').trim();
      if (!trimmed || trimmed.startsWith('#') || /^total\b/i.test(trimmed)) {
         return null;
      }

      var warning = null;
      var quantity = 1;
      var name = trimmed;
      var setCode = null;
      var collectorNumber = null;
      var finish = null;

      var qtyMatch = trimmed.match(/^(\d+)\s*[x×]\s+(.+)$/i);
      if (qtyMatch) {
         quantity = parseInt(qtyMatch[1], 10) || 1;
         name = qtyMatch[2].trim();
      } else {
         var leadingQty = trimmed.match(/^(\d+)\s+(.+)$/);
         if (leadingQty && !/^\d+\s*\(/.test(trimmed)) {
            quantity = parseInt(leadingQty[1], 10) || 1;
            name = leadingQty[2].trim();
         }
      }

      var setCollector = name.match(/\(([^)]+)\)\s*#?(\d+[a-z]?)\s*$/i);
      if (setCollector) {
         setCode = setCollector[1].trim().toLowerCase();
         collectorNumber = setCollector[2].trim();
         name = name.slice(0, setCollector.index).trim();
      } else {
         var setOnly = name.match(/\(([a-z0-9]{2,5})\)\s*$/i);
         if (setOnly) {
            setCode = setOnly[1].toLowerCase();
            name = name.slice(0, setOnly.index).trim();
         }
      }

      var finishMatch = name.match(/\b(foil|non-?foil|etched|glossy)\b/i);
      if (finishMatch) {
         finish = normalizeFinish(finishMatch[1]);
         name = name.replace(finishMatch[0], '').replace(/\s+/g, ' ').trim();
      }

      name = name.replace(/\s*[-–—]\s*$/, '').trim();
      if (!name) {
         return { raw: trimmed, warning: 'Could not parse card name' };
      }

      return {
         name: name,
         quantity: quantity,
         set_code: setCode,
         collector_number: collectorNumber,
         finish: finish,
         raw: trimmed,
         warning: warning
      };
   }

   function parseCardList(text) {
      var lines = String(text || '').split(/\r?\n/);
      var cards = [];
      var warnings = [];
      lines.forEach(function (line, index) {
         var parsed = parseCardLine(line);
         if (!parsed) {
            return;
         }
         if (parsed.warning && !parsed.name) {
            warnings.push({ line: index + 1, raw: parsed.raw, message: parsed.warning });
            return;
         }
         parsed.id = 'acq-' + cards.length;
         cards.push(parsed);
      });
      return { cards: cards, warnings: warnings };
   }

   function isLikelyCardLine(line) {
      var t = String(line || '').trim();
      if (!t || t.length < 3) {
         return false;
      }
      if (/^(hi|hello|dear|thanks|thank you|order|shipped|tracking|invoice|subtotal|shipping|tax|total|date|from|to)\b/i.test(t)) {
         return false;
      }
      if (/^https?:\/\//i.test(t)) {
         return false;
      }
      if (/^\d+\s*[x×]\s+\S/i.test(t)) {
         return true;
      }
      if (/\([a-z0-9]{2,5}\)/i.test(t) && /[a-z]/i.test(t)) {
         return true;
      }
      if (/^\d+\s+[A-Z][\w',-]+/i.test(t)) {
         return true;
      }
      return false;
   }

   function parseOrderEmail(text) {
      var lines = String(text || '').split(/\r?\n/);
      var cardLines = [];
      var skipped = [];
      lines.forEach(function (line, index) {
         if (isLikelyCardLine(line)) {
            cardLines.push(line);
         } else if (String(line).trim()) {
            skipped.push({ line: index + 1, raw: line.trim() });
         }
      });
      var result = parseCardList(cardLines.join('\n'));
      result.skippedNonCardLines = skipped;
      return result;
   }

   function mergeAcquiredCards(cards) {
      var map = {};
      (cards || []).forEach(function (card) {
         var key = [
            card.name.toLowerCase(),
            card.set_code || '',
            card.collector_number || '',
            card.finish || ''
         ].join('|');
         if (!map[key]) {
            map[key] = Object.assign({ id: 'acq-' + Object.keys(map).length }, card);
         } else {
            map[key].quantity = (map[key].quantity || 1) + (card.quantity || 1);
         }
      });
      return Object.keys(map).map(function (k) { return map[k]; });
   }

   global.OrderEmailParse = {
      parseCardLine: parseCardLine,
      parseCardList: parseCardList,
      parseOrderEmail: parseOrderEmail,
      mergeAcquiredCards: mergeAcquiredCards
   };
})(window);
