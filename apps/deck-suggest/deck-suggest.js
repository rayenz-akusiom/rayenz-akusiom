(function (global) {
   'use strict';

   var DS = global.DeckSuggest || (global.DeckSuggest = {});
   var state = DS.state = {
      setScope: null,
      deckSelection: { folderUrl: '', decks: [], selectedIds: [] },
      profilesConnected: false,
      generationRun: null,
      ui: { setCodesInput: '' },
      settings: HubStorage.loadDeckSuggestSettings(),
      statusMessage: '',
      generating: false
   };

   var escapeHtml = HubUtils.escapeHtml;
   var setStatus = DS.setStatus = function (msg) {
      state.statusMessage = msg || '';
   };

   function normalizeCodesInput(input) {
      return (String(input || '').split(/[,\s]+/).filter(Boolean).map(function (c) {
         return String(c).trim().toUpperCase();
      }));
   }

   function getGenerateReadiness(st) {
      st = st || state;
      var items = [];
      var missing = [];
      var codesInput = st.ui.setCodesInput != null ? st.ui.setCodesInput : (st.settings.setCodes || '');
      var inputCodes = normalizeCodesInput(codesInput);
      var inputKey = HubStorage.normalizeSetCodesKey(inputCodes);

      if (st.setScope && st.setScope.complete === true) {
         var scopeKey = st.setScope.codesKey || HubStorage.normalizeSetCodesKey(st.setScope.codes);
         var codesMatch = scopeKey === inputKey;
         var cacheLabel = st.setScope.source === 'scryfall' && st.setScope.fromCache ? ' (cached)' : '';
         if (codesMatch) {
            items.push({
               id: 'set',
               ok: true,
               label: 'Set pool loaded — ' + st.setScope.cards.length + ' cards' + cacheLabel
            });
         } else {
            missing.push('set');
            items.push({
               id: 'set',
               ok: false,
               label: 'Set codes changed — reload set pool'
            });
         }
      } else {
         missing.push('set');
         items.push({ id: 'set', ok: false, label: 'Load set pool' });
      }

      if ((st.deckSelection.decks || []).length > 0) {
         items.push({
            id: 'decks',
            ok: true,
            label: (st.deckSelection.decks.length) + ' deck(s) available'
         });
      } else {
         missing.push('decks');
         items.push({ id: 'decks', ok: false, label: 'Load decks or paste a deck import' });
      }

      var selectedCount = (st.deckSelection.selectedIds || []).length;
      if (selectedCount > 0) {
         items.push({
            id: 'selection',
            ok: true,
            label: selectedCount + ' deck(s) selected'
         });
      } else {
         missing.push('selection');
         items.push({ id: 'selection', ok: false, label: 'Select at least one deck' });
      }

      var ok = !missing.length && !st.generating;
      return { ok: ok, missing: missing, items: items, generating: !!st.generating };
   }

   DS.getGenerateReadiness = getGenerateReadiness;

   function ensureCss() {
      HubUtils.ensureCss('apps/deck-suggest/deck-suggest.css', 'data-deck-suggest-css');
   }

   function rulesDebugEnabled() {
      return HubUtils.isLocalHub() && !!state.settings.rulesDebug;
   }

   function ensureDebugModule() {
      if (!HubUtils.isLocalHub() || (DS.Debug && DS.Debug.createCollector)) {
         return Promise.resolve();
      }
      if (document.querySelector('script[data-ds-rules-debug]')) {
         return new Promise(function (resolve) {
            var tries = 0;
            (function wait() {
               if (DS.Debug && DS.Debug.createCollector) {
                  resolve();
                  return;
               }
               tries += 1;
               if (tries > 50) {
                  resolve();
                  return;
               }
               setTimeout(wait, 10);
            })();
         });
      }
      return new Promise(function (resolve, reject) {
         var script = document.createElement('script');
         script.src = 'apps/deck-suggest/ds-rules-debug.js';
         script.setAttribute('data-ds-rules-debug', '1');
         script.onload = function () { resolve(); };
         script.onerror = function () { reject(new Error('Could not load rules debug module.')); };
         document.body.appendChild(script);
      });
   }

   function shellTemplate() {
      return '<div class="deck-suggest-app">' +
         '<div class="hub-sticky-chrome">' +
         '<header class="ds-header">' +
         '<div class="ds-header-top">' +
         '<div><h2>Deck Suggest</h2>' +
         '<p class="ds-meta">Profile-based replacement suggestions for Commander decks (no LLM).</p></div>' +
         '<div class="ds-action-bar">' +
         '<button type="button" class="ds-btn ds-btn-primary" id="ds-generate" disabled>Generate suggestions</button>' +
         '<button type="button" class="ds-btn ds-btn-primary" id="ds-review-handoff" disabled' +
         ' title="Generate suggestions with at least one match first">Review in Deck Review</button>' +
         '<button type="button" class="ds-btn" id="ds-download" disabled>Download JSON</button>' +
         '</div></div>' +
         '<p class="ds-requirements-label">Generate requires:</p>' +
         '<ul class="ds-requirements" id="ds-requirements"></ul>' +
         '</header>' +
         '<div class="hub-progress-host" id="ds-progress-host"></div>' +
         '</div>' +
         '<div class="ds-error" id="ds-error" hidden></div>' +
         '<div class="ds-body">' +
         '<section class="ds-panel" id="ds-results">' +
         '<p class="ds-meta ds-results-placeholder" id="ds-results-placeholder">Run Generate to see suggestions.</p>' +
         '<div id="ds-results-content" hidden></div>' +
         '</section>' +
         '<section class="ds-panel" id="ds-setup"></section>' +
         '</div></div>';
   }

   function wireActionBar() {
      var generateBtn = document.getElementById('ds-generate');
      if (!generateBtn || generateBtn.dataset.wired === '1') {
         if (generateBtn) {
            DS.Render.updateActionBar();
         }
         return;
      }
      generateBtn.dataset.wired = '1';
      generateBtn.addEventListener('click', function () {
         if (!getGenerateReadiness().ok) {
            return;
         }
         DS.hideError();
         DS.generateSuggestions().catch(function (err) {
            DS.showError(err.message || String(err));
            state.generating = false;
            if (state.ui.progress) {
               state.ui.progress.finish({ label: err.message || String(err), variant: 'error' });
            }
            DS.Render.updateActionBar();
         });
      });

      var reviewBtn = document.getElementById('ds-review-handoff');
      if (reviewBtn) {
         reviewBtn.addEventListener('click', function () {
            if (reviewBtn.disabled) {
               return;
            }
            DS.transferToDeckReview().catch(function (err) {
               DS.showError(err.message || String(err));
            });
         });
      }

      var downloadBtn = document.getElementById('ds-download');
      if (downloadBtn) {
         downloadBtn.addEventListener('click', function () {
            if (downloadBtn.disabled) {
               return;
            }
            try {
               DS.Export.downloadJson(state);
            } catch (err) {
               DS.showError(err.message || String(err));
            }
         });
      }

      DS.Render.updateActionBar();
   }

   async function runGenerationForDeck(deck, setScope) {
      await DS.Data.enrichDeckWithProfile(deck);
      DS.Data.attachProfileLists(deck);
      var eligibility = deck.eligibility || DS.Data.resolveDeckEligibility(deck);
      if (!eligibility.eligible) {
         return {
            deck: deck,
            skipped: true,
            skip_reason: eligibility.reason,
            message: eligibility.message,
            suggestions: [],
            audit: [],
            analysis: null
         };
      }
      deck.format = eligibility.format || 'commander';
      var output = DS.runRulesForDeck(deck, setScope, { debug: rulesDebugEnabled() });
      return {
         deck: deck,
         skipped: false,
         suggestions: output.suggestions,
         audit: output.audit,
         analysis: output.analysis,
         taggerCoverage: output.taggerCoverage,
         debugTrace: output.debugTrace
      };
   }

   async function generateSuggestions() {
      var readiness = getGenerateReadiness();
      if (!readiness.ok) {
         throw new Error('Complete setup requirements before generating.');
      }
      if (!state.setScope) {
         throw new Error('Load a set pool first.');
      }
      var selected = state.deckSelection.decks.filter(function (d) {
         return state.deckSelection.selectedIds.indexOf(d.deck_id) >= 0;
      });
      if (!selected.length) {
         throw new Error('Select at least one deck.');
      }
      state.generating = true;
      DS.Render.updateActionBar();
      var progress = state.ui.progress;
      if (progress) {
         progress.start({ label: 'Generating suggestions…' });
      }
      if (rulesDebugEnabled()) {
         await ensureDebugModule();
      }
      var deckResults = [];
      var allAudit = [];
      for (var i = 0; i < selected.length; i += 1) {
         var deck = selected[i];
         if (progress) {
            progress.update({
               current: i + 1,
               total: selected.length,
               label: 'Generating ' + (i + 1) + '/' + selected.length + ': ' + deck.deck_name + '…'
            });
         }
         try {
            if (!deck.deck_snapshot) {
               deck.deck_snapshot = await DS.Data.fetchDeckSnapshot(deck.archidekt_url);
            }
            var result = await runGenerationForDeck(deck, state.setScope);
            deckResults.push(result);
            (result.audit || []).forEach(function (a) {
               allAudit.push(a);
            });
         } catch (err) {
            deckResults.push({
               deck: deck,
               error: err.message || String(err),
               suggestions: [],
               audit: []
            });
         }
      }
      state.generationRun = {
         runId: new Date().toISOString(),
         rulesExecuted: allAudit,
         taggerCoverage: deckResults[0] && deckResults[0].taggerCoverage,
         deckResults: deckResults
      };
      state.generating = false;
      if (progress) {
         progress.finish({ label: 'Generated suggestions for ' + deckResults.length + ' deck(s).' });
      }
      DS.Render.updateActionBar();
      DS.Render.renderResults();
   }

   async function ensureHandoffSnapshots(payload) {
      var reviewable = (payload.decks || []).filter(function (d) {
         return (d.suggestions || []).length > 0;
      });
      for (var i = 0; i < reviewable.length; i += 1) {
         var exported = reviewable[i];
         if (exported.deck_snapshot && exported.deck_snapshot.cards && exported.deck_snapshot.cards.length) {
            continue;
         }
         var source = null;
         if (state.generationRun) {
            (state.generationRun.deckResults || []).forEach(function (result) {
               if (result.deck && result.deck.deck_id === exported.deck_id) {
                  source = result.deck;
               }
            });
         }
         if (source && source.deck_snapshot && source.deck_snapshot.cards && source.deck_snapshot.cards.length) {
            exported.deck_snapshot = source.deck_snapshot;
            continue;
         }
         if (HubUtils.bridgeAvailable() && exported.archidekt_url) {
            exported.deck_snapshot = await DS.Data.fetchDeckSnapshot(exported.archidekt_url);
            if (source) {
               source.deck_snapshot = exported.deck_snapshot;
            }
            continue;
         }
         throw new Error('Missing deck snapshot for ' + (exported.deck_name || exported.deck_id) +
            '. Load decks with the Archidekt bridge or upload deck JSON with a snapshot.');
      }
   }

   async function transferToDeckReview() {
      var payload = DS.Export.buildExport(state);
      var hasSuggestions = (payload.decks || []).some(function (d) {
         return (d.suggestions || []).length > 0;
      });
      if (!hasSuggestions) {
         throw new Error('No suggestions to review — adjust inputs or deck profile and generate again.');
      }
      await ensureHandoffSnapshots(payload);
      var snapSummary = HubUtils.handoffSnapshotSummary(payload);
      var handoffPayload = {
         data: payload,
         source: 'deck-suggest',
         savedAt: new Date().toISOString()
      };
      if (!HubStorage.saveReviewHandoff(handoffPayload)) {
         throw new Error('Could not store handoff. Use Download JSON and upload in Deck Review instead.');
      }
      HubRouter.navigate('#/deck-review');
   }

   function applyDeckList(decks) {
      decks = decks.slice().sort(function (a, b) {
         return String(a.deck_name).localeCompare(String(b.deck_name));
      });
      state.deckSelection.decks = decks;
      state.deckSelection.selectedIds = decks.map(function (d) {
         return d.deck_id;
      });
      DS.Render.renderSetup();
   }

   function normalizeDeckLoadTab(tab) {
      if (tab === 'paste') {
         return 'paste-urls';
      }
      return tab;
   }

   function resolveDeckLoadTab() {
      var tab = null;
      if (state.ui && state.ui.deckLoadTab) {
         tab = normalizeDeckLoadTab(state.ui.deckLoadTab);
      } else if (state.settings.deckLoadTab) {
         tab = normalizeDeckLoadTab(state.settings.deckLoadTab);
      } else {
         tab = HubUtils.bridgeAvailable() ? 'folder' : 'paste-import';
      }
      if (tab === 'folder' && !HubUtils.bridgeAvailable()) {
         return 'paste-import';
      }
      return tab;
   }

   async function loadFolderDecks() {
      var progress = state.ui.progress;
      if (progress) {
         progress.start({ label: 'Loading decks from folder…', indeterminate: true });
      }
      try {
         var decks = await DS.Data.loadDeckRegistry(state.settings.folderUrl);
         applyDeckList(decks);
         if (progress) {
            progress.finish({ label: 'Loaded ' + decks.length + ' deck(s) from folder.' });
         }
      } catch (err) {
         if (progress) {
            progress.finish({ label: err.message || String(err), variant: 'error' });
         }
         throw err;
      }
   }

   function loadPastedDecks(text) {
      var decks = DS.Data.parseDeckListFromText(text);
      applyDeckList(decks);
   }

   function loadPastedDeckImport(text, options) {
      var deck = DS.Data.buildDeckFromImportText(text, options || {});
      applyDeckList([deck]);
   }

   function showError(msg) {
      var el = state.ui.errorEl;
      if (el) {
         el.textContent = msg;
         el.hidden = !msg;
      }
   }

   function hideError() {
      showError('');
   }

   function restoreSetPoolFromSettings() {
      var codesInput = state.ui.setCodesInput || state.settings.setCodes || '';
      var codes = normalizeCodesInput(codesInput);
      if (!codes.length) {
         return;
      }
      var codesKey = HubStorage.normalizeSetCodesKey(codes);
      var scope = DS.Data.tryRestoreSetPool(codesKey);
      if (scope) {
         scope.fromCache = true;
         state.setScope = scope;
      }
   }

   async function loadDeckSuggestApp(root) {
      ensureCss();
      state.settings = HubStorage.loadDeckSuggestSettings();
      root.innerHTML = shellTemplate();
      state.ui = {
         errorEl: document.getElementById('ds-error'),
         setupEl: document.getElementById('ds-setup'),
         resultsEl: document.getElementById('ds-results'),
         resultsContentEl: document.getElementById('ds-results-content'),
         resultsPlaceholderEl: document.getElementById('ds-results-placeholder'),
         requirementsEl: document.getElementById('ds-requirements'),
         progressHostEl: document.getElementById('ds-progress-host'),
         progress: null,
         setCodesInput: state.settings.setCodes || '',
         deckLoadTab: null
      };
      if (state.ui.progressHostEl) {
         state.ui.progress = HubUtils.mountAppProgress(state.ui.progressHostEl, 'deck-suggest');
      }
      state.ui.deckLoadTab = resolveDeckLoadTab();
      restoreSetPoolFromSettings();
      wireActionBar();
      DS.Render.renderSetup();
      if (global.ProfileSync && ProfileSync.getProfilesDir) {
         ProfileSync.getProfilesDir().then(function (handle) {
            state.profilesConnected = !!handle;
            DS.Render.renderSetup();
         });
      }
   }

   DS.rulesDebugEnabled = rulesDebugEnabled;
   DS.ensureDebugModule = ensureDebugModule;
   DS.generateSuggestions = generateSuggestions;
   DS.loadFolderDecks = loadFolderDecks;
   DS.loadPastedDecks = loadPastedDecks;
   DS.loadPastedDeckImport = loadPastedDeckImport;
   DS.applyDeckList = applyDeckList;
   DS.resolveDeckLoadTab = resolveDeckLoadTab;
   DS.runGenerationForDeck = runGenerationForDeck;
   DS.transferToDeckReview = transferToDeckReview;
   DS.showError = showError;
   DS.hideError = hideError;
   DS.normalizeCodesInput = normalizeCodesInput;

   global.loadDeckSuggestApp = loadDeckSuggestApp;
})(window);
