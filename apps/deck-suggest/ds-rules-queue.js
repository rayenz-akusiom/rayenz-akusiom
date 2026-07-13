(function (global) {
   'use strict';

   var DS = global.DeckSuggest;
   var G = DS.RuleGuards;

   function getSwapQueue(deck) {
      if (DS.Data && DS.Data.getDeckSwapQueue) {
         return DS.Data.getDeckSwapQueue(deck);
      }
      return global.SwapQueue.deriveSwapQueue(deck);
   }

   function inCardIsLand(inCard) {
      var typeLine = inCard.type_line || '';
      if (/land/i.test(typeLine)) {
         return true;
      }
      return /\b(Plains|Island|Swamp|Mountain|Forest|Verge|Foundry|Tower|Steppe|Catacombs|Graveyard|Tomb)\b/i.test(inCard.name || '');
   }

   function pickCutForUnpairedIn(deck, profile, taggerCtx, inCard) {
      var candidates = G.cutCandidates(deck);
      if (inCardIsLand(inCard)) {
         var lands = candidates.filter(function (c) {
            return c.primary_category === 'Land' || /land/i.test(c.type_line || '') ||
               /\b(Plains|Island|Swamp|Mountain|Forest|Verge|Foundry|Tower|Steppe)\b/i.test(c.name || '');
         });
         if (lands.length) {
            candidates = lands;
         }
      }
      var ranked = G.rankCutCandidates(candidates, profile, taggerCtx);
      return ranked[0] || null;
   }

   function runQueueInPair(deck, setScope, profile, existing, taggerCtx, debug) {
      var added = [];
      var skipped = [];
      var queue = getSwapQueue(deck);
      if (!queue) {
         if (debug && debug.collector) {
            debug.collector.push({
               ruleId: debug.ruleId || 'queue_in_pair',
               outcome: 'info',
               subject: deck.deck_name || deck.deck_id,
               reason: 'no_swap_queue'
            });
         }
         return { added: added, skipped: skipped };
      }
      var inCards = queue.new_set_in || [];
      var outCards = queue.new_set_out || [];
      var pairCount = Math.min(inCards.length, outCards.length);
      var setCode = (setScope.primaryCode || setScope.codes[0] || '').toUpperCase();

      for (var i = 0; i < pairCount; i += 1) {
         var inCard = inCards[i];
         var outCard = outCards[i];
         var resolvedIn = G.resolveQueuedInForScope(inCard, setScope);
         if (!resolvedIn) {
            skipped.push({ name: inCard.name, reason: 'not_in_set_scope' });
            continue;
         }
         var suggestion = {
            suggestion_id: G.nextSuggestionId(deck.deck_id, existing.concat(added)),
            action: 'replace',
            card: resolvedIn,
            quantity: 1,
            roles_matched: ['swap'],
            confidence: 'high',
            rationale: 'Queued add — paired with ' + outCard.name + ' cut (' + setCode + ' printing).',
            tags: ['swap', 'rule:queue_in_pair'],
            replaces: [{ name: outCard.name, quantity: 1 }],
            fills_swap_slot: inCard.name,
            priority_tier: 'swap',
            swap_source: 'queue_in'
         };
         var emitted = G.emitIfValid(suggestion, profile, existing.concat(added), debug);
         if (emitted) {
            added.push(emitted);
         }
      }

      for (var j = pairCount; j < inCards.length; j += 1) {
         var unpairedIn = inCards[j];
         var resolvedUnpaired = G.resolveQueuedInForScope(unpairedIn, setScope);
         if (!resolvedUnpaired) {
            skipped.push({ name: unpairedIn.name, reason: 'not_in_set_scope' });
            continue;
         }
         var cut = pickCutForUnpairedIn(deck, profile, taggerCtx, unpairedIn);
         if (!cut) {
            if (debug && debug.collector) {
               debug.collector.push({
                  ruleId: debug.ruleId || 'queue_in_pair',
                  outcome: 'skipped',
                  subject: unpairedIn.name,
                  reason: 'no_cut_candidate'
               });
            }
            continue;
         }
         var unpairedSuggestion = {
            suggestion_id: G.nextSuggestionId(deck.deck_id, existing.concat(added)),
            action: 'replace',
            card: resolvedUnpaired,
            quantity: 1,
            roles_matched: ['swap'],
            confidence: 'high',
            rationale: 'Queued add — no Out paired; cut suggested from main deck (' + setCode + ' printing).',
            tags: ['swap', 'rule:queue_in_pair'],
            replaces: [{ name: cut.name, quantity: 1 }],
            fills_swap_slot: unpairedIn.name,
            priority_tier: 'swap',
            swap_source: 'queue_in'
         };
         var unpairedEmitted = G.emitIfValid(unpairedSuggestion, profile, existing.concat(added));
         if (unpairedEmitted) {
            added.push(unpairedEmitted);
         }
      }

      return { added: added, skipped: skipped };
   }

   function findSetReplacement(deck, outCard, setScope, profile, taggerCtx) {
      var deckNames = G.deckNamesInSnapshot(deck);
      var best = null;
      (setScope.cards || []).forEach(function (setCard) {
         if (deckNames[setCard.name.toLowerCase()]) {
            return;
         }
         var match = DS.Tagger.matchSetCardToRoles(setCard, profile);
         if (!match) {
            return;
         }
         if (!best || match.score > best.score) {
            best = { setCard: setCard, match: match };
         }
      });
      return best;
   }

   function runQueueOutFill(deck, setScope, profile, existing, taggerCtx, debug) {
      var added = [];
      var queue = getSwapQueue(deck);
      if (!queue) {
         return added;
      }
      var inCards = queue.new_set_in || [];
      var outCards = queue.new_set_out || [];
      if (outCards.length <= inCards.length) {
         if (debug && debug.collector && outCards.length) {
            debug.collector.push({
               ruleId: debug.ruleId || 'queue_out_fill',
               outcome: 'info',
               subject: deck.deck_name || deck.deck_id,
               reason: 'queue_out_not_applicable',
               detail: 'In: ' + inCards.length + ', Out: ' + outCards.length
            });
         }
         return added;
      }

      for (var i = inCards.length; i < outCards.length; i += 1) {
         var outCard = outCards[i];
         var replacement = findSetReplacement(deck, outCard, setScope, profile, taggerCtx);
         if (!replacement) {
            if (debug && debug.collector) {
               debug.collector.push({
                  ruleId: debug.ruleId || 'queue_out_fill',
                  outcome: 'skipped',
                  subject: outCard.name,
                  reason: 'queue_out_no_replacement'
               });
            }
            continue;
         }
         var setCode = (setScope.primaryCode || setScope.codes[0] || '').toUpperCase();
         var suggestion = {
            suggestion_id: G.nextSuggestionId(deck.deck_id, existing.concat(added)),
            action: 'replace',
            card: G.setCardToSuggestionCard(replacement.setCard),
            quantity: 1,
            roles_matched: [replacement.match.roleId],
            confidence: 'high',
            rationale: 'Queued cut — suggested replacement from ' + setCode + '.',
            tags: ['swap', 'rule:queue_out_fill'],
            replaces: [{ name: outCard.name, quantity: 1 }],
            priority_tier: 'swap',
            swap_source: 'queue_out_fill'
         };
         var emitted = G.emitIfValid(suggestion, profile, existing.concat(added), debug);
         if (emitted) {
            added.push(emitted);
         }
      }

      return added;
   }

   DS.QueueRules = {
      runQueueInPair: runQueueInPair,
      runQueueOutFill: runQueueOutFill,
      pickCutForUnpairedIn: pickCutForUnpairedIn,
      findSetReplacement: findSetReplacement
   };
})(window);
