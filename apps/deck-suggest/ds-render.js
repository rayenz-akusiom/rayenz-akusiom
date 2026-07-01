(function (global) {
   'use strict';

   var DS = global.DeckSuggest;
   var state = DS.state;
   var escapeHtml = HubUtils.escapeHtml;

   function renderSetup() {
      var el = state.ui.setupEl;
      if (!el) {
         return;
      }
      var codes = state.settings.setCodes || '';
      var decks = state.deckSelection.decks || [];
      var selected = state.deckSelection.selectedIds || [];

      var html = '<h3>Setup</h3>' +
         '<label class="ds-field">Set codes (comma-separated)' +
         '<input type="text" id="ds-set-codes" value="' + escapeHtml(codes) + '" placeholder="MSH,MSC,MAR"></label>' +
         '<div class="ds-actions">' +
         '<button type="button" class="ds-btn" id="ds-fetch-set">Load set pool</button>' +
         '<label class="ds-btn ds-btn-ghost">Upload set JSON<input type="file" id="ds-set-upload" accept=".json" hidden></label>' +
         '</div>';

      if (state.setScope) {
         html += '<p class="ds-meta">Set pool: ' + escapeHtml(state.setScope.codes.join(', ')) +
            ' — ' + state.setScope.cards.length + ' cards (' + escapeHtml(state.setScope.source) + ')</p>';
      }

      html += '<label class="ds-field">Archidekt folder URL' +
         '<input type="text" id="ds-folder-url" value="' + escapeHtml(state.settings.folderUrl || '') + '"></label>' +
         '<div class="ds-actions">' +
         '<button type="button" class="ds-btn" id="ds-load-folder">Load decks</button>' +
         '<label class="ds-btn ds-btn-ghost">Upload deck JSON<input type="file" id="ds-deck-upload" accept=".json" hidden></label>' +
         '</div>';

      if (state.profilesConnected) {
         html += '<p class="ds-meta">Profiles directory connected.</p>';
      } else {
         html += '<p class="ds-meta">Connect profiles in Deck Review for role rules and blocklists.</p>';
      }

      if (decks.length) {
         html += '<fieldset class="ds-deck-list"><legend>Decks</legend>';
         decks.forEach(function (deck) {
            var checked = selected.indexOf(deck.deck_id) >= 0 ? ' checked' : '';
            html += '<label class="ds-deck-option"><input type="checkbox" name="ds-deck" value="' +
               escapeHtml(deck.deck_id) + '"' + checked + '> ' +
               escapeHtml(deck.deck_name) + '</label>';
         });
         html += '</fieldset>';
      }

      html += '<div class="ds-actions">' +
         '<button type="button" class="ds-btn ds-btn-primary" id="ds-generate"' +
         (state.busy ? ' disabled' : '') + '>Generate suggestions</button>' +
         '</div>';

      el.innerHTML = html;
      wireSetup();
   }

   function wireSetup() {
      var setCodesEl = document.getElementById('ds-set-codes');
      var folderEl = document.getElementById('ds-folder-url');

      document.getElementById('ds-fetch-set').addEventListener('click', function () {
         DS.hideError();
         var codes = (setCodesEl.value || '').split(/[,\s]+/).filter(Boolean);
         if (!codes.length) {
            DS.showError('Enter at least one set code.');
            return;
         }
         state.settings.setCodes = setCodesEl.value;
         HubStorage.saveDeckSuggestSettings(state.settings);
         DS.setStatus('Fetching Scryfall set pool…');
         DS.Data.fetchSetPool(codes).then(function (scope) {
            state.setScope = scope;
            DS.setStatus('Loaded ' + scope.cards.length + ' cards.');
            renderSetup();
         }).catch(function (err) {
            DS.showError(err.message || String(err));
            DS.setStatus('');
         });
      });

      document.getElementById('ds-set-upload').addEventListener('change', function (e) {
         var file = e.target.files && e.target.files[0];
         if (!file) {
            return;
         }
         var reader = new FileReader();
         reader.onload = function () {
            try {
               state.setScope = DS.Data.loadSetScopeFromUpload(JSON.parse(reader.result));
               renderSetup();
            } catch (err) {
               DS.showError(err.message || String(err));
            }
         };
         reader.readAsText(file);
      });

      document.getElementById('ds-load-folder').addEventListener('click', function () {
         DS.hideError();
         state.settings.folderUrl = folderEl.value.trim();
         HubStorage.saveDeckSuggestSettings(state.settings);
         DS.loadFolderDecks().catch(function (err) {
            DS.showError(err.message || String(err));
         });
      });

      document.getElementById('ds-deck-upload').addEventListener('change', function (e) {
         var file = e.target.files && e.target.files[0];
         if (!file) {
            return;
         }
         var reader = new FileReader();
         reader.onload = function () {
            try {
               var deck = JSON.parse(reader.result);
               deck.deck_id = deck.deck_id || 'upload-' + Date.now();
               state.deckSelection.decks = [deck];
               state.deckSelection.selectedIds = [deck.deck_id];
               renderSetup();
            } catch (err) {
               DS.showError(err.message || String(err));
            }
         };
         reader.readAsText(file);
      });

      document.querySelectorAll('input[name="ds-deck"]').forEach(function (input) {
         input.addEventListener('change', function () {
            var ids = [];
            document.querySelectorAll('input[name="ds-deck"]:checked').forEach(function (cb) {
               ids.push(cb.value);
            });
            state.deckSelection.selectedIds = ids;
         });
      });

      document.getElementById('ds-generate').addEventListener('click', function () {
         DS.hideError();
         DS.generateSuggestions().catch(function (err) {
            DS.showError(err.message || String(err));
            state.busy = false;
         });
      });
   }

   function filteredSuggestions(result) {
      var list = result.suggestions || [];
      var deckFilter = state.ui.filterDeck;
      var ruleFilter = state.ui.filterRule;
      var tierFilter = state.ui.filterTier;
      return list.filter(function (s) {
         if (deckFilter && result.deck.deck_id !== deckFilter) {
            return false;
         }
         if (tierFilter && s.priority_tier !== tierFilter) {
            return false;
         }
         if (ruleFilter) {
            var tags = Array.isArray(s.tags) ? s.tags : [s.tags];
            if (!tags.some(function (t) { return String(t).indexOf(ruleFilter) >= 0; })) {
               return false;
            }
         }
         return true;
      });
   }

   function renderResults() {
      var el = state.ui.resultsEl;
      if (!el || !state.generationRun) {
         return;
      }
      el.hidden = false;
      var run = state.generationRun;
      var html = '<h3>Results</h3>';

      if (run.taggerCoverage) {
         html += '<p class="ds-meta">Tagger coverage: ' + run.taggerCoverage.percent +
            '% (' + run.taggerCoverage.cardsWithTags + '/' + run.taggerCoverage.cardsResolved + ' cards)</p>';
      }

      html += '<details class="ds-audit"><summary>Rules executed</summary><ul>';
      (run.rulesExecuted || []).forEach(function (a) {
         html += '<li>' + escapeHtml(a.ruleId) + ' — ' + escapeHtml(a.deckId) +
            ': +' + a.suggestionsAdded;
         if (a.skippedReason) {
            html += ' (skipped: ' + escapeHtml(a.skippedReason) + ')';
         }
         html += '</li>';
      });
      html += '</ul></details>';

      html += '<div class="ds-filters">' +
         '<label>Rule <select id="ds-filter-rule"><option value="">All</option>' +
         '<option value="queue_in_pair">queue_in_pair</option>' +
         '<option value="queue_out_fill">queue_out_fill</option>' +
         '<option value="proxy_upgrade">proxy_upgrade</option>' +
         '<option value="role_synergy">role_synergy</option></select></label>' +
         '<label>Tier <select id="ds-filter-tier"><option value="">All</option>' +
         '<option value="swap">swap</option><option value="normal">normal</option></select></label>' +
         '</div>';

      html += '<div class="ds-actions"><button type="button" class="ds-btn" id="ds-download">Download JSON</button></div>';

      run.deckResults.forEach(function (result) {
         html += '<div class="ds-deck-result">';
         html += '<h4>' + escapeHtml(result.deck.deck_name) + '</h4>';
         if (result.error) {
            html += '<p class="ds-error-inline">' + escapeHtml(result.error) + '</p>';
         } else if (result.skipped) {
            html += '<p class="ds-meta">' + escapeHtml(result.message || result.skip_reason) + '</p>';
         } else if (!(result.suggestions || []).length) {
            html += '<p class="ds-meta">No suggestions matched rules (rules still evaluated).</p>';
         } else {
            filteredSuggestions(result).forEach(function (s) {
               var rep = s.replaces && s.replaces[0];
               html += '<div class="ds-suggestion">' +
                  '<span class="ds-tier ds-tier-' + escapeHtml(s.priority_tier || 'normal') + '">' +
                  escapeHtml(s.priority_tier || 'normal') + '</span> ' +
                  '<strong>' + escapeHtml(s.card.name) + '</strong>';
               if (rep && rep.name) {
                  html += ' → cut ' + escapeHtml(rep.name);
               }
               html += '<br><span class="ds-meta">' + escapeHtml(s.rationale || '') + '</span>';
               html += '<br><span class="ds-meta">Rule: ' + escapeHtml((s.tags || []).join(', ')) +
                  ' · ' + escapeHtml(s.confidence || '') + '</span></div>';
            });
         }
         html += '</div>';
      });

      el.innerHTML = html;

      document.getElementById('ds-download').addEventListener('click', function () {
         try {
            DS.Export.downloadJson(state);
         } catch (err) {
            DS.showError(err.message || String(err));
         }
      });

      var ruleSel = document.getElementById('ds-filter-rule');
      var tierSel = document.getElementById('ds-filter-tier');
      ruleSel.value = state.ui.filterRule || '';
      tierSel.value = state.ui.filterTier || '';
      ruleSel.addEventListener('change', function () {
         state.ui.filterRule = ruleSel.value;
         renderResults();
      });
      tierSel.addEventListener('change', function () {
         state.ui.filterTier = tierSel.value;
         renderResults();
      });
   }

   DS.Render = {
      renderSetup: renderSetup,
      renderResults: renderResults
   };
})(window);
