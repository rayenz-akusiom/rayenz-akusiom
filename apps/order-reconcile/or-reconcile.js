(function (global) {
   'use strict';

   var OR = global.OrderReconcile;
   var state = OR.state;
   var STAGING_DECK_ID = OR.STAGING_DECK_ID;
   var escapeHtml = HubUtils.escapeHtml;
   var optionKey = HubUtils.optionKey;
   var bridgeApplyAvailable = HubUtils.bridgeApplyAvailable;
   var scryfallImageFromId = HubUtils.scryfallImageFromId;
   var scryfallImageFromName = HubUtils.scryfallImageFromName;
   var scryfallImageFromPrinting = HubUtils.scryfallImageFromPrinting;
   var setStatus = OR.setStatus;
   var saveProgress = OR.saveProgress;
   var getDecision = OR.getDecision;
   var setDecision = OR.setDecision;
   var getDeckById = OR.getDeckById;
   var itemsForDeck = OR.itemsForDeck;
   var render = OR.render;
   var scrollToTop = OR.scrollToTop;
   var archidektDeckLinkHtml = OR.archidektDeckLinkHtml;
   var fetchPrintings = OR.fetchPrintings;
   var printOptionLines = OR.printOptionLines;
   var readPrintingValue = OR.readPrintingValue;
   var printingValueFromParts = OR.printingValueFromParts;
   var renderSummaryHtml = OR.renderSummaryHtml;
   var renderStagingPanel = OR.renderStagingPanel;
   var wireStagingPanel = OR.wireStagingPanel;

   function excludeCategories() {
      var excluded = {};
      excluded[CutCandidates.SWAP_IN] = true;
      excluded[CutCandidates.SWAP_OUT] = true;
      Object.keys(CutCandidates.PROTECTED_CATEGORIES).forEach(function (key) {
         excluded[key] = true;
      });
      excluded.Maybeboard = true;
      return excluded;
   }

   function cubeMainCardSameName(deck, name) {
      if (!deck || !deck.deck_snapshot) {
         return null;
      }
      var excluded = excludeCategories();
      excluded[OrderReconcileExport.MAYBEBOARD_CATEGORY] = true;
      var found = null;
      (deck.deck_snapshot.cards || []).forEach(function (card) {
         if (found) {
            return;
         }
         var primary = card.primary_category || (card.categories && card.categories[0]);
         if (primary && excluded[primary]) {
            return;
         }
         if (OrderReconcileExport.namesMatch(name, card.name)) {
            found = {
               name: card.name,
               set_code: card.set_code || null,
               collector_number: card.collector_number || null
            };
         }
      });
      return found;
   }

   function defaultInImageSrc(item) {
      if (item.is_cube && item.maybeboard_entry &&
         item.maybeboard_entry.set_code && item.maybeboard_entry.collector_number) {
         return scryfallImageFromPrinting(
            item.maybeboard_entry.set_code, item.maybeboard_entry.collector_number);
      }
      if (item.acquired_set && item.acquired_collector) {
         return scryfallImageFromPrinting(item.acquired_set, item.acquired_collector);
      }
      return scryfallImageFromName(item.card_name);
   }

   function defaultInPrinting(item) {
      if (item.is_cube && item.maybeboard_entry) {
         var mb = item.maybeboard_entry;
         if (mb.set_code && mb.collector_number) {
            return {
               name: mb.name || item.card_name,
               set_code: mb.set_code,
               collector_number: mb.collector_number,
               finish: 'nonfoil'
            };
         }
      }
      if (item.queued_in && item.queued_in.set_code && item.queued_in.collector_number) {
         return {
            name: item.queued_in.name || item.card_name,
            set_code: item.queued_in.set_code,
            collector_number: item.queued_in.collector_number,
            finish: 'nonfoil'
         };
      }
      if (item.acquired_set && item.acquired_collector) {
         return {
            name: item.card_name,
            set_code: item.acquired_set,
            collector_number: item.acquired_collector,
            finish: 'nonfoil'
         };
      }
      // Fall back to a name-only printing so Accept is never blocked just because we
      // could not resolve a specific set/collector number. Archidekt picks a default
      // printing for name-only import lines.
      return {
         name: item.card_name,
         set_code: null,
         collector_number: null,
         finish: 'nonfoil'
      };
   }

   function deckCutOptions(deck, categoryFilter, includeOutQueue) {
      return CutCandidates.buildCutCandidates(deck.deck_snapshot, {
         excludeMaybeboard: true,
         categoryFilter: categoryFilter || null,
         includeOutQueue: !!includeOutQueue,
         outQueueCategory: OrderReconcileExport.OUT_CATEGORY
      });
   }

   function assignDefaultOuts(deck, items) {
      if (!deck || OrderReconcileExport.isCubeDeck(deck)) {
         (items || []).forEach(function (item) {
            item.default_out = null;
         });
         return;
      }
      var queue = OrderReconcileExport.deriveSwapQueue(deck.deck_snapshot);
      var outQueue = queue.new_set_out || [];
      var usedKeys = {};
      var queueIdx = 0;

      function cutFromCard(card) {
         return {
            name: card.name,
            set_code: card.set_code || null,
            collector_number: card.collector_number || null
         };
      }

      function markUsed(cut) {
         if (cut) {
            usedKeys[optionKey(cut)] = true;
         }
      }

      (items || []).forEach(function (item) {
         if (item.paired_out && item.paired_out.name) {
            item.default_out = cutFromCard(item.paired_out);
            markUsed(item.default_out);
            return;
         }
         while (queueIdx < outQueue.length) {
            var candidate = cutFromCard(outQueue[queueIdx]);
            queueIdx++;
            if (!usedKeys[optionKey(candidate)]) {
               item.default_out = candidate;
               markUsed(candidate);
               return;
            }
         }
         item.default_out = null;
      });
   }

   function defaultCutForItem(item, deck) {
      if (item.default_out) {
         return item.default_out;
      }
      if (item.paired_out) {
         return item.paired_out;
      }
      if (item.is_cube) {
         // Only auto-suggest a cut when we acquired a duplicate of a card already
         // in the cube. Otherwise leave the cut empty so the user picks deliberately
         // instead of getting an arbitrary first-in-section match.
         var sameNameCut = cubeMainCardSameName(deck, item.card_name);
         if (sameNameCut) {
            return sameNameCut;
         }
         return null;
      }
      return null;
   }

   function showCardError(cardEl, msg) {
      if (!cardEl) {
         return;
      }
      var err = cardEl.querySelector('[data-or-card-error]');
      if (!err) {
         err = document.createElement('p');
         err.className = 'or-card-error';
         err.setAttribute('data-or-card-error', '1');
         var actions = cardEl.querySelector('.or-actions');
         if (actions) {
            cardEl.insertBefore(err, actions);
         } else {
            cardEl.appendChild(err);
         }
      }
      err.textContent = msg || '';
      err.hidden = !msg;
      if (msg) {
         cardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
   }

   function clearCardError(cardEl) {
      var err = cardEl && cardEl.querySelector('[data-or-card-error]');
      if (err) {
         err.textContent = '';
         err.hidden = true;
      }
   }

   function setReconcileImage(img, src) {
      if (!img) {
         return;
      }
      var btn = img.closest('.or-card-image');
      if (src) {
         img.src = src;
         if (btn) {
            btn.classList.remove('or-card-image-empty');
         }
      } else {
         img.removeAttribute('src');
         if (btn) {
            btn.classList.add('or-card-image-empty');
         }
      }
   }

   function applyCutToCardEl(cardEl, cut) {
      if (!cut) {
         return;
      }
      cardEl.querySelector('[data-or-cut-value]').value = cutValueFromOpt(cut);
      cardEl.querySelector('[data-or-cut-summary]').textContent = formatCardLabel(cut);
      var imgOut = cardEl.querySelector('[data-or-img-out]');
      if (imgOut) {
         setReconcileImage(imgOut, (cut.set_code && cut.collector_number)
            ? scryfallImageFromPrinting(cut.set_code, cut.collector_number)
            : '');
      }
   }

   function cutOptionImageSrc(opt) {
      if (opt.set_code && opt.collector_number) {
         return scryfallImageFromPrinting(opt.set_code, opt.collector_number);
      }
      return '';
   }

   function cutValueFromOpt(opt) {
      return JSON.stringify({
         name: opt.name,
         set_code: opt.set_code || null,
         collector_number: opt.collector_number || null,
         quantity: 1
      });
   }

   function readCutValue(raw) {
      try {
         return raw ? JSON.parse(raw) : null;
      } catch (e) {
         return null;
      }
   }

   function formatCardLabel(card) {
      if (!card) {
         return '—';
      }
      var label;
      if (card.set_code && card.collector_number) {
         label = card.name + ' (' + String(card.set_code).toUpperCase() + ' #' + card.collector_number + ')';
      } else {
         label = card.name;
      }
      if (card.finish === 'foil') {
         label += ' · Foil';
      }
      return label;
   }

   function reconcileSwapImageBtn(openAttr, imgDataAttr, imgSrc) {
      var empty = !imgSrc;
      var btnClass = 'or-card-image or-card-image-btn' + (empty ? ' or-card-image-empty' : '');
      var imgTag = empty
         ? '<img ' + imgDataAttr + ' alt="">'
         : '<img ' + imgDataAttr + ' src="' + escapeHtml(imgSrc) + '" alt="">';
      return '<button type="button" class="' + btnClass + '" ' + openAttr + '>' + imgTag + '</button>';
   }

   function buildReconcileCardHtml(item, deck) {
      var decision = getDecision(item.item_id);
      var decisionClass = decision ? ' or-decision-' + decision.status : '';
      var cats = deck && deck.deck_snapshot
         ? OrderReconcileExport.deckCategories(deck.deck_snapshot)
         : [];
      var defaultOut = defaultCutForItem(item, deck);
      var outImg = defaultOut ? cutOptionImageSrc(defaultOut) : '';
      var inImg = defaultInImageSrc(item);
      var defaultInPrint = defaultInPrinting(item);
      var inPrintValue = defaultInPrint ? printingValueFromParts(defaultInPrint) : '';
      var inPrintSummary = defaultInPrint
         ? formatCardLabel(defaultInPrint)
         : 'Choose printing…';
      var noCat = !item.destination_category;
      var categoryHtml = '<label>Destination category</label><select class="or-category-select" data-or-dest-category>' +
         '<option value=""' + (noCat ? ' selected' : '') + '>— choose category —</option>' +
         cats.map(function (c) {
            var sel = c === item.destination_category ? ' selected' : '';
            return '<option value="' + escapeHtml(c) + '"' + sel + '>' + escapeHtml(c) + '</option>';
         }).join('') + '</select>';

      return '<div class="or-reconcile-card' + decisionClass + '" data-item-id="' + escapeHtml(item.item_id) + '"' +
         (item.is_cube ? ' data-is-cube="1"' : '') + '>' +
         '<h3>' + escapeHtml(item.card_name) + '</h3>' + categoryHtml +
         '<div class="or-swap-pair">' +
         '<div class="or-swap-col or-swap-in">' +
         '<div class="or-swap-label or-swap-label-in">In</div>' +
         reconcileSwapImageBtn('data-or-open-print', 'data-or-img-in', inImg) +
         '<p class="or-picker-summary" data-or-print-summary>' + escapeHtml(inPrintSummary) + '</p>' +
         '<input type="hidden" data-or-print-value value="' + escapeHtml(inPrintValue) + '">' +
         '</div>' +
         '<div class="or-swap-arrow">→</div>' +
         '<div class="or-swap-col or-swap-out">' +
         '<div class="or-swap-label or-swap-label-out">Out</div>' +
         reconcileSwapImageBtn('data-or-open-cut', 'data-or-img-out', outImg) +
         '<p class="or-picker-summary" data-or-cut-summary>' +
         (defaultOut ? escapeHtml(formatCardLabel(defaultOut)) : 'Choose cut…') + '</p>' +
         '<input type="hidden" data-or-cut-value value="' +
         (defaultOut ? escapeHtml(cutValueFromOpt(defaultOut)) : '') + '">' +
         '</div></div>' +
         '<div class="or-actions">' +
         '<button type="button" class="or-btn or-btn-ghost" data-or-action="skip">Skip</button>' +
         '<button type="button" class="or-btn or-btn-success" data-or-action="accept">Accept</button>' +
         '</div></div>';
   }

   function buildDeckImportText(deck) {
      var items = itemsForDeck(deck.deck_id);
      var accepted = items.filter(function (item) {
         var d = getDecision(item.item_id);
         return d && d.status === 'accepted';
      }).map(function (item) {
         var d = getDecision(item.item_id);
         return {
            status: 'accepted',
            accepted: d.accepted,
            slot_key: item.slot_key,
            is_cube: !!item.is_cube,
            maybeboard_entry: item.maybeboard_entry || null
         };
      });
      return OrderReconcileExport.buildReconcileDeckImport(
         deck.deck_id, deck.deck_snapshot, accepted, items,
         { isProxyOrder: state.isProxyOrder }
      );
   }

   function wireDeckApply(deck, complete) {
      var copyBtn = document.getElementById('or-copy-deck-import');
      if (copyBtn) {
         copyBtn.addEventListener('click', function () {
            ArchidektExport.copyText(document.getElementById('or-deck-import').value).then(function () {
               setStatus('Deck import copied.');
            });
         });
      }
      var applyBtn = document.getElementById('or-confirm-apply');
      if (applyBtn) {
         applyBtn.addEventListener('click', function () {
            var text = document.getElementById('or-deck-import').value;
            var deckId = ArchidektExport.parseDeckId(deck.archidekt_url);
            ArchidektExport.stageDeckApply(deckId, text);
            window.open(deck.archidekt_url, '_blank', 'noopener');
            state.completedDecks[deck.deck_id] = true;
            saveProgress();
            setStatus('Applied — move to next deck.');
            advanceToNextDeck();
         });
      }
   }

   function advanceToNextDeck() {
      var pending = state.decks.filter(function (d) {
         return itemsForDeck(d.deck_id).length > 0 && !state.completedDecks[d.deck_id];
      });
      if (pending.length) {
         state.activeDeckId = pending[0].deck_id;
         render();
         scrollToTop();
         return;
      }
      state.phase = 'staging';
      state.activeDeckId = STAGING_DECK_ID;
      render();
      scrollToTop();
   }

   function renderReconcilePhase() {
      if (state.activeDeckId === STAGING_DECK_ID) {
         state.ui.mainContent.innerHTML = renderStagingPanel();
         wireStagingPanel();
         return;
      }

      var deck = getDeckById(state.activeDeckId);
      var items = itemsForDeck(state.activeDeckId);
      if (!deck || !items.length) {
         state.ui.mainContent.innerHTML = '<div class="or-empty">No cards for this deck.</div>';
         return;
      }

      assignDefaultOuts(deck, items);

      var complete = OrderReconcileExport.deckReconcileComplete(items, getDecision);
      var cardsHtml = items.map(function (item) {
         return buildReconcileCardHtml(item, deck);
      }).join('');

      state.ui.mainContent.innerHTML =
         '<div class="or-status-card">' +
         '<div class="or-status-header"><h3>' + escapeHtml(deck.deck_name) + '</h3>' +
         archidektDeckLinkHtml(deck) + '</div>' +
         '<div class="or-status-pane">' +
         (state.isProxyOrder
            ? '<p class="or-proxy-order-banner">Proxy order active — added cards will include the Proxies category.</p>'
            : '') +
         cardsHtml + renderSummaryHtml(deck) +
         '<div class="or-apply-row">' +
         '<button type="button" class="or-btn or-btn-primary" id="or-copy-deck-import"' +
         (complete.complete ? '' : ' disabled') + '>Copy deck import</button> ' +
         (bridgeApplyAvailable()
            ? '<button type="button" class="or-btn or-btn-success" id="or-confirm-apply"' +
              (complete.complete ? '' : ' disabled') + '>Confirm &amp; apply</button>'
            : '') +
         '</div>' +
         '<textarea class="or-textarea" readonly id="or-deck-import" style="min-height:100px;margin-top:12px">' +
         escapeHtml(buildDeckImportText(deck)) + '</textarea>' +
         '</div></div>';

      wireReconcileCards(deck, items);
      wireDeckApply(deck, complete);
   }

   function wireReconcileCards(deck, items) {
      items.forEach(function (item) {
         var cardEl = Array.prototype.slice.call(document.querySelectorAll('.or-reconcile-card'))
            .find(function (el) { return el.getAttribute('data-item-id') === item.item_id; });
         if (!cardEl) {
            return;
         }

         var cutOptions = item.is_cube && item.destination_category
            ? deckCutOptions(deck, item.destination_category, false)
            : deckCutOptions(deck, null, !item.is_cube);

         var defaultOut = defaultCutForItem(item, deck);
         if (defaultOut) {
            applyCutToCardEl(cardEl, defaultOut);
         }

         var catSelect = cardEl.querySelector('[data-or-dest-category]');
         if (catSelect) {
            catSelect.addEventListener('change', function () {
               item.destination_category = catSelect.value;
               if (item.is_cube) {
                  cutOptions = deckCutOptions(deck, item.destination_category, false);
                  applyCutToCardEl(cardEl, defaultCutForItem(item, deck));
               }
            });
         }

         var printBtn = cardEl.querySelector('[data-or-open-print]');
         if (printBtn) {
            printBtn.addEventListener('click', function () {
               fetchPrintings(item.card_name).then(function (prints) {
                  var currentPrint = readPrintingValue(cardEl.querySelector('[data-or-print-value]').value);
                  HubCardPicker.open({
                     title: 'Choose printing — ' + item.card_name,
                     showFoilToggle: true,
                     foilDefault: !!(currentPrint && currentPrint.finish === 'foil'),
                     items: prints.map(function (p) {
                        return {
                           value: p.id,
                           imgSrc: scryfallImageFromId(p.id),
                           lines: printOptionLines(p),
                           finishes: p.finishes,
                           name: p.name,
                           set_code: p.set,
                           collector_number: p.collector_number
                        };
                     }),
                     selectedValue: currentPrint && currentPrint.scryfall_id ? currentPrint.scryfall_id : '',
                     onPick: function (value, pickItem, ctx) {
                        var finish = HubCardPicker.resolveFinish(pickItem, ctx && ctx.foil);
                        var printing = {
                           scryfall_id: value,
                           name: pickItem.name,
                           set_code: pickItem.set_code,
                           collector_number: pickItem.collector_number,
                           finish: finish
                        };
                        cardEl.querySelector('[data-or-print-value]').value = printingValueFromParts(printing);
                        cardEl.querySelector('[data-or-print-summary]').textContent = formatCardLabel(printing);
                        if (printing.scryfall_id) {
                           setReconcileImage(cardEl.querySelector('[data-or-img-in]'),
                              scryfallImageFromId(printing.scryfall_id));
                        }
                     }
                  });
               }).catch(function (err) {
                  setStatus(err.message);
               });
            });
         }

         var cutBtn = cardEl.querySelector('[data-or-open-cut]');
         if (cutBtn) {
            cutBtn.addEventListener('click', function () {
               var opts = item.is_cube && item.destination_category
                  ? deckCutOptions(deck, item.destination_category, false)
                  : deckCutOptions(deck, null, !item.is_cube);
               HubCardPicker.open({
                  title: 'Choose card to cut',
                  groupByCategory: true,
                  items: opts.map(function (opt) {
                     return {
                        value: cutValueFromOpt(opt),
                        imgSrc: cutOptionImageSrc(opt),
                        category: opt.primary_category || null,
                        lines: [opt.name, opt.set_code ? opt.set_code.toUpperCase() + ' #' + opt.collector_number : '']
                     };
                  }),
                  selectedValue: cardEl.querySelector('[data-or-cut-value]').value,
                  onPick: function (value) {
                     var cut = readCutValue(value);
                     cardEl.querySelector('[data-or-cut-value]').value = value;
                     cardEl.querySelector('[data-or-cut-summary]').textContent = cut ? formatCardLabel(cut) : '';
                     if (cut && cut.set_code && cut.collector_number) {
                        setReconcileImage(cardEl.querySelector('[data-or-img-out]'),
                           scryfallImageFromPrinting(cut.set_code, cut.collector_number));
                     }
                  }
               });
            });
         }

         cardEl.querySelectorAll('[data-or-action]').forEach(function (btn) {
            btn.addEventListener('click', function () {
               var action = btn.getAttribute('data-or-action');
               if (action === 'accept') {
                  var printing = readPrintingValue(cardEl.querySelector('[data-or-print-value]').value);
                  var cut = readCutValue(cardEl.querySelector('[data-or-cut-value]').value);
                  if (!printing) {
                     showCardError(cardEl, 'Choose a printing before accepting.');
                     return;
                  }
                  if (!item.destination_category) {
                     showCardError(cardEl, 'Choose a destination category.');
                     return;
                  }
                  if (item.is_cube && (!cut || !cut.name)) {
                     showCardError(cardEl, 'Choose a card to cut from the ' + item.destination_category + ' section.');
                     return;
                  }
                  clearCardError(cardEl);
                  cardEl.classList.remove('or-decision-accepted', 'or-decision-skipped', 'or-decision-rejected');
                  setDecision(item.item_id, {
                     status: 'accepted',
                     accepted: {
                        quantity: 1,
                        destination_category: item.destination_category,
                        card_in: printing,
                        card_out: cut
                     }
                  });
                  cardEl.classList.add('or-decision-accepted');
               } else {
                  cardEl.classList.remove('or-decision-accepted', 'or-decision-skipped', 'or-decision-rejected');
                  setDecision(item.item_id, { status: 'skipped' });
                  cardEl.classList.add('or-decision-skipped');
               }
               var ta = document.getElementById('or-deck-import');
               if (ta) {
                  ta.value = buildDeckImportText(deck);
               }
               var complete = OrderReconcileExport.deckReconcileComplete(items, getDecision);
               var copyBtn2 = document.getElementById('or-copy-deck-import');
               var applyBtn2 = document.getElementById('or-confirm-apply');
               if (copyBtn2) {
                  copyBtn2.disabled = !complete.complete;
               }
               if (applyBtn2) {
                  applyBtn2.disabled = !complete.complete;
               }
               var summaryHost = document.querySelector('.or-summary-box');
               if (summaryHost) {
                  summaryHost.outerHTML = renderSummaryHtml(deck);
               }
            });
         });
      });
   }

   OR.excludeCategories = excludeCategories;
   OR.cubeMainCardSameName = cubeMainCardSameName;
   OR.defaultInImageSrc = defaultInImageSrc;
   OR.defaultInPrinting = defaultInPrinting;
   OR.deckCutOptions = deckCutOptions;
   OR.assignDefaultOuts = assignDefaultOuts;
   OR.defaultCutForItem = defaultCutForItem;
   OR.showCardError = showCardError;
   OR.clearCardError = clearCardError;
   OR.setReconcileImage = setReconcileImage;
   OR.applyCutToCardEl = applyCutToCardEl;
   OR.cutOptionImageSrc = cutOptionImageSrc;
   OR.cutValueFromOpt = cutValueFromOpt;
   OR.readCutValue = readCutValue;
   OR.formatCardLabel = formatCardLabel;
   OR.reconcileSwapImageBtn = reconcileSwapImageBtn;
   OR.buildReconcileCardHtml = buildReconcileCardHtml;
   OR.buildDeckImportText = buildDeckImportText;
   OR.wireDeckApply = wireDeckApply;
   OR.advanceToNextDeck = advanceToNextDeck;
   OR.renderReconcilePhase = renderReconcilePhase;
   OR.wireReconcileCards = wireReconcileCards;
})(window);
