(function (global) {
   'use strict';

   var DS = global.DeckSuggest;
   var G = DS.RuleGuards;

   function isProxyCard(card) {
      var cats = card.categories || [];
      return cats.indexOf('Proxies') >= 0 || card.primary_category === 'Proxies';
   }

   function findOfficialInScope(proxyCard, setScope) {
      var name = proxyCard.name;
      var nameLower = String(name || '').toLowerCase();
      var matches;
      if (setScope && setScope.cardsByName) {
         matches = (setScope.cardsByName[nameLower] || []).slice();
      } else {
         matches = (setScope.cards || []).filter(function (c) {
            return c.name === name;
         });
      }
      if (!matches.length) {
         return null;
      }
      matches.sort(function (a, b) {
         return String(a.collector_number).localeCompare(String(b.collector_number));
      });
      return matches[0];
   }

   function runProxyUpgrade(deck, setScope, profile, existing, taggerCtx, debug) {
      var added = [];
      (deck.deck_snapshot && deck.deck_snapshot.cards || []).forEach(function (card) {
         if (!isProxyCard(card)) {
            return;
         }
         var official = findOfficialInScope(card, setScope);
         if (!official) {
            if (debug && debug.collector) {
               debug.collector.push({
                  ruleId: debug.ruleId || 'proxy_upgrade',
                  outcome: 'skipped',
                  subject: card.name,
                  reason: 'proxy_no_official_in_scope'
               });
            }
            return;
         }
         var setCode = (official.set_code || setScope.primaryCode || '').toUpperCase();
         var suggestion = {
            suggestion_id: G.nextSuggestionId(deck.deck_id, existing.concat(added)),
            action: 'replace',
            card: G.setCardToSuggestionCard(official),
            quantity: 1,
            roles_matched: ['proxy'],
            confidence: 'high',
            rationale: 'Proxy upgrade — official printing from ' + setCode + '.',
            tags: ['proxy', 'rule:proxy_upgrade'],
            replaces: [{ name: card.name, quantity: 1 }],
            priority_tier: 'normal',
            swap_source: 'analysis'
         };
         var emitted = G.emitIfValid(suggestion, profile, existing.concat(added), debug);
         if (emitted) {
            added.push(emitted);
         }
      });
      return added;
   }

   DS.ProxyRules = {
      runProxyUpgrade: runProxyUpgrade,
      isProxyCard: isProxyCard
   };
})(window);
