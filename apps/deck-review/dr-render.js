(function (global) {
   'use strict';

   var DR = global.DeckReview;
   var state = DR.state;

   var BRIDGE_SCRIPT_URL = 'https://github.com/rayenz-akusiom/rayenz-hub/blob/main/monkey-scripts/archidekt-deck-review.user.js';

   var escapeHtml = HubUtils.escapeHtml;
   var optionKey = HubUtils.optionKey;
   var scryfallImageFromId = HubUtils.scryfallImageFromId;
   var bridgeAvailable = HubUtils.bridgeAvailable;
   var bridgeApplyAvailable = HubUtils.bridgeApplyAvailable;
   var sleep = HubUtils.sleep;

   var getDeckById = DR.getDeckById;
   var getDecision = DR.getDecision;
   var render = DR.render;
   var showError = DR.showError;
   var hideError = DR.hideError;
   var sortSuggestions = DR.sortSuggestions;

   var deriveSwapQueue = DR.deriveSwapQueue;
   var getSuggestionStaleness = DR.getSuggestionStaleness;
   var getSwapQueueReconciliation = DR.getSwapQueueReconciliation;
   var swapQueueListItem = DR.swapQueueListItem;
   var swapReconcileWarningHtml = DR.swapReconcileWarningHtml;
   var findSnapshotCard = DR.findSnapshotCard;
   var fetchPrintings = DR.fetchPrintings;
   var isMissingSuggestedCut = DR.isMissingSuggestedCut;
   var needsSuggestedCut = DR.needsSuggestedCut;
   var archidektApplyOpenUrl = DR.archidektApplyOpenUrl;

   var deckCutOptions = DR.deckCutOptions;
   var setPrintSelection = DR.setPrintSelection;
   var setCutSelection = DR.setCutSelection;
   var openPrintPicker = DR.openPrintPicker;
   var openCutPicker = DR.openCutPicker;

   var getDeckPreferences = DR.getDeckPreferences;
   var isSuggestionFiltered = DR.isSuggestionFiltered;
   var setProfileStatus = DR.setProfileStatus;
   var renderProfilesNav = DR.renderProfilesNav;
   var neverSuggestAgain = DR.neverSuggestAgain;

   var decisionStatusClass = DR.decisionStatusClass;
   var decisionStatusLabel = DR.decisionStatusLabel;
   var decisionRecapInOut = DR.decisionRecapInOut;
   var restoreAcceptedSelections = DR.restoreAcceptedSelections;
   var acceptedForDeck = DR.acceptedForDeck;
   var recordSuggestionDecision = DR.recordSuggestionDecision;
   var acceptSuggestionFromCard = DR.acceptSuggestionFromCard;

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
      var progress = state.ui.progress;
      if (btn) {
         btn.disabled = true;
      }
      if (progress) {
         progress.start({ label: 'Refreshing decks from Archidekt…' });
      }
      for (var i = 0; i < decks.length; i++) {
         if (progress) {
            progress.update({
               current: i + 1,
               total: decks.length,
               label: 'Refreshing Archidekt (' + (i + 1) + '/' + decks.length + '): ' + decks[i].deck_name + '…'
            });
         }
         try {
            await refreshDeckSnapshot(decks[i]);
         } catch (err) {
            if (progress) {
               progress.finish({
                  label: 'Refresh failed for ' + decks[i].deck_name + ': ' + (err.message || String(err)),
                  variant: 'error'
               });
            }
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
      if (progress) {
         progress.finish({ label: 'Refreshed ' + decks.length + ' decks from Archidekt.' });
      }
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
      var progress = state.ui.progress;
      if (btn) {
         btn.disabled = true;
      }
      if (progress) {
         progress.start({ label: 'Refreshing ' + deck.deck_name + '…', indeterminate: true });
      }
      try {
         await refreshDeckSnapshot(deck);
         if (progress) {
            progress.finish({ label: 'Refreshed ' + deck.deck_name + ' from Archidekt.' });
         }
         renderSuggestionPanel();
         renderDeckStatusCard(deck);
      } catch (err) {
         if (progress) {
            progress.finish({ label: err.message || String(err), variant: 'error' });
         }
      }
      if (btn) {
         btn.disabled = false;
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
      var cls = 'hub-deck-chip';
      if (deck.deck_id === state.activeDeckId) {
         cls += ' active';
      }
      if (counts.reviewed >= counts.total && counts.total > 0) {
         cls += ' done';
      }
      if (!deckSuggestionCount(deck)) {
         cls += ' empty';
      }
      return '<button type="button" class="' + cls + '" data-deck-id="' + escapeHtml(deck.deck_id) + '">' +
         escapeHtml(deck.deck_name) +
         '<span class="hub-deck-chip-count">' + counts.accepted + '/' + counts.total + '</span>' +
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
            '<div class="hub-deck-list">' +
            sortDecksByName(withoutSuggestions).map(renderDeckChip).join('') +
            '</div></details>';
      }

      state.ui.deckList.innerHTML = html;
      wireDeckListClicks();
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
         : ' disabled title="Profile updates require a configured Hub API or desktop Chrome on PC."';
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
         '<img data-dr-img-out alt="">' +
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
         if (state.transferSource === 'deck-suggest') {
            return archidektDeckLinkHtml(deck, 'View deck on Archidekt') +
               '<p class="dr-bridge-hint">Snapshot missing from Deck Suggest handoff — use Refresh or return to Deck Suggest.</p>';
         }
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
      var sourceLabel = (state.transferSource === 'deck-suggest' && deck.deck_snapshot)
         ? 'From Deck Suggest · as of ' + fetchedAt
         : 'From Archidekt · as of ' + fetchedAt;
      var refreshBtn = bridge
         ? '<button type="button" class="dr-btn dr-btn-ghost dr-swap-refresh" id="dr-refresh-deck-snapshot">Refresh</button>'
         : '';
      var bridgeHint = bridge
         ? ''
         : '<p class="dr-bridge-hint">Install the <a href="' + escapeHtml(BRIDGE_SCRIPT_URL) + '" target="_blank" rel="noopener">Archidekt Deck Review Bridge</a> userscript for live refresh.</p>';

      return '<div class="dr-swap-panel-meta">' +
         archidektDeckLinkHtml(deck, 'View deck') +
         '<span class="dr-swap-source">' + sourceLabel + '</span>' +
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

   DR.renderDeckList = renderDeckList;
   DR.renderSuggestionPanel = renderSuggestionPanel;
   DR.renderDeckStatusCard = renderDeckStatusCard;
   DR.refreshAllDeckSnapshots = refreshAllDeckSnapshots;
})(window);
