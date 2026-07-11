(function (global) {
   'use strict';

   var DR = global.DeckReview;
   var state = DR.state;

   var deriveSwapQueue = SwapQueue.deriveSwapQueue;

   var escapeHtml = HubUtils.escapeHtml;
   var optionKey = HubUtils.optionKey;
   var scryfallImageFromPrinting = HubUtils.scryfallImageFromPrinting;

   function archidektApplyOpenUrl(archidektUrl) {
      if (!archidektUrl) {
         return archidektUrl;
      }
      var sep = archidektUrl.indexOf('?') >= 0 ? '&' : '?';
      return archidektUrl + sep + 'rayenz_apply=1';
   }

   function swapQueueHasName(cards, name) {
      return (cards || []).some(function (c) { return c.name === name; });
   }

   function formatSwapQueueItem(card) {
      if (card.set_code && card.collector_number) {
         return card.name + ' (' + String(card.set_code).toUpperCase() + ' #' + card.collector_number + ')';
      }
      return card.name;
   }

   function getSuggestionStaleness(deck, suggestion) {
      var queue = deriveSwapQueue(deck);
      if (!queue) {
         return { stale: false, level: '', reasons: [] };
      }
      var reasons = [];
      var incoming = suggestion.card && suggestion.card.name;
      var slot = suggestion.fills_swap_slot;
      var queuedIn = (incoming && swapQueueHasName(queue.new_set_in, incoming)) ||
         (slot && swapQueueHasName(queue.new_set_in, slot));
      var queuedOut = (suggestion.replaces || []).some(function (r) {
         return r.name && swapQueueHasName(queue.new_set_out, r.name);
      });
      if (queuedIn) {
         reasons.push((slot || incoming) + ' is already in your Archidekt New Set In queue.');
      }
      if (queuedOut) {
         (suggestion.replaces || []).forEach(function (r) {
            if (r.name && swapQueueHasName(queue.new_set_out, r.name)) {
               reasons.push(r.name + ' is already in your Archidekt New Set Out queue.');
            }
         });
      }
      var level = '';
      if (queuedIn && queuedOut) {
         level = 'fully_queued';
      } else if (queuedIn) {
         level = 'queued_in';
      } else if (queuedOut) {
         level = 'queued_out';
      }
      return { stale: reasons.length > 0, level: level, reasons: reasons };
   }

   function suggestionCoversQueueIn(suggestion, inName) {
      if (!inName || !suggestion) {
         return false;
      }
      if (suggestion.fills_swap_slot === inName) {
         return true;
      }
      if (suggestion.overrides_queue_in === inName) {
         return true;
      }
      return suggestion.card && suggestion.card.name === inName;
   }

   function suggestionCoversQueueOut(suggestion, outName) {
      if (!outName || !suggestion) {
         return false;
      }
      return (suggestion.replaces || []).some(function (r) {
         return r.name === outName;
      });
   }

   function getSwapQueueReconciliation(deck) {
      var queue = deriveSwapQueue(deck);
      if (!queue) {
         return { uncoveredIn: [], uncoveredOut: [], unpairedIn: [], unpairedOut: [] };
      }
      var suggestions = deck.suggestions || [];
      var uncoveredIn = [];
      var uncoveredOut = [];
      (queue.new_set_in || []).forEach(function (c) {
         var covered = suggestions.some(function (s) {
            return suggestionCoversQueueIn(s, c.name);
         });
         if (!covered) {
            uncoveredIn.push(c.name);
         }
      });
      (queue.new_set_out || []).forEach(function (c) {
         var covered = suggestions.some(function (s) {
            return suggestionCoversQueueOut(s, c.name);
         });
         if (!covered) {
            uncoveredOut.push(c.name);
         }
      });
      var unpairedIn = [];
      var unpairedOut = [];
      var inLen = queue.new_set_in.length;
      var outLen = queue.new_set_out.length;
      if (inLen > outLen) {
         queue.new_set_in.slice(outLen).forEach(function (c) {
            unpairedIn.push(c.name);
         });
      } else if (outLen > inLen) {
         queue.new_set_out.slice(inLen).forEach(function (c) {
            unpairedOut.push(c.name);
         });
      }
      return {
         uncoveredIn: uncoveredIn,
         uncoveredOut: uncoveredOut,
         unpairedIn: unpairedIn,
         unpairedOut: unpairedOut
      };
   }

   function swapQueueListItem(card, uncoveredNames) {
      var uncovered = uncoveredNames.indexOf(card.name) >= 0;
      return '<li' + (uncovered ? ' class="dr-swap-item-uncovered"' : '') + '>' +
         escapeHtml(formatSwapQueueItem(card)) + '</li>';
   }

   function swapReconcileWarningHtml(recon) {
      var parts = [];
      if (recon.uncoveredIn.length) {
         parts.push('In: ' + recon.uncoveredIn.join(', '));
      }
      if (recon.uncoveredOut.length) {
         parts.push('Out: ' + recon.uncoveredOut.join(', '));
      }
      if (!parts.length) {
         return '';
      }
      return '<div class="dr-swap-reconcile-warning">No suggestion yet for ' +
         escapeHtml(parts.join(' · ')) + '</div>';
   }

   function findSnapshotCard(deck, name, setCode, collectorNumber) {
      if (!deck.deck_snapshot || !deck.deck_snapshot.cards) {
         return null;
      }
      var matches = deck.deck_snapshot.cards.filter(function (c) { return c.name === name; });
      if (!matches.length) {
         return null;
      }
      if (setCode && collectorNumber) {
         var exact = matches.find(function (c) {
            return c.set_code === setCode && String(c.collector_number) === String(collectorNumber);
         });
         if (exact) {
            return exact;
         }
      }
      return matches[0];
   }

   async function fetchPrintings(cardName, defaultScryfallId) {
      return ScryfallCache.fetchPrintings(cardName, { defaultScryfallId: defaultScryfallId });
   }

   function printingLabel(print) {
      var set = (print.set_name || print.set || '').trim();
      var num = print.collector_number || '';
      var price = print.prices && print.prices.usd ? ' $' + print.prices.usd : '';
      return set + ' #' + num + price;
   }

   function printingToCardIn(print, fallback, cardEl) {
      return {
         name: print.name || fallback.name,
         set_code: (print.set || fallback.set_code || '').toUpperCase(),
         collector_number: String(print.collector_number || fallback.collector_number || ''),
         scryfall_id: print.id || fallback.scryfall_id,
         scryfall_uri: print.scryfall_uri || fallback.scryfall_uri,
         finish: (cardEl && cardEl.dataset.finish) || 'nonfoil'
      };
   }

   function printOptionLines(print) {
      var set = (print.set_name || print.set || '').trim();
      var num = print.collector_number || '';
      var price = print.prices && print.prices.usd ? '$' + print.prices.usd : '';
      var lines = [];
      if (set || num) {
         lines.push(set + (num ? ' #' + num : ''));
      }
      if (price) {
         lines.push(price);
      }
      if (!lines.length) {
         lines.push(printingLabel(print));
      }
      return lines;
   }

   function optionLabel(opt) {
      if (opt.set_code && opt.collector_number) {
         return opt.name + ' (' + opt.set_code + ' #' + opt.collector_number + ')';
      }
      return opt.name;
   }

   function cutOptionImageSrc(opt, deck) {
      if (opt.set_code && opt.collector_number) {
         return scryfallImageFromPrinting(opt.set_code, opt.collector_number);
      }
      var snap = findSnapshotCard(deck, opt.name, opt.set_code, opt.collector_number);
      if (snap && snap.set_code && snap.collector_number) {
         return scryfallImageFromPrinting(snap.set_code, snap.collector_number);
      }
      return '';
   }

   function cutOptionLines(opt) {
      if (opt.set_code && opt.collector_number) {
         return [opt.name, opt.set_code.toUpperCase() + ' #' + opt.collector_number];
      }
      return [opt.name];
   }

   function hasSuggestedCut(suggestion) {
      return (suggestion.replaces || []).some(function (r) {
         return r && r.name;
      });
   }

   function needsSuggestedCut(suggestion) {
      return suggestion.action !== 'sideboard';
   }

   function isMissingSuggestedCut(suggestion) {
      return needsSuggestedCut(suggestion) && !hasSuggestedCut(suggestion);
   }

   DR.archidektApplyOpenUrl = archidektApplyOpenUrl;
   DR.deriveSwapQueue = deriveSwapQueue;
   DR.formatSwapQueueItem = formatSwapQueueItem;
   DR.getSuggestionStaleness = getSuggestionStaleness;
   DR.getSwapQueueReconciliation = getSwapQueueReconciliation;
   DR.swapQueueListItem = swapQueueListItem;
   DR.swapReconcileWarningHtml = swapReconcileWarningHtml;
   DR.findSnapshotCard = findSnapshotCard;
   DR.fetchPrintings = fetchPrintings;
   DR.printingLabel = printingLabel;
   DR.printingToCardIn = printingToCardIn;
   DR.printOptionLines = printOptionLines;
   DR.optionLabel = optionLabel;
   DR.cutOptionImageSrc = cutOptionImageSrc;
   DR.cutOptionLines = cutOptionLines;
   DR.hasSuggestedCut = hasSuggestedCut;
   DR.needsSuggestedCut = needsSuggestedCut;
   DR.isMissingSuggestedCut = isMissingSuggestedCut;
})(window);
