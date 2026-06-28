(function (global) {
   'use strict';

   var OR = global.OrderReconcile;
   var state = OR.state;
   var escapeHtml = HubUtils.escapeHtml;
   var bridgeApplyAvailable = HubUtils.bridgeApplyAvailable;
   var scryfallImageFromName = HubUtils.scryfallImageFromName;
   var scryfallImageFromPrinting = HubUtils.scryfallImageFromPrinting;
   var setStatus = OR.setStatus;
   var getDecision = OR.getDecision;
   var itemsForDeck = OR.itemsForDeck;
   var archidektDeckLinkHtml = OR.archidektDeckLinkHtml;

   function summaryCardImageSrc(card) {
      if (!card) {
         return '';
      }
      if (card.set_code && card.collector_number) {
         return scryfallImageFromPrinting(card.set_code, card.collector_number);
      }
      return scryfallImageFromName(card.name);
   }

   function summaryCardImgHtml(card) {
      if (!card) {
         return '<div class="or-summary-card or-summary-card-empty">No card</div>';
      }
      var src = summaryCardImageSrc(card);
      var title = escapeHtml(card.name || '');
      if (!src) {
         return '<div class="or-summary-card or-summary-card-empty" title="' + title + '">No card</div>';
      }
      return '<img class="or-summary-card" src="' + escapeHtml(src) + '" alt="' + title + '" title="' + title + '">';
   }

   function summaryGroupHtml(cards, emptyLabel) {
      if (!cards || !cards.length) {
         return '<div class="or-summary-group or-summary-group-empty"><span class="or-summary-group-empty-label">' +
            escapeHtml(emptyLabel || 'None') + '</span></div>';
      }
      return '<div class="or-summary-group">' +
         cards.map(function (c) { return summaryCardImgHtml(c); }).join('') +
         '</div>';
   }

   function summaryColHtml(label, cards) {
      return '<div class="or-summary-section-col">' +
         '<div class="or-summary-section-label">' + label + '</div>' +
         summaryGroupHtml(cards, 'None') +
         '</div>';
   }

   function summarySectionHtml(inCards, outCards) {
      var hasIn = !!(inCards && inCards.length);
      var hasOut = !!(outCards && outCards.length);
      // When only one side has cards, drop the empty column and the arrow so the
      // populated side fills the available width.
      if (hasIn && !hasOut) {
         return '<div class="or-summary-section or-summary-section-single">' +
            summaryColHtml('In', inCards) + '</div>';
      }
      if (!hasIn && hasOut) {
         return '<div class="or-summary-section or-summary-section-single">' +
            summaryColHtml('Out', outCards) + '</div>';
      }
      return '<div class="or-summary-section">' +
         summaryColHtml('In', inCards) +
         '<div class="or-summary-arrow" aria-hidden="true">→</div>' +
         summaryColHtml('Out', outCards) +
         '</div>';
   }

   function renderSummaryHtml(deck) {
      var items = itemsForDeck(deck.deck_id);
      var accepted = items.map(function (item) {
         var d = getDecision(item.item_id);
         return d && d.status === 'accepted' ? { status: 'accepted', accepted: d.accepted, slot_key: item.slot_key } : null;
      }).filter(Boolean);
      var isCube = OrderReconcileExport.isCubeDeck(deck);
      var summary = OrderReconcileExport.summarizeDeck(
         deck.deck_id, deck.deck_snapshot, accepted, { isCube: isCube });
      return '<div class="or-summary-box">' +
         '<h4>Changes summary</h4>' +
         summarySectionHtml(summary.ins, summary.outs) +
         '<h4>Remaining queue</h4>' +
         summarySectionHtml(summary.remainingIn, summary.remainingOut) +
         '</div>';
   }

   function renderStagingPanel() {
      var removals = [];
      state.reconcileItems.forEach(function (item) {
         var d = getDecision(item.item_id);
         if (d && d.status === 'accepted') {
            removals.push({
               name: d.accepted.card_in.name,
               set_code: d.accepted.card_in.set_code,
               collector_number: d.accepted.card_in.collector_number,
               quantity: 1
            });
         }
      });
      var importText = state.stagingDeck && state.stagingDeck.deck_snapshot
         ? OrderReconcileExport.buildStagingCleanupImport(state.stagingDeck.deck_snapshot, removals)
         : '';
      return '<div class="or-status-card"><div class="or-status-header"><h3>Buy/trade list cleanup</h3>' +
         archidektDeckLinkHtml(state.stagingDeck) + '</div>' +
         '<div class="or-status-pane"><p>Remove ' + removals.length + ' accepted card(s) from staging deck.</p>' +
         '<button type="button" class="or-btn or-btn-primary" id="or-copy-staging">Copy staging import</button> ' +
         (bridgeApplyAvailable()
            ? '<button type="button" class="or-btn or-btn-success" id="or-apply-staging">Apply via bridge</button>'
            : '') +
         '<textarea class="or-textarea" readonly id="or-staging-import" style="margin-top:12px;min-height:120px">' +
         escapeHtml(importText) + '</textarea></div></div>';
   }

   function wireStagingPanel() {
      var copyBtn = document.getElementById('or-copy-staging');
      if (copyBtn) {
         copyBtn.addEventListener('click', function () {
            ArchidektExport.copyText(document.getElementById('or-staging-import').value);
            setStatus('Staging import copied.');
         });
      }
      var applyBtn = document.getElementById('or-apply-staging');
      if (applyBtn && state.stagingDeck) {
         applyBtn.addEventListener('click', function () {
            var text = document.getElementById('or-staging-import').value;
            var deckId = ArchidektExport.parseDeckId(state.stagingDeck.archidekt_url);
            ArchidektExport.stageDeckApply(deckId, text);
            window.open(state.stagingDeck.archidekt_url, '_blank', 'noopener');
            setStatus('Staged staging deck — apply on Archidekt tab.');
         });
      }
   }

   OR.summaryCardImageSrc = summaryCardImageSrc;
   OR.summaryCardImgHtml = summaryCardImgHtml;
   OR.summaryGroupHtml = summaryGroupHtml;
   OR.summaryColHtml = summaryColHtml;
   OR.summarySectionHtml = summarySectionHtml;
   OR.renderSummaryHtml = renderSummaryHtml;
   OR.renderStagingPanel = renderStagingPanel;
   OR.wireStagingPanel = wireStagingPanel;
})(window);
