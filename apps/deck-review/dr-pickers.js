(function (global) {
   'use strict';

   var DR = global.DeckReview;
   var state = DR.state;

   var optionKey = HubUtils.optionKey;
   var scryfallImageFromId = HubUtils.scryfallImageFromId;
   var scryfallImageFromPrinting = HubUtils.scryfallImageFromPrinting;

   var findSnapshotCard = DR.findSnapshotCard;
   var fetchPrintings = DR.fetchPrintings;
   var printOptionLines = DR.printOptionLines;
   var optionLabel = DR.optionLabel;
   var cutOptionImageSrc = DR.cutOptionImageSrc;
   var cutOptionLines = DR.cutOptionLines;
   var isMissingSuggestedCut = DR.isMissingSuggestedCut;

   function deckCutOptions(deck) {
      var options = CutCandidates.buildCutCandidates(deck.deck_snapshot, {
         outQueueFallback: true
      });
      var seen = {};
      options.forEach(function (opt) {
         seen[optionKey(opt)] = true;
      });

      (deck.suggestions || []).forEach(function (s) {
         (s.replaces || []).forEach(function (r) {
            if (!r.name) {
               return;
            }
            var snap = findSnapshotCard(deck, r.name);
            var opt = {
               name: r.name,
               quantity: 1,
               set_code: snap ? snap.set_code : null,
               collector_number: snap ? snap.collector_number : null,
               primary_category: snap ? snap.primary_category : null
            };
            var key = optionKey(opt);
            if (!seen[key]) {
               seen[key] = true;
               options.push(opt);
            }
         });
      });

      options.sort(function (a, b) {
         return a.name.localeCompare(b.name);
      });
      return options;
   }

   function readCutSelection(cardEl) {
      if (!cardEl) {
         return { name: '', quantity: 1 };
      }
      var input = cardEl.querySelector('[data-dr-cut-value]');
      var key = input ? input.value : '';
      var options = cardEl._drCutOptions || [];
      var opt = options.find(function (o) { return optionKey(o) === key; });
      if (!opt && key === '') {
         return { name: '', quantity: 1 };
      }
      if (!opt) {
         var parts = key.split('|');
         return {
            name: parts[0] || '',
            quantity: 1,
            set_code: parts[1] || null,
            collector_number: parts[2] || null
         };
      }
      return {
         name: opt.name,
         quantity: 1,
         set_code: opt.set_code || null,
         collector_number: opt.collector_number || null
      };
   }

   function getPrintValue(cardEl) {
      var input = cardEl && cardEl.querySelector('[data-dr-print-value]');
      return input ? input.value : '';
   }

   function getCutValue(cardEl) {
      var input = cardEl && cardEl.querySelector('[data-dr-cut-value]');
      return input ? input.value : '';
   }

   function updatePrintSummary(cardEl, suggestion) {
      var summary = cardEl.querySelector('[data-dr-print-summary]');
      if (!summary) {
         return;
      }
      var printId = getPrintValue(cardEl);
      if (!printId) {
         summary.textContent = 'No printing selected';
         return;
      }
      var label = '';
      var prints = cardEl._drPrints || [];
      var print = prints.find(function (p) { return p.id === printId; });
      if (print) {
         label = printOptionLines(print).join(' · ');
      } else if (suggestion && suggestion.card && suggestion.card.scryfall_id === printId) {
         label = suggestion.card.set_code + ' #' + suggestion.card.collector_number;
      } else {
         label = 'Printing selected';
      }
      if (cardEl.dataset.finish === 'foil') {
         label += ' · Foil';
      }
      summary.textContent = label;
   }

   function updateCutSummary(cardEl) {
      var summary = cardEl.querySelector('[data-dr-cut-summary]');
      if (!summary) {
         return;
      }
      var cut = readCutSelection(cardEl);
      if (!cut.name) {
         summary.textContent = 'No cut selected';
         return;
      }
      summary.textContent = optionLabel(cut);
   }

   function setPrintSelection(cardEl, printId, suggestion) {
      var input = cardEl.querySelector('[data-dr-print-value]');
      if (input) {
         input.value = printId || '';
      }
      var imgIn = cardEl.querySelector('[data-dr-img-in]');
      if (imgIn && printId) {
         imgIn.src = scryfallImageFromId(printId);
      }
      updatePrintSummary(cardEl, suggestion);
   }

   function setCutSelection(cardEl, optionKeyValue, deck) {
      var input = cardEl.querySelector('[data-dr-cut-value]');
      if (input) {
         input.value = optionKeyValue || '';
      }
      var imgOut = cardEl.querySelector('[data-dr-img-out]');
      var cut = readCutSelection(cardEl);
      if (!cut.name) {
         if (imgOut) {
            imgOut.removeAttribute('src');
         }
         if (imgOut && imgOut.parentElement) {
            imgOut.parentElement.classList.add('dr-card-image-empty');
         }
         updateCutSummary(cardEl);
         return;
      }
      if (imgOut && imgOut.parentElement) {
         imgOut.parentElement.classList.remove('dr-card-image-empty');
      }
      if (cut.set_code && cut.collector_number) {
         imgOut.src = scryfallImageFromPrinting(cut.set_code, cut.collector_number);
      } else {
         var snap = findSnapshotCard(deck, cut.name, cut.set_code, cut.collector_number);
         if (snap && snap.set_code && snap.collector_number) {
            imgOut.src = scryfallImageFromPrinting(snap.set_code, snap.collector_number);
         } else {
            fetchPrintings(cut.name, null).then(function (prints) {
               if (prints.length && prints[0].id && imgOut) {
                  imgOut.src = scryfallImageFromId(prints[0].id);
               }
            }).catch(function () { /* keep placeholder */ });
         }
      }
      updateCutSummary(cardEl);
   }

   function openPrintPicker(cardEl, suggestion) {
      var prints = cardEl._drPrints || [];
      var items = prints.map(function (p) {
         return {
            value: p.id,
            imgSrc: scryfallImageFromId(p.id),
            lines: printOptionLines(p),
            finishes: p.finishes,
            name: p.name,
            set_code: p.set,
            collector_number: p.collector_number
         };
      });
      if (!items.length && suggestion.card.scryfall_id) {
         items.push({
            value: suggestion.card.scryfall_id,
            imgSrc: scryfallImageFromId(suggestion.card.scryfall_id),
            lines: [suggestion.card.set_code + ' #' + suggestion.card.collector_number],
            finishes: [],
            name: suggestion.card.name,
            set_code: suggestion.card.set_code,
            collector_number: suggestion.card.collector_number
         });
      }
      HubCardPicker.open({
         title: 'Choose printing — ' + suggestion.card.name,
         showFoilToggle: true,
         foilDefault: cardEl.dataset.finish === 'foil',
         items: items,
         selectedValue: getPrintValue(cardEl),
         onPick: function (value, item, ctx) {
            var finish = HubCardPicker.resolveFinish(item, ctx && ctx.foil);
            cardEl.dataset.finish = finish;
            setPrintSelection(cardEl, value, suggestion);
         }
      });
   }

   function openCutPicker(cardEl, deck) {
      var options = cardEl._drCutOptions || [];
      var items = options.map(function (opt) {
         return {
            value: optionKey(opt),
            imgSrc: cutOptionImageSrc(opt, deck),
            category: opt.primary_category || null,
            lines: cutOptionLines(opt)
         };
      });
      if (isMissingSuggestedCut(cardEl._drSuggestion)) {
         items.unshift({
            value: '',
            imgSrc: '',
            lines: ['No cut suggested', 'Choose manually']
         });
      }
      var currentKey = getCutValue(cardEl);
      if (currentKey && !items.some(function (item) { return item.value === currentKey; })) {
         var currentCut = readCutSelection(cardEl);
         items.unshift({
            value: currentKey,
            imgSrc: cutOptionImageSrc(currentCut, deck),
            lines: cutOptionLines(currentCut)
         });
      }
      HubCardPicker.open({
         title: 'Choose card to cut',
         groupByCategory: true,
         items: items,
         selectedValue: getCutValue(cardEl),
         onPick: function (value) {
            setCutSelection(cardEl, value, deck);
         }
      });
   }

   DR.deckCutOptions = deckCutOptions;
   DR.readCutSelection = readCutSelection;
   DR.getPrintValue = getPrintValue;
   DR.getCutValue = getCutValue;
   DR.setPrintSelection = setPrintSelection;
   DR.setCutSelection = setCutSelection;
   DR.openPrintPicker = openPrintPicker;
   DR.openCutPicker = openCutPicker;
})(window);
