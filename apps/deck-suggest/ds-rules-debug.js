(function (global) {
   'use strict';

   var DS = global.DeckSuggest || (global.DeckSuggest = {});
   var G;
   var deriveSwapQueue;

   var REASON_LABELS = {
      not_in_set_scope: 'Card not in selected set pool',
      no_swap_queue: 'No Archidekt swap queue on deck snapshot',
      no_cut_candidate: 'No eligible main-deck cut found',
      blocked_add: 'Card is on profile blocklist (add)',
      protected_cut: 'Suggested cut is on profile protected list',
      duplicate_pair: 'Duplicate in/out pair already suggested',
      queue_out_no_replacement: 'No set-pool replacement matched profile roles',
      queue_out_not_applicable: 'Queue Out count does not exceed In count',
      proxy_not_proxy: 'Card is not in Proxies category',
      proxy_no_official_in_scope: 'No official printing in set pool for proxy',
      role_already_in_deck: 'Card already in deck',
      role_wrong_set: 'Printing not in selected set codes',
      role_no_match: 'No profile role/tag match',
      role_no_cut: 'No eligible cut for role suggestion',
      deck_ineligible: 'Deck skipped by eligibility rules',
      would_emit: 'Would produce a suggestion'
   };

   function normalizeName(name) {
      return String(name || '').trim().toLowerCase();
   }

   function createCollector(deckId) {
      var entries = [];
      return {
         deckId: deckId,
         push: function (entry) {
            entries.push(Object.assign({ deckId: deckId }, entry));
         },
         entries: function () {
            return entries.slice();
         },
         filterByCard: function (name) {
            var needle = normalizeName(name);
            if (!needle) {
               return entries.slice();
            }
            return entries.filter(function (entry) {
               return [entry.subject, entry.cardIn, entry.cardOut].some(function (field) {
                  return field && normalizeName(field).indexOf(needle) >= 0;
               });
            });
         }
      };
   }

   function rejectReason(suggestion, profile, existing) {
      if (!G) {
         G = DS.RuleGuards;
      }
      if (!suggestion || !suggestion.card) {
         return 'invalid_suggestion';
      }
      if (!G.passesBlocklist(suggestion, profile)) {
         if (G.isBlockedAdd(suggestion.card.name, profile)) {
            return 'blocked_add';
         }
         return 'protected_cut';
      }
      if (G.hasDuplicate(existing, suggestion)) {
         return 'duplicate_pair';
      }
      return null;
   }

   function formatReason(entry) {
      var label = REASON_LABELS[entry.reason] || entry.reason || 'unknown';
      var parts = [];
      if (entry.ruleId) {
         parts.push('[' + entry.ruleId + ']');
      }
      if (entry.subject) {
         parts.push(entry.subject);
      }
      parts.push('— ' + label);
      if (entry.cardIn && entry.cardIn !== entry.subject) {
         parts.push('(in: ' + entry.cardIn + ')');
      }
      if (entry.cardOut) {
         parts.push('(cut: ' + entry.cardOut + ')');
      }
      if (entry.detail) {
         parts.push('— ' + entry.detail);
      }
      return parts.join(' ');
   }

   function explainCard(deck, setScope, cardName) {
      if (!G) {
         G = DS.RuleGuards;
      }
      if (!deriveSwapQueue) {
         deriveSwapQueue = global.SwapQueue.deriveSwapQueue;
      }
      var profile = deck.profile || {};
      var name = String(cardName || '').trim();
      var lines = [];
      if (!name) {
         return lines;
      }
      var nameLower = normalizeName(name);

      function push(ruleId, reason, detail, extra) {
         lines.push(Object.assign({
            ruleId: ruleId,
            outcome: reason === 'would_emit' ? 'info' : 'skipped',
            subject: name,
            reason: reason,
            detail: detail || ''
         }, extra || {}));
      }

      var queue = deriveSwapQueue(deck);
      if (!queue) {
         push('queue_in_pair', 'no_swap_queue', 'Deck has no New Set In/Out queue');
      } else {
         var inIdx = -1;
         var outIdx = -1;
         (queue.new_set_in || []).forEach(function (c, i) {
            if (normalizeName(c.name) === nameLower) {
               inIdx = i;
            }
         });
         (queue.new_set_out || []).forEach(function (c, i) {
            if (normalizeName(c.name) === nameLower) {
               outIdx = i;
            }
         });
         if (inIdx >= 0) {
            var inCard = queue.new_set_in[inIdx];
            var resolved = G.resolveQueuedInForScope(inCard, setScope);
            if (!resolved) {
               push('queue_in_pair', 'not_in_set_scope', 'Queued In not found in set pool');
            } else if (outIdx >= 0 && inIdx === outIdx) {
               push('queue_in_pair', 'would_emit', 'Paired with Out slot ' + queue.new_set_out[outIdx].name);
            } else if (inIdx >= (queue.new_set_out || []).length) {
               var taggerCtx = DS.Tagger.createContext(deck, setScope);
               var cut = DS.QueueRules && DS.QueueRules.pickCutForUnpairedIn
                  ? DS.QueueRules.pickCutForUnpairedIn(deck, profile, taggerCtx, inCard)
                  : G.pickBestCut(deck, profile, taggerCtx);
               if (!cut) {
                  push('queue_in_pair', 'no_cut_candidate', 'Unpaired In — no cut candidate');
               } else {
                  push('queue_in_pair', 'would_emit', 'Unpaired In — cut ' + cut.name, { cardOut: cut.name });
               }
            }
         }
         if (outIdx >= 0 && inIdx < 0) {
            var outCard = queue.new_set_out[outIdx];
            if (outIdx < (queue.new_set_in || []).length) {
               push('queue_out_fill', 'would_emit', 'Paired Out — handled by queue_in_pair');
            } else {
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
               if (!best) {
                  push('queue_out_fill', 'queue_out_no_replacement', 'Extra Out — no role-matched replacement in pool');
               } else {
                  push('queue_out_fill', 'would_emit', 'Extra Out — replace with ' + best.setCard.name, {
                     cardIn: best.setCard.name
                  });
               }
            }
         }
      }

      var snapshotCard = (deck.deck_snapshot && deck.deck_snapshot.cards || []).find(function (c) {
         return normalizeName(c.name) === nameLower;
      });
      if (snapshotCard && DS.ProxyRules && DS.ProxyRules.isProxyCard(snapshotCard)) {
         var official = null;
         (setScope.cards || []).forEach(function (c) {
            if (c.name === snapshotCard.name && !official) {
               official = c;
            }
         });
         if (!official) {
            push('proxy_upgrade', 'proxy_no_official_in_scope', 'Proxy has no printing in set pool');
         } else {
            push('proxy_upgrade', 'would_emit', 'Proxy upgrade to ' + official.set_code);
         }
      }

      var poolCard = G.findInSetPool(name, setScope);
      var deckNames = G.deckNamesInSnapshot(deck);
      if (poolCard) {
         var codes = {};
         (setScope.codes || []).forEach(function (c) {
            codes[String(c).toUpperCase()] = true;
         });
         var code = String(poolCard.set_code || '').toUpperCase();
         if (!codes[code]) {
            push('role_synergy', 'role_wrong_set', 'Printing set ' + code + ' not in scope');
         } else if (deckNames[nameLower]) {
            push('role_synergy', 'role_already_in_deck', 'Already in deck snapshot');
         } else {
            var match = DS.Tagger.matchSetCardToRoles(poolCard, profile);
            if (!match) {
               push('role_synergy', 'role_no_match', 'No profile role/tag overlap');
            } else {
               var taggerCtx = DS.Tagger.createContext(deck, setScope);
               var cut = G.pickBestCut(deck, profile, taggerCtx);
               if (!cut) {
                  push('role_synergy', 'role_no_cut', 'Role match but no cut candidate');
               } else {
                  push('role_synergy', 'would_emit', 'Role ' + match.roleId + ' — cut ' + cut.name, {
                     cardOut: cut.name
                  });
               }
            }
         }
      }

      return lines;
   }

   DS.Debug = {
      createCollector: createCollector,
      rejectReason: rejectReason,
      formatReason: formatReason,
      explainCard: explainCard,
      REASON_LABELS: REASON_LABELS
   };
})(window);
