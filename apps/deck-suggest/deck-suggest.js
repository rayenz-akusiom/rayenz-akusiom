(function (global) {
   'use strict';

   var DS = global.DeckSuggest || (global.DeckSuggest = {});
   var state = DS.state = {
      setScope: null,
      deckSelection: { folderUrl: '', decks: [], selectedIds: [] },
      profilesConnected: false,
      generationRun: null,
      ui: { filterDeck: '', filterRule: '', filterTier: '' },
      settings: HubStorage.loadDeckSuggestSettings(),
      statusMessage: '',
      busy: false
   };

   var escapeHtml = HubUtils.escapeHtml;
   var setStatus = DS.setStatus = function (msg) {
      state.statusMessage = msg || '';
      if (state.ui.statusEl) {
         state.ui.statusEl.textContent = state.statusMessage;
         state.ui.statusEl.hidden = !state.statusMessage;
      }
   };

   function ensureCss() {
      HubUtils.ensureCss('apps/deck-suggest/deck-suggest.css', 'data-deck-suggest-css');
   }

   function shellTemplate() {
      return '<div class="deck-suggest-app">' +
         '<header class="ds-header"><h2>Deck Suggest</h2>' +
         '<p class="ds-meta">Rule-based replacement suggestions for Commander decks (no LLM).</p>' +
         '<p class="ds-status" id="ds-status" hidden></p></header>' +
         '<div class="ds-error" id="ds-error" hidden></div>' +
         '<div class="ds-body">' +
         '<section class="ds-panel" id="ds-setup"></section>' +
         '<section class="ds-panel" id="ds-results" hidden></section>' +
         '</div></div>';
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
      var output = DS.runRulesForDeck(deck, setScope, {});
      return {
         deck: deck,
         skipped: false,
         suggestions: output.suggestions,
         audit: output.audit,
         analysis: output.analysis,
         taggerCoverage: output.taggerCoverage
      };
   }

   async function generateSuggestions() {
      if (!state.setScope) {
         throw new Error('Load a set pool first.');
      }
      var selected = state.deckSelection.decks.filter(function (d) {
         return state.deckSelection.selectedIds.indexOf(d.deck_id) >= 0;
      });
      if (!selected.length) {
         throw new Error('Select at least one deck.');
      }
      state.busy = true;
      setStatus('Generating…');
      var deckResults = [];
      var allAudit = [];
      for (var i = 0; i < selected.length; i += 1) {
         var deck = selected[i];
         setStatus('Generating ' + (i + 1) + '/' + selected.length + ': ' + deck.deck_name + '…');
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
      state.busy = false;
      setStatus('Generated suggestions for ' + deckResults.length + ' deck(s).');
      DS.Render.renderResults();
   }

   async function loadFolderDecks() {
      var decks = await DS.Data.loadDeckRegistry(state.settings.folderUrl);
      decks = decks.sort(function (a, b) {
         return String(a.deck_name).localeCompare(String(b.deck_name));
      });
      state.deckSelection.decks = decks;
      if (!state.deckSelection.selectedIds.length && decks.length) {
         state.deckSelection.selectedIds = [decks[0].deck_id];
      }
      DS.Render.renderSetup();
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

   async function loadDeckSuggestApp(root) {
      ensureCss();
      state.settings = HubStorage.loadDeckSuggestSettings();
      root.innerHTML = shellTemplate();
      state.ui = {
         statusEl: document.getElementById('ds-status'),
         errorEl: document.getElementById('ds-error'),
         setupEl: document.getElementById('ds-setup'),
         resultsEl: document.getElementById('ds-results')
      };
      DS.Render.renderSetup();
      if (global.ProfileSync && ProfileSync.getProfilesDir) {
         ProfileSync.getProfilesDir().then(function (handle) {
            state.profilesConnected = !!handle;
            DS.Render.renderSetup();
         });
      }
   }

   DS.generateSuggestions = generateSuggestions;
   DS.loadFolderDecks = loadFolderDecks;
   DS.runGenerationForDeck = runGenerationForDeck;
   DS.showError = showError;
   DS.hideError = hideError;

   global.loadDeckSuggestApp = loadDeckSuggestApp;
})(window);
