(function (global) {
   'use strict';

   var DS = global.DeckSuggest;
   var state = DS.state;
   var escapeHtml = HubUtils.escapeHtml;

   function updateActionBar() {
      var generateBtn = document.getElementById('ds-generate');
      var reqEl = state.ui.requirementsEl || document.getElementById('ds-requirements');
      if (generateBtn) {
         var readiness = DS.getGenerateReadiness(state);
         generateBtn.disabled = !readiness.ok;
         if (reqEl) {
            reqEl.innerHTML = readiness.items.map(function (item) {
               var cls = item.ok ? 'ds-req-ok' : 'ds-req-missing';
               return '<li class="' + cls + '">' + escapeHtml(item.label) + '</li>';
            }).join('');
         }
      }

      var hasRun = !!state.generationRun;
      var canReview = hasRun && DS.Export.hasReviewableSuggestions(state);
      var reviewBtn = document.getElementById('ds-review-handoff');
      if (reviewBtn) {
         reviewBtn.disabled = !canReview;
         reviewBtn.setAttribute('aria-disabled', canReview ? 'false' : 'true');
         reviewBtn.title = canReview ? '' : 'Generate suggestions with at least one match first';
      }
      var downloadBtn = document.getElementById('ds-download');
      if (downloadBtn) {
         downloadBtn.disabled = !hasRun;
      }
   }

   function updateGenerateBar() {
      updateActionBar();
   }

   function renderSetup() {
      var el = state.ui.setupEl;
      if (!el) {
         return;
      }
      var codes = state.ui.setCodesInput != null ? state.ui.setCodesInput : (state.settings.setCodes || '');
      var decks = state.deckSelection.decks || [];
      var selected = state.deckSelection.selectedIds || [];

      var html = '<h3>Setup</h3>' +
         '<p class="ds-meta"><a href="#/settings/deck-suggest">Open Deck Suggest settings</a> for folder URL, set codes, and debug prefs.</p>' +
         '<label class="ds-field">Set codes (comma-separated)' +
         '<input type="text" id="ds-set-codes" value="' + escapeHtml(codes) + '" placeholder="MSH,MSC,MAR"></label>' +
         '<div class="ds-actions">' +
         '<button type="button" class="ds-btn" id="ds-fetch-set">Load set pool</button>' +
         '<label class="ds-btn ds-btn-ghost">Upload set JSON<input type="file" id="ds-set-upload" accept=".json" hidden></label>' +
         '</div>';

      if (state.setScope) {
         var cacheNote = state.setScope.fromCache ? ' (cached)' : '';
         html += '<p class="ds-meta">Set pool: ' + escapeHtml(state.setScope.codes.join(', ')) +
            ' — ' + state.setScope.cards.length + ' cards (' + escapeHtml(state.setScope.source) + cacheNote + ')</p>';
      }

      var deckTab = DS.resolveDeckLoadTab();
      var bridge = HubUtils.bridgeAvailable();
      var tabClass = function (name) {
         return 'ds-deck-load-tab' + (deckTab === name ? ' active' : '');
      };

      html += '<h4 class="ds-meta">Decks</h4>' +
         '<div class="ds-deck-load-tabs">' +
         '<button type="button" class="' + tabClass('folder') + '" data-deck-tab="folder"' +
         (bridge ? '' : ' disabled title="Requires Archidekt bridge"') + '>Folder</button>' +
         '<button type="button" class="' + tabClass('paste-import') + '" data-deck-tab="paste-import">Paste deck</button>' +
         '<button type="button" class="' + tabClass('paste-urls') + '" data-deck-tab="paste-urls">Paste URLs</button>' +
         '<button type="button" class="' + tabClass('upload') + '" data-deck-tab="upload">Upload JSON</button>' +
         '</div>';

      html += '<div class="ds-deck-load-pane" id="ds-deck-pane-folder"' + (deckTab === 'folder' ? '' : ' hidden') + '>' +
         '<label class="ds-field">Archidekt folder URL' +
         '<input type="text" id="ds-folder-url" value="' + escapeHtml(state.settings.folderUrl || '') + '"></label>' +
         '<div class="ds-actions">' +
         '<button type="button" class="ds-btn" id="ds-load-folder"' + (bridge ? '' : ' disabled') +
         '>Load decks</button></div>';
      if (!bridge) {
         html += '<p class="ds-meta">Install the Archidekt Deck Review Bridge userscript to load from a folder, or paste a deck import below.</p>';
      }
      html += '</div>';

      html += '<div class="ds-deck-load-pane" id="ds-deck-pane-paste-import"' + (deckTab === 'paste-import' ? '' : ' hidden') + '>' +
         '<label class="ds-field">Deck name (optional)' +
         '<input type="text" id="ds-paste-deck-name" value="' + escapeHtml(state.settings.pasteDeckName || '') + '"></label>' +
         '<label class="ds-field">Archidekt deck URL (optional, for profiles)' +
         '<input type="text" id="ds-paste-deck-url" value="' + escapeHtml(state.settings.pasteDeckUrl || '') + '"></label>' +
         '<label class="ds-field">Archidekt import text (one card per line)' +
         '<textarea id="ds-deck-import" placeholder="1x Sol Ring (cmm) 1 [Ramp]&#10;1x Lightning Bolt (mh2) 123 [Removal]">' +
         escapeHtml(state.settings.pasteDeckImport || '') + '</textarea></label>' +
         '<div class="ds-actions">' +
         '<button type="button" class="ds-btn" id="ds-load-import">Load deck</button>' +
         '</div></div>';

      html += '<div class="ds-deck-load-pane" id="ds-deck-pane-paste-urls"' + (deckTab === 'paste-urls' ? '' : ' hidden') + '>' +
         '<label class="ds-field">Archidekt deck URLs (one per line)' +
         '<textarea id="ds-deck-urls" placeholder="https://archidekt.com/decks/12345/my-deck">' +
         escapeHtml(state.settings.customDeckUrls || '') + '</textarea></label>' +
         '<div class="ds-actions">' +
         '<button type="button" class="ds-btn" id="ds-load-paste-urls">Load decks</button>' +
         '</div></div>';

      html += '<div class="ds-deck-load-pane" id="ds-deck-pane-upload"' + (deckTab === 'upload' ? '' : ' hidden') + '>' +
         '<div class="ds-actions">' +
         '<label class="ds-btn ds-btn-ghost">Upload deck JSON<input type="file" id="ds-deck-upload" accept=".json" hidden></label>' +
         '</div></div>';

      if (state.profilesConnected) {
         html += '<p class="ds-meta">Profiles directory connected.</p>';
      } else {
         html += '<p class="ds-meta">Connect profiles in Deck Review for roles and blocklists.</p>';
      }

      if (HubUtils.isLocalHub()) {
         var debugChecked = state.settings.rulesDebug ? ' checked' : '';
         html += '<fieldset class="ds-rules-debug-setup">' +
            '<legend>Developer</legend>' +
            '<label class="ds-deck-option">' +
            '<input type="checkbox" id="ds-rules-debug"' + debugChecked + '> Debug trace</label>' +
            '<p class="ds-meta">Local dev only — traces why cards did not match deck profile.</p>' +
            '</fieldset>';
      }

      if (decks.length) {
         html += '<fieldset class="ds-deck-list"><legend>Decks (' + decks.length + ')</legend>' +
            '<div class="ds-deck-select-actions">' +
            '<button type="button" id="ds-select-all-decks">Select all</button>' +
            '<button type="button" id="ds-clear-all-decks">Clear all</button>' +
            '</div>';
         decks.forEach(function (deck) {
            var checked = selected.indexOf(deck.deck_id) >= 0 ? ' checked' : '';
            html += '<label class="ds-deck-option"><input type="checkbox" name="ds-deck" value="' +
               escapeHtml(deck.deck_id) + '"' + checked + '> ' +
               escapeHtml(deck.deck_name) + '</label>';
         });
         html += '</fieldset>';
      }

      el.innerHTML = html;
      wireSetup();
      updateGenerateBar();
   }

   function wireSetup() {
      var setCodesEl = document.getElementById('ds-set-codes');
      var folderEl = document.getElementById('ds-folder-url');
      var deckUrlsEl = document.getElementById('ds-deck-urls');
      var deckImportEl = document.getElementById('ds-deck-import');
      var pasteDeckNameEl = document.getElementById('ds-paste-deck-name');
      var pasteDeckUrlEl = document.getElementById('ds-paste-deck-url');

      document.querySelectorAll('[data-deck-tab]').forEach(function (btn) {
         btn.addEventListener('click', function () {
            if (btn.disabled) {
               return;
            }
            var tab = btn.getAttribute('data-deck-tab');
            state.ui.deckLoadTab = tab;
            state.settings.deckLoadTab = tab;
            HubStorage.saveDeckSuggestSettings(state.settings);
            renderSetup();
         });
      });

      setCodesEl.addEventListener('input', function () {
         state.ui.setCodesInput = setCodesEl.value;
         updateGenerateBar();
      });

      document.getElementById('ds-fetch-set').addEventListener('click', function () {
         DS.hideError();
         var codes = DS.normalizeCodesInput(setCodesEl.value);
         if (!codes.length) {
            DS.showError('Enter at least one set code.');
            return;
         }
         state.ui.setCodesInput = setCodesEl.value;
         state.settings.setCodes = setCodesEl.value;
         HubStorage.saveDeckSuggestSettings(state.settings);
         var progress = state.ui.progress;
         if (progress) {
            progress.start({ label: 'Fetching Scryfall set pool…', indeterminate: true });
         }
         DS.Data.fetchSetPool(codes, { forceRefresh: true }).then(function (scope) {
            state.setScope = scope;
            if (progress) {
               progress.finish({ label: 'Loaded ' + scope.cards.length + ' cards from Scryfall.' });
            }
            renderSetup();
         }).catch(function (err) {
            DS.showError(err.message || String(err));
            if (progress) {
               progress.finish({ label: err.message || String(err), variant: 'error' });
            }
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

      var loadFolderBtn = document.getElementById('ds-load-folder');
      if (loadFolderBtn) {
         loadFolderBtn.addEventListener('click', function () {
            DS.hideError();
            state.settings.folderUrl = folderEl.value.trim();
            HubStorage.saveDeckSuggestSettings(state.settings);
            DS.loadFolderDecks().catch(function (err) {
               DS.showError(err.message || String(err));
            });
         });
      }

      var loadPasteUrlsBtn = document.getElementById('ds-load-paste-urls');
      if (loadPasteUrlsBtn && deckUrlsEl) {
         loadPasteUrlsBtn.addEventListener('click', function () {
            DS.hideError();
            state.settings.customDeckUrls = deckUrlsEl.value;
            HubStorage.saveDeckSuggestSettings(state.settings);
            try {
               DS.loadPastedDecks(deckUrlsEl.value);
            } catch (err) {
               DS.showError(err.message || String(err));
            }
         });
      }

      var loadImportBtn = document.getElementById('ds-load-import');
      if (loadImportBtn && deckImportEl) {
         loadImportBtn.addEventListener('click', function () {
            DS.hideError();
            state.settings.pasteDeckImport = deckImportEl.value;
            state.settings.pasteDeckName = pasteDeckNameEl ? pasteDeckNameEl.value.trim() : '';
            state.settings.pasteDeckUrl = pasteDeckUrlEl ? pasteDeckUrlEl.value.trim() : '';
            HubStorage.saveDeckSuggestSettings(state.settings);
            try {
               DS.loadPastedDeckImport(deckImportEl.value, {
                  deck_name: state.settings.pasteDeckName || undefined,
                  archidekt_url: state.settings.pasteDeckUrl || undefined
               });
            } catch (err) {
               DS.showError(err.message || String(err));
            }
         });
      }

      var deckUpload = document.getElementById('ds-deck-upload');
      if (deckUpload) {
         deckUpload.addEventListener('change', function (e) {
            var file = e.target.files && e.target.files[0];
            if (!file) {
               return;
            }
            var reader = new FileReader();
            reader.onload = function () {
               try {
                  var deck = JSON.parse(reader.result);
                  deck.deck_id = deck.deck_id || 'upload-' + Date.now();
                  DS.applyDeckList([deck]);
               } catch (err) {
                  DS.showError(err.message || String(err));
               }
            };
            reader.readAsText(file);
         });
      }

      var selectAllBtn = document.getElementById('ds-select-all-decks');
      if (selectAllBtn) {
         selectAllBtn.addEventListener('click', function () {
            state.deckSelection.selectedIds = (state.deckSelection.decks || []).map(function (d) {
               return d.deck_id;
            });
            renderSetup();
         });
      }

      var clearAllBtn = document.getElementById('ds-clear-all-decks');
      if (clearAllBtn) {
         clearAllBtn.addEventListener('click', function () {
            state.deckSelection.selectedIds = [];
            renderSetup();
         });
      }

      document.querySelectorAll('input[name="ds-deck"]').forEach(function (input) {
         input.addEventListener('change', function () {
            var ids = [];
            document.querySelectorAll('input[name="ds-deck"]:checked').forEach(function (cb) {
               ids.push(cb.value);
            });
            state.deckSelection.selectedIds = ids;
            updateGenerateBar();
         });
      });

      var rulesDebugEl = document.getElementById('ds-rules-debug');
      if (rulesDebugEl) {
         rulesDebugEl.addEventListener('change', function () {
            state.settings.rulesDebug = rulesDebugEl.checked;
            HubStorage.saveDeckSuggestSettings(state.settings);
         });
      }
   }

   function renderSummaryCard(summary) {
      if (!summary) {
         return '';
      }
      var html = '<div class="ds-summary">' +
         '<h4>Summary</h4>' +
         '<p class="ds-summary-total"><strong>' + summary.totalSuggestions + '</strong> suggestions' +
         ' (' + summary.totalSwap + ' swap · ' + summary.totalNormal + ' normal)</p>' +
         '<p class="ds-meta">Set ' + escapeHtml(summary.setCodes.join(', ')) +
         ' · ' + summary.poolSize + ' cards in pool</p>';
      if (summary.skippedQueueSlots > 0) {
         html += '<p class="ds-meta">Queue slots skipped (not in set scope): ' + summary.skippedQueueSlots + '</p>';
      }
      html += '</div>';
      return html;
   }

   function deckResultHasSuggestions(result) {
      return !result.error && !result.skipped && (result.suggestions || []).length > 0;
   }

   function renderSuggestionLine(s) {
      var rep = s.replaces && s.replaces[0];
      var html = '<div class="ds-suggestion">' +
         '<span class="ds-tier ds-tier-' + escapeHtml(s.priority_tier || 'normal') + '">' +
         escapeHtml(s.priority_tier || 'normal') + '</span> ' +
         '<strong>' + escapeHtml(s.card.name) + '</strong>';
      if (rep && rep.name) {
         html += ' → cut ' + escapeHtml(rep.name);
      }
      html += '<br><span class="ds-meta">' + escapeHtml(s.rationale || '') + '</span></div>';
      return html;
   }

   function renderDeckResultBlock(result, compact) {
      var html = '<div class="ds-deck-result' + (compact ? ' ds-deck-result-compact' : '') + '">';
      html += '<h4>' + escapeHtml(result.deck.deck_name) + '</h4>';
      if (result.error) {
         html += '<p class="ds-error-inline">' + escapeHtml(result.error) + '</p>';
      } else if (result.skipped) {
         html += '<p class="ds-meta">' + escapeHtml(result.message || result.skip_reason) + '</p>';
      } else if (!(result.suggestions || []).length) {
         html += '<p class="ds-meta">No suggestions matched deck profile.</p>';
      } else if (!compact) {
         (result.suggestions || []).forEach(function (s) {
            html += renderSuggestionLine(s);
         });
      }
      html += '</div>';
      return html;
   }

   function collectDebugEntries(run, filterText) {
      var entries = [];
      (run.deckResults || []).forEach(function (result) {
         var trace = result.debugTrace || [];
         trace.forEach(function (entry) {
            entries.push({
               deckId: result.deck.deck_id,
               deckName: result.deck.deck_name,
               entry: entry
            });
         });
      });
      if (!filterText) {
         return entries;
      }
      var needle = String(filterText).trim().toLowerCase();
      if (!needle) {
         return entries;
      }
      return entries.filter(function (row) {
         var e = row.entry;
         return [e.subject, e.cardIn, e.cardOut].some(function (field) {
            return field && String(field).toLowerCase().indexOf(needle) >= 0;
         });
      });
   }

   function renderRulesDebugPanel(run) {
      if (!HubUtils.isLocalHub() || !state.settings.rulesDebug || !DS.Debug) {
         return '';
      }
      var rows = collectDebugEntries(run, '');
      var html = '<details class="ds-rules-debug">' +
         '<summary>Debug trace (' + rows.length + ')</summary>' +
         '<div class="ds-rules-debug-body">' +
         '<label class="ds-field">Filter card' +
         '<input type="text" id="ds-debug-filter" placeholder="Card name…"></label>';

      var deckOptions = (run.deckResults || []).map(function (result) {
         return '<option value="' + escapeHtml(result.deck.deck_id) + '">' +
            escapeHtml(result.deck.deck_name) + '</option>';
      }).join('');
      if (deckOptions) {
         html += '<div class="ds-rules-debug-explain">' +
            '<label class="ds-field">Explain card' +
            '<select id="ds-debug-explain-deck">' + deckOptions + '</select>' +
            '<input type="text" id="ds-debug-explain-card" placeholder="Card name…">' +
            '<button type="button" class="ds-btn" id="ds-debug-explain-btn">Explain</button></label>' +
            '<div id="ds-debug-explain-out" class="ds-rules-debug-explain-out"></div></div>';
      }

      html += '<ul class="ds-rules-debug-list" id="ds-debug-trace">';
      rows.forEach(function (row) {
         html += '<li class="ds-rules-debug-item ds-rules-debug-' + escapeHtml(row.entry.outcome || 'info') + '">' +
            '<span class="ds-meta">' + escapeHtml(row.deckName) + '</span> ' +
            escapeHtml(DS.Debug.formatReason(row.entry)) + '</li>';
      });
      if (!rows.length) {
         html += '<li class="ds-meta">No trace entries — re-run Generate with debug enabled.</li>';
      }
      html += '</ul></div></details>';
      return html;
   }

   function wireRulesDebugPanel(run) {
      var filterEl = document.getElementById('ds-debug-filter');
      var listEl = document.getElementById('ds-debug-trace');
      if (filterEl && listEl) {
         filterEl.addEventListener('input', function () {
            var rows = collectDebugEntries(run, filterEl.value);
            listEl.innerHTML = rows.map(function (row) {
               return '<li class="ds-rules-debug-item ds-rules-debug-' + escapeHtml(row.entry.outcome || 'info') + '">' +
                  '<span class="ds-meta">' + escapeHtml(row.deckName) + '</span> ' +
                  escapeHtml(DS.Debug.formatReason(row.entry)) + '</li>';
            }).join('') || '<li class="ds-meta">No matching entries.</li>';
         });
      }

      var explainBtn = document.getElementById('ds-debug-explain-btn');
      if (explainBtn && state.setScope) {
         explainBtn.addEventListener('click', function () {
            var deckId = document.getElementById('ds-debug-explain-deck').value;
            var cardName = document.getElementById('ds-debug-explain-card').value;
            var outEl = document.getElementById('ds-debug-explain-out');
            var result = (run.deckResults || []).find(function (r) {
               return r.deck.deck_id === deckId;
            });
            if (!result || !outEl) {
               return;
            }
            var lines = DS.Debug.explainCard(result.deck, state.setScope, cardName);
            if (!lines.length) {
               outEl.innerHTML = '<p class="ds-meta">No profile paths found for that card.</p>';
               return;
            }
            outEl.innerHTML = '<ul class="ds-rules-debug-list">' + lines.map(function (line) {
               return '<li class="ds-rules-debug-item ds-rules-debug-' + escapeHtml(line.outcome || 'info') + '">' +
                  escapeHtml(DS.Debug.formatReason(line)) + '</li>';
            }).join('') + '</ul>';
         });
      }
   }

   function renderResults() {
      var contentEl = state.ui.resultsContentEl;
      var placeholderEl = state.ui.resultsPlaceholderEl;
      if (!contentEl || !state.generationRun) {
         return;
      }
      if (placeholderEl) {
         placeholderEl.hidden = true;
      }
      contentEl.hidden = false;

      var run = state.generationRun;
      var summary = DS.Export.buildSummary(state);
      var html = '<h3>Results</h3>';

      html += renderSummaryCard(summary);

      var withSuggestions = [];
      var withoutSuggestions = [];
      (run.deckResults || []).forEach(function (result) {
         if (deckResultHasSuggestions(result)) {
            withSuggestions.push(result);
         } else {
            withoutSuggestions.push(result);
         }
      });

      withSuggestions.forEach(function (result) {
         html += renderDeckResultBlock(result, false);
      });

      if (withoutSuggestions.length) {
         html += '<details class="ds-no-suggestions">' +
            '<summary>No suggestions (' + withoutSuggestions.length + ')</summary>';
         withoutSuggestions.forEach(function (result) {
            html += renderDeckResultBlock(result, true);
         });
         html += '</details>';
      }

      html += renderRulesDebugPanel(run);

      contentEl.innerHTML = html;
      wireRulesDebugPanel(run);
      updateActionBar();
   }

   DS.Render = {
      renderSetup: renderSetup,
      renderResults: renderResults,
      updateActionBar: updateActionBar,
      updateGenerateBar: updateGenerateBar
   };
})(window);
