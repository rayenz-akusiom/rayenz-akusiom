(function (global) {
   'use strict';

   var DS = global.DeckSuggest;
   var G = DS.RuleGuards;
   var deriveSwapQueue = global.SwapQueue.deriveSwapQueue;

   var CONFIDENCE_ORDER = { high: 0, medium: 1, low: 2 };

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

   function buildSwapQueueAnalysis(deck) {
      var queue = deriveSwapQueue(deck);
      if (!queue) {
         return null;
      }
      var unpairedIn = [];
      var unpairedOut = [];
      var inLen = queue.new_set_in.length;
      var outLen = queue.new_set_out.length;
      if (inLen > outLen) {
         queue.new_set_in.slice(outLen).forEach(function (c) {
            unpairedIn.push(c.name);
         });
      } else if (outLen > inLen) {
         queue.new_set_out.slice(inLen).forEach(function (c) {
            unpairedOut.push(c.name);
         });
      }
      return {
         new_set_in: queue.new_set_in.map(function (c) { return c.name; }),
         new_set_out: outLen === 1 && queue.new_set_out[0]
            ? queue.new_set_out[0].name
            : queue.new_set_out.map(function (c) { return c.name; }),
         metadata_flags: queue.metadata_flags,
         in_count: inLen,
         out_count: outLen,
         unpaired_in: unpairedIn.length ? unpairedIn : null,
         unpaired_out: unpairedOut.length ? unpairedOut : null,
         reconciliation_notes: unpairedIn.map(function (name) {
            return name + ': no Out paired — cut suggested from main deck';
         })
      };
   }

   function runRulesForDeck(deck, setScope, options) {
      options = options || {};
      var profile = deck.profile || {};
      var existing = (options.existingSuggestions || []).slice();
      var suggestions = existing.slice();
      var audit = [];
      var taggerCtx = DS.Tagger.createContext(deck, setScope);

      var rules = [
         { id: 'queue_in_pair', fn: DS.QueueRules.runQueueInPair },
         { id: 'queue_out_fill', fn: DS.QueueRules.runQueueOutFill },
         { id: 'proxy_upgrade', fn: DS.ProxyRules.runProxyUpgrade },
         { id: 'role_synergy', fn: DS.RoleRules.runRoleSynergy }
      ];

      rules.forEach(function (rule) {
         var before = suggestions.length;
         var raw = rule.fn(deck, setScope, profile, suggestions, taggerCtx) || [];
         var added = raw.added != null ? raw.added : raw;
         var skipped = raw.skipped || [];
         suggestions = suggestions.concat(added);
         audit.push({
            ruleId: rule.id,
            deckId: deck.deck_id,
            suggestionsAdded: suggestions.length - before
         });
         skipped.forEach(function (slot) {
            audit.push({
               ruleId: rule.id,
               deckId: deck.deck_id,
               suggestionsAdded: 0,
               skippedReason: slot.name + ' (' + slot.reason + ')'
            });
         });
      });

      suggestions = sortSuggestions(suggestions);

      return {
         suggestions: suggestions,
         audit: audit,
         taggerCoverage: taggerCtx.coverage,
         analysis: {
            swap_queue: buildSwapQueueAnalysis(deck)
         }
      };
   }

   DS.runRulesForDeck = runRulesForDeck;
   DS.sortSuggestions = sortSuggestions;
   DS.buildSwapQueueAnalysis = buildSwapQueueAnalysis;
})(window);
