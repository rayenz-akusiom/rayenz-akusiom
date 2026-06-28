(function (global) {
   'use strict';

   var OR = global.OrderReconcile;
   var state = OR.state;
   var ASSIGN_PHASE_ID = OR.ASSIGN_PHASE_ID;
   var escapeHtml = HubUtils.escapeHtml;
   var setStatus = OR.setStatus;
   var showError = OR.showError;
   var hideError = OR.hideError;
   var saveProgress = OR.saveProgress;
   var render = OR.render;
   var fetchAllSnapshots = OR.fetchAllSnapshots;
   var buildAssignmentPlan = OR.buildAssignmentPlan;

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

   OR.parseInputToAcquired = parseInputToAcquired;
   OR.renderParsedTable = renderParsedTable;
   OR.wireParsedTable = wireParsedTable;
   OR.renderInputPhase = renderInputPhase;
   OR.continueToAssign = continueToAssign;
})(window);
