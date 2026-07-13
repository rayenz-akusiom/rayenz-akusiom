(function (global) {
   'use strict';

   var SB = global.SuggestionsBundle || (global.SuggestionsBundle = {});
   var deriveSwapQueue = global.SwapQueue.deriveSwapQueue;

   var SUPPORTED_SCHEMAS = { '1.0': true, '1.1': true };
   var CONFIDENCE_ORDER = { high: 0, medium: 1, low: 2 };

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
      suggestion.roles_matched = normalizeArrayValue(suggestion.roles_matched);
      return suggestion;
   }

   function normalizeProfilePreferences(prefs) {
      prefs = prefs || {};
      return {
         protected_cards: normalizeArrayValue(prefs.protected_cards),
         blocked_cards: normalizeArrayValue(prefs.blocked_cards)
      };
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

   function attachSwapQueueCache(deck) {
      if (!deck || deck._swapQueue !== undefined) {
         return deck;
      }
      if (!deck.deck_snapshot) {
         deck._swapQueue = null;
         return deck;
      }
      deck._swapQueue = deriveSwapQueue(deck);
      return deck;
   }

   function getSwapQueue(deck) {
      if (!deck) {
         return null;
      }
      attachSwapQueueCache(deck);
      return deck._swapQueue;
   }

   function normalizeDeckEntry(deck) {
      if (!deck) {
         return deck;
      }
      deck.suggestions = sortSuggestions(
         normalizeArrayValue(deck.suggestions).map(normalizeSuggestion)
      );
      deck.profile_preferences = normalizeProfilePreferences(deck.profile_preferences);
      attachSwapQueueCache(deck);
      return deck;
   }

   function validatePayload(data) {
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
         normalizeDeckEntry(deck);
      });
      return data;
   }

   function buildMetaFromSetScope(setScope, notes) {
      var today = new Date().toISOString().slice(0, 10);
      return {
         schema_version: '1.1',
         set_code: setScope.primaryCode,
         set_name: setScope.setName,
         set_codes: setScope.codes,
         sets: setScope.codes.map(function (code) {
            return {
               code: code,
               name: code,
               set_type: 'expansion',
               card_count: setScope.cards.length
            };
         }),
         generated_at: today,
         card_count: setScope.cards.length,
         notes: notes || ''
      };
   }

   function buildDeckEntry(options) {
      options = options || {};
      var deck = options.deck || {};
      var analysis = options.analysis || {};
      var swapQueueAnalysis = analysis.swap_queue;
      if (!swapQueueAnalysis && options.swapQueueAnalysisFn) {
         swapQueueAnalysis = options.swapQueueAnalysisFn(deck);
      }
      return normalizeDeckEntry({
         deck_id: deck.deck_id,
         deck_name: deck.deck_name,
         archidekt_url: deck.archidekt_url || '',
         format: deck.format || 'commander',
         analysis: {
            swap_queue: swapQueueAnalysis || null,
            inferred_themes: (deck.profile && deck.profile.tags) || []
         },
         suggestions: options.suggestions || [],
         deck_snapshot: deck.deck_snapshot || null,
         profile_preferences: deck.profile_preferences || {
            protected_cards: (deck.profile && deck.profile.protected_cards) || [],
            blocked_cards: (deck.profile && deck.profile.blocked_cards) || []
         },
         skipped: options.skipped || false,
         skip_reason: options.skip_reason || null
      });
   }

   function buildPayload(meta, decks) {
      return {
         meta: meta,
         decks: (decks || []).map(function (deck) {
            return normalizeDeckEntry(deck);
         })
      };
   }

   SB.SUPPORTED_SCHEMAS = SUPPORTED_SCHEMAS;
   SB.normalizeArrayValue = normalizeArrayValue;
   SB.normalizeSuggestion = normalizeSuggestion;
   SB.normalizeProfilePreferences = normalizeProfilePreferences;
   SB.sortSuggestions = sortSuggestions;
   SB.attachSwapQueueCache = attachSwapQueueCache;
   SB.getSwapQueue = getSwapQueue;
   SB.normalizeDeckEntry = normalizeDeckEntry;
   SB.validatePayload = validatePayload;
   SB.buildMetaFromSetScope = buildMetaFromSetScope;
   SB.buildDeckEntry = buildDeckEntry;
   SB.buildPayload = buildPayload;
})(window);
