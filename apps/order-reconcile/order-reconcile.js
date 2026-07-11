(function (global) {
   'use strict';

   var ASSIGN_PHASE_ID = '__assign__';
   var STAGING_DECK_ID = '__staging__';

   var OR = global.OrderReconcile || (global.OrderReconcile = {});

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
      isProxyOrder: false,
      printCache: ScryfallCache.printCache,
      colorIdentityCache: {},
      progress: null,
      statusMessage: '',
      ui: {}
   };

   OR.state = state;
   OR.ASSIGN_PHASE_ID = ASSIGN_PHASE_ID;
   OR.STAGING_DECK_ID = STAGING_DECK_ID;

   var escapeHtml = HubUtils.escapeHtml;

   function ensureCss() {
      HubUtils.ensureCss('apps/order-reconcile/order-reconcile.css', 'data-order-reconcile-css');
   }

   function setStatus(msg) {
      state.statusMessage = msg || '';
      if (state.ui.statusEl) {
         state.ui.statusEl.textContent = state.statusMessage;
         state.ui.statusEl.hidden = !state.statusMessage;
      }
   }

   function showProgress(current, total, msg) {
      var progress = state.ui.progress;
      if (!progress) {
         return;
      }
      if (!progress.isActive() && !progress.isFinished()) {
         progress.start({ label: msg || 'Working…' });
      }
      progress.update({
         current: current,
         total: total,
         label: msg || ('Step ' + current + '/' + total + '…')
      });
   }

   function hideProgress() {
      if (state.ui.progress) {
         state.ui.progress.dismiss();
      }
   }

   function finishProgress(label, variant) {
      if (state.ui.progress) {
         state.ui.progress.finish({ label: label, variant: variant || 'success' });
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
         phase: state.phase,
         isProxyOrder: state.isProxyOrder
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
      if (state.progress.isProxyOrder !== undefined) {
         state.isProxyOrder = !!state.progress.isProxyOrder;
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

   function scrollToTop() {
      if (typeof window !== 'undefined' && window.scrollTo) {
         window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      }
   }

   function archidektDeckLinkHtml(deck) {
      if (!deck || !deck.archidekt_url) {
         return '';
      }
      return '<a class="or-deck-link" href="' + escapeHtml(deck.archidekt_url) +
         '" target="_blank" rel="noopener">Open on Archidekt ↗</a>';
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
         OR.renderInputPhase();
      } else if (state.phase === 'assign') {
         OR.renderAssignPhase();
      } else if (state.phase === 'staging') {
         OR.renderReconcilePhase();
      } else {
         OR.renderReconcilePhase();
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

   function shellTemplate() {
      return '<div class="order-reconcile-app">' +
         '<button type="button" id="or-right-nav-toggle" class="or-right-nav-toggle" aria-label="Open menu">&#9776;</button>' +
         '<div id="or-right-nav-backdrop" class="or-right-nav-backdrop"></div>' +
         '<div class="or-layout">' +
         '<div class="or-main-area">' +
         '<div class="hub-sticky-chrome">' +
         '<header class="or-header"><h2>Order Reconcile</h2>' +
         '<div class="or-meta">Match acquired cards to swap queues and update Archidekt decks.</div>' +
         '<div class="or-meta" id="or-status" hidden></div></header>' +
         '<div class="hub-progress-host" id="or-progress-host"></div>' +
         '</div>' +
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
   }

   function renderEmptyShell(root) {
      ensureCss();
      state.settings = HubStorage.loadOrderReconcileSettings();
      state.sessionId = 'session-' + new Date().toISOString().slice(0, 10);
      loadProgress();

      root.innerHTML = shellTemplate();

      state.ui = {
         statusEl: document.getElementById('or-status'),
         errorEl: document.getElementById('or-error'),
         emptyState: document.getElementById('or-empty-state'),
         content: document.getElementById('or-content'),
         mainContent: document.getElementById('or-main-content'),
         deckList: document.getElementById('or-deck-list'),
         progressHostEl: document.getElementById('or-progress-host'),
         progress: null
      };

      if (state.ui.progressHostEl) {
         state.ui.progress = HubUtils.mountAppProgress(state.ui.progressHostEl, 'order-reconcile');
      }

      initRightNav();

      document.getElementById('or-new-session').addEventListener('click', function () {
         state.phase = 'input';
         state.assignments = [];
         state.needsReview = [];
         state.copies = [];
         state.reconcileItems = [];
         state.acquiredCards = [];
         state.completedDecks = {};
         state.isProxyOrder = false;
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
         await OR.fetchAllSnapshots();
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

   OR.setStatus = setStatus;
   OR.showProgress = showProgress;
   OR.hideProgress = hideProgress;
   OR.finishProgress = finishProgress;
   OR.sortDecksByName = sortDecksByName;
   OR.showError = showError;
   OR.hideError = hideError;
   OR.saveProgress = saveProgress;
   OR.loadProgress = loadProgress;
   OR.getDecision = getDecision;
   OR.setDecision = setDecision;
   OR.getDeckById = getDeckById;
   OR.itemsForDeck = itemsForDeck;
   OR.scrollToTop = scrollToTop;
   OR.archidektDeckLinkHtml = archidektDeckLinkHtml;
   OR.render = render;

   global.loadOrderReconcileApp = loadOrderReconcileApp;
})(window);
