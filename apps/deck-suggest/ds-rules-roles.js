(function (global) {
   'use strict';

   var DS = global.DeckSuggest || (global.DeckSuggest = {});

   var PROTECTED_CATEGORIES = { Commander: true, Lieutenant: true, Lieutenants: true };
   var SWAP_IN = 'New Set In';
   var SWAP_OUT = 'New Set Out';

   function listHasName(list, name) {
      return (list || []).some(function (n) {
         return String(n).toLowerCase() === String(name).toLowerCase();
      });
   }

   function normalizeProfile(profile) {
      profile = profile || {};
      return {
         roles: profile.roles || [],
         tags: profile.tags || [],
         protected_cards: profile.protected_cards || [],
         blocked_cards: profile.blocked_cards || []
      };
   }

   function isCommanderCategory(card) {
      var primary = card && (card.primary_category || (card.categories && card.categories[0]));
      return !!(primary && PROTECTED_CATEGORIES[primary]);
   }

   function isBlockedAdd(name, profile) {
      return listHasName(normalizeProfile(profile).blocked_cards, name);
   }

   function isProtectedCut(name, profile) {
      return listHasName(normalizeProfile(profile).protected_cards, name);
   }

   function passesBlocklist(suggestion, profile) {
      if (!suggestion || !suggestion.card) {
         return false;
      }
      if (isBlockedAdd(suggestion.card.name, profile)) {
         return false;
      }
      return !(suggestion.replaces || []).some(function (r) {
         return r.name && isProtectedCut(r.name, profile);
      });
   }

   function deckNamesInSnapshot(deck) {
      if (deck.ruleContext && deck.ruleContext.deckNames) {
         return deck.ruleContext.deckNames;
      }
      var names = {};
      (deck.deck_snapshot && deck.deck_snapshot.cards || []).forEach(function (c) {
         if (c.name) {
            names[c.name.toLowerCase()] = true;
         }
      });
      return names;
   }

   function cutCandidates(deck) {
      if (deck.ruleContext && deck.ruleContext.cutCandidates) {
         return deck.ruleContext.cutCandidates;
      }
      var options = [];
      var seen = {};
      (deck.deck_snapshot && deck.deck_snapshot.cards || []).forEach(function (card) {
         var primary = card.primary_category || (card.categories && card.categories[0]);
         if (primary && PROTECTED_CATEGORIES[primary]) {
            return;
         }
         if (primary === SWAP_IN || primary === SWAP_OUT) {
            return;
         }
         if (!card.name || seen[card.name]) {
            return;
         }
         seen[card.name] = true;
         options.push(card);
      });
      if (deck.ruleContext) {
         deck.ruleContext.cutCandidates = options;
      }
      return options;
   }

   function soughtTags(profile) {
      var tags = [];
      normalizeProfile(profile).roles.forEach(function (role) {
         (role.tags || []).forEach(function (t) {
            if (tags.indexOf(t) < 0) {
               tags.push(t);
            }
         });
      });
      normalizeProfile(profile).tags.forEach(function (t) {
         if (tags.indexOf(t) < 0) {
            tags.push(t);
         }
      });
      return tags;
   }

   function priorityWeight(priority) {
      if (priority === 'high') {
         return 3;
      }
      if (priority === 'medium') {
         return 2;
      }
      if (priority === 'low') {
         return 1;
      }
      return 0;
   }

   function roleFillScore(card, profile) {
      var roles = normalizeProfile(profile).roles;
      var best = 0;
      roles.forEach(function (role) {
         var overlap = DS.Tagger.countTagOverlap(card, role.tags || [], null);
         if (overlap > 0) {
            best = Math.max(best, priorityWeight(role.priority));
         }
      });
      return best;
   }

   function rankCutCandidates(candidates, profile, taggerCtx) {
      var sought = soughtTags(profile);
      return candidates.slice().sort(function (a, b) {
         var overlapA = DS.Tagger.countTagOverlap(a, sought, taggerCtx);
         var overlapB = DS.Tagger.countTagOverlap(b, sought, taggerCtx);
         if (overlapA !== overlapB) {
            return overlapA - overlapB;
         }
         var roleA = roleFillScore(a, profile);
         var roleB = roleFillScore(b, profile);
         if (roleA !== roleB) {
            return roleB - roleA;
         }
         var cmcA = a.cmc != null ? a.cmc : 0;
         var cmcB = b.cmc != null ? b.cmc : 0;
         if (cmcA !== cmcB) {
            return cmcB - cmcA;
         }
         return String(a.name).localeCompare(String(b.name));
      });
   }

   function pickBestCut(deck, profile, taggerCtx) {
      var ranked = rankCutCandidates(cutCandidates(deck), profile, taggerCtx);
      return ranked[0] || null;
   }

   function suggestionPairKey(suggestion) {
      var rep = suggestion.replaces && suggestion.replaces[0];
      return (suggestion.card && suggestion.card.name || '') + '::' + (rep && rep.name || '');
   }

   function hasDuplicate(existing, suggestion) {
      var key = suggestionPairKey(suggestion);
      return existing.some(function (s) {
         return suggestionPairKey(s) === key;
      });
   }

   function nextSuggestionId(deckId, existing) {
      var max = 0;
      existing.forEach(function (s) {
         var m = String(s.suggestion_id || '').match(/-(\d+)$/);
         if (m) {
            max = Math.max(max, parseInt(m[1], 10));
         }
      });
      return deckId + '-' + String(max + 1).padStart(3, '0');
   }

   function snapshotCardToSuggestionCard(card) {
      return {
         name: card.name,
         set_code: (card.set_code || '').toUpperCase(),
         collector_number: String(card.collector_number || ''),
         scryfall_id: card.scryfall_id || null,
         scryfall_uri: card.scryfall_uri || null,
         mana_cost: card.mana_cost || null,
         cmc: card.cmc != null ? card.cmc : null,
         type_line: card.type_line || null
      };
   }

   function setCardToSuggestionCard(card) {
      return {
         name: card.name,
         set_code: (card.set_code || '').toUpperCase(),
         collector_number: String(card.collector_number || ''),
         scryfall_id: card.scryfall_id || null,
         scryfall_uri: card.scryfall_uri || null,
         mana_cost: card.mana_cost || null,
         cmc: card.cmc != null ? card.cmc : null,
         type_line: card.type_line || null
      };
   }

   function emitIfValid(suggestion, profile, existing, debug) {
      var reason = null;
      if (DS.Debug && DS.Debug.rejectReason) {
         reason = DS.Debug.rejectReason(suggestion, profile, existing);
      } else if (!passesBlocklist(suggestion, profile)) {
         reason = isBlockedAdd(suggestion.card.name, profile) ? 'blocked_add' : 'protected_cut';
      } else if (hasDuplicate(existing, suggestion)) {
         reason = 'duplicate_pair';
      }
      if (reason) {
         if (debug && debug.collector) {
            var rep = suggestion.replaces && suggestion.replaces[0];
            debug.collector.push({
               ruleId: debug.ruleId || 'emit',
               outcome: 'rejected',
               subject: suggestion.card && suggestion.card.name,
               cardIn: suggestion.card && suggestion.card.name,
               cardOut: rep && rep.name,
               reason: reason
            });
         }
         return null;
      }
      return suggestion;
   }

   function findInSetPool(cardName, setScope) {
      var nameLower = String(cardName || '').toLowerCase();
      var matches;
      if (setScope && setScope.cardsByName) {
         matches = setScope.cardsByName[nameLower] || [];
      } else {
         matches = (setScope && setScope.cards || []).filter(function (c) {
            return String(c.name).toLowerCase() === nameLower;
         });
      }
      if (!matches.length) {
         return null;
      }
      var primary = String(setScope.primaryCode || '').toUpperCase();
      var preferred = matches.find(function (c) {
         return String(c.set_code || '').toUpperCase() === primary;
      });
      return preferred || matches[0];
   }

   function resolveQueuedInForScope(inCard, setScope) {
      var poolCard = findInSetPool(inCard.name, setScope);
      if (!poolCard) {
         return null;
      }
      return setCardToSuggestionCard(poolCard);
   }

   DS.RuleGuards = {
      listHasName: listHasName,
      normalizeProfile: normalizeProfile,
      isCommanderCategory: isCommanderCategory,
      isBlockedAdd: isBlockedAdd,
      isProtectedCut: isProtectedCut,
      passesBlocklist: passesBlocklist,
      deckNamesInSnapshot: deckNamesInSnapshot,
      cutCandidates: cutCandidates,
      rankCutCandidates: rankCutCandidates,
      pickBestCut: pickBestCut,
      suggestionPairKey: suggestionPairKey,
      hasDuplicate: hasDuplicate,
      nextSuggestionId: nextSuggestionId,
      snapshotCardToSuggestionCard: snapshotCardToSuggestionCard,
      setCardToSuggestionCard: setCardToSuggestionCard,
      emitIfValid: emitIfValid,
      findInSetPool: findInSetPool,
      resolveQueuedInForScope: resolveQueuedInForScope
   };
})(window);
