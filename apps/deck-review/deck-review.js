(function (global) {
   'use strict';

   var SUPPORTED_SCHEMAS = { '1.0': true, '1.1': true };
   var CONFIDENCE_ORDER = { high: 0, medium: 1, low: 2 };
   var LATEST_URL = 'data/suggestions/latest.json';
   var BRIDGE_SCRIPT_URL = 'https://github.com/rayenz-akusiom/neopets/blob/main/monkey-scripts/archidekt-deck-review.user.js';
   var SWAP_IN = 'New Set In';
   var SWAP_OUT = 'New Set Out';
   var cssLoaded = false;

   var state = {
      data: null,
      fileId: null,
      progress: null,
      activeDeckId: null,
      suggestionIndex: 0,
      printCache: {},
      deckPrefs: {},
      profileStatus: '',
      profilesConnected: false,
      showAllMode: false,
      statusCardTab: 'decisions',
      ui: {}
   };

   function ensureCss() {
      if (cssLoaded || document.querySelector('link[data-deck-review-css]')) {
         cssLoaded = true;
         return;
      }
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'apps/deck-review/deck-review.css';
      link.setAttribute('data-deck-review-css', '1');
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

   function normalizeArrayValue(value) {
      if (!value) {
         return [];
      }
      return Array.isArray(value) ? value : [value];
   }

   function normalizeSuggestion(suggestion) {
      if (!suggestion) {
         return suggestion;
      }
      suggestion.replaces = normalizeArrayValue(suggestion.replaces);
      return suggestion;
   }

   function validateSuggestions(data) {
      if (!data || typeof data !== 'object') {
         throw new Error('Invalid JSON: expected an object');
      }
      if (!data.meta || !SUPPORTED_SCHEMAS[data.meta.schema_version]) {
         throw new Error('Unsupported or missing schema_version (need 1.0 or 1.1)');
      }
      if (!Array.isArray(data.decks)) {
         throw new Error('Missing decks array');
      }
      data.decks.forEach(function (deck) {
         deck.suggestions = normalizeArrayValue(deck.suggestions).map(normalizeSuggestion);
      });
      return data;
   }

   function sortSuggestions(suggestions) {
      return suggestions.slice().sort(function (a, b) {
         var tierA = a.priority_tier === 'swap' ? 0 : 1;
         var tierB = b.priority_tier === 'swap' ? 0 : 1;
         if (tierA !== tierB) {
            return tierA - tierB;
         }
         var confA = CONFIDENCE_ORDER[a.confidence] != null ? CONFIDENCE_ORDER[a.confidence] : 9;
         var confB = CONFIDENCE_ORDER[b.confidence] != null ? CONFIDENCE_ORDER[b.confidence] : 9;
         if (confA !== confB) {
            return confA - confB;
         }
         return String(a.suggestion_id).localeCompare(String(b.suggestion_id));
      });
   }

   function getDeckById(deckId) {
      return state.data.decks.find(function (d) { return d.deck_id === deckId; });
   }

   function decisionKey(suggestionId) {
      return suggestionId;
   }

   function getDecision(suggestionId) {
      return state.progress.decisions[decisionKey(suggestionId)] || null;
   }

   function setDecision(suggestionId, decision) {
      state.progress.decisions[decisionKey(suggestionId)] = decision;
      HubStorage.saveReviewProgress(state.fileId, state.progress);
   }

   function listHasName(list, name) {
      return (list || []).some(function (item) { return item === name; });
   }

   function uniqueNames() {
      var seen = {};
      var names = [];
      for (var i = 0; i < arguments.length; i++) {
         (arguments[i] || []).forEach(function (name) {
            if (name && !seen[name]) {
               seen[name] = true;
               names.push(name);
            }
         });
      }
      return names;
   }

   function getDeckPreferences(deck) {
      var base = deck.profile_preferences || {};
      var runtime = state.deckPrefs[deck.deck_id] || {};
      return {
         blocked_cards: uniqueNames(base.blocked_cards, runtime.blocked_cards),
         protected_cards: uniqueNames(base.protected_cards, runtime.protected_cards)
      };
   }

   function addRuntimePreference(deckId, field, cardName) {
      if (!cardName) {
         return;
      }
      if (!state.deckPrefs[deckId]) {
         state.deckPrefs[deckId] = { blocked_cards: [], protected_cards: [] };
      }
      var list = state.deckPrefs[deckId][field] || [];
      if (!listHasName(list, cardName)) {
         list.push(cardName);
         state.deckPrefs[deckId][field] = list;
      }
   }

   function isSuggestionFiltered(suggestion, prefs) {
      if (!suggestion || !prefs) {
         return false;
      }
      if (suggestion.card && suggestion.card.name && listHasName(prefs.blocked_cards, suggestion.card.name)) {
         return true;
      }
      return (suggestion.replaces || []).some(function (r) {
         return r.name && listHasName(prefs.protected_cards, r.name);
      });
   }

   function setProfileStatus(msg) {
      state.profileStatus = msg || '';
      if (state.ui.profileStatusEl) {
         state.ui.profileStatusEl.textContent = state.profileStatus;
         state.ui.profileStatusEl.hidden = !state.profileStatus;
      }
   }

   function renderProfilesNav() {
      if (!state.ui.profilesSection) {
         return;
      }
      var canWrite = global.ProfileSync && ProfileSync.canWriteProfiles();
      state.ui.profilesSection.hidden = !state.data;

      if (state.ui.connectProfilesBtn) {
         state.ui.connectProfilesBtn.hidden = !canWrite;
         state.ui.connectProfilesBtn.disabled = !canWrite || state.profilesConnected;
         state.ui.connectProfilesBtn.textContent = state.profilesConnected
            ? 'Profiles folder connected'
            : 'Connect profiles folder';
      }

      if (state.ui.tabletProfilesNote) {
         state.ui.tabletProfilesNote.hidden = canWrite;
      }

      var deck = state.activeDeckId ? getDeckById(state.activeDeckId) : null;
      if (deck && state.ui.prefCountsEl) {
         var prefs = getDeckPreferences(deck);
         state.ui.prefCountsEl.textContent =
            prefs.blocked_cards.length + ' blocked · ' + prefs.protected_cards.length + ' protected';
      } else if (state.ui.prefCountsEl) {
         state.ui.prefCountsEl.textContent = '';
      }
   }

   function updateProfilesConnectionStatus() {
      if (!global.ProfileSync) {
         state.profilesConnected = false;
         renderProfilesNav();
         return Promise.resolve();
      }
      return ProfileSync.isConnected().then(function (connected) {
         state.profilesConnected = connected;
         renderProfilesNav();
      });
   }

   function selectedInCardName(cardEl, suggestion) {
      var printId = getPrintValue(cardEl);
      var prints = (cardEl && cardEl._drPrints) ||
         state.printCache[(suggestion.card.name || '').toLowerCase()] || [];
      var print = prints.find(function (p) { return p.id === printId; });
      return (print && print.name) || suggestion.card.name;
   }

   function neverSuggestAgain(deck, suggestion, side, cardEl, advance) {
      if (!global.ProfileSync || !ProfileSync.canWriteProfiles()) {
         setProfileStatus('Profile updates require desktop Chrome on PC.');
         return;
      }

      var field = side === 'in' ? 'blocked_cards' : 'protected_cards';
      var cardName = side === 'in'
         ? selectedInCardName(cardEl, suggestion)
         : readCutSelection(cardEl).name;

      if (!cardName) {
         setProfileStatus('Select a card first.');
         return;
      }

      var btn = (cardEl || document).querySelector(side === 'in' ? '[data-dr-never-in]' : '[data-dr-never-out]');
      if (btn) {
         btn.disabled = true;
      }

      ProfileSync.appendToProfileList(deck.deck_id, field, cardName)
         .then(function (result) {
            addRuntimePreference(deck.deck_id, field, cardName);
            var verb = result.changed ? 'Added' : 'Already listed';
            setProfileStatus(verb + ' ' + cardName + ' in ' + field.replace('_', ' ') + '.');
            state.profilesConnected = true;
            renderProfilesNav();
            recordSuggestionDecision(deck, suggestion, 'skipped', cardEl, advance !== false);
         })
         .catch(function (err) {
            setProfileStatus(err.message || String(err));
            if (btn) {
               btn.disabled = false;
            }
         });
   }

   function deckProgressCounts(deck) {
      var total = (deck.suggestions || []).length;
      var reviewed = 0;
      var accepted = 0;
      (deck.suggestions || []).forEach(function (s) {
         var d = getDecision(s.suggestion_id);
         if (d) {
            reviewed++;
            if (d.status === 'accepted') {
               accepted++;
            }
         }
      });
      return { total: total, reviewed: reviewed, accepted: accepted };
   }

   function excludeCategories() {
      return { Commander: true, Lieutenant: true, Lieutenants: true };
   }

   function optionKey(opt) {
      return [opt.name, opt.set_code || '', opt.collector_number || ''].join('|');
   }

   function bridgeAvailable() {
      return typeof global.RayenzArchidektBridge !== 'undefined' && global.RayenzArchidektBridge.isAvailable;
   }

   function bridgeApplyAvailable() {
      var bridge = global.RayenzArchidektBridge;
      return !!(bridge && bridge.isAvailable && typeof bridge.stageApply === 'function');
   }

   function archidektApplyOpenUrl(archidektUrl) {
      if (!archidektUrl) {
         return archidektUrl;
      }
      var sep = archidektUrl.indexOf('?') >= 0 ? '&' : '?';
      return archidektUrl + sep + 'rayenz_apply=1';
   }

   function deriveSwapQueue(deck) {
      if (!deck.deck_snapshot || !Array.isArray(deck.deck_snapshot.cards)) {
         return null;
      }
      var newSetIn = [];
      var newSetOut = [];
      var metadataFlags = [];
      deck.deck_snapshot.cards.forEach(function (card) {
         var primary = card.primary_category || (card.categories && card.categories[0]);
         var cats = card.categories || [];
         if (primary === SWAP_IN) {
            newSetIn.push(card);
         }
         if (primary === SWAP_OUT) {
            newSetOut.push(card);
         }
         if (cats.indexOf(SWAP_IN) >= 0 && primary !== SWAP_IN) {
            metadataFlags.push(card.name + ' (primary: ' + primary + ')');
         }
         if (cats.indexOf(SWAP_OUT) >= 0 && primary !== SWAP_OUT) {
            metadataFlags.push(card.name + ' (primary: ' + primary + ')');
         }
      });
      return {
         new_set_in: newSetIn,
         new_set_out: newSetOut,
         metadata_flags: metadataFlags,
         fetched_at: deck.deck_snapshot.fetched_at || null
      };
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

   function refreshDeckSnapshot(deck) {
      if (!bridgeAvailable()) {
         return Promise.reject(new Error('Archidekt bridge userscript not installed'));
      }
      var deckId = ArchidektExport.parseDeckId(deck.archidekt_url);
      if (!deckId) {
         return Promise.reject(new Error('Invalid Archidekt URL for ' + (deck.deck_name || deck.deck_id)));
      }
      return global.RayenzArchidektBridge.fetchDeckSnapshot(deckId).then(function (snapshot) {
         deck.deck_snapshot = snapshot;
         return snapshot;
      });
   }

   function sleep(ms) {
      return new Promise(function (resolve) { setTimeout(resolve, ms); });
   }

   async function refreshAllDeckSnapshots() {
      if (!bridgeAvailable()) {
         setProfileStatus('Install Archidekt Deck Review Bridge userscript for live refresh.');
         return;
      }
      if (!state.data || !state.data.decks.length) {
         return;
      }
      var decks = state.data.decks;
      var btn = state.ui.refreshAllDecksBtn;
      if (btn) {
         btn.disabled = true;
      }
      for (var i = 0; i < decks.length; i++) {
         setProfileStatus('Refreshing Archidekt (' + (i + 1) + '/' + decks.length + '): ' + decks[i].deck_name + '…');
         try {
            await refreshDeckSnapshot(decks[i]);
         } catch (err) {
            setProfileStatus('Refresh failed for ' + decks[i].deck_name + ': ' + (err.message || String(err)));
            if (btn) {
               btn.disabled = false;
            }
            render();
            return;
         }
         if (i < decks.length - 1) {
            await sleep(150);
         }
      }
      setProfileStatus('Refreshed ' + decks.length + ' decks from Archidekt.');
      if (btn) {
         btn.disabled = false;
      }
      render();
   }

   async function refreshActiveDeckSnapshot() {
      var deck = getDeckById(state.activeDeckId);
      if (!deck) {
         return;
      }
      var btn = state.ui.refreshDeckBtn;
      if (btn) {
         btn.disabled = true;
      }
      try {
         await refreshDeckSnapshot(deck);
         setProfileStatus('Refreshed ' + deck.deck_name + ' from Archidekt.');
         renderSuggestionPanel();
         renderDeckStatusCard(deck);
      } catch (err) {
         setProfileStatus(err.message || String(err));
      }
      if (btn) {
         btn.disabled = false;
      }
   }

   function deckCutOptions(deck) {
      var excluded = excludeCategories();
      var options = [];
      var seen = {};

      if (deck.deck_snapshot && Array.isArray(deck.deck_snapshot.cards)) {
         deck.deck_snapshot.cards.forEach(function (card) {
            var primary = card.primary_category || (card.categories && card.categories[0]);
            if (primary && excluded[primary]) {
               return;
            }
            if (primary === 'New Set In' || primary === 'New Set Out') {
               return;
            }
            if (!card.name) {
               return;
            }
            var key = optionKey(card);
            if (seen[key]) {
               return;
            }
            seen[key] = true;
            options.push({
               name: card.name,
               quantity: 1,
               set_code: card.set_code,
               collector_number: card.collector_number
            });
         });
      }

      if (!options.length) {
         var queue = deriveSwapQueue(deck);
         if (queue) {
            (queue.new_set_out || []).forEach(function (card) {
               var key = optionKey({ name: card.name, set_code: card.set_code, collector_number: card.collector_number });
               if (!seen[key]) {
                  seen[key] = true;
                  options.push({
                     name: card.name,
                     quantity: 1,
                     set_code: card.set_code,
                     collector_number: card.collector_number
                  });
               }
            });
         }
      }

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
               collector_number: snap ? snap.collector_number : null
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

   function scryfallImageFromId(scryfallId) {
      if (!scryfallId) {
         return '';
      }
      return 'https://api.scryfall.com/cards/' + scryfallId + '?format=image&version=normal';
   }

   function scryfallImageFromPrinting(setCode, collectorNumber) {
      if (!setCode || !collectorNumber) {
         return '';
      }
      return 'https://api.scryfall.com/cards/' + encodeURIComponent(String(setCode).toLowerCase()) + '/' +
         encodeURIComponent(String(collectorNumber)) + '?format=image&version=normal';
   }

   function optionLabel(opt) {
      if (opt.set_code && opt.collector_number) {
         return opt.name + ' (' + opt.set_code + ' #' + opt.collector_number + ')';
      }
      return opt.name;
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
      var prints = cardEl._drPrints || [];
      var print = prints.find(function (p) { return p.id === printId; });
      if (print) {
         summary.textContent = printOptionLines(print).join(' · ');
         return;
      }
      if (suggestion && suggestion.card && suggestion.card.scryfall_id === printId) {
         summary.textContent = suggestion.card.set_code + ' #' + suggestion.card.collector_number;
         return;
      }
      summary.textContent = 'Printing selected';
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

   function ensurePickerDialog() {
      if (state.ui.pickerDialog) {
         return state.ui.pickerDialog;
      }
      var dialog = document.createElement('dialog');
      dialog.className = 'dr-picker-dialog';
      dialog.id = 'dr-picker-dialog';
      dialog.innerHTML =
         '<div class="dr-picker-dialog-inner">' +
         '<header class="dr-picker-dialog-header">' +
         '<h3 id="dr-picker-title" class="dr-picker-title"></h3>' +
         '<button type="button" class="dr-btn dr-btn-ghost" data-dr-picker-close aria-label="Close">Close</button>' +
         '</header>' +
         '<div class="dr-picker-grid" id="dr-picker-grid"></div>' +
         '</div>';
      document.body.appendChild(dialog);
      dialog.querySelector('[data-dr-picker-close]').addEventListener('click', function () {
         dialog.close();
      });
      dialog.addEventListener('click', function (e) {
         if (e.target === dialog) {
            dialog.close();
         }
      });
      state.ui.pickerDialog = dialog;
      return dialog;
   }

   function openPickerDialog(config) {
      var dialog = ensurePickerDialog();
      var titleEl = dialog.querySelector('#dr-picker-title');
      var grid = dialog.querySelector('#dr-picker-grid');
      titleEl.textContent = config.title || 'Choose an option';
      grid.innerHTML = '';

      (config.items || []).forEach(function (item) {
         var btn = document.createElement('button');
         btn.type = 'button';
         btn.className = 'dr-picker-option';
         if (item.value === config.selectedValue) {
            btn.classList.add('selected');
         }
         var imgWrap = document.createElement('div');
         imgWrap.className = 'dr-picker-option-image';
         if (item.imgSrc) {
            var img = document.createElement('img');
            img.src = item.imgSrc;
            img.alt = (item.lines && item.lines[0]) || '';
            img.loading = 'lazy';
            imgWrap.appendChild(img);
         } else {
            imgWrap.classList.add('dr-picker-option-image-empty');
            imgWrap.textContent = 'No image';
         }
         var meta = document.createElement('div');
         meta.className = 'dr-picker-option-meta';
         (item.lines || []).forEach(function (line) {
            var p = document.createElement('div');
            p.className = 'dr-picker-option-line';
            p.textContent = line;
            meta.appendChild(p);
         });
         btn.appendChild(imgWrap);
         btn.appendChild(meta);
         btn.addEventListener('click', function () {
            if (config.onPick) {
               config.onPick(item.value, item);
            }
            dialog.close();
         });
         grid.appendChild(btn);
      });

      if (typeof dialog.showModal === 'function') {
         dialog.showModal();
      } else {
         dialog.setAttribute('open', 'open');
      }
   }

   function openPrintPicker(cardEl, suggestion) {
      var prints = cardEl._drPrints || [];
      var items = prints.map(function (p) {
         return {
            value: p.id,
            imgSrc: scryfallImageFromId(p.id),
            lines: printOptionLines(p)
         };
      });
      if (!items.length && suggestion.card.scryfall_id) {
         items.push({
            value: suggestion.card.scryfall_id,
            imgSrc: scryfallImageFromId(suggestion.card.scryfall_id),
            lines: [suggestion.card.set_code + ' #' + suggestion.card.collector_number]
         });
      }
      openPickerDialog({
         title: 'Choose printing — ' + suggestion.card.name,
         items: items,
         selectedValue: getPrintValue(cardEl),
         onPick: function (value) {
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
      openPickerDialog({
         title: 'Choose card to cut',
         items: items,
         selectedValue: getCutValue(cardEl),
         onPick: function (value) {
            setCutSelection(cardEl, value, deck);
         }
      });
   }

   async function fetchPrintings(cardName, defaultScryfallId) {
      var cacheKey = cardName.toLowerCase();
      if (state.printCache[cacheKey]) {
         return state.printCache[cacheKey];
      }
      var url = 'https://api.scryfall.com/cards/search?q=' + encodeURIComponent('!"' + cardName + '"') + '&unique=prints&order=released';
      var resp = await fetch(url);
      if (!resp.ok) {
         if (defaultScryfallId) {
            var single = await fetch('https://api.scryfall.com/cards/' + defaultScryfallId);
            if (single.ok) {
               var one = await single.json();
               state.printCache[cacheKey] = [one];
               return state.printCache[cacheKey];
            }
         }
         throw new Error('Scryfall lookup failed for ' + cardName);
      }
      var json = await resp.json();
      var prints = json.data || [];
      state.printCache[cacheKey] = prints;
      return prints;
   }

   function printingLabel(print) {
      var set = (print.set_name || print.set || '').trim();
      var num = print.collector_number || '';
      var price = print.prices && print.prices.usd ? ' $' + print.prices.usd : '';
      return set + ' #' + num + price;
   }

   function printingToCardIn(print, fallback) {
      return {
         name: print.name || fallback.name,
         set_code: (print.set || fallback.set_code || '').toUpperCase(),
         collector_number: String(print.collector_number || fallback.collector_number || ''),
         scryfall_id: print.id || fallback.scryfall_id,
         scryfall_uri: print.scryfall_uri || fallback.scryfall_uri
      };
   }

   function acceptedForDeck(deckId) {
      var deck = getDeckById(deckId);
      if (!deck) {
         return [];
      }
      var out = [];
      (deck.suggestions || []).forEach(function (s) {
         var d = getDecision(s.suggestion_id);
         if (d && d.status === 'accepted' && d.accepted) {
            out.push(d.accepted);
         }
      });
      return out;
   }

   function allAcceptedByDeck() {
      var map = {};
      state.data.decks.forEach(function (deck) {
         var items = acceptedForDeck(deck.deck_id);
         if (items.length) {
            map[deck.deck_id] = items;
         }
      });
      return map;
   }

   function loadSuggestionsData(data) {
      state.data = validateSuggestions(data);
      state.fileId = HubStorage.fileIdFromMeta(state.data.meta);
      state.progress = HubStorage.loadReviewProgress(state.fileId);
      if (!state.progress.currentSuggestionIndex) {
         state.progress.currentSuggestionIndex = {};
      }
      state.activeDeckId = state.progress.currentDeckId || (state.data.decks[0] && state.data.decks[0].deck_id);
      state.suggestionIndex = state.progress.currentSuggestionIndex[state.activeDeckId] || 0;
      showLoadedUi();
      render();
   }

   async function fetchLatest() {
      var resp = await fetch(LATEST_URL + '?t=' + Date.now());
      if (!resp.ok) {
         throw new Error('Could not fetch ' + LATEST_URL + ' (' + resp.status + ')');
      }
      var data = await resp.json();
      loadSuggestionsData(data);
   }

   function handleFileUpload(file) {
      var reader = new FileReader();
      reader.onload = function () {
         try {
            var data = JSON.parse(reader.result);
            loadSuggestionsData(data);
         } catch (err) {
            showError(err.message || String(err));
         }
      };
      reader.readAsText(file);
   }

   function showError(msg) {
      var el = state.ui.errorEl;
      if (el) {
         el.textContent = msg;
         el.hidden = false;
      }
   }

   function hideError() {
      if (state.ui.errorEl) {
         state.ui.errorEl.hidden = true;
      }
   }

   function allVisibleSuggestions(deck) {
      var prefs = getDeckPreferences(deck);
      return sortSuggestions(deck.suggestions || []).filter(function (s) {
         return !isSuggestionFiltered(s, prefs);
      });
   }

   function pendingSuggestions(deck) {
      var prefs = getDeckPreferences(deck);
      return sortSuggestions(deck.suggestions || []).filter(function (s) {
         var d = getDecision(s.suggestion_id);
         if (d && d.status !== 'skipped') {
            return false;
         }
         return !isSuggestionFiltered(s, prefs);
      });
   }

   function currentSuggestion(deck) {
      var pending = pendingSuggestions(deck);
      if (!pending.length) {
         return null;
      }
      var idx = Math.min(state.suggestionIndex, pending.length - 1);
      return pending[idx];
   }

   function initRightNav() {
      var toggle = document.getElementById('dr-right-nav-toggle');
      var nav = document.getElementById('dr-right-nav');
      var backdrop = document.getElementById('dr-right-nav-backdrop');

      function closeNav() {
         if (nav) {
            nav.classList.remove('open');
         }
         if (backdrop) {
            backdrop.classList.remove('open');
         }
      }

      if (toggle && nav) {
         toggle.addEventListener('click', function () {
            nav.classList.toggle('open');
            if (backdrop) {
               backdrop.classList.toggle('open');
            }
         });
      }
      if (backdrop) {
         backdrop.addEventListener('click', closeNav);
      }

      if (state.ui.deckList) {
         state.ui.deckList.addEventListener('click', function (e) {
            if (e.target.closest('[data-deck-id]')) {
               closeNav();
            }
         });
      }
   }

   function deckSuggestionCount(deck) {
      return (deck.suggestions || []).length;
   }

   function sortDecksByName(decks) {
      return decks.slice().sort(function (a, b) {
         return String(a.deck_name || a.deck_id).localeCompare(String(b.deck_name || b.deck_id));
      });
   }

   function renderDeckChip(deck) {
      var counts = deckProgressCounts(deck);
      var cls = 'dr-deck-chip';
      if (deck.deck_id === state.activeDeckId) {
         cls += ' active';
      }
      if (counts.reviewed >= counts.total && counts.total > 0) {
         cls += ' done';
      }
      if (!deckSuggestionCount(deck)) {
         cls += ' dr-deck-chip-empty';
      }
      return '<button type="button" class="' + cls + '" data-deck-id="' + escapeHtml(deck.deck_id) + '">' +
         escapeHtml(deck.deck_name) + ' (' + counts.accepted + '/' + counts.total + ')' +
         '</button>';
   }

   function wireDeckListClicks() {
      state.ui.deckList.querySelectorAll('[data-deck-id]').forEach(function (btn) {
         btn.addEventListener('click', function () {
            state.activeDeckId = btn.getAttribute('data-deck-id');
            state.suggestionIndex = state.progress.currentSuggestionIndex[state.activeDeckId] || 0;
            state.progress.currentDeckId = state.activeDeckId;
            HubStorage.saveReviewProgress(state.fileId, state.progress);
            renderSuggestionPanel();
            renderDeckList();
            renderDeckStatusCard(getDeckById(state.activeDeckId));
            renderProfilesNav();
         });
      });
   }

   function renderDeckList() {
      var withSuggestions = [];
      var withoutSuggestions = [];
      state.data.decks.forEach(function (deck) {
         if (deckSuggestionCount(deck) > 0) {
            withSuggestions.push(deck);
         } else {
            withoutSuggestions.push(deck);
         }
      });

      var html = sortDecksByName(withSuggestions).map(renderDeckChip).join('');
      if (withoutSuggestions.length) {
         var emptyOpen = withoutSuggestions.some(function (d) {
            return d.deck_id === state.activeDeckId;
         });
         html +=
            '<details class="dr-deck-empty-collapse"' + (emptyOpen ? ' open' : '') + '>' +
            '<summary>No suggestions (' + withoutSuggestions.length + ')</summary>' +
            '<div class="dr-deck-list-collapsed">' +
            sortDecksByName(withoutSuggestions).map(renderDeckChip).join('') +
            '</div></details>';
      }

      state.ui.deckList.innerHTML = html;
      wireDeckListClicks();
   }

   function decisionStatusClass(status) {
      if (status === 'accepted') {
         return ' dr-decision-accepted';
      }
      if (status === 'rejected') {
         return ' dr-decision-rejected';
      }
      if (status === 'skipped') {
         return ' dr-decision-skipped';
      }
      return '';
   }

   function decisionStatusLabel(status) {
      if (status === 'accepted') {
         return '<span class="dr-decision-label dr-decision-label-accepted">Accepted</span>';
      }
      if (status === 'rejected') {
         return '<span class="dr-decision-label dr-decision-label-rejected">Rejected</span>';
      }
      if (status === 'skipped') {
         return '<span class="dr-decision-label dr-decision-label-skipped">Skipped</span>';
      }
      if (status === 'pending') {
         return '<span class="dr-decision-label dr-decision-label-pending">Pending</span>';
      }
      return '';
   }

   function decisionRecapInOut(suggestion, decision) {
      var inName = '';
      var inSet = '';
      var outName = '';
      if (decision && decision.status === 'accepted' && decision.accepted) {
         if (decision.accepted.card_in) {
            inName = decision.accepted.card_in.name || '';
            inSet = decision.accepted.card_in.set_code || '';
         }
         if (decision.accepted.card_out && decision.accepted.card_out.name) {
            outName = decision.accepted.card_out.name;
         }
      } else {
         inName = (suggestion.card && suggestion.card.name) || '';
         inSet = (suggestion.card && suggestion.card.set_code) || '';
         var rep = suggestion.replaces && suggestion.replaces[0];
         outName = rep && rep.name ? rep.name : '';
      }
      return { inName: inName, inSet: inSet, outName: outName };
   }

   function applyCardDecisionUi(cardEl, status) {
      if (!cardEl) {
         return;
      }
      cardEl.classList.remove('dr-decision-accepted', 'dr-decision-rejected', 'dr-decision-skipped');
      if (status === 'accepted') {
         cardEl.classList.add('dr-decision-accepted');
      } else if (status === 'rejected') {
         cardEl.classList.add('dr-decision-rejected');
      } else if (status === 'skipped') {
         cardEl.classList.add('dr-decision-skipped');
      }
      var labelHost = cardEl.querySelector('[data-dr-decision-label]');
      if (labelHost) {
         labelHost.innerHTML = decisionStatusLabel(status);
      }
   }

   function suggestionBadgesHtml(suggestion, staleness) {
      var staleBadge = '';
      if (staleness && staleness.stale) {
         if (staleness.level === 'fully_queued') {
            staleBadge = '<span class="dr-badge dr-badge-queued">Already queued</span>';
         } else {
            staleBadge = '<span class="dr-badge dr-badge-stale">Stale</span>';
         }
      }
      return (suggestion.priority_tier === 'swap' ? '<span class="dr-badge dr-badge-swap">Swap</span>' : '') +
         staleBadge +
         '<span class="dr-badge dr-badge-' + escapeHtml(suggestion.confidence) + '">' + escapeHtml(suggestion.confidence) + '</span>' +
         '<span class="dr-badge">' + escapeHtml(suggestion.action) + '</span>';
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

   function defaultOutKeyForSuggestion(deck, suggestion) {
      var defaultOut = (suggestion.replaces && suggestion.replaces[0]) ? suggestion.replaces[0].name : '';
      if (!defaultOut) {
         return { defaultOut: '', defaultOutKey: '' };
      }
      var defaultSnap = findSnapshotCard(deck, defaultOut);
      return {
         defaultOut: defaultOut,
         defaultOutKey: optionKey({
            name: defaultOut,
            set_code: defaultSnap ? defaultSnap.set_code : null,
            collector_number: defaultSnap ? defaultSnap.collector_number : null
         })
      };
   }

   function buildSuggestionCardHtml(suggestion, deck, decision) {
      var tierClass = suggestion.priority_tier === 'swap' ? ' swap-tier' : '';
      var decisionClass = decision ? decisionStatusClass(decision.status) : '';
      var missingCut = isMissingSuggestedCut(suggestion);
      var missingCutClass = missingCut ? ' dr-missing-cut' : '';
      var staleness = getSuggestionStaleness(deck, suggestion);
      var staleClass = '';
      if (staleness.stale) {
         staleClass = staleness.level === 'fully_queued' ? ' dr-suggestion-fully-queued' : ' dr-suggestion-stale';
      }
      var canWriteProfiles = global.ProfileSync && ProfileSync.canWriteProfiles();
      var neverBtnAttrs = canWriteProfiles
         ? ''
         : ' disabled title="Profile updates require desktop Chrome on PC."';
      var missingCutBadge = missingCut
         ? '<span class="dr-badge dr-badge-missing-cut">No cut suggested</span>'
         : '';
      var missingCutNotice = missingCut
         ? '<div class="dr-cut-warning-row"><p class="dr-cut-warning">No cut was suggested for this swap. Choose an Out card manually — the generator may have omitted <code>replaces</code>.</p></div>'
         : '';
      var staleNotice = staleness.stale
         ? '<div class="dr-stale-notice-row"><p class="dr-stale-notice">' +
            escapeHtml(staleness.reasons.join(' ')) + '</p></div>'
         : '';

      return '<div class="dr-suggestion-card' + tierClass + decisionClass + missingCutClass + staleClass + '" data-suggestion-id="' +
         escapeHtml(suggestion.suggestion_id) + '">' +
         '<div class="dr-reasoning">' +
         '<div class="dr-badge-row">' + suggestionBadgesHtml(suggestion, staleness) + missingCutBadge +
         '<span data-dr-decision-label>' + (decision ? decisionStatusLabel(decision.status) : '') + '</span></div>' +
         '<h3>' + escapeHtml(suggestion.card.name) + '</h3>' +
         '<p class="dr-rationale">' + escapeHtml(suggestion.rationale) + '</p>' +
         '<p class="dr-roles">Roles: ' + escapeHtml((suggestion.roles_matched || []).join(', ')) + '</p>' +
         '</div>' +
         '<div class="dr-swap-pair">' +
         staleNotice +
         missingCutNotice +
         '<div class="dr-swap-col dr-swap-in">' +
         '<div class="dr-swap-label dr-swap-label-in">In</div>' +
         '<button type="button" class="dr-card-image dr-card-image-btn" data-dr-open-print-picker aria-label="Choose printing">' +
         '<img data-dr-img-in src="' + escapeHtml(scryfallImageFromId(suggestion.card.scryfall_id)) + '" alt="">' +
         '</button>' +
         '<p class="dr-picker-summary" data-dr-print-summary>Loading printings…</p>' +
         '<input type="hidden" data-dr-print-value value="">' +
         '<button type="button" class="dr-btn dr-btn-ghost dr-never-btn" data-dr-never-in' + neverBtnAttrs + '>Never suggest again</button>' +
         '</div>' +
         '<div class="dr-swap-arrow" aria-hidden="true">→</div>' +
         '<div class="dr-swap-col dr-swap-out">' +
         '<div class="dr-swap-label dr-swap-label-out">Out</div>' +
         '<button type="button" class="dr-card-image dr-card-image-btn' + (missingCut ? ' dr-card-image-empty' : '') + '" data-dr-open-cut-picker aria-label="Choose cut">' +
         '<img data-dr-img-out src="" alt="">' +
         '</button>' +
         '<p class="dr-picker-summary" data-dr-cut-summary></p>' +
         '<input type="hidden" data-dr-cut-value value="">' +
         '<button type="button" class="dr-btn dr-btn-ghost dr-never-btn" data-dr-never-out' + neverBtnAttrs + '>Never suggest again</button>' +
         '</div>' +
         '</div>' +
         '<div class="dr-actions">' +
         '<button type="button" class="dr-btn dr-btn-ghost" data-dr-action="skip">Skip</button>' +
         '<button type="button" class="dr-btn dr-btn-danger" data-dr-action="reject">Reject</button>' +
         '<button type="button" class="dr-btn dr-btn-success" data-dr-action="accept">Accept</button>' +
         '</div></div>';
   }

   function resolveDefaultCutKey(deck, suggestion, cutOptions) {
      var outDefaults = defaultOutKeyForSuggestion(deck, suggestion);
      var defaultOut = outDefaults.defaultOut;
      var defaultOutKey = outDefaults.defaultOutKey;
      var missingCut = isMissingSuggestedCut(suggestion);

      if (missingCut) {
         return '';
      }
      if (defaultOutKey) {
         return defaultOutKey;
      }
      if (defaultOut) {
         var snap = findSnapshotCard(deck, defaultOut);
         return optionKey({
            name: defaultOut,
            set_code: snap && snap.set_code,
            collector_number: snap && snap.collector_number
         });
      }
      if (cutOptions.length) {
         return optionKey(cutOptions[0]);
      }
      return '';
   }

   async function mountSuggestionCard(cardEl, deck, suggestion, cutOptions, advanceOnAction) {
      cardEl._drCutOptions = cutOptions.slice();
      cardEl._drSuggestion = suggestion;

      var defaultCutKey = resolveDefaultCutKey(deck, suggestion, cutOptions);
      setCutSelection(cardEl, defaultCutKey, deck);

      var openCutBtn = cardEl.querySelector('[data-dr-open-cut-picker]');
      if (openCutBtn) {
         openCutBtn.addEventListener('click', function () {
            openCutPicker(cardEl, deck);
         });
      }

      var openPrintBtn = cardEl.querySelector('[data-dr-open-print-picker]');
      try {
         var prints = await fetchPrintings(suggestion.card.name, suggestion.card.scryfall_id);
         cardEl._drPrints = prints;
         var defaultPrintId = suggestion.card.scryfall_id;
         if (prints.length && !prints.some(function (p) { return p.id === defaultPrintId; })) {
            defaultPrintId = prints[0].id;
         }
         setPrintSelection(cardEl, defaultPrintId, suggestion);
      } catch (err) {
         cardEl._drPrints = [];
         setPrintSelection(cardEl, suggestion.card.scryfall_id, suggestion);
      }

      if (openPrintBtn) {
         openPrintBtn.addEventListener('click', function () {
            openPrintPicker(cardEl, suggestion);
         });
      }

      var existing = getDecision(suggestion.suggestion_id);
      if (existing && existing.accepted) {
         restoreAcceptedSelections(cardEl, deck, suggestion, existing.accepted);
      }

      cardEl.querySelector('[data-dr-action="skip"]').addEventListener('click', function () {
         recordSuggestionDecision(deck, suggestion, 'skipped', cardEl, advanceOnAction);
      });
      cardEl.querySelector('[data-dr-action="reject"]').addEventListener('click', function () {
         recordSuggestionDecision(deck, suggestion, 'rejected', cardEl, advanceOnAction);
      });
      cardEl.querySelector('[data-dr-action="accept"]').addEventListener('click', function () {
         acceptSuggestionFromCard(deck, suggestion, cardEl, advanceOnAction);
      });

      var neverIn = cardEl.querySelector('[data-dr-never-in]');
      var neverOut = cardEl.querySelector('[data-dr-never-out]');
      if (neverIn) {
         neverIn.addEventListener('click', function () {
            neverSuggestAgain(deck, suggestion, 'in', cardEl, advanceOnAction);
         });
      }
      if (neverOut) {
         neverOut.addEventListener('click', function () {
            neverSuggestAgain(deck, suggestion, 'out', cardEl, advanceOnAction);
         });
      }
   }

   function restoreAcceptedSelections(cardEl, deck, suggestion, accepted) {
      if (accepted.card_in && accepted.card_in.scryfall_id) {
         setPrintSelection(cardEl, accepted.card_in.scryfall_id, suggestion);
      }
      if (accepted.card_out && accepted.card_out.name) {
         setCutSelection(cardEl, optionKey({
            name: accepted.card_out.name,
            set_code: accepted.card_out.set_code,
            collector_number: accepted.card_out.collector_number
         }), deck);
      }
   }

   function wireViewToggle() {
      var btn = document.getElementById('dr-toggle-view');
      if (!btn) {
         return;
      }
      btn.addEventListener('click', function () {
         state.showAllMode = !state.showAllMode;
         renderSuggestionPanel();
      });
   }

   function archidektDeckLinkHtml(deck, label) {
      if (!deck || !deck.archidekt_url) {
         return '';
      }
      var text = label || ('Open ' + deck.deck_name + ' on Archidekt');
      return '<a class="dr-deck-archidekt-link" href="' + escapeHtml(deck.archidekt_url) +
         '" target="_blank" rel="noopener">' + escapeHtml(text) + '</a>';
   }

   function viewToolbarHtml(deck) {
      return '<div class="dr-view-toolbar">' +
         archidektDeckLinkHtml(deck) +
         '<button type="button" class="dr-btn dr-btn-ghost" id="dr-toggle-view">' +
         (state.showAllMode ? 'One at a time' : 'Show all') +
         '</button></div>';
   }

   function renderArchidektQueuePane(deck) {
      var queue = deriveSwapQueue(deck);
      var bridge = bridgeAvailable();

      if (!queue && !deck.deck_snapshot) {
         var hints = '<p class="dr-bridge-hint">No Archidekt snapshot. Re-run <code>enrich_suggestions.ps1</code>';
         if (!bridge) {
            hints += ' or install the <a href="' + escapeHtml(BRIDGE_SCRIPT_URL) + '" target="_blank" rel="noopener">Archidekt Deck Review Bridge</a> userscript for live refresh';
         }
         hints += '.</p>';
         return archidektDeckLinkHtml(deck, 'View deck on Archidekt') + hints;
      }

      if (!queue) {
         return '<p class="dr-empty">No swap queue on this deck.</p>';
      }

      var recon = getSwapQueueReconciliation(deck);
      var inList = (queue.new_set_in || []).map(function (c) {
         return swapQueueListItem(c, recon.uncoveredIn);
      }).join('') || '<li><em>empty</em></li>';
      var outList = (queue.new_set_out || []).map(function (c) {
         return swapQueueListItem(c, recon.uncoveredOut);
      }).join('') || '<li><em>empty</em></li>';
      var flags = (queue.metadata_flags || []).map(function (f) {
         return '<div>' + escapeHtml(f) + '</div>';
      }).join('');
      var fetchedAt = queue.fetched_at ? escapeHtml(queue.fetched_at) : 'unknown';
      var refreshBtn = bridge
         ? '<button type="button" class="dr-btn dr-btn-ghost dr-swap-refresh" id="dr-refresh-deck-snapshot">Refresh</button>'
         : '';
      var bridgeHint = bridge
         ? ''
         : '<p class="dr-bridge-hint">Install the <a href="' + escapeHtml(BRIDGE_SCRIPT_URL) + '" target="_blank" rel="noopener">Archidekt Deck Review Bridge</a> userscript for live refresh.</p>';

      return '<div class="dr-swap-panel-meta">' +
         archidektDeckLinkHtml(deck, 'View deck') +
         '<span class="dr-swap-source">From Archidekt · as of ' + fetchedAt + '</span>' +
         refreshBtn +
         '</div>' +
         '<div class="dr-swap-cols">' +
         '<div><strong>In</strong><ul>' + inList + '</ul></div>' +
         '<div><strong>Out</strong><ul>' + outList + '</ul></div>' +
         '</div>' +
         swapReconcileWarningHtml(recon) +
         (flags ? '<div class="dr-flags">' + flags + '</div>' : '') +
         bridgeHint;
   }

   function renderDecisionsPane(deck) {
      var suggestions = allVisibleSuggestions(deck);
      if (!suggestions.length) {
         return '<p class="dr-empty">No suggestions for this deck.</p>';
      }
      var progress = ArchidektExport.deckReviewComplete(suggestions, getDecision);
      var rows = suggestions.map(function (s) {
         var decision = getDecision(s.suggestion_id);
         var status = decision && decision.status ? decision.status : 'pending';
         var recap = decisionRecapInOut(s, decision);
         var stale = getSuggestionStaleness(deck, s);
         var staleHtml = stale.stale ? '<span class="dr-badge dr-badge-stale">Stale</span>' : '';
         var outHtml = recap.outName
            ? ' → ' + escapeHtml(recap.outName)
            : (needsSuggestedCut(s) ? ' → <em>(pick cut)</em>' : '');
         return '<div class="dr-decision-recap-row dr-decision-recap-' + escapeHtml(status) + '">' +
            '<div class="dr-decision-recap-status">' + decisionStatusLabel(status) + staleHtml + '</div>' +
            '<div class="dr-decision-recap-swap"><strong>' + escapeHtml(recap.inName) + '</strong>' +
            (recap.inSet ? ' <span class="dr-decision-recap-set">(' + escapeHtml(recap.inSet) + ')</span>' : '') +
            outHtml + '</div>' +
            '</div>';
      }).join('');
      return '<p class="dr-decision-recap-meta">' + progress.reviewed + '/' + progress.total + ' reviewed</p>' +
         '<div class="dr-decision-recap-list">' + rows + '</div>';
   }

   function renderUpdatePane(deck) {
      var suggestions = allVisibleSuggestions(deck);
      var progress = ArchidektExport.deckReviewComplete(suggestions, getDecision);
      var hasSnapshot = !!(deck.deck_snapshot && Array.isArray(deck.deck_snapshot.cards));
      var accepted = acceptedForDeck(deck.deck_id);
      var acceptedSwaps = ArchidektExport.buildTargetAcceptedSwaps(accepted);
      var importText = hasSnapshot ? ArchidektExport.buildFullDeckImport(deck, acceptedSwaps) : '';
      var canApply = progress.complete && hasSnapshot && importText.trim().length > 0;
      var gateMsg = '';
      if (!hasSnapshot) {
         gateMsg = '<p class="dr-update-gate">Refresh or enrich deck snapshot before applying.</p>';
      } else if (!progress.complete) {
         gateMsg = '<p class="dr-update-gate">Review all suggestions first (' + progress.reviewed + '/' + progress.total + ').</p>';
      } else if (!importText.trim()) {
         gateMsg = '<p class="dr-update-gate">Nothing to export for this deck.</p>';
      } else {
         gateMsg = '<p class="dr-update-ready">All ' + progress.total + ' suggestions reviewed. Ready to update Archidekt.</p>';
      }

      var bridgeBtn = bridgeApplyAvailable()
         ? '<button type="button" class="dr-btn dr-btn-primary" id="dr-apply-bridge"' +
            (canApply ? '' : ' disabled') + '>Apply via bridge</button>'
         : '<p class="dr-bridge-hint">Install or update the <a href="' + escapeHtml(BRIDGE_SCRIPT_URL) + '" target="_blank" rel="noopener">Archidekt Deck Review Bridge</a> userscript (2026-06-21.4+) to apply from desktop.</p>';

      return gateMsg +
         '<div class="dr-toolbar dr-update-actions">' +
         '<button type="button" class="dr-btn dr-btn-primary" id="dr-copy-full-import"' +
         (canApply ? '' : ' disabled') + '>Copy full deck import</button>' +
         bridgeBtn +
         archidektDeckLinkHtml(deck, 'Open on Archidekt') +
         '</div>' +
         '<p class="dr-import-hint">Desktop: Apply via bridge stages the import in Tampermonkey, then shows a banner on Archidekt. Tablet: Import → <strong>Replace deck</strong> → paste → Save.</p>' +
         '<textarea id="dr-full-import-text" class="dr-import-preview" readonly' +
         (canApply ? '' : ' disabled') + '>' + escapeHtml(importText) + '</textarea>';
   }

   function wireDeckStatusCard(deck) {
      var card = state.ui.deckStatusCard;
      if (!card) {
         return;
      }
      card.querySelectorAll('[data-status-tab]').forEach(function (btn) {
         btn.addEventListener('click', function () {
            state.statusCardTab = btn.getAttribute('data-status-tab');
            renderDeckStatusCard(deck);
         });
      });

      state.ui.refreshDeckBtn = document.getElementById('dr-refresh-deck-snapshot');
      if (state.ui.refreshDeckBtn) {
         state.ui.refreshDeckBtn.addEventListener('click', function () {
            refreshActiveDeckSnapshot();
         });
      }

      var copyBtn = document.getElementById('dr-copy-full-import');
      if (copyBtn) {
         copyBtn.addEventListener('click', async function () {
            var accepted = acceptedForDeck(deck.deck_id);
            var text = ArchidektExport.buildFullDeckImport(deck, ArchidektExport.buildTargetAcceptedSwaps(accepted));
            await ArchidektExport.copyText(text);
            copyBtn.textContent = 'Copied!';
            setTimeout(function () { copyBtn.textContent = 'Copy full deck import'; }, 1500);
         });
      }

      var applyBtn = document.getElementById('dr-apply-bridge');
      if (applyBtn) {
         applyBtn.addEventListener('click', function () {
            if (!bridgeApplyAvailable()) {
               showError('Install/update Archidekt Deck Review Bridge userscript (2026-06-21.4+) to apply from Hub.');
               return;
            }
            var accepted = acceptedForDeck(deck.deck_id);
            var text = ArchidektExport.buildFullDeckImport(deck, ArchidektExport.buildTargetAcceptedSwaps(accepted));
            var deckId = ArchidektExport.parseDeckId(deck.archidekt_url);
            if (!deckId || !text.trim()) {
               showError('Cannot stage apply — missing deck id or import text.');
               return;
            }
            try {
               RayenzArchidektBridge.stageApply(deckId, text);
               window.open(archidektApplyOpenUrl(deck.archidekt_url), '_blank', 'noopener');
               setProfileStatus('Staged — switch to the Archidekt tab and click Apply import on the banner.');
            } catch (err) {
               showError(err.message || String(err));
            }
         });
      }
   }

   function renderDeckStatusCard(deck) {
      if (!deck || !state.ui.deckStatusCard) {
         return;
      }
      var tab = state.statusCardTab || 'decisions';
      var tabClass = function (name) {
         return 'dr-status-tab' + (tab === name ? ' active' : '');
      };

      state.ui.deckStatusCard.hidden = false;
      state.ui.deckStatusCard.innerHTML =
         '<div class="dr-deck-status-header">' +
         '<h3>Deck status</h3>' +
         '<div class="dr-status-tabs">' +
         '<button type="button" class="' + tabClass('decisions') + '" data-status-tab="decisions">Decisions</button>' +
         '<button type="button" class="' + tabClass('queue') + '" data-status-tab="queue">Archidekt queue</button>' +
         '<button type="button" class="' + tabClass('update') + '" data-status-tab="update">Update</button>' +
         '</div></div>' +
         '<div class="dr-status-pane" id="dr-status-pane-decisions"' + (tab === 'decisions' ? '' : ' hidden') + '>' +
         renderDecisionsPane(deck) +
         '</div>' +
         '<div class="dr-status-pane" id="dr-status-pane-queue"' + (tab === 'queue' ? '' : ' hidden') + '>' +
         renderArchidektQueuePane(deck) +
         '</div>' +
         '<div class="dr-status-pane" id="dr-status-pane-update"' + (tab === 'update' ? '' : ' hidden') + '>' +
         renderUpdatePane(deck) +
         '</div>';

      wireDeckStatusCard(deck);
   }

   function renderDeckStatusCardOrHide(deck) {
      if (!deck) {
         if (state.ui.deckStatusCard) {
            state.ui.deckStatusCard.innerHTML = '';
            state.ui.deckStatusCard.hidden = true;
         }
         return;
      }
      renderDeckStatusCard(deck);
   }

   async function renderSuggestionPanel() {
      hideError();
      var deck = getDeckById(state.activeDeckId);
      if (!deck) {
         state.ui.suggestionPanel.innerHTML = '<div class="dr-empty">Select a deck.</div>';
         renderDeckStatusCardOrHide(null);
         return;
      }

      renderDeckStatusCard(deck);

      if (state.showAllMode) {
         var allSuggestions = allVisibleSuggestions(deck);
         if (!allSuggestions.length) {
            state.ui.suggestionPanel.innerHTML = viewToolbarHtml(deck) +
               '<div class="dr-empty">No suggestions for ' + escapeHtml(deck.deck_name) + '.</div>';
            wireViewToggle();
            return;
         }

         state.ui.suggestionPanel.innerHTML = viewToolbarHtml(deck) +
            (state.profileStatus ? '<p class="dr-profile-status dr-profile-status-global">' + escapeHtml(state.profileStatus) + '</p>' : '') +
            '<div class="dr-suggestions-all" id="dr-suggestions-all"></div>';
         wireViewToggle();

         var container = document.getElementById('dr-suggestions-all');
         var cutOptions = deckCutOptions(deck);
         for (var i = 0; i < allSuggestions.length; i++) {
            var s = allSuggestions[i];
            var decision = getDecision(s.suggestion_id);
            container.insertAdjacentHTML('beforeend', buildSuggestionCardHtml(s, deck, decision));
            var cardEl = container.lastElementChild;
            await mountSuggestionCard(cardEl, deck, s, cutOptions, false);
         }
         return;
      }

      var suggestion = currentSuggestion(deck);
      if (!suggestion) {
         state.ui.suggestionPanel.innerHTML = viewToolbarHtml(deck) +
            '<div class="dr-empty">All suggestions reviewed for ' + escapeHtml(deck.deck_name) + '.</div>';
         wireViewToggle();
         return;
      }

      var decision = getDecision(suggestion.suggestion_id);
      state.ui.suggestionPanel.innerHTML = viewToolbarHtml(deck) +
         (state.profileStatus ? '<p class="dr-profile-status dr-profile-status-global">' + escapeHtml(state.profileStatus) + '</p>' : '') +
         buildSuggestionCardHtml(suggestion, deck, decision);
      wireViewToggle();

      var cardEl = state.ui.suggestionPanel.querySelector('.dr-suggestion-card');
      await mountSuggestionCard(cardEl, deck, suggestion, deckCutOptions(deck), true);
   }

   function recordSuggestionDecision(deck, suggestion, status, cardEl, advanceOnAction) {
      setDecision(suggestion.suggestion_id, { status: status });
      if (advanceOnAction) {
         state.suggestionIndex++;
         state.progress.currentSuggestionIndex[state.activeDeckId] = state.suggestionIndex;
         HubStorage.saveReviewProgress(state.fileId, state.progress);
         renderDeckList();
         renderSuggestionPanel();
         renderDeckStatusCard(getDeckById(state.activeDeckId));
         return;
      }
      HubStorage.saveReviewProgress(state.fileId, state.progress);
      applyCardDecisionUi(cardEl, status);
      renderDeckList();
      renderDeckStatusCard(getDeckById(state.activeDeckId));
   }

   function acceptSuggestionFromCard(deck, suggestion, cardEl, advanceOnAction) {
      var qty = 1;

      var selectedPrintId = getPrintValue(cardEl);
      var prints = cardEl._drPrints ||
         state.printCache[(suggestion.card.name || '').toLowerCase()] || [];
      var print = prints.find(function (p) { return p.id === selectedPrintId; }) || suggestion.card;
      var cardIn = printingToCardIn(print, suggestion.card);

      var cutMeta = readCutSelection(cardEl);
      if (isMissingSuggestedCut(suggestion) && !cutMeta.name) {
         showError('No Out card selected. This suggestion had no cut in the JSON — pick one manually or skip.');
         return;
      }
      if (!cutMeta.name && needsSuggestedCut(suggestion)) {
         showError('Select an Out card before accepting.');
         return;
      }
      if (!cutMeta.set_code || !cutMeta.collector_number) {
         var snap = findSnapshotCard(deck, cutMeta.name, cutMeta.set_code, cutMeta.collector_number);
         if (snap) {
            cutMeta.set_code = cutMeta.set_code || snap.set_code;
            cutMeta.collector_number = cutMeta.collector_number || snap.collector_number;
         }
      }

      var accepted = {
         suggestion_id: suggestion.suggestion_id,
         deck_id: deck.deck_id,
         archidekt_deck_id: ArchidektExport.parseDeckId(deck.archidekt_url),
         archidekt_url: deck.archidekt_url,
         action: suggestion.action,
         quantity: qty,
         card_in: cardIn,
         card_out: {
            name: cutMeta.name,
            quantity: qty,
            set_code: cutMeta.set_code,
            collector_number: cutMeta.collector_number
         },
         swap_categories: suggestion.action === 'replace' || suggestion.priority_tier === 'swap' || !!cutMeta.name
      };

      setDecision(suggestion.suggestion_id, { status: 'accepted', accepted: accepted });
      if (advanceOnAction) {
         state.suggestionIndex++;
         state.progress.currentSuggestionIndex[state.activeDeckId] = state.suggestionIndex;
         HubStorage.saveReviewProgress(state.fileId, state.progress);
         renderDeckList();
         renderSuggestionPanel();
         renderDeckStatusCard(getDeckById(state.activeDeckId));
         return;
      }
      HubStorage.saveReviewProgress(state.fileId, state.progress);
      applyCardDecisionUi(cardEl, 'accepted');
      renderDeckList();
      renderDeckStatusCard(getDeckById(state.activeDeckId));
   }

   function render() {
      if (!state.data) {
         return;
      }
      hideError();
      var meta = state.data.meta;
      state.ui.metaEl.innerHTML =
         '<strong>' + escapeHtml(meta.set_name) + '</strong> · ' + escapeHtml(meta.set_code) +
         ' · ' + escapeHtml(meta.generated_at) + ' · ' + state.data.decks.length + ' decks' +
         (meta.notes ? '<div class="dr-meta-notes">' + escapeHtml(meta.notes) + '</div>' : '');

      renderDeckList();
      renderSuggestionPanel();
      renderProfilesNav();
      if (state.ui.refreshAllDecksBtn) {
         state.ui.refreshAllDecksBtn.disabled = !bridgeAvailable();
         state.ui.refreshAllDecksBtn.title = bridgeAvailable()
            ? 'Fetch latest deck lists from Archidekt'
            : 'Requires Archidekt Deck Review Bridge userscript';
      }
   }

   function renderEmptyShell(root) {
      ensureCss();
      root.innerHTML =
         '<div class="deck-review-app">' +
         '<button type="button" id="dr-right-nav-toggle" class="dr-right-nav-toggle" aria-label="Open deck menu">&#9776;</button>' +
         '<div id="dr-right-nav-backdrop" class="dr-right-nav-backdrop"></div>' +
         '<div class="dr-layout">' +
         '<div class="dr-main-area">' +
         '<header class="dr-header">' +
         '<h2>Deck Review</h2>' +
         '<div class="dr-meta" id="dr-meta">Load set-update suggestions to review swaps deck by deck.</div>' +
         '</header>' +
         '<div class="dr-error" id="dr-error" hidden></div>' +
         '<div class="dr-body" id="dr-body">' +
         '<div class="dr-empty" id="dr-empty-state">Upload a suggestions file or refresh latest from the repo.</div>' +
         '<div id="dr-content" hidden>' +
         '<div class="dr-deck-status-card" id="dr-deck-status-card" hidden></div>' +
         '<div id="dr-suggestion-panel"></div>' +
         '</div></div></div>' +
         '<aside id="dr-right-nav" class="dr-right-nav" aria-label="Deck navigation">' +
         '<div class="dr-nav-actions">' +
         '<h3>Data</h3>' +
         '<button type="button" class="dr-btn dr-btn-primary" id="dr-fetch-latest">Refresh latest</button>' +
         '<button type="button" class="dr-btn dr-btn-ghost" id="dr-upload-btn">Upload JSON</button>' +
         '<input type="file" id="dr-file-input" class="dr-file-input" accept=".json,application/json">' +
         '</div>' +
         '<div class="dr-profiles-section" id="dr-profiles-section">' +
         '<h3>Profiles</h3>' +
         '<p class="dr-profiles-note" id="dr-tablet-profiles-note" hidden>Profile updates require desktop Chrome on PC.</p>' +
         '<button type="button" class="dr-btn dr-btn-ghost" id="dr-connect-profiles">Connect profiles folder</button>' +
         '<div id="dr-profile-status" class="dr-profiles-status" hidden></div>' +
         '<div id="dr-pref-counts" class="dr-pref-counts"></div>' +
         '</div>' +
         '<div class="dr-nav-actions">' +
         '<h3>Archidekt</h3>' +
         '<button type="button" class="dr-btn dr-btn-ghost" id="dr-refresh-all-decks">Refresh all decks</button>' +
         '</div>' +
         '<div>' +
         '<h3>Decks</h3>' +
         '<div class="dr-deck-list" id="dr-deck-list"></div>' +
         '</div>' +
         '</aside></div></div>';

      state.ui = {
         metaEl: document.getElementById('dr-meta'),
         errorEl: document.getElementById('dr-error'),
         emptyState: document.getElementById('dr-empty-state'),
         content: document.getElementById('dr-content'),
         deckList: document.getElementById('dr-deck-list'),
         deckStatusCard: document.getElementById('dr-deck-status-card'),
         suggestionPanel: document.getElementById('dr-suggestion-panel'),
         profilesSection: document.getElementById('dr-profiles-section'),
         connectProfilesBtn: document.getElementById('dr-connect-profiles'),
         profileStatusEl: document.getElementById('dr-profile-status'),
         prefCountsEl: document.getElementById('dr-pref-counts'),
         tabletProfilesNote: document.getElementById('dr-tablet-profiles-note'),
         refreshAllDecksBtn: document.getElementById('dr-refresh-all-decks'),
         refreshDeckBtn: null
      };

      initRightNav();

      if (state.ui.connectProfilesBtn && global.ProfileSync) {
         state.ui.connectProfilesBtn.addEventListener('click', function () {
            if (state.profilesConnected) {
               return;
            }
            ProfileSync.connectProfilesDir()
               .then(function () {
                  state.profilesConnected = true;
                  setProfileStatus('Profiles folder connected.');
                  renderProfilesNav();
               })
               .catch(function (err) {
                  setProfileStatus(err.message || String(err));
               });
         });
      }
      updateProfilesConnectionStatus();
      renderProfilesNav();

      document.getElementById('dr-upload-btn').addEventListener('click', function () {
         document.getElementById('dr-file-input').click();
      });
      document.getElementById('dr-file-input').addEventListener('change', function (e) {
         var file = e.target.files && e.target.files[0];
         if (file) {
            handleFileUpload(file);
         }
      });
      document.getElementById('dr-fetch-latest').addEventListener('click', function () {
         fetchLatest().catch(function (err) {
            showError(err.message || String(err));
         });
      });
      if (state.ui.refreshAllDecksBtn) {
         state.ui.refreshAllDecksBtn.addEventListener('click', function () {
            refreshAllDeckSnapshots();
         });
      }
   }

   function showLoadedUi() {
      if (state.ui.emptyState) {
         state.ui.emptyState.hidden = true;
      }
      if (state.ui.content) {
         state.ui.content.hidden = false;
      }
   }

   async function loadDeckReviewApp(root) {
      renderEmptyShell(root);
      try {
         await fetchLatest();
      } catch (err) {
         /* no latest.json yet — user can upload */
      }
   }

   global.loadDeckReviewApp = loadDeckReviewApp;
})(window);
