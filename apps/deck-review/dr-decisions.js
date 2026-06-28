(function (global) {
   'use strict';

   var DR = global.DeckReview;
   var state = DR.state;

   var optionKey = HubUtils.optionKey;

   var getDeckById = DR.getDeckById;
   var getDecision = DR.getDecision;
   var setDecision = DR.setDecision;
   var showError = DR.showError;
   var setPrintSelection = DR.setPrintSelection;
   var setCutSelection = DR.setCutSelection;
   var getPrintValue = DR.getPrintValue;
   var readCutSelection = DR.readCutSelection;
   var findSnapshotCard = DR.findSnapshotCard;
   var printingToCardIn = DR.printingToCardIn;
   var isMissingSuggestedCut = DR.isMissingSuggestedCut;
   var needsSuggestedCut = DR.needsSuggestedCut;

   function decisionStatusClass(status) {
      if (status === 'accepted') {
         return ' dr-decision-accepted';
      }
      if (status === 'rejected') {
         return ' dr-decision-rejected';
      }
      if (status === 'skipped') {
         return ' dr-decision-skipped';
      }
      return '';
   }

   function decisionStatusLabel(status) {
      if (status === 'accepted') {
         return '<span class="dr-decision-label dr-decision-label-accepted">Accepted</span>';
      }
      if (status === 'rejected') {
         return '<span class="dr-decision-label dr-decision-label-rejected">Rejected</span>';
      }
      if (status === 'skipped') {
         return '<span class="dr-decision-label dr-decision-label-skipped">Skipped</span>';
      }
      if (status === 'pending') {
         return '<span class="dr-decision-label dr-decision-label-pending">Pending</span>';
      }
      return '';
   }

   function decisionRecapInOut(suggestion, decision) {
      var inName = '';
      var inSet = '';
      var outName = '';
      if (decision && decision.status === 'accepted' && decision.accepted) {
         if (decision.accepted.card_in) {
            inName = decision.accepted.card_in.name || '';
            inSet = decision.accepted.card_in.set_code || '';
         }
         if (decision.accepted.card_out && decision.accepted.card_out.name) {
            outName = decision.accepted.card_out.name;
         }
      } else {
         inName = (suggestion.card && suggestion.card.name) || '';
         inSet = (suggestion.card && suggestion.card.set_code) || '';
         var rep = suggestion.replaces && suggestion.replaces[0];
         outName = rep && rep.name ? rep.name : '';
      }
      return { inName: inName, inSet: inSet, outName: outName };
   }

   function applyCardDecisionUi(cardEl, status) {
      if (!cardEl) {
         return;
      }
      cardEl.classList.remove('dr-decision-accepted', 'dr-decision-rejected', 'dr-decision-skipped');
      if (status === 'accepted') {
         cardEl.classList.add('dr-decision-accepted');
      } else if (status === 'rejected') {
         cardEl.classList.add('dr-decision-rejected');
      } else if (status === 'skipped') {
         cardEl.classList.add('dr-decision-skipped');
      }
      var labelHost = cardEl.querySelector('[data-dr-decision-label]');
      if (labelHost) {
         labelHost.innerHTML = decisionStatusLabel(status);
      }
   }

   function restoreAcceptedSelections(cardEl, deck, suggestion, accepted) {
      if (accepted.card_in && accepted.card_in.scryfall_id) {
         if (accepted.card_in.finish) {
            cardEl.dataset.finish = accepted.card_in.finish;
         }
         setPrintSelection(cardEl, accepted.card_in.scryfall_id, suggestion);
      }
      if (accepted.card_out && accepted.card_out.name) {
         setCutSelection(cardEl, optionKey({
            name: accepted.card_out.name,
            set_code: accepted.card_out.set_code,
            collector_number: accepted.card_out.collector_number
         }), deck);
      }
   }

   function acceptedForDeck(deckId) {
      var deck = getDeckById(deckId);
      if (!deck) {
         return [];
      }
      var out = [];
      (deck.suggestions || []).forEach(function (s) {
         var d = getDecision(s.suggestion_id);
         if (d && d.status === 'accepted' && d.accepted) {
            out.push(d.accepted);
         }
      });
      return out;
   }

   function allAcceptedByDeck() {
      var map = {};
      state.data.decks.forEach(function (deck) {
         var items = acceptedForDeck(deck.deck_id);
         if (items.length) {
            map[deck.deck_id] = items;
         }
      });
      return map;
   }

   function recordSuggestionDecision(deck, suggestion, status, cardEl, advanceOnAction) {
      setDecision(suggestion.suggestion_id, { status: status });
      if (advanceOnAction) {
         state.suggestionIndex++;
         state.progress.currentSuggestionIndex[state.activeDeckId] = state.suggestionIndex;
         HubStorage.saveReviewProgress(state.fileId, state.progress);
         DR.renderDeckList();
         DR.renderSuggestionPanel();
         DR.renderDeckStatusCard(getDeckById(state.activeDeckId));
         return;
      }
      HubStorage.saveReviewProgress(state.fileId, state.progress);
      applyCardDecisionUi(cardEl, status);
      DR.renderDeckList();
      DR.renderDeckStatusCard(getDeckById(state.activeDeckId));
   }

   function acceptSuggestionFromCard(deck, suggestion, cardEl, advanceOnAction) {
      var qty = 1;

      var selectedPrintId = getPrintValue(cardEl);
      var prints = cardEl._drPrints ||
         state.printCache[(suggestion.card.name || '').toLowerCase()] || [];
      var print = prints.find(function (p) { return p.id === selectedPrintId; }) || suggestion.card;
      var cardIn = printingToCardIn(print, suggestion.card, cardEl);

      var cutMeta = readCutSelection(cardEl);
      if (isMissingSuggestedCut(suggestion) && !cutMeta.name) {
         showError('No Out card selected. This suggestion had no cut in the JSON — pick one manually or skip.');
         return;
      }
      if (!cutMeta.name && needsSuggestedCut(suggestion)) {
         showError('Select an Out card before accepting.');
         return;
      }
      if (!cutMeta.set_code || !cutMeta.collector_number) {
         var snap = findSnapshotCard(deck, cutMeta.name, cutMeta.set_code, cutMeta.collector_number);
         if (snap) {
            cutMeta.set_code = cutMeta.set_code || snap.set_code;
            cutMeta.collector_number = cutMeta.collector_number || snap.collector_number;
         }
      }

      var accepted = {
         suggestion_id: suggestion.suggestion_id,
         deck_id: deck.deck_id,
         archidekt_deck_id: ArchidektExport.parseDeckId(deck.archidekt_url),
         archidekt_url: deck.archidekt_url,
         action: suggestion.action,
         quantity: qty,
         card_in: cardIn,
         card_out: {
            name: cutMeta.name,
            quantity: qty,
            set_code: cutMeta.set_code,
            collector_number: cutMeta.collector_number
         },
         swap_categories: suggestion.action === 'replace' || suggestion.priority_tier === 'swap' || !!cutMeta.name
      };

      setDecision(suggestion.suggestion_id, { status: 'accepted', accepted: accepted });
      if (advanceOnAction) {
         state.suggestionIndex++;
         state.progress.currentSuggestionIndex[state.activeDeckId] = state.suggestionIndex;
         HubStorage.saveReviewProgress(state.fileId, state.progress);
         DR.renderDeckList();
         DR.renderSuggestionPanel();
         DR.renderDeckStatusCard(getDeckById(state.activeDeckId));
         return;
      }
      HubStorage.saveReviewProgress(state.fileId, state.progress);
      applyCardDecisionUi(cardEl, 'accepted');
      DR.renderDeckList();
      DR.renderDeckStatusCard(getDeckById(state.activeDeckId));
   }

   DR.decisionStatusClass = decisionStatusClass;
   DR.decisionStatusLabel = decisionStatusLabel;
   DR.decisionRecapInOut = decisionRecapInOut;
   DR.applyCardDecisionUi = applyCardDecisionUi;
   DR.restoreAcceptedSelections = restoreAcceptedSelections;
   DR.acceptedForDeck = acceptedForDeck;
   DR.allAcceptedByDeck = allAcceptedByDeck;
   DR.recordSuggestionDecision = recordSuggestionDecision;
   DR.acceptSuggestionFromCard = acceptSuggestionFromCard;
})(window);
