(function (global) {
   'use strict';

   var SUPPORTED_SCHEMAS = SuggestionsBundle.SUPPORTED_SCHEMAS;
   var CONFIDENCE_ORDER = { high: 0, medium: 1, low: 2 };
   var LATEST_URL = 'data/suggestions/latest.json';

   var DR = global.DeckReview || (global.DeckReview = {});

   var state = {
      data: null,
      fileId: null,
      progress: null,
      activeDeckId: null,
      suggestionIndex: 0,
      printCache: ScryfallCache.printCache,
      deckPrefs: {},
      profileStatus: '',
      profilesConnected: false,
      showAllMode: false,
      statusCardTab: 'decisions',
      transferSource: null,
      ui: {}
   };

   DR.state = state;

   var escapeHtml = HubUtils.escapeHtml;
   var bridgeAvailable = HubUtils.bridgeAvailable;

   function ensureCss() {
      HubUtils.ensureCss('apps/deck-review/deck-review.css', 'data-deck-review-css');
   }

   function normalizeSuggestion(suggestion) {
      return SuggestionsBundle.normalizeSuggestion(suggestion);
   }

   function validateSuggestions(data) {
      return SuggestionsBundle.validatePayload(data);
   }

   function sortSuggestions(suggestions) {
      return SuggestionsBundle.sortSuggestions(suggestions);
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
      applyHandoffStatus(state.data);
      showLoadedUi();
      render();
   }

   function applyHandoffStatus(data) {
      if (state.transferSource !== 'deck-suggest') {
         return;
      }
      var summary = HubUtils.handoffSnapshotSummary(data);
      if (summary.missingSnapshots > 0) {
         showError(summary.missingSnapshots + ' deck(s) missing snapshots — use Refresh from Archidekt (optional) or return to Deck Suggest.');
      } else if (summary.allReady) {
         hideError();
         if (global.DeckReview && DeckReview.setProfileStatus) {
            DeckReview.setProfileStatus('Ready to review — deck snapshots included from Deck Suggest.');
         }
      }
   }

   async function fetchLatest() {
      var resp = await fetch(LATEST_URL + '?t=' + Date.now());
      if (!resp.ok) {
         throw new Error('Could not fetch ' + LATEST_URL + ' (' + resp.status + ')');
      }
      var data = await resp.json();
      state.transferSource = 'latest';
      loadSuggestionsData(data);
   }

   function handleFileUpload(file) {
      var reader = new FileReader();
      reader.onload = function () {
         try {
            var data = JSON.parse(reader.result);
            state.transferSource = 'upload';
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

   function handoffSnapshotDate(data) {
      var dates = (data.decks || []).map(function (d) {
         return d.deck_snapshot && d.deck_snapshot.fetched_at;
      }).filter(Boolean);
      if (!dates.length) {
         return null;
      }
      dates.sort();
      return dates[dates.length - 1];
   }

   function render() {
      if (!state.data) {
         return;
      }
      hideError();
      var meta = state.data.meta;
      var metaHtml = '<strong>' + escapeHtml(meta.set_name) + '</strong> · ' + escapeHtml(meta.set_code) +
         ' · ' + escapeHtml(meta.generated_at) + ' · ' + state.data.decks.length + ' decks';
      if (state.transferSource === 'deck-suggest') {
         var snapDate = handoffSnapshotDate(state.data);
         var snapSummary = HubUtils.handoffSnapshotSummary(state.data);
         metaHtml += '<div class="dr-meta-notes">Transferred from Deck Suggest — review swaps deck by deck.';
         if (snapSummary.allReady) {
            metaHtml += ' Ready to review — snapshots included.';
         }
         if (snapDate) {
            metaHtml += ' Snapshots as of ' + escapeHtml(snapDate) + '.';
         }
         metaHtml += '</div>';
      } else if (meta.notes) {
         metaHtml += '<div class="dr-meta-notes">' + escapeHtml(meta.notes) + '</div>';
      }
      state.ui.metaEl.innerHTML = metaHtml;

      DR.renderDeckList();
      DR.renderSuggestionPanel();
      DR.renderProfilesNav();
      updateTransferNav();
      if (state.ui.refreshAllDecksBtn) {
         state.ui.refreshAllDecksBtn.disabled = !bridgeAvailable();
         if (state.transferSource === 'deck-suggest') {
            state.ui.refreshAllDecksBtn.textContent = 'Refresh from Archidekt (optional)';
            state.ui.refreshAllDecksBtn.title = bridgeAvailable()
               ? 'Snapshots loaded from Deck Suggest; refresh only if Archidekt changed since.'
               : 'Requires Archidekt Deck Review Bridge userscript';
         } else {
            state.ui.refreshAllDecksBtn.textContent = 'Refresh all decks';
            state.ui.refreshAllDecksBtn.title = bridgeAvailable()
               ? 'Fetch latest deck lists from Archidekt'
               : 'Requires Archidekt Deck Review Bridge userscript';
         }
      }
   }

   function shellTemplate() {
      return '<div class="deck-review-app">' +
         '<button type="button" id="dr-right-nav-toggle" class="dr-right-nav-toggle" aria-label="Open deck menu">&#9776;</button>' +
         '<div id="dr-right-nav-backdrop" class="dr-right-nav-backdrop"></div>' +
         '<div class="dr-layout">' +
         '<div class="dr-main-area">' +
         '<div class="hub-sticky-chrome">' +
         '<header class="dr-header">' +
         '<h2>Deck Review</h2>' +
         '<div class="dr-meta" id="dr-meta">Load set-update suggestions to review swaps deck by deck.</div>' +
         '</header>' +
         '<div class="hub-progress-host" id="dr-progress-host"></div>' +
         '</div>' +
         '<div class="dr-error" id="dr-error" hidden></div>' +
         '<div class="dr-body" id="dr-body">' +
         '<div class="dr-empty" id="dr-empty-state">Upload a suggestions JSON file, transfer from Deck Suggest, or click Refresh latest.</div>' +
         '<div id="dr-content" hidden>' +
         '<div class="dr-deck-status-card" id="dr-deck-status-card" hidden></div>' +
         '<div id="dr-suggestion-panel"></div>' +
         '</div></div></div>' +
         '<aside id="dr-right-nav" class="dr-right-nav" aria-label="Deck navigation">' +
         '<div class="dr-nav-actions">' +
         '<h3>Data</h3>' +
         '<button type="button" class="dr-btn dr-btn-primary" id="dr-fetch-latest">Refresh latest</button>' +
         '<button type="button" class="dr-btn dr-btn-ghost" id="dr-upload-btn">Upload JSON</button>' +
         '<button type="button" class="dr-btn dr-btn-ghost" id="dr-download-json" hidden>Download JSON</button>' +
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
         refreshDeckBtn: null,
         downloadJsonBtn: document.getElementById('dr-download-json'),
         progressHostEl: document.getElementById('dr-progress-host'),
         progress: null
      };

      if (state.ui.progressHostEl) {
         state.ui.progress = HubUtils.mountAppProgress(state.ui.progressHostEl, 'deck-review');
      }

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
      if (state.ui.downloadJsonBtn) {
         state.ui.downloadJsonBtn.addEventListener('click', function () {
            if (state.data) {
               HubUtils.downloadSuggestionsJson(state.data);
            }
         });
      }
      if (state.ui.refreshAllDecksBtn) {
         state.ui.refreshAllDecksBtn.addEventListener('click', function () {
            DR.refreshAllDeckSnapshots();
         });
      }
   }

   function updateTransferNav() {
      if (state.ui.downloadJsonBtn) {
         state.ui.downloadJsonBtn.hidden = state.transferSource !== 'deck-suggest';
      }
      if (state.ui.refreshAllDecksBtn && state.transferSource === 'deck-suggest') {
         state.ui.refreshAllDecksBtn.textContent = 'Refresh from Archidekt (optional)';
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
      var handoff = HubStorage.consumeReviewHandoff();
      if (handoff && handoff.data) {
         state.transferSource = handoff.source || 'handoff';
         loadSuggestionsData(handoff.data);
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
   DR.loadSuggestionsData = loadSuggestionsData;
   DR.updateTransferNav = updateTransferNav;

   global.loadDeckReviewApp = loadDeckReviewApp;
})(window);
