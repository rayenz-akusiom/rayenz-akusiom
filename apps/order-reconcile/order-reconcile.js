(function (global) {
   'use strict';

   var ASSIGN_PHASE_ID = '__assign__';
   var STAGING_DECK_ID = '__staging__';
   var cssLoaded = false;

   var state = {
      phase: 'input',
      sessionId: null,
      settings: null,
      acquiredCards: [],
      copies: [],
      assignments: [],
      needsReview: [],
      decks: [],
      stagingDeck: null,
      reconcileItems: [],
      completedDecks: {},
      activeDeckId: null,
      inputMode: 'list',
      printCache: {},
      colorIdentityCache: {},
      progress: null,
      statusMessage: '',
      ui: {}
   };

   function ensureCss() {
      if (cssLoaded || document.querySelector('link[data-order-reconcile-css]')) {
         cssLoaded = true;
         return;
      }
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'apps/order-reconcile/order-reconcile.css';
      link.setAttribute('data-order-reconcile-css', '1');
      document.head.appendChild(link);
      cssLoaded = true;
   }

   function escapeHtml(str) {
      return String(str || '')
         .replace(/&/g, '&amp;')
         .replace(/</g, '&lt;')
         .replace(/>/g, '&gt;')
         .replace(/"/g, '&quot;');
   }

   function bridgeAvailable() {
      return typeof global.RayenzArchidektBridge !== 'undefined' && global.RayenzArchidektBridge.isAvailable;
   }

   function bridgeApplyAvailable() {
      var bridge = global.RayenzArchidektBridge;
      return !!(bridge && bridge.isAvailable && typeof bridge.stageApply === 'function');
   }

   function setStatus(msg) {
      state.statusMessage = msg || '';
      if (state.ui.statusEl) {
         state.ui.statusEl.textContent = state.statusMessage;
         state.ui.statusEl.hidden = !state.statusMessage;
      }
   }

   function ensureProgressBar() {
      var bar = document.getElementById('or-progress-bar');
      if (bar) {
         return bar;
      }
      bar = document.createElement('div');
      bar.id = 'or-progress-bar';
      bar.className = 'or-progress-bar';
      bar.hidden = true;
      bar.innerHTML =
         '<div class="or-progress-bar-track"><div class="or-progress-bar-fill" id="or-progress-fill"></div></div>' +
         '<div class="or-progress-bar-label" id="or-progress-label"></div>';
      document.body.appendChild(bar);
      return bar;
   }

   function showProgress(current, total, msg) {
      var bar = ensureProgressBar();
      var pct = total > 0 ? Math.round((current / total) * 100) : 0;
      bar.hidden = false;
      var fill = document.getElementById('or-progress-fill');
      var label = document.getElementById('or-progress-label');
      if (fill) {
         fill.style.width = pct + '%';
      }
      if (label) {
         label.textContent = msg || ('Fetching ' + current + '/' + total + '…');
      }
   }

   function hideProgress() {
      var bar = document.getElementById('or-progress-bar');
      if (bar) {
         bar.hidden = true;
      }
   }

   function sortDecksByName(decks) {
      return decks.slice().sort(function (a, b) {
         var aCube = OrderReconcileExport.isCubeDeck(a) ? 0 : 1;
         var bCube = OrderReconcileExport.isCubeDeck(b) ? 0 : 1;
         if (aCube !== bCube) {
            return aCube - bCube;
         }
         return (a.deck_name || '').localeCompare(b.deck_name || '', undefined, { sensitivity: 'base' });
      });
   }

   function showError(msg) {
      if (state.ui.errorEl) {
         state.ui.errorEl.hidden = !msg;
         state.ui.errorEl.textContent = msg || '';
      }
   }

   function hideError() {
      showError('');
   }

   function saveProgress() {
      HubStorage.saveOrderReconcileProgress(state.sessionId, {
         decisions: state.progress.decisions,
         assignments: state.assignments,
         needsReview: state.needsReview,
         copies: state.copies,
         acquiredCards: state.acquiredCards,
         reconcileItems: state.reconcileItems,
         completedDecks: state.completedDecks,
         activeDeckId: state.activeDeckId,
         phase: state.phase
      });
   }

   function loadProgress() {
      state.progress = HubStorage.loadOrderReconcileProgress(state.sessionId);
      if (!state.progress.decisions) {
         state.progress.decisions = {};
      }
      if (state.progress.phase) {
         state.phase = state.progress.phase;
      }
      if (state.progress.acquiredCards) {
         state.acquiredCards = state.progress.acquiredCards;
      }
      if (state.progress.copies) {
         state.copies = state.progress.copies;
      }
      if (state.progress.assignments) {
         state.assignments = state.progress.assignments;
      }
      if (state.progress.needsReview) {
         state.needsReview = state.progress.needsReview;
      }
      if (state.progress.reconcileItems) {
         state.reconcileItems = state.progress.reconcileItems;
      }
      if (state.progress.completedDecks) {
         state.completedDecks = state.progress.completedDecks;
      }
      if (state.progress.activeDeckId) {
         state.activeDeckId = state.progress.activeDeckId;
      }
   }

   function getDecision(itemId) {
      return state.progress.decisions[itemId] || null;
   }

   function setDecision(itemId, decision) {
      state.progress.decisions[itemId] = decision;
      saveProgress();
   }

   function getDeckById(deckId) {
      if (deckId === STAGING_DECK_ID) {
         return state.stagingDeck;
      }
      return state.decks.find(function (d) { return d.deck_id === deckId; });
   }

   function itemsForDeck(deckId) {
      return state.reconcileItems.filter(function (item) {
         return item.deck_id === deckId;
      });
   }

   function parseFolderId(url) {
      var match = String(url || '').match(/archidekt\.com\/folders\/(\d+)/);
      return match ? parseInt(match[1], 10) : null;
   }

   async function loadDeckRegistry() {
      var source = state.settings.registrySource || 'folder';
      if (source === 'urls') {
         var urls = (state.settings.customDeckUrls || '').split(/\r?\n/).filter(Boolean);
         return urls.map(function (url, i) {
            return {
               deck_id: 'custom-' + i,
               deck_name: 'Deck ' + (i + 1),
               archidekt_url: url.trim()
            };
         });
      }
      if (!bridgeAvailable() || typeof global.RayenzArchidektBridge.fetchFolder !== 'function') {
         throw new Error('Install Archidekt Deck Review Bridge userscript (2026-06-25-2+) for folder fetch.');
      }
      var folderId = parseFolderId(state.settings.folderUrl);
      if (!folderId) {
         throw new Error('Invalid Archidekt folder URL.');
      }
      return global.RayenzArchidektBridge.fetchFolder(folderId);
   }

   function sleep(ms) {
      return new Promise(function (resolve) { setTimeout(resolve, ms); });
   }

   async function fetchDeckSnapshot(url) {
      if (!bridgeAvailable()) {
         throw new Error('Install Archidekt Deck Review Bridge userscript for live Archidekt fetch.');
      }
      var deckId = ArchidektExport.parseDeckId(url);
      if (!deckId) {
         throw new Error('Invalid Archidekt URL: ' + url);
      }
      return global.RayenzArchidektBridge.fetchDeckSnapshot(deckId);
   }

   async function fetchAllSnapshots() {
      try {
         state.decks = sortDecksByName(await loadDeckRegistry());
         var total = state.decks.length + 1;
         var step = 0;
         showProgress(step, total, 'Fetching staging deck…');
         state.stagingDeck = {
            deck_id: STAGING_DECK_ID,
            deck_name: 'Buy / trade list',
            archidekt_url: state.settings.stagingDeckUrl,
            deck_snapshot: await fetchDeckSnapshot(state.settings.stagingDeckUrl)
         };
         step = 1;
         showProgress(step, total, 'Fetched staging deck');
         for (var i = 0; i < state.decks.length; i++) {
            step = i + 2;
            showProgress(step, total,
               'Fetching deck ' + (i + 1) + '/' + state.decks.length + ': ' + state.decks[i].deck_name + '…');
            state.decks[i].deck_snapshot = await fetchDeckSnapshot(state.decks[i].archidekt_url);
            if (i < state.decks.length - 1) {
               await sleep(150);
            }
         }
         setStatus('Fetched ' + state.decks.length + ' decks + staging list.');
      } finally {
         hideProgress();
      }
   }

   function expandToCopies(acquiredCards) {
      var copies = [];
      (acquiredCards || []).forEach(function (acq) {
         var qty = acq.quantity || 1;
         for (var i = 0; i < qty; i++) {
            copies.push({
               copy_id: acq.id + ':' + i,
               acquired_id: acq.id,
               card_name: acq.name,
               set_code: acq.set_code || null,
               collector_number: acq.collector_number || null,
               finish: acq.finish || null
            });
         }
      });
      return copies;
   }

   function findCandidatesForName(cardName) {
      var candidates = [];
      state.decks.forEach(function (deck) {
         if (OrderReconcileExport.isCubeDeck(deck)) {
            var maybeboard = OrderReconcileExport.deriveMaybeboard(deck.deck_snapshot);
            maybeboard.forEach(function (entry, idx) {
               if (!OrderReconcileExport.namesMatch(cardName, entry.name)) {
                  return;
               }
               var destCat = OrderReconcileExport.resolveCubeDestinationCategory(
                  deck.deck_snapshot, entry.color_identity);
               candidates.push({
                  deck_id: deck.deck_id,
                  deck_name: deck.deck_name,
                  slot_key: OrderReconcileExport.maybeboardSlotKey(deck.deck_id, idx, entry.name),
                  queued_in: entry,
                  paired_out: null,
                  destination_category: destCat,
                  is_cube: true,
                  maybeboard_entry: {
                     name: entry.name,
                     set_code: entry.set_code,
                     collector_number: entry.collector_number,
                     quantity: 1
                  }
               });
            });
            return;
         }
         var queue = OrderReconcileExport.deriveSwapQueue(deck.deck_snapshot);
         OrderReconcileExport.pairSwapSlots(queue.new_set_in, queue.new_set_out).forEach(function (pair) {
            if (!OrderReconcileExport.namesMatch(cardName, pair.in.name)) {
               return;
            }
            candidates.push({
               deck_id: deck.deck_id,
               deck_name: deck.deck_name,
               slot_key: OrderReconcileExport.fulfilledSlotKey(deck.deck_id, pair.index, pair.in.name),
               queued_in: pair.in,
               paired_out: pair.out,
               is_cube: false,
               maybeboard_entry: null
            });
         });
      });
      return candidates;
   }

   function findMaybeboardCandidatesForName(cardName) {
      var candidates = [];
      state.decks.forEach(function (deck) {
         if (OrderReconcileExport.isCubeDeck(deck)) {
            return;
         }
         OrderReconcileExport.deriveMaybeboard(deck.deck_snapshot).forEach(function (entry, idx) {
            if (!OrderReconcileExport.namesMatch(cardName, entry.name)) {
               return;
            }
            candidates.push({
               deck_id: deck.deck_id,
               deck_name: deck.deck_name,
               slot_key: OrderReconcileExport.maybeboardSlotKey(deck.deck_id, idx, entry.name),
               queued_in: entry,
               paired_out: null,
               destination_category: '',
               is_cube: false,
               is_maybeboard: true,
               maybeboard_entry: {
                  name: entry.name,
                  set_code: entry.set_code,
                  collector_number: entry.collector_number,
                  quantity: 1
               }
            });
         });
      });
      return candidates;
   }

   async function resolveCubeCandidateCategories(candidates) {
      for (var i = 0; i < candidates.length; i++) {
         var c = candidates[i];
         if (!c.is_cube || c.destination_category) {
            continue;
         }
         var deck = getDeckById(c.deck_id);
         if (!deck || !deck.deck_snapshot) {
            continue;
         }
         var ci = await fetchColorIdentity(c.queued_in && c.queued_in.name);
         c.destination_category = OrderReconcileExport.resolveCubeDestinationCategory(
            deck.deck_snapshot, ci);
      }
      return candidates;
   }

   function makeAssignment(copy, candidate, reason) {
      var destCat = candidate.destination_category;
      return {
         copy_id: copy.copy_id,
         card_name: copy.card_name,
         deck_id: candidate.deck_id,
         deck_name: candidate.deck_name,
         slot_key: candidate.slot_key,
         queued_in: candidate.queued_in,
         paired_out: candidate.paired_out,
         destination_category: destCat || '',
         is_cube: !!candidate.is_cube,
         maybeboard_entry: candidate.maybeboard_entry || null,
         reason: reason || 'auto'
      };
   }

   async function buildAssignmentPlan() {
      state.copies = expandToCopies(state.acquiredCards);
      state.assignments = [];
      state.needsReview = [];
      var usedSlots = {};

      var byName = {};
      state.copies.forEach(function (copy) {
         var key = copy.card_name.toLowerCase();
         if (!byName[key]) {
            byName[key] = [];
         }
         byName[key].push(copy);
      });

      function freeCandidates(candidates) {
         return candidates.filter(function (c) { return !usedSlots[c.slot_key]; });
      }

      var nameKeys = Object.keys(byName);
      for (var ki = 0; ki < nameKeys.length; ki++) {
         var nameKey = nameKeys[ki];
         var copies = byName[nameKey];
         var candidates = await resolveCubeCandidateCategories(
            findCandidatesForName(copies[0].card_name));
         var n = copies.length;
         var s = candidates.length;

         if (!s) {
            var mbCandidates = findMaybeboardCandidatesForName(copies[0].card_name);
            copies.forEach(function (copy) {
               if (mbCandidates.length) {
                  state.needsReview.push({
                     copy: copy,
                     reason: 'maybeboard',
                     candidates: mbCandidates,
                     assigned_deck_id: '',
                     destination_category: '',
                     conflict_note: 'Not in any swap queue. Found in maybeboard of: ' +
                        mbCandidates.map(function (c) { return c.deck_name; }).join(', ')
                  });
               } else {
                  state.needsReview.push({
                     copy: copy,
                     reason: 'unmatched',
                     candidates: [],
                     assigned_deck_id: '',
                     destination_category: ''
                  });
               }
            });
            continue;
         }

         if (n >= s) {
            var free = freeCandidates(candidates);
            var assignCount = Math.min(n, free.length);
            var ci;
            for (ci = 0; ci < assignCount; ci++) {
               state.assignments.push(makeAssignment(copies[ci], free[ci], 'auto'));
               usedSlots[free[ci].slot_key] = true;
            }
            for (; ci < n; ci++) {
               state.needsReview.push({
                  copy: copies[ci],
                  reason: 'extra',
                  candidates: [],
                  assigned_deck_id: '',
                  destination_category: ''
               });
            }
            continue;
         }

         var freeForConflict = freeCandidates(candidates);
         var conflictNote = 'Only ' + n + ' acquired; ' + s +
            ' deck(s) need this card: ' + candidates.map(function (c) { return c.deck_name; }).join(', ');
         copies.forEach(function (copy, idx) {
            var preselected = freeForConflict[idx] || null;
            if (preselected) {
               usedSlots[preselected.slot_key] = true;
            }
            state.needsReview.push({
               copy: copy,
               reason: 'conflict',
               candidates: candidates,
               all_candidates: candidates,
               totalDemand: s,
               assigned_deck_id: preselected ? preselected.deck_id : '',
               destination_category: preselected ? (preselected.destination_category || '') : '',
               preselected_candidate: preselected,
               conflict_note: conflictNote
            });
         });
      }
      saveProgress();
   }

   function buildReconcileItems() {
      state.reconcileItems = [];
      state.assignments.forEach(function (a) {
         if (!a.deck_id) {
            return;
         }
         var acquired = copyFieldsForReconcileItem(a.copy_id);
         state.reconcileItems.push({
            item_id: a.copy_id,
            copy_id: a.copy_id,
            slot_key: a.slot_key,
            deck_id: a.deck_id,
            deck_name: a.deck_name,
            card_name: a.card_name,
            quantity: 1,
            queued_in: a.queued_in,
            paired_out: a.paired_out,
            destination_category: a.destination_category,
            is_cube: !!a.is_cube,
            maybeboard_entry: a.maybeboard_entry || null,
            acquired_set: acquired.acquired_set,
            acquired_collector: acquired.acquired_collector,
            type: a.reason === 'unmatched' || a.reason === 'extra' ? 'assigned' : 'matched'
         });
      });
      state.needsReview.forEach(function (nr) {
         if (!nr.assigned_deck_id) {
            return;
         }
         var deck = getDeckById(nr.assigned_deck_id);
         var candidate = (nr.candidates || []).find(function (c) {
            return c.deck_id === nr.assigned_deck_id;
         });
         var isCube = candidate ? !!candidate.is_cube : OrderReconcileExport.isCubeDeck(deck);
         var acquiredNr = copyFieldsForReconcileItem(nr.copy.copy_id);
         state.reconcileItems.push({
            item_id: nr.copy.copy_id,
            copy_id: nr.copy.copy_id,
            slot_key: candidate ? candidate.slot_key : null,
            deck_id: nr.assigned_deck_id,
            deck_name: deck ? deck.deck_name : nr.assigned_deck_id,
            card_name: nr.copy.card_name,
            quantity: 1,
            queued_in: candidate ? candidate.queued_in : null,
            paired_out: candidate ? candidate.paired_out : null,
            destination_category: nr.destination_category || (candidate ? candidate.destination_category : ''),
            is_cube: isCube,
            maybeboard_entry: candidate ? candidate.maybeboard_entry : null,
            acquired_set: acquiredNr.acquired_set,
            acquired_collector: acquiredNr.acquired_collector,
            type: nr.reason === 'unmatched' || nr.reason === 'extra' ? 'assigned' : 'matched'
         });
      });
      saveProgress();
   }

   function scryfallImageFromName(name) {
      if (!name) {
         return '';
      }
      return 'https://api.scryfall.com/cards/named?exact=' +
         encodeURIComponent(name) + '&format=image&version=normal';
   }

   function acquiredCardImageSrc(copy) {
      if (copy.set_code && copy.collector_number) {
         return scryfallImageFromPrinting(copy.set_code, copy.collector_number);
      }
      return scryfallImageFromName(copy.card_name);
   }

   async function validateScryfallName(name) {
      var url = 'https://api.scryfall.com/cards/named?exact=' + encodeURIComponent(name);
      var resp = await fetch(url);
      return resp.ok;
   }

   function applyCardNameFix(oldName, newName) {
      state.acquiredCards.forEach(function (acq) {
         if (acq.name === oldName) {
            acq.name = newName;
         }
      });
      buildAssignmentPlan().then(function () {
         saveProgress();
         render();
      });
   }

   function deckOptionTags(decks, selectedId, disabledSet) {
      disabledSet = disabledSet || {};
      return decks.map(function (d) {
         var disabledAttr = disabledSet[d.deck_id] ? ' disabled' : '';
         return '<option value="' + escapeHtml(d.deck_id) + '"' +
            (selectedId === d.deck_id ? ' selected' : '') + disabledAttr + '>' +
            escapeHtml(d.deck_name) + '</option>';
      }).join('');
   }

   function deckOptionsHtml(selectedId, includeLeaveOut, disabledSet) {
      disabledSet = disabledSet || {};
      var html = '';
      if (includeLeaveOut) {
         html += '<option value=""' + (!selectedId ? ' selected' : '') +
            '>— leave out (buy/trade only) —</option>';
      }
      var cubeDecks = state.decks.filter(function (d) { return OrderReconcileExport.isCubeDeck(d); });
      var commanderDecks = state.decks.filter(function (d) { return !OrderReconcileExport.isCubeDeck(d); });
      if (cubeDecks.length) {
         html += '<optgroup label="Cube">' +
            deckOptionTags(cubeDecks, selectedId, disabledSet) + '</optgroup>';
      }
      if (commanderDecks.length) {
         html += '<optgroup label="Commander">' +
            deckOptionTags(commanderDecks, selectedId, disabledSet) + '</optgroup>';
      }
      return html;
   }

   function maybeboardDeckOptionsHtml(nr, disabledSet) {
      disabledSet = disabledSet || {};
      var html = '<option value=""' + (!nr.assigned_deck_id ? ' selected' : '') +
         '>— leave out (buy/trade only) —</option>';
      var seen = {};
      var suggested = (nr.candidates || []).filter(function (c) {
         if (seen[c.deck_id]) {
            return false;
         }
         seen[c.deck_id] = true;
         return true;
      });
      if (suggested.length) {
         html += '<optgroup label="Found in maybeboard">' +
            deckOptionTags(suggested.map(function (c) {
               return { deck_id: c.deck_id, deck_name: c.deck_name };
            }), nr.assigned_deck_id, disabledSet) + '</optgroup>';
      }
      html += deckOptionsHtml(nr.assigned_deck_id, false, disabledSet);
      return html;
   }

   function candidateOptionsHtml(candidates, selectedId, disabledSet) {
      disabledSet = disabledSet || {};
      var cube = [];
      var commander = [];
      (candidates || []).forEach(function (c) {
         if (c.is_cube) {
            cube.push(c);
         } else {
            commander.push(c);
         }
      });
      cube.sort(function (a, b) {
         return (a.deck_name || '').localeCompare(b.deck_name || '', undefined, { sensitivity: 'base' });
      });
      commander.sort(function (a, b) {
         return (a.deck_name || '').localeCompare(b.deck_name || '', undefined, { sensitivity: 'base' });
      });
      function opts(list) {
         return list.map(function (c) {
            var dis = disabledSet[c.deck_id] ? ' disabled' : '';
            return '<option value="' + escapeHtml(c.deck_id) + '"' +
               (selectedId === c.deck_id ? ' selected' : '') + dis + '>' +
               escapeHtml(c.deck_name) + '</option>';
         }).join('');
      }
      var html = '';
      if (cube.length) {
         html += '<optgroup label="Cube">' + opts(cube) + '</optgroup>';
      }
      if (commander.length) {
         html += '<optgroup label="Commander">' + opts(commander) + '</optgroup>';
      }
      return html;
   }

   function slotCountByDeckForCard(cardName) {
      var candidates = findCandidatesForName(cardName);
      var slotCount = {};
      candidates.forEach(function (c) {
         slotCount[c.deck_id] = (slotCount[c.deck_id] || 0) + 1;
      });
      return slotCount;
   }

   function consumedByDeckForCard(cardName, excludeReviewIdx) {
      var nameKey = cardName.toLowerCase();
      var consumed = {};
      state.assignments.forEach(function (a) {
         if (a.card_name.toLowerCase() !== nameKey) {
            return;
         }
         consumed[a.deck_id] = (consumed[a.deck_id] || 0) + 1;
      });
      state.needsReview.forEach(function (nr, idx) {
         if (idx === excludeReviewIdx || !nr.assigned_deck_id) {
            return;
         }
         if (nr.copy.card_name.toLowerCase() !== nameKey) {
            return;
         }
         consumed[nr.assigned_deck_id] = (consumed[nr.assigned_deck_id] || 0) + 1;
      });
      return consumed;
   }

   function disabledDecksForReviewRow(nr, rowIdx) {
      var slotCount = slotCountByDeckForCard(nr.copy.card_name);
      var consumed = consumedByDeckForCard(nr.copy.card_name, rowIdx);
      var disabled = {};
      Object.keys(slotCount).forEach(function (deckId) {
         if ((consumed[deckId] || 0) >= slotCount[deckId] && nr.assigned_deck_id !== deckId) {
            disabled[deckId] = true;
         }
      });
      return disabled;
   }

   function autoAssignedDeckNote(cardName) {
      var nameKey = cardName.toLowerCase();
      var names = [];
      var seen = {};
      state.assignments.forEach(function (a) {
         if (a.card_name.toLowerCase() !== nameKey || seen[a.deck_id]) {
            return;
         }
         seen[a.deck_id] = true;
         names.push(a.deck_name);
      });
      return names.join(', ');
   }

   function copyFieldsForReconcileItem(copyId) {
      var copy = state.copies.find(function (c) { return c.copy_id === copyId; });
      if (!copy) {
         return { acquired_set: null, acquired_collector: null };
      }
      return {
         acquired_set: copy.set_code || null,
         acquired_collector: copy.collector_number || null
      };
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

   function printingValueFromParts(parts) {
      return JSON.stringify({
         name: parts.name,
         set_code: parts.set_code,
         collector_number: parts.collector_number,
         finish: parts.finish || 'nonfoil'
      });
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

   function scryfallImageFromId(id) {
      return id ? 'https://api.scryfall.com/cards/' + id + '?format=image&version=normal' : '';
   }

   function scryfallImageFromPrinting(setCode, collectorNumber) {
      if (!setCode || !collectorNumber) {
         return '';
      }
      return 'https://api.scryfall.com/cards/' + encodeURIComponent(String(setCode).toLowerCase()) + '/' +
         encodeURIComponent(String(collectorNumber)) + '?format=image&version=normal';
   }

   async function fetchColorIdentity(cardName) {
      if (!cardName) {
         return [];
      }
      var cacheKey = cardName.toLowerCase();
      if (state.colorIdentityCache[cacheKey]) {
         return state.colorIdentityCache[cacheKey];
      }
      try {
         var url = 'https://api.scryfall.com/cards/named?exact=' + encodeURIComponent(cardName);
         var resp = await fetch(url);
         if (!resp.ok) {
            return [];
         }
         var json = await resp.json();
         var ci = json.color_identity || [];
         state.colorIdentityCache[cacheKey] = ci;
         return ci;
      } catch (e) {
         return [];
      }
   }

   async function resolveCubeDestinationForCard(deck, cardName) {
      if (!deck || !deck.deck_snapshot || !cardName) {
         return '';
      }
      var snapshot = deck.deck_snapshot;
      var matched = null;
      (snapshot.cards || []).forEach(function (card) {
         if (matched) {
            return;
         }
         if (OrderReconcileExport.namesMatch(cardName, card.name) && card.color_identity) {
            matched = card;
         }
      });
      if (matched && matched.color_identity && matched.color_identity.length) {
         return OrderReconcileExport.resolveCubeDestinationCategory(snapshot, matched.color_identity);
      }
      var ci = await fetchColorIdentity(cardName);
      return OrderReconcileExport.resolveCubeDestinationCategory(snapshot, ci);
   }

   async function fetchPrintings(cardName) {
      var cacheKey = cardName.toLowerCase();
      if (state.printCache[cacheKey]) {
         return state.printCache[cacheKey];
      }
      var url = 'https://api.scryfall.com/cards/search?q=' +
         encodeURIComponent('!"' + cardName + '"') + '&unique=prints&order=released';
      var resp = await fetch(url);
      if (!resp.ok) {
         throw new Error('Scryfall lookup failed for ' + cardName);
      }
      var json = await resp.json();
      state.printCache[cacheKey] = json.data || [];
      return state.printCache[cacheKey];
   }

   function printOptionLines(p) {
      var lines = [];
      if (p.set_name || p.set) {
         lines.push((p.set_name || p.set).toUpperCase() + (p.collector_number ? ' #' + p.collector_number : ''));
      }
      return lines.length ? lines : [p.name];
   }

   function readPrintingValue(raw) {
      try {
         return raw ? JSON.parse(raw) : null;
      } catch (e) {
         return null;
      }
   }

   function optionKey(opt) {
      return [opt.name, opt.set_code || '', opt.collector_number || ''].join('|');
   }

   function excludeCategories() {
      return {
         'New Set In': true,
         'New Set Out': true,
         Commander: true,
         Lieutenant: true,
         Lieutenants: true,
         Maybeboard: true
      };
   }

   function deckCutOptions(deck, categoryFilter, includeOutQueue) {
      var excluded = excludeCategories();
      var options = [];
      var seen = {};

      function addOption(card, primary) {
         if (!card || !card.name) {
            return;
         }
         var key = optionKey(card);
         if (seen[key]) {
            return;
         }
         seen[key] = true;
         options.push({
            name: card.name,
            set_code: card.set_code,
            collector_number: card.collector_number,
            primary_category: primary || card.primary_category
         });
      }

      if (includeOutQueue && deck && deck.deck_snapshot) {
         var queue = OrderReconcileExport.deriveSwapQueue(deck.deck_snapshot);
         (queue.new_set_out || []).forEach(function (card) {
            addOption(card, OrderReconcileExport.OUT_CATEGORY);
         });
      }

      (deck.deck_snapshot.cards || []).forEach(function (card) {
         var primary = card.primary_category || (card.categories && card.categories[0]);
         if (primary && excluded[primary]) {
            return;
         }
         if (categoryFilter && primary !== categoryFilter) {
            return;
         }
         addOption(card, primary);
      });
      return options;
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

   function parseInputToAcquired() {
      var text = '';
      if (state.inputMode === 'email') {
         text = state.ui.emailInput ? state.ui.emailInput.value : '';
         var result = OrderEmailParse.parseOrderEmail(text);
         state.acquiredCards = OrderEmailParse.mergeAcquiredCards(result.cards);
      } else {
         text = state.ui.listInput ? state.ui.listInput.value : '';
         var listResult = OrderEmailParse.parseCardList(text);
         state.acquiredCards = OrderEmailParse.mergeAcquiredCards(listResult.cards);
      }
      state.acquiredCards.forEach(function (c, i) {
         c.id = c.id || 'acq-' + i;
      });
   }

   function renderParsedTable() {
      if (!state.acquiredCards.length) {
         return '<p class="or-empty">No cards parsed yet.</p>';
      }
      var html = '<table class="or-parsed-table"><thead><tr>' +
         '<th>Qty</th><th>Name</th><th>Set</th><th>#</th><th>Finish</th></tr></thead><tbody>';
      state.acquiredCards.forEach(function (card, i) {
         html += '<tr data-acq-index="' + i + '">' +
            '<td><input type="number" min="1" data-field="quantity" value="' + (card.quantity || 1) + '"></td>' +
            '<td><input type="text" data-field="name" value="' + escapeHtml(card.name) + '"></td>' +
            '<td><input type="text" data-field="set_code" value="' + escapeHtml(card.set_code || '') + '"></td>' +
            '<td><input type="text" data-field="collector_number" value="' + escapeHtml(card.collector_number || '') + '"></td>' +
            '<td><input type="text" data-field="finish" value="' + escapeHtml(card.finish || '') + '"></td></tr>';
      });
      html += '</tbody></table>';
      return html;
   }

   function wireParsedTable() {
      var table = document.querySelector('.or-parsed-table');
      if (!table) {
         return;
      }
      table.querySelectorAll('tr[data-acq-index]').forEach(function (row) {
         var idx = parseInt(row.getAttribute('data-acq-index'), 10);
         row.querySelectorAll('input[data-field]').forEach(function (input) {
            input.addEventListener('change', function () {
               var field = input.getAttribute('data-field');
               var val = input.value;
               if (field === 'quantity') {
                  state.acquiredCards[idx][field] = parseInt(val, 10) || 1;
               } else {
                  state.acquiredCards[idx][field] = val || null;
               }
            });
         });
      });
   }

   function renderInputPhase() {
      state.ui.mainContent.innerHTML =
         '<div class="or-settings-panel">' +
         '<h3>Settings</h3>' +
         '<label for="or-folder-url">Archidekt folder URL</label>' +
         '<input type="url" id="or-folder-url" value="' + escapeHtml(state.settings.folderUrl || '') + '">' +
         '<label for="or-staging-url">Buy/trade staging deck URL</label>' +
         '<input type="url" id="or-staging-url" value="' + escapeHtml(state.settings.stagingDeckUrl) + '">' +
         '<label for="or-registry-source">Deck registry source</label>' +
         '<select id="or-registry-source">' +
         '<option value="folder"' + (state.settings.registrySource !== 'urls' ? ' selected' : '') + '>Archidekt folder</option>' +
         '<option value="urls"' + (state.settings.registrySource === 'urls' ? ' selected' : '') + '>Custom Archidekt URLs</option>' +
         '</select>' +
         '<label for="or-custom-urls">Custom deck URLs (one per line)</label>' +
         '<textarea id="or-custom-urls" rows="3">' + escapeHtml(state.settings.customDeckUrls || '') + '</textarea>' +
         '<button type="button" class="or-btn or-btn-ghost" id="or-save-settings" style="margin-top:12px">Save settings</button>' +
         '</div>' +
         '<div class="or-input-tabs">' +
         '<button type="button" class="or-input-tab' + (state.inputMode === 'list' ? ' active' : '') + '" data-input-mode="list">Card list</button>' +
         '<button type="button" class="or-input-tab' + (state.inputMode === 'email' ? ' active' : '') + '" data-input-mode="email">Order email <span class="or-badge-experimental">experimental</span></button>' +
         '</div>' +
         '<div id="or-input-list"' + (state.inputMode === 'list' ? '' : ' hidden') + '>' +
         '<textarea class="or-textarea" id="or-list-input" placeholder="1x Sol Ring (cmm) 1&#10;2 Lightning Bolt"></textarea>' +
         '</div>' +
         '<div id="or-input-email"' + (state.inputMode === 'email' ? '' : ' hidden') + '>' +
         '<textarea class="or-textarea" id="or-email-input" placeholder="Paste order confirmation email body…"></textarea>' +
         '</div>' +
         '<div style="margin:12px 0">' +
         '<button type="button" class="or-btn or-btn-ghost" id="or-parse-btn">Parse cards</button> ' +
         '<button type="button" class="or-btn or-btn-primary" id="or-continue-btn">Continue</button>' +
         '</div>' +
         '<div id="or-parsed-area">' + renderParsedTable() + '</div>';

      state.ui.listInput = document.getElementById('or-list-input');
      state.ui.emailInput = document.getElementById('or-email-input');

      document.querySelectorAll('.or-input-tab').forEach(function (btn) {
         btn.addEventListener('click', function () {
            state.inputMode = btn.getAttribute('data-input-mode');
            renderInputPhase();
         });
      });
      document.getElementById('or-parse-btn').addEventListener('click', function () {
         parseInputToAcquired();
         document.getElementById('or-parsed-area').innerHTML = renderParsedTable();
         wireParsedTable();
      });
      document.getElementById('or-save-settings').addEventListener('click', function () {
         state.settings.folderUrl = document.getElementById('or-folder-url').value.trim();
         state.settings.stagingDeckUrl = document.getElementById('or-staging-url').value.trim();
         state.settings.registrySource = document.getElementById('or-registry-source').value;
         state.settings.customDeckUrls = document.getElementById('or-custom-urls').value;
         HubStorage.saveOrderReconcileSettings(state.settings);
         setStatus('Settings saved.');
      });
      document.getElementById('or-continue-btn').addEventListener('click', function () {
         continueToAssign();
      });
      wireParsedTable();
   }

   async function continueToAssign() {
      hideError();
      parseInputToAcquired();
      if (!state.acquiredCards.length) {
         showError('Parse at least one acquired card first.');
         return;
      }
      try {
         await fetchAllSnapshots();
         state.progress.decisions = {};
         state.completedDecks = {};
         await buildAssignmentPlan();
         state.phase = 'assign';
         state.activeDeckId = ASSIGN_PHASE_ID;
         saveProgress();
         render();
      } catch (err) {
         showError(err.message || String(err));
      }
   }

   function renderAssignPhase() {
      var autoCount = state.assignments.length;
      var reviewCount = state.needsReview.length;
      var html = '<div class="or-status-card"><div class="or-status-header"><h3>Assign copies to decks</h3></div>' +
         '<div class="or-status-pane">' +
         '<p>' + autoCount + ' auto-assigned · ' + reviewCount + ' optional assignment(s)</p>';

      if (!reviewCount) {
         html += '<p class="or-empty">All copies assigned automatically.</p>';
      } else {
         state.needsReview.forEach(function (nr, idx) {
            var imgSrc = acquiredCardImageSrc(nr.copy);
            var disabled = disabledDecksForReviewRow(nr, idx);
            var assignedNote = autoAssignedDeckNote(nr.copy.card_name);
            html += '<div class="or-assign-row" data-review-idx="' + idx + '">';
            if (nr.conflict_note) {
               html += '<div class="or-conflict-banner">' + escapeHtml(nr.conflict_note) + '</div>';
            }
            html += '<div class="or-assign-row-inner">';
            html += '<div class="or-assign-image"><img src="' + escapeHtml(imgSrc) + '" alt="" ' +
               'data-or-assign-img data-card-name="' + escapeHtml(nr.copy.card_name) + '"></div>';
            html += '<div class="or-assign-fields">';
            html += '<h4>' + escapeHtml(nr.copy.card_name) + ' <span class="or-badge">' +
               escapeHtml(nr.reason) + '</span></h4>';
            if (assignedNote && (nr.reason === 'extra' || nr.reason === 'unmatched')) {
               html += '<p class="or-assign-note">Already assigned to: ' + escapeHtml(assignedNote) + '</p>';
            }
            if (nr.reason === 'conflict') {
               html += '<label>Which deck gets this copy?</label><select class="or-category-select" data-assign-deck>' +
                  candidateOptionsHtml(nr.candidates, nr.assigned_deck_id, disabled) + '</select>';
            } else {
               html += '<label>Assign to deck (optional)</label><select class="or-category-select" data-assign-deck>' +
                  (nr.reason === 'maybeboard'
                     ? maybeboardDeckOptionsHtml(nr, disabled)
                     : deckOptionsHtml(nr.assigned_deck_id, true, disabled)) + '</select>';
               html += '<label class="or-assign-category-label"' +
                  (nr.assigned_deck_id ? '' : ' hidden') + '>Destination category</label>' +
                  '<select class="or-category-select" data-assign-category' +
                  (nr.assigned_deck_id ? '' : ' hidden') + '>' +
                  '<option value="">— choose category —</option></select>';
            }
            html += '</div></div>';
            html += '<div class="or-name-fix" hidden data-or-name-fix>' +
               '<p class="or-warning">Card not found on Scryfall — fix the name for all copies of this card:</p>' +
               '<input type="text" class="or-name-fix-input" value="' + escapeHtml(nr.copy.card_name) + '"> ' +
               '<button type="button" class="or-btn or-btn-ghost or-name-fix-apply">Apply</button>' +
               '</div></div>';
         });
      }
      html += '<button type="button" class="or-btn or-btn-primary" id="or-start-reconcile">Start reconcile</button>';
      html += '</div></div>';
      state.ui.mainContent.innerHTML = html;

      function populateCategorySelect(nr, deck, catSelect) {
         if (!catSelect || !deck) {
            return;
         }
         var cats = OrderReconcileExport.deckCategories(deck.deck_snapshot);
         catSelect.innerHTML = '<option value="">— choose category —</option>' +
            cats.map(function (c) {
               return '<option value="' + escapeHtml(c) + '">' + escapeHtml(c) + '</option>';
            }).join('');
         if (nr.destination_category && cats.indexOf(nr.destination_category) >= 0) {
            catSelect.value = nr.destination_category;
         } else if (nr.reason !== 'conflict' && OrderReconcileExport.isCubeDeck(deck) && nr.copy) {
            var queued = nr.candidates && nr.candidates[0];
            var fromCube = queued && queued.destination_category;
            nr.destination_category = fromCube || '';
            catSelect.value = nr.destination_category;
         } else {
            nr.destination_category = '';
            catSelect.value = '';
         }
      }

      document.querySelectorAll('.or-assign-row').forEach(function (row) {
         var idx = parseInt(row.getAttribute('data-review-idx'), 10);
         var nr = state.needsReview[idx];
         var deckSelect = row.querySelector('[data-assign-deck]');
         var catSelect = row.querySelector('[data-assign-category]');
         var catLabel = row.querySelector('.or-assign-category-label');
         var img = row.querySelector('[data-or-assign-img]');
         var nameFix = row.querySelector('[data-or-name-fix]');
         var originalName = nr.copy.card_name;

         if (nr.reason === 'conflict' && nr.candidates && nr.candidates.length) {
            var rowDisabled = disabledDecksForReviewRow(nr, idx);
            deckSelect.innerHTML = candidateOptionsHtml(nr.candidates, nr.assigned_deck_id, rowDisabled);
         } else if (nr.reason === 'maybeboard') {
            deckSelect.innerHTML = maybeboardDeckOptionsHtml(nr, disabledDecksForReviewRow(nr, idx));
         }

         if (nr.assigned_deck_id && catSelect) {
            var deck0 = getDeckById(nr.assigned_deck_id);
            populateCategorySelect(nr, deck0, catSelect);
            if (catLabel) {
               catLabel.hidden = false;
            }
            catSelect.hidden = false;
         }

         if (img) {
            img.addEventListener('error', function () {
               if (nameFix) {
                  nameFix.hidden = false;
               }
            });
         }

         var fixApply = row.querySelector('.or-name-fix-apply');
         if (fixApply) {
            fixApply.addEventListener('click', function () {
               var input = row.querySelector('.or-name-fix-input');
               var newName = (input && input.value || '').trim();
               if (!newName || newName === originalName) {
                  return;
               }
               validateScryfallName(newName).then(function (ok) {
                  if (!ok) {
                     setStatus('Scryfall could not find “' + newName + '”.');
                     return;
                  }
                  applyCardNameFix(originalName, newName);
               });
            });
         }

         deckSelect.addEventListener('change', function () {
            nr.assigned_deck_id = deckSelect.value;
            var deck = getDeckById(nr.assigned_deck_id);
            if (nr.reason === 'conflict' && deck) {
               var picked = (nr.candidates || []).find(function (c) {
                  return c.deck_id === nr.assigned_deck_id;
               });
               nr.destination_category = picked ? (picked.destination_category || '') : nr.destination_category;
               saveProgress();
               renderAssignPhase();
               return;
            }
            if (nr.reason !== 'conflict') {
               if (!nr.assigned_deck_id) {
                  nr.destination_category = '';
                  saveProgress();
                  renderAssignPhase();
                  return;
               }
               if (deck && OrderReconcileExport.isCubeDeck(deck)) {
                  resolveCubeDestinationForCard(deck, nr.copy.card_name).then(function (destCat) {
                     var cats = OrderReconcileExport.deckCategories(deck.deck_snapshot);
                     if (destCat && cats.indexOf(destCat) >= 0) {
                        nr.destination_category = destCat;
                     } else {
                        nr.destination_category = '';
                     }
                     saveProgress();
                     renderAssignPhase();
                  });
                  return;
               }
               if (deck && !OrderReconcileExport.isCubeDeck(deck)) {
                  nr.destination_category = '';
               }
            }
            saveProgress();
            renderAssignPhase();
         });

         if (catSelect) {
            catSelect.addEventListener('change', function () {
               nr.destination_category = catSelect.value;
               saveProgress();
            });
         }
      });

      document.getElementById('or-start-reconcile').addEventListener('click', function () {
         buildReconcileItems();
         state.phase = 'reconcile';
         var first = state.decks.find(function (d) {
            return itemsForDeck(d.deck_id).length > 0;
         });
         state.activeDeckId = first ? first.deck_id : STAGING_DECK_ID;
         saveProgress();
         render();
      });
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

   function summaryCardImageSrc(card) {
      if (!card) {
         return '';
      }
      if (card.set_code && card.collector_number) {
         return scryfallImageFromPrinting(card.set_code, card.collector_number);
      }
      return scryfallImageFromName(card.name);
   }

   function summaryCardImgHtml(card) {
      if (!card) {
         return '<div class="or-summary-card or-summary-card-empty">No card</div>';
      }
      var src = summaryCardImageSrc(card);
      var title = escapeHtml(card.name || '');
      if (!src) {
         return '<div class="or-summary-card or-summary-card-empty" title="' + title + '">No card</div>';
      }
      return '<img class="or-summary-card" src="' + escapeHtml(src) + '" alt="' + title + '" title="' + title + '">';
   }

   function summaryGroupHtml(cards, emptyLabel) {
      if (!cards || !cards.length) {
         return '<div class="or-summary-group or-summary-group-empty"><span class="or-summary-group-empty-label">' +
            escapeHtml(emptyLabel || 'None') + '</span></div>';
      }
      return '<div class="or-summary-group">' +
         cards.map(function (c) { return summaryCardImgHtml(c); }).join('') +
         '</div>';
   }

   function summaryColHtml(label, cards) {
      return '<div class="or-summary-section-col">' +
         '<div class="or-summary-section-label">' + label + '</div>' +
         summaryGroupHtml(cards, 'None') +
         '</div>';
   }

   function summarySectionHtml(inCards, outCards) {
      var hasIn = !!(inCards && inCards.length);
      var hasOut = !!(outCards && outCards.length);
      // When only one side has cards, drop the empty column and the arrow so the
      // populated side fills the available width.
      if (hasIn && !hasOut) {
         return '<div class="or-summary-section or-summary-section-single">' +
            summaryColHtml('In', inCards) + '</div>';
      }
      if (!hasIn && hasOut) {
         return '<div class="or-summary-section or-summary-section-single">' +
            summaryColHtml('Out', outCards) + '</div>';
      }
      return '<div class="or-summary-section">' +
         summaryColHtml('In', inCards) +
         '<div class="or-summary-arrow" aria-hidden="true">→</div>' +
         summaryColHtml('Out', outCards) +
         '</div>';
   }

   function renderSummaryHtml(deck) {
      var items = itemsForDeck(deck.deck_id);
      var accepted = items.map(function (item) {
         var d = getDecision(item.item_id);
         return d && d.status === 'accepted' ? { status: 'accepted', accepted: d.accepted, slot_key: item.slot_key } : null;
      }).filter(Boolean);
      var isCube = OrderReconcileExport.isCubeDeck(deck);
      var summary = OrderReconcileExport.summarizeDeck(
         deck.deck_id, deck.deck_snapshot, accepted, { isCube: isCube });
      return '<div class="or-summary-box">' +
         '<h4>Changes summary</h4>' +
         summarySectionHtml(summary.ins, summary.outs) +
         '<h4>Remaining queue</h4>' +
         summarySectionHtml(summary.remainingIn, summary.remainingOut) +
         '</div>';
   }

   function archidektDeckLinkHtml(deck) {
      if (!deck || !deck.archidekt_url) {
         return '';
      }
      return '<a class="or-deck-link" href="' + escapeHtml(deck.archidekt_url) +
         '" target="_blank" rel="noopener">Open on Archidekt ↗</a>';
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
         '<div class="or-status-pane">' + cardsHtml + renderSummaryHtml(deck) +
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
         deck.deck_id, deck.deck_snapshot, accepted, items
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

   function scrollToTop() {
      if (typeof window !== 'undefined' && window.scrollTo) {
         window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
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

   function renderStagingPanel() {
      var removals = [];
      state.reconcileItems.forEach(function (item) {
         var d = getDecision(item.item_id);
         if (d && d.status === 'accepted') {
            removals.push({
               name: d.accepted.card_in.name,
               set_code: d.accepted.card_in.set_code,
               collector_number: d.accepted.card_in.collector_number,
               quantity: 1
            });
         }
      });
      var importText = state.stagingDeck && state.stagingDeck.deck_snapshot
         ? OrderReconcileExport.buildStagingCleanupImport(state.stagingDeck.deck_snapshot, removals)
         : '';
      return '<div class="or-status-card"><div class="or-status-header"><h3>Buy/trade list cleanup</h3>' +
         archidektDeckLinkHtml(state.stagingDeck) + '</div>' +
         '<div class="or-status-pane"><p>Remove ' + removals.length + ' accepted card(s) from staging deck.</p>' +
         '<button type="button" class="or-btn or-btn-primary" id="or-copy-staging">Copy staging import</button> ' +
         (bridgeApplyAvailable()
            ? '<button type="button" class="or-btn or-btn-success" id="or-apply-staging">Apply via bridge</button>'
            : '') +
         '<textarea class="or-textarea" readonly id="or-staging-import" style="margin-top:12px;min-height:120px">' +
         escapeHtml(importText) + '</textarea></div></div>';
   }

   function wireStagingPanel() {
      var copyBtn = document.getElementById('or-copy-staging');
      if (copyBtn) {
         copyBtn.addEventListener('click', function () {
            ArchidektExport.copyText(document.getElementById('or-staging-import').value);
            setStatus('Staging import copied.');
         });
      }
      var applyBtn = document.getElementById('or-apply-staging');
      if (applyBtn && state.stagingDeck) {
         applyBtn.addEventListener('click', function () {
            var text = document.getElementById('or-staging-import').value;
            var deckId = ArchidektExport.parseDeckId(state.stagingDeck.archidekt_url);
            ArchidektExport.stageDeckApply(deckId, text);
            window.open(state.stagingDeck.archidekt_url, '_blank', 'noopener');
            setStatus('Staged staging deck — apply on Archidekt tab.');
         });
      }
   }

   function deckNavHtml() {
      var html = '';
      if (state.phase === 'assign') {
         html += '<button type="button" class="hub-deck-chip' +
            (state.activeDeckId === ASSIGN_PHASE_ID ? ' active' : '') +
            '" data-deck-id="' + ASSIGN_PHASE_ID + '">Disambiguate<span class="hub-deck-chip-count">' +
            state.needsReview.length + '</span></button>';
         return html;
      }
      if (state.phase === 'reconcile' || state.phase === 'staging') {
         state.decks.forEach(function (deck) {
            var count = itemsForDeck(deck.deck_id).length;
            if (!count) {
               return;
            }
            var done = state.completedDecks[deck.deck_id] ? ' done' : '';
            html += '<button type="button" class="hub-deck-chip' +
               (state.activeDeckId === deck.deck_id ? ' active' : '') + done +
               '" data-deck-id="' + escapeHtml(deck.deck_id) + '">' + escapeHtml(deck.deck_name) +
               '<span class="hub-deck-chip-count">' + count + '</span></button>';
         });
         html += '<button type="button" class="hub-deck-chip' +
            (state.activeDeckId === STAGING_DECK_ID ? ' active' : '') +
            '" data-deck-id="' + STAGING_DECK_ID + '">Buy/trade list</button>';
      }
      return html;
   }

   function wireDeckNav() {
      document.querySelectorAll('.hub-deck-chip').forEach(function (btn) {
         btn.addEventListener('click', function () {
            state.activeDeckId = btn.getAttribute('data-deck-id');
            saveProgress();
            render();
            scrollToTop();
            document.querySelectorAll('.hub-deck-chip').forEach(function (b) {
               b.classList.toggle('active', b.getAttribute('data-deck-id') === state.activeDeckId);
            });
         });
      });
   }

   function render() {
      hideError();
      if (state.ui.emptyState) {
         state.ui.emptyState.hidden = true;
      }
      if (state.ui.content) {
         state.ui.content.hidden = false;
      }
      if (state.ui.deckList) {
         state.ui.deckList.innerHTML = deckNavHtml();
         wireDeckNav();
      }
      if (state.phase === 'input') {
         renderInputPhase();
      } else if (state.phase === 'assign') {
         renderAssignPhase();
      } else if (state.phase === 'staging') {
         renderReconcilePhase();
      } else {
         renderReconcilePhase();
      }
   }

   function initRightNav() {
      var toggle = document.getElementById('or-right-nav-toggle');
      var nav = document.getElementById('or-right-nav');
      var backdrop = document.getElementById('or-right-nav-backdrop');
      if (toggle && nav) {
         toggle.addEventListener('click', function () {
            nav.classList.toggle('open');
            if (backdrop) {
               backdrop.classList.toggle('open');
            }
         });
      }
      if (backdrop) {
         backdrop.addEventListener('click', function () {
            nav.classList.remove('open');
            backdrop.classList.remove('open');
         });
      }
   }

   function renderEmptyShell(root) {
      ensureCss();
      state.settings = HubStorage.loadOrderReconcileSettings();
      state.sessionId = 'session-' + new Date().toISOString().slice(0, 10);
      loadProgress();

      root.innerHTML =
         '<div class="order-reconcile-app">' +
         '<button type="button" id="or-right-nav-toggle" class="or-right-nav-toggle" aria-label="Open menu">&#9776;</button>' +
         '<div id="or-right-nav-backdrop" class="or-right-nav-backdrop"></div>' +
         '<div class="or-layout">' +
         '<div class="or-main-area">' +
         '<header class="or-header"><h2>Order Reconcile</h2>' +
         '<div class="or-meta">Match acquired cards to swap queues and update Archidekt decks.</div>' +
         '<div class="or-meta" id="or-status" hidden></div></header>' +
         '<div class="or-error" id="or-error" hidden></div>' +
         '<div class="or-body">' +
         '<div class="or-empty" id="or-empty-state" hidden></div>' +
         '<div id="or-content"><div id="or-main-content"></div></div>' +
         '</div></div>' +
         '<aside id="or-right-nav" class="or-right-nav">' +
         '<div class="or-nav-actions"><h3>Session</h3>' +
         '<button type="button" class="or-btn or-btn-ghost" id="or-new-session">New session</button>' +
         '<button type="button" class="or-btn or-btn-ghost" id="or-back-input">Edit acquired cards</button>' +
         '</div><div><h3>Decks</h3><div class="hub-deck-list" id="or-deck-list"></div></div>' +
         '</aside></div></div>';

      state.ui = {
         statusEl: document.getElementById('or-status'),
         errorEl: document.getElementById('or-error'),
         emptyState: document.getElementById('or-empty-state'),
         content: document.getElementById('or-content'),
         mainContent: document.getElementById('or-main-content'),
         deckList: document.getElementById('or-deck-list')
      };

      initRightNav();

      document.getElementById('or-new-session').addEventListener('click', function () {
         state.phase = 'input';
         state.assignments = [];
         state.needsReview = [];
         state.copies = [];
         state.reconcileItems = [];
         state.acquiredCards = [];
         state.completedDecks = {};
         state.progress = { decisions: {} };
         saveProgress();
         render();
      });

      document.getElementById('or-back-input').addEventListener('click', function () {
         state.phase = 'input';
         saveProgress();
         render();
      });

      render();
   }

   async function resumeSessionIfNeeded() {
      if (state.phase === 'input' || !state.acquiredCards.length) {
         return;
      }
      if (state.decks.length && state.decks[0].deck_snapshot) {
         return;
      }
      try {
         setStatus('Restoring session — refetching decks…');
         await fetchAllSnapshots();
         setStatus('');
      } catch (err) {
         showError('Could not restore session: ' + (err.message || String(err)));
         state.phase = 'input';
      }
   }

   async function loadOrderReconcileApp(root) {
      renderEmptyShell(root);
      await resumeSessionIfNeeded();
      render();
   }

   global.loadOrderReconcileApp = loadOrderReconcileApp;
})(window);
