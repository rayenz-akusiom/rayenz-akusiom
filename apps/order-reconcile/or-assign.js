(function (global) {
   'use strict';

   var OR = global.OrderReconcile;
   var state = OR.state;
   var STAGING_DECK_ID = OR.STAGING_DECK_ID;
   var escapeHtml = HubUtils.escapeHtml;
   var scryfallImageFromName = HubUtils.scryfallImageFromName;
   var scryfallImageFromPrinting = HubUtils.scryfallImageFromPrinting;
   var setStatus = OR.setStatus;
   var saveProgress = OR.saveProgress;
   var getDeckById = OR.getDeckById;
   var itemsForDeck = OR.itemsForDeck;
   var render = OR.render;
   var fetchColorIdentity = OR.fetchColorIdentity;
   var validateScryfallName = OR.validateScryfallName;
   var resolveCubeDestinationForCard = OR.resolveCubeDestinationForCard;

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

   function indexKeysForName(name) {
      var keys = {};
      keys[String(name || '').trim().toLowerCase()] = true;
      OrderReconcileExport.cardFaces(name).forEach(function (face) {
         keys[face] = true;
      });
      return Object.keys(keys);
   }

   function addCandidateToIndex(index, name, candidate) {
      indexKeysForName(name).forEach(function (key) {
         if (!index[key]) {
            index[key] = [];
         }
         index[key].push(candidate);
      });
   }

   function lookupAssignmentIndex(index, cardName) {
      var seen = {};
      var result = [];
      function collect(key) {
         (index[key] || []).forEach(function (candidate) {
            if (seen[candidate.slot_key]) {
               return;
            }
            seen[candidate.slot_key] = true;
            result.push(candidate);
         });
      }
      collect(String(cardName || '').trim().toLowerCase());
      OrderReconcileExport.cardFaces(cardName).forEach(collect);
      return result;
   }

   function buildAssignmentIndex(decks) {
      var swapByName = {};
      var maybeboardByName = {};

      (decks || []).forEach(function (deck) {
         if (OrderReconcileExport.isCubeDeck(deck)) {
            OrderReconcileExport.deriveMaybeboard(deck.deck_snapshot).forEach(function (entry, idx) {
               var destCat = OrderReconcileExport.resolveCubeDestinationCategory(
                  deck.deck_snapshot, entry.color_identity);
               addCandidateToIndex(swapByName, entry.name, {
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
            addCandidateToIndex(swapByName, pair.in.name, {
               deck_id: deck.deck_id,
               deck_name: deck.deck_name,
               slot_key: OrderReconcileExport.fulfilledSlotKey(deck.deck_id, pair.index, pair.in.name),
               queued_in: pair.in,
               paired_out: pair.out,
               is_cube: false,
               maybeboard_entry: null
            });
         });

         OrderReconcileExport.deriveMaybeboard(deck.deck_snapshot).forEach(function (entry, idx) {
            addCandidateToIndex(maybeboardByName, entry.name, {
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

      return { swapByName: swapByName, maybeboardByName: maybeboardByName };
   }

   function ensureAssignmentIndex() {
      if (!state.assignmentIndex) {
         state.assignmentIndex = buildAssignmentIndex(state.decks);
      }
      return state.assignmentIndex;
   }

   function findCandidatesForName(cardName) {
      var index = ensureAssignmentIndex();
      return lookupAssignmentIndex(index.swapByName, cardName);
   }

   function findMaybeboardCandidatesForName(cardName) {
      var index = ensureAssignmentIndex();
      return lookupAssignmentIndex(index.maybeboardByName, cardName);
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
      state.assignmentIndex = buildAssignmentIndex(state.decks);
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

   function acquiredCardImageSrc(copy) {
      if (copy.set_code && copy.collector_number) {
         return scryfallImageFromPrinting(copy.set_code, copy.collector_number);
      }
      return scryfallImageFromName(copy.card_name);
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

   function renderAssignPhase() {
      var autoCount = state.assignments.length;
      var reviewCount = state.needsReview.length;
      var html = '<div class="or-status-card"><div class="or-status-header"><h3>Assign copies to decks</h3></div>' +
         '<div class="or-status-pane">' +
         (state.isProxyOrder
            ? '<p class="or-proxy-order-banner">Proxy order active — added cards will include the Proxies category.</p>'
            : '') +
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

   OR.expandToCopies = expandToCopies;
   OR.buildAssignmentIndex = buildAssignmentIndex;
   OR.findCandidatesForName = findCandidatesForName;
   OR.findMaybeboardCandidatesForName = findMaybeboardCandidatesForName;
   OR.resolveCubeCandidateCategories = resolveCubeCandidateCategories;
   OR.makeAssignment = makeAssignment;
   OR.buildAssignmentPlan = buildAssignmentPlan;
   OR.copyFieldsForReconcileItem = copyFieldsForReconcileItem;
   OR.buildReconcileItems = buildReconcileItems;
   OR.acquiredCardImageSrc = acquiredCardImageSrc;
   OR.applyCardNameFix = applyCardNameFix;
   OR.deckOptionTags = deckOptionTags;
   OR.deckOptionsHtml = deckOptionsHtml;
   OR.maybeboardDeckOptionsHtml = maybeboardDeckOptionsHtml;
   OR.candidateOptionsHtml = candidateOptionsHtml;
   OR.slotCountByDeckForCard = slotCountByDeckForCard;
   OR.consumedByDeckForCard = consumedByDeckForCard;
   OR.disabledDecksForReviewRow = disabledDecksForReviewRow;
   OR.autoAssignedDeckNote = autoAssignedDeckNote;
   OR.renderAssignPhase = renderAssignPhase;
})(window);
