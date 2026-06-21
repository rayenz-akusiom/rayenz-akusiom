(function (global) {
   'use strict';

   var SUPPORTED_SCHEMAS = { '1.0': true, '1.1': true };
   var CONFIDENCE_ORDER = { high: 0, medium: 1, low: 2 };
   var LATEST_URL = 'data/suggestions/latest.json';
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

   function selectedInCardName(printSelect, suggestion) {
      if (!printSelect) {
         return suggestion.card.name;
      }
      var printId = printSelect.value;
      var prints = state.printCache[(suggestion.card.name || '').toLowerCase()] || [];
      var print = prints.find(function (p) { return p.id === printId; });
      return (print && print.name) || suggestion.card.name;
   }

   function neverSuggestAgain(deck, suggestion, side, cardEl, advance) {
      if (!global.ProfileSync || !ProfileSync.canWriteProfiles()) {
         setProfileStatus('Profile updates require desktop Chrome on PC.');
         return;
      }

      var root = cardEl || document;
      var printSelect = root.querySelector('[data-dr-print-select]');
      var cutSelect = root.querySelector('[data-dr-cut-select]');
      var field = side === 'in' ? 'blocked_cards' : 'protected_cards';
      var cardName = side === 'in'
         ? selectedInCardName(printSelect, suggestion)
         : readCutOption(cutSelect).name;

      if (!cardName) {
         setProfileStatus('Select a card first.');
         return;
      }

      var btn = root.querySelector(side === 'in' ? '[data-dr-never-in]' : '[data-dr-never-out]');
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

      if (!options.length && deck.analysis && deck.analysis.swap_queue) {
         (deck.analysis.swap_queue.new_set_out || []).forEach(function (name) {
            var key = name + '||';
            if (!seen[key]) {
               seen[key] = true;
               options.push({ name: name, quantity: 1 });
            }
         });
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

   function readCutOption(selectEl) {
      var opt = selectEl.options[selectEl.selectedIndex];
      if (!opt) {
         return { name: '', quantity: 1 };
      }
      return {
         name: opt.dataset.name || opt.value,
         quantity: 1,
         set_code: opt.dataset.setCode || null,
         collector_number: opt.dataset.collectorNumber || null
      };
   }

   function updateInImage(printSelect, imgEl) {
      if (!printSelect || !imgEl) {
         return;
      }
      var printId = printSelect.value;
      imgEl.src = scryfallImageFromId(printId);
   }

   function updateOutImage(cutSelect, imgEl, deck) {
      if (!cutSelect || !imgEl) {
         return;
      }
      var cut = readCutOption(cutSelect);
      if (!cut.name) {
         imgEl.removeAttribute('src');
         if (imgEl.parentElement) {
            imgEl.parentElement.classList.add('dr-card-image-empty');
         }
         return;
      }
      if (imgEl.parentElement) {
         imgEl.parentElement.classList.remove('dr-card-image-empty');
      }
      if (cut.set_code && cut.collector_number) {
         imgEl.src = scryfallImageFromPrinting(cut.set_code, cut.collector_number);
         return;
      }
      var snap = findSnapshotCard(deck, cut.name, cut.set_code, cut.collector_number);
      if (snap && snap.set_code && snap.collector_number) {
         imgEl.src = scryfallImageFromPrinting(snap.set_code, snap.collector_number);
         return;
      }
      fetchPrintings(cut.name, null).then(function (prints) {
         if (prints.length && prints[0].id) {
            imgEl.src = scryfallImageFromId(prints[0].id);
         }
      }).catch(function () { /* keep placeholder */ });
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

   function renderDeckList() {
      var html = state.data.decks.map(function (deck) {
         var counts = deckProgressCounts(deck);
         var cls = 'dr-deck-chip';
         if (deck.deck_id === state.activeDeckId) {
            cls += ' active';
         }
         if (counts.reviewed >= counts.total && counts.total > 0) {
            cls += ' done';
         }
         return '<button type="button" class="' + cls + '" data-deck-id="' + escapeHtml(deck.deck_id) + '">' +
            escapeHtml(deck.deck_name) + ' (' + counts.accepted + '/' + counts.total + ')' +
            '</button>';
      }).join('');
      state.ui.deckList.innerHTML = html;
      state.ui.deckList.querySelectorAll('[data-deck-id]').forEach(function (btn) {
         btn.addEventListener('click', function () {
            state.activeDeckId = btn.getAttribute('data-deck-id');
            state.suggestionIndex = state.progress.currentSuggestionIndex[state.activeDeckId] || 0;
            state.progress.currentDeckId = state.activeDeckId;
            HubStorage.saveReviewProgress(state.fileId, state.progress);
            renderSuggestionPanel();
            renderDeckList();
            renderAcceptedPanel();
            renderProfilesNav();
         });
      });
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
      return '';
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

   function suggestionBadgesHtml(suggestion) {
      return (suggestion.priority_tier === 'swap' ? '<span class="dr-badge dr-badge-swap">Swap</span>' : '') +
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
      var canWriteProfiles = global.ProfileSync && ProfileSync.canWriteProfiles();
      var neverBtnAttrs = canWriteProfiles
         ? ''
         : ' disabled title="Profile updates require desktop Chrome on PC."';
      var missingCutBadge = missingCut
         ? '<span class="dr-badge dr-badge-missing-cut">No cut suggested</span>'
         : '';
      var missingCutNotice = missingCut
         ? '<p class="dr-cut-warning">No cut was suggested for this swap. Choose an Out card manually — the generator may have omitted <code>replaces</code>.</p>'
         : '';

      return '<div class="dr-suggestion-card' + tierClass + decisionClass + missingCutClass + '" data-suggestion-id="' +
         escapeHtml(suggestion.suggestion_id) + '">' +
         '<div class="dr-reasoning">' +
         '<div class="dr-badge-row">' + suggestionBadgesHtml(suggestion) + missingCutBadge +
         '<span data-dr-decision-label>' + (decision ? decisionStatusLabel(decision.status) : '') + '</span></div>' +
         '<h3>' + escapeHtml(suggestion.card.name) + '</h3>' +
         '<p class="dr-rationale">' + escapeHtml(suggestion.rationale) + '</p>' +
         '<p class="dr-roles">Roles: ' + escapeHtml((suggestion.roles_matched || []).join(', ')) + '</p>' +
         '</div>' +
         '<div class="dr-swap-pair">' +
         '<div class="dr-swap-col dr-swap-in">' +
         '<div class="dr-swap-label dr-swap-label-in">In</div>' +
         '<div class="dr-card-image"><img data-dr-img-in src="' + escapeHtml(scryfallImageFromId(suggestion.card.scryfall_id)) + '" alt="Card in"></div>' +
         '<select data-dr-print-select><option>Loading printings…</option></select>' +
         '<button type="button" class="dr-btn dr-btn-ghost dr-never-btn" data-dr-never-in' + neverBtnAttrs + '>Never suggest again</button>' +
         '</div>' +
         '<div class="dr-swap-arrow" aria-hidden="true">→</div>' +
         '<div class="dr-swap-col dr-swap-out' + (missingCut ? ' dr-swap-out-unspecified' : '') + '">' +
         '<div class="dr-swap-label dr-swap-label-out">Out</div>' +
         missingCutNotice +
         '<div class="dr-card-image' + (missingCut ? ' dr-card-image-empty' : '') + '"><img data-dr-img-out src="" alt="Card out"></div>' +
         '<select data-dr-cut-select></select>' +
         '<button type="button" class="dr-btn dr-btn-ghost dr-never-btn" data-dr-never-out' + neverBtnAttrs + '>Never suggest again</button>' +
         '</div>' +
         '</div>' +
         '<div class="dr-actions">' +
         '<button type="button" class="dr-btn dr-btn-ghost" data-dr-action="skip">Skip</button>' +
         '<button type="button" class="dr-btn dr-btn-danger" data-dr-action="reject">Reject</button>' +
         '<button type="button" class="dr-btn dr-btn-success" data-dr-action="accept">Accept</button>' +
         '</div></div>';
   }

   function populateCutSelect(cutSelect, deck, suggestion, cutOptions) {
      var outDefaults = defaultOutKeyForSuggestion(deck, suggestion);
      var defaultOut = outDefaults.defaultOut;
      var defaultOutKey = outDefaults.defaultOutKey;
      var missingCut = isMissingSuggestedCut(suggestion);

      if (missingCut) {
         var placeholder = document.createElement('option');
         placeholder.value = '';
         placeholder.textContent = 'No cut suggested — choose manually';
         placeholder.selected = true;
         placeholder.dataset.name = '';
         cutSelect.appendChild(placeholder);
      }

      cutOptions.forEach(function (opt) {
         var o = document.createElement('option');
         o.value = optionKey(opt);
         o.textContent = optionLabel(opt);
         o.dataset.name = opt.name;
         if (opt.set_code) {
            o.dataset.setCode = opt.set_code;
         }
         if (opt.collector_number) {
            o.dataset.collectorNumber = opt.collector_number;
         }
         if (!missingCut && (optionKey(opt) === defaultOutKey || (!defaultOutKey && opt.name === defaultOut))) {
            o.selected = true;
         }
         cutSelect.appendChild(o);
      });

      if (!cutOptions.length && defaultOut) {
         var snap = findSnapshotCard(deck, defaultOut);
         var fallback = document.createElement('option');
         fallback.value = optionKey({ name: defaultOut, set_code: snap && snap.set_code, collector_number: snap && snap.collector_number });
         fallback.textContent = optionLabel({ name: defaultOut, set_code: snap && snap.set_code, collector_number: snap && snap.collector_number });
         fallback.dataset.name = defaultOut;
         if (snap && snap.set_code) {
            fallback.dataset.setCode = snap.set_code;
         }
         if (snap && snap.collector_number) {
            fallback.dataset.collectorNumber = snap.collector_number;
         }
         fallback.selected = true;
         cutSelect.appendChild(fallback);
      }
   }

   async function mountSuggestionCard(cardEl, deck, suggestion, cutOptions, advanceOnAction) {
      var cutSelect = cardEl.querySelector('[data-dr-cut-select]');
      var imgOut = cardEl.querySelector('[data-dr-img-out]');
      populateCutSelect(cutSelect, deck, suggestion, cutOptions);
      updateOutImage(cutSelect, imgOut, deck);
      cutSelect.addEventListener('change', function () {
         updateOutImage(cutSelect, imgOut, deck);
      });

      var printSelect = cardEl.querySelector('[data-dr-print-select]');
      var imgIn = cardEl.querySelector('[data-dr-img-in]');
      try {
         var prints = await fetchPrintings(suggestion.card.name, suggestion.card.scryfall_id);
         printSelect.innerHTML = '';
         prints.forEach(function (p) {
            var o = document.createElement('option');
            o.value = p.id;
            o.textContent = printingLabel(p);
            if (p.id === suggestion.card.scryfall_id) {
               o.selected = true;
            }
            printSelect.appendChild(o);
         });
         if (!prints.length) {
            printSelect.innerHTML = '<option value="' + escapeHtml(suggestion.card.scryfall_id) + '">' +
               escapeHtml(suggestion.card.set_code + ' #' + suggestion.card.collector_number) + '</option>';
         }
      } catch (err) {
         printSelect.innerHTML = '<option value="' + escapeHtml(suggestion.card.scryfall_id) + '">' +
            escapeHtml(suggestion.card.set_code + ' #' + suggestion.card.collector_number) + ' (default)</option>';
      }

      updateInImage(printSelect, imgIn);
      printSelect.addEventListener('change', function () {
         updateInImage(printSelect, imgIn);
      });

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
      var printSelect = cardEl.querySelector('[data-dr-print-select]');
      var cutSelect = cardEl.querySelector('[data-dr-cut-select]');
      if (accepted.card_in && accepted.card_in.scryfall_id && printSelect) {
         printSelect.value = accepted.card_in.scryfall_id;
         updateInImage(printSelect, cardEl.querySelector('[data-dr-img-in]'));
      }
      if (accepted.card_out && accepted.card_out.name && cutSelect) {
         var outKey = optionKey({
            name: accepted.card_out.name,
            set_code: accepted.card_out.set_code,
            collector_number: accepted.card_out.collector_number
         });
         for (var i = 0; i < cutSelect.options.length; i++) {
            if (cutSelect.options[i].value === outKey) {
               cutSelect.selectedIndex = i;
               break;
            }
         }
         updateOutImage(cutSelect, cardEl.querySelector('[data-dr-img-out]'), deck);
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

   function viewToolbarHtml() {
      return '<div class="dr-view-toolbar">' +
         '<button type="button" class="dr-btn dr-btn-ghost" id="dr-toggle-view">' +
         (state.showAllMode ? 'One at a time' : 'Show all') +
         '</button></div>';
   }

   function renderSwapPanel(deck) {
      var sq = deck.analysis && deck.analysis.swap_queue;
      if (!sq) {
         state.ui.swapPanel.innerHTML = '';
         state.ui.swapPanel.hidden = true;
         return;
      }
      state.ui.swapPanel.hidden = false;
      var inList = (sq.new_set_in || []).map(function (n) { return '<li>' + escapeHtml(n) + '</li>'; }).join('') || '<li><em>empty</em></li>';
      var outList = (sq.new_set_out || []).map(function (n) { return '<li>' + escapeHtml(n) + '</li>'; }).join('') || '<li><em>empty</em></li>';
      var flags = (sq.metadata_flags || []).map(function (f) { return '<div>' + escapeHtml(f) + '</div>'; }).join('');
      state.ui.swapPanel.innerHTML =
         '<h3>Swap queue</h3>' +
         '<div class="dr-swap-cols">' +
         '<div><strong>In</strong><ul>' + inList + '</ul></div>' +
         '<div><strong>Out</strong><ul>' + outList + '</ul></div>' +
         '</div>' +
         (flags ? '<div class="dr-flags">' + flags + '</div>' : '');
   }

   async function renderSuggestionPanel() {
      hideError();
      var deck = getDeckById(state.activeDeckId);
      if (!deck) {
         state.ui.suggestionPanel.innerHTML = '<div class="dr-empty">Select a deck.</div>';
         return;
      }

      renderSwapPanel(deck);

      if (state.showAllMode) {
         var allSuggestions = allVisibleSuggestions(deck);
         if (!allSuggestions.length) {
            state.ui.suggestionPanel.innerHTML = viewToolbarHtml() +
               '<div class="dr-empty">No suggestions for ' + escapeHtml(deck.deck_name) + '.</div>';
            wireViewToggle();
            return;
         }

         state.ui.suggestionPanel.innerHTML = viewToolbarHtml() +
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
         state.ui.suggestionPanel.innerHTML = viewToolbarHtml() +
            '<div class="dr-empty">All suggestions reviewed for ' + escapeHtml(deck.deck_name) + '.</div>';
         wireViewToggle();
         return;
      }

      var decision = getDecision(suggestion.suggestion_id);
      state.ui.suggestionPanel.innerHTML = viewToolbarHtml() +
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
         renderAcceptedPanel();
         return;
      }
      HubStorage.saveReviewProgress(state.fileId, state.progress);
      applyCardDecisionUi(cardEl, status);
      renderDeckList();
      renderAcceptedPanel();
   }

   function acceptSuggestionFromCard(deck, suggestion, cardEl, advanceOnAction) {
      var printSelect = cardEl.querySelector('[data-dr-print-select]');
      var cutSelect = cardEl.querySelector('[data-dr-cut-select]');
      var qty = 1;

      var selectedPrintId = printSelect.value;
      var prints = state.printCache[(suggestion.card.name || '').toLowerCase()] || [];
      var print = prints.find(function (p) { return p.id === selectedPrintId; }) || suggestion.card;
      var cardIn = printingToCardIn(print, suggestion.card);

      var cutMeta = readCutOption(cutSelect);
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
            quantity: 1,
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
         renderAcceptedPanel();
         return;
      }
      HubStorage.saveReviewProgress(state.fileId, state.progress);
      applyCardDecisionUi(cardEl, 'accepted');
      renderDeckList();
      renderAcceptedPanel();
   }

   function renderAcceptedPanel() {
      var deck = getDeckById(state.activeDeckId);
      if (!deck) {
         state.ui.acceptedPanel.innerHTML = '';
         return;
      }
      var accepted = acceptedForDeck(deck.deck_id);
      if (!accepted.length) {
         state.ui.acceptedPanel.innerHTML = '<h3>Accepted swaps</h3><p class="dr-empty">None yet for this deck.</p>';
         return;
      }

      var items = accepted.map(function (a) {
         var outName = a.card_out && a.card_out.name ? a.card_out.name : '(none)';
         return '<div class="dr-accepted-item"><strong>' + escapeHtml(a.card_in.name) + '</strong> (' +
            escapeHtml(a.card_in.set_code) + ') → ' + escapeHtml(outName) + '</div>';
      }).join('');

      var importText = ArchidektExport.buildImportTextForDeck(accepted);

      state.ui.acceptedPanel.innerHTML =
         '<h3>Accepted (' + accepted.length + ')</h3>' +
         items +
         '<div class="dr-import-box">' +
         '<div class="dr-toolbar" style="margin-top:12px">' +
         '<button type="button" class="dr-btn dr-btn-primary" id="dr-copy-import">Copy Import Text</button>' +
         '<button type="button" class="dr-btn dr-btn-ghost" id="dr-copy-manifest">Copy Apply Manifest</button>' +
         '<a class="dr-btn dr-btn-ghost" href="' + escapeHtml(deck.archidekt_url) + '" target="_blank" rel="noopener">Open in Archidekt</a>' +
         '</div>' +
         '<textarea id="dr-import-text" readonly>' + escapeHtml(importText) + '</textarea>' +
         '<p class="dr-import-hint">On Archidekt: open deck → Import → paste → Save Changes. Uses `New Set In` / `New Set Out` categories.</p>' +
         '</div>';

      document.getElementById('dr-copy-import').addEventListener('click', async function () {
         await ArchidektExport.copyText(importText);
         this.textContent = 'Copied!';
         var btn = this;
         setTimeout(function () { btn.textContent = 'Copy Import Text'; }, 1500);
      });

      document.getElementById('dr-copy-manifest').addEventListener('click', async function () {
         var manifest = ArchidektExport.buildApplyManifest(state.data.meta, allAcceptedByDeck());
         await ArchidektExport.copyText(JSON.stringify(manifest, null, 2));
         this.textContent = 'Copied!';
         var btn = this;
         setTimeout(function () { btn.textContent = 'Copy Apply Manifest'; }, 1500);
      });
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
      renderAcceptedPanel();
      renderProfilesNav();
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
         '<div class="dr-swap-panel" id="dr-swap-panel" hidden></div>' +
         '<div id="dr-suggestion-panel"></div>' +
         '<div class="dr-accepted-panel" id="dr-accepted-panel"></div>' +
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
         swapPanel: document.getElementById('dr-swap-panel'),
         suggestionPanel: document.getElementById('dr-suggestion-panel'),
         acceptedPanel: document.getElementById('dr-accepted-panel'),
         profilesSection: document.getElementById('dr-profiles-section'),
         connectProfilesBtn: document.getElementById('dr-connect-profiles'),
         profileStatusEl: document.getElementById('dr-profile-status'),
         prefCountsEl: document.getElementById('dr-pref-counts'),
         tabletProfilesNote: document.getElementById('dr-tablet-profiles-note')
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
