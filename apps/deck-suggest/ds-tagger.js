(function (global) {
   'use strict';

   var DS = global.DeckSuggest;
   var G = DS.RuleGuards;

   function normalizeText(value) {
      return String(value || '').toLowerCase();
   }

   function cardTextBlob(card) {
      return normalizeText([
         card.type_line,
         card.oracle_text,
         (card.keywords || []).join(' ')
      ].join(' '));
   }

   function countTagOverlap(card, tags, taggerCtx) {
      if (!tags || !tags.length) {
         return 0;
      }
      var resolved = taggerCtx && taggerCtx.resolve ? taggerCtx.resolve(card.name, card) : null;
      var blob = cardTextBlob(card);
      var taggerTags = (resolved && resolved.taggerTags) || [];
      var count = 0;
      tags.forEach(function (tag) {
         var t = normalizeText(tag);
         if (!t) {
            return;
         }
         if (taggerTags.some(function (tt) { return normalizeText(tt) === t || normalizeText(tt).indexOf(t) >= 0; })) {
            count += 1;
            return;
         }
         if (blob.indexOf(t) >= 0) {
            count += 1;
         }
      });
      return count;
   }

   function resolveCardTags(cardName, card) {
      var blob = cardTextBlob(card || { name: cardName });
      var tags = [];
      var keywords = (card && card.keywords) || [];
      keywords.forEach(function (k) {
         if (tags.indexOf(k) < 0) {
            tags.push(k);
         }
      });
      if (card && card.type_line) {
         card.type_line.split(/[—\-]/).slice(1).join(' ').split(/\s+/).forEach(function (part) {
            var p = part.replace(/[^a-zA-Z]/g, '');
            if (p.length > 2 && tags.indexOf(p) < 0) {
               tags.push(p);
            }
         });
      }
      return {
         cardName: cardName,
         taggerTags: tags,
         source: tags.length ? 'fallback' : 'fallback'
      };
   }

   function createContext(deck, setScope) {
      var cache = {};
      var withTags = 0;
      var total = 0;

      function resolve(name, card) {
         var key = normalizeText(name);
         if (!cache[key]) {
            cache[key] = resolveCardTags(name, card);
         }
         return cache[key];
      }

      function track(name, card) {
         total += 1;
         var res = resolve(name, card);
         if (res.taggerTags && res.taggerTags.length) {
            withTags += 1;
         }
      }

      (deck.deck_snapshot && deck.deck_snapshot.cards || []).forEach(function (c) {
         track(c.name, c);
      });
      (setScope && setScope.cards || []).forEach(function (c) {
         track(c.name, c);
      });

      return {
         resolve: resolve,
         cache: cache,
         coverage: {
            cardsResolved: total,
            cardsWithTags: withTags,
            percent: total ? Math.round((withTags / total) * 100) : 0
         }
      };
   }

   function matchSetCardToRoles(setCard, profile) {
      var roles = G.normalizeProfile(profile).roles;
      var best = null;
      roles.forEach(function (role) {
         var overlap = countTagOverlap(setCard, role.tags || [], null);
         if (!overlap) {
            var roleId = normalizeText(role.id);
            if (roleId && cardTextBlob(setCard).indexOf(roleId) >= 0) {
               overlap = 1;
            }
         }
         if (!overlap) {
            return;
         }
         var score = overlap * 10 + priorityWeight(role.priority);
         if (!best || score > best.score) {
            best = { roleId: role.id, score: score, hint: (role.tags || []).slice(0, 2).join(', ') };
         }
      });
      return best;
   }

   function priorityWeight(priority) {
      if (priority === 'high') {
         return 3;
      }
      if (priority === 'medium') {
         return 2;
      }
      return 1;
   }

   function runRoleSynergy(deck, setScope, profile, existing, taggerCtx) {
      var added = [];
      var deckNames = G.deckNamesInSnapshot(deck);
      var codes = {};
      (setScope.codes || []).forEach(function (c) {
         codes[String(c).toUpperCase()] = true;
      });

      (setScope.cards || []).forEach(function (setCard) {
         var code = String(setCard.set_code || '').toUpperCase();
         if (!codes[code]) {
            return;
         }
         if (deckNames[setCard.name.toLowerCase()]) {
            return;
         }
         var match = matchSetCardToRoles(setCard, profile);
         if (!match) {
            return;
         }
         var cut = G.pickBestCut(deck, profile, taggerCtx);
         if (!cut) {
            return;
         }
         var confidence = match.score >= 13 ? 'medium' : 'low';
         var suggestion = {
            suggestion_id: G.nextSuggestionId(deck.deck_id, existing.concat(added)),
            action: 'consider',
            card: G.setCardToSuggestionCard(setCard),
            quantity: 1,
            roles_matched: [match.roleId],
            confidence: confidence,
            rationale: 'Role match (' + match.roleId + ') — ' + (match.hint || 'profile tags') + '.',
            tags: ['rule:role_synergy', match.roleId],
            replaces: [{ name: cut.name, quantity: 1 }],
            priority_tier: 'normal',
            swap_source: 'analysis'
         };
         var emitted = G.emitIfValid(suggestion, profile, existing.concat(added));
         if (emitted) {
            added.push(emitted);
         }
      });

      return added;
   }

   DS.Tagger = {
      countTagOverlap: countTagOverlap,
      resolveCardTags: resolveCardTags,
      createContext: createContext,
      matchSetCardToRoles: matchSetCardToRoles
   };
   DS.RoleRules = {
      runRoleSynergy: runRoleSynergy
   };
})(window);
