(function (global) {
   'use strict';

   var SUPPORTED_SCHEMAS = { '1.0': true, '1.1': true };
   var CONFIDENCE_ORDER = { high: 0, medium: 1, low: 2 };
   var LATEST_URL = 'data/suggestions/latest.json';

   var DR = global.DeckReview || (global.DeckReview = {});

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

   DR.state = state;

   var escapeHtml = HubUtils.escapeHtml;
   var bridgeAvailable = HubUtils.bridgeAvailable;

   function ensureCss() {
      HubUtils.ensureCss('apps/deck-review/deck-review.css', 'data-deck-review-css');
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

      DR.renderDeckList();
      DR.renderSuggestionPanel();
      DR.renderProfilesNav();
      if (state.ui.refreshAllDecksBtn) {
         state.ui.refreshAllDecksBtn.disabled = !bridgeAvailable();
         state.ui.refreshAllDecksBtn.title = bridgeAvailable()
            ? 'Fetch latest deck lists from Archidekt'
            : 'Requires Archidekt Deck Review Bridge userscript';
      }
   }

   function shellTemplate() {
      return '<div class="deck-review-app">' +
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
         '<div class="hub-deck-list" id="dr-deck-list"></div>' +
         '</div>' +
         '</aside></div></div>';
   }

   function renderEmptyShell(root) {
      ensureCss();
      root.innerHTML = shellTemplate();

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
                  DR.setProfileStatus('Profiles folder connected.');
                  DR.renderProfilesNav();
               })
               .catch(function (err) {
                  DR.setProfileStatus(err.message || String(err));
               });
         });
      }
      DR.updateProfilesConnectionStatus();
      DR.renderProfilesNav();

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
            DR.refreshAllDeckSnapshots();
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

   DR.getDeckById = getDeckById;
   DR.getDecision = getDecision;
   DR.setDecision = setDecision;
   DR.validateSuggestions = validateSuggestions;
   DR.sortSuggestions = sortSuggestions;
   DR.showError = showError;
   DR.hideError = hideError;
   DR.render = render;

   global.loadDeckReviewApp = loadDeckReviewApp;
})(window);
