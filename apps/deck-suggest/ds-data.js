(function (global) {
   'use strict';

   var DS = global.DeckSuggest || (global.DeckSuggest = {});
   var deriveSwapQueue = global.SwapQueue.deriveSwapQueue;
   var sleep = HubUtils.sleep;
   var bridgeAvailable = HubUtils.bridgeAvailable;

   var setPoolCache = {};

   function parseFolderId(url) {
      var match = String(url || '').match(/archidekt\.com\/folders\/(\d+)/);
      return match ? parseInt(match[1], 10) : null;
   }

   function parseYamlProfile(text) {
      var profile = { roles: [], protected_cards: [], blocked_cards: [] };
      var currentList = null;
      var currentRole = null;
      String(text || '').split(/\r?\n/).forEach(function (line) {
         var trimmed = line.trim();
         if (!trimmed || trimmed.charAt(0) === '#') {
            return;
         }
         if (trimmed === 'roles:') {
            return;
         }
         if (trimmed.indexOf('- id:') === 0) {
            currentRole = { id: trimmed.replace('- id:', '').trim(), tags: [] };
            profile.roles.push(currentRole);
            return;
         }
         if (currentRole && trimmed.indexOf('priority:') === 0) {
            currentRole.priority = trimmed.replace('priority:', '').trim();
            return;
         }
         if (currentRole && trimmed.indexOf('tags:') === 0) {
            var tagMatch = trimmed.match(/\[(.*)\]/);
            if (tagMatch) {
               currentRole.tags = tagMatch[1].split(',').map(function (t) {
                  return t.trim().replace(/^['"]|['"]$/g, '');
               }).filter(Boolean);
            }
            return;
         }
         if (trimmed === 'protected_cards:') {
            currentList = 'protected_cards';
            return;
         }
         if (trimmed === 'blocked_cards:') {
            currentList = 'blocked_cards';
            return;
         }
         if (trimmed.indexOf('deck_id:') === 0) {
            profile.deck_id = trimmed.replace('deck_id:', '').trim();
            return;
         }
         if (trimmed.indexOf('format:') === 0) {
            profile.format = trimmed.replace('format:', '').trim();
            return;
         }
         if (trimmed.indexOf('- ') === 0 && currentList) {
            profile[currentList].push(trimmed.replace('- ', '').trim().replace(/^['"]|['"]$/g, ''));
         }
      });
      return profile;
   }

   function resolveDeckEligibility(deck) {
      var profile = deck.profile || {};
      var format = profile.format;
      if (format && format !== 'commander') {
         return {
            eligible: false,
            reason: 'non_commander_format',
            message: deck.deck_name + ': skipped (profile format is ' + format + ').'
         };
      }
      if (global.OrderReconcileExport && OrderReconcileExport.isCubeDeck(deck)) {
         return {
            eligible: false,
            reason: 'cube_or_non_commander',
            message: deck.deck_name + ': skipped (cube deck — out of scope for v1).'
         };
      }
      if (SwapQueue.hasMaybeboardOnlySwapQueue(deck.deck_snapshot)) {
         return {
            eligible: false,
            reason: 'maybeboard_swap_queue',
            message: deck.deck_name + ': skipped (Maybeboard-only swap queue).'
         };
      }
      if (format === 'commander') {
         return { eligible: true, format: 'commander' };
      }
      return { eligible: true, format: 'commander', inferred: true };
   }

   function buildScopeFromCodes(codes, cards, source) {
      var upper = codes.map(function (c) { return String(c).toUpperCase(); });
      var codesKey = HubStorage.normalizeSetCodesKey(upper);
      return indexSetPool({
         primaryCode: upper[0],
         codes: upper,
         codesKey: codesKey,
         setName: upper.join('/'),
         cards: cards,
         fetchedAt: new Date().toISOString().slice(0, 10),
         source: source || 'scryfall',
         complete: true
      });
   }

   function indexSetPool(scope) {
      if (!scope) {
         return scope;
      }
      if (scope.indexVersion === 1 && scope.cardsByName) {
         return scope;
      }
      var cardsByName = {};
      (scope.cards || []).forEach(function (card) {
         var key = String(card.name || '').toLowerCase();
         if (!key) {
            return;
         }
         if (!cardsByName[key]) {
            cardsByName[key] = [];
         }
         cardsByName[key].push(card);
      });
      scope.cardsByName = cardsByName;
      scope.indexVersion = 1;
      return scope;
   }

   function ensureSetPoolIndexed(scope) {
      return indexSetPool(scope);
   }

   function buildDeckRuleContext(deck) {
      if (deck.ruleContext && deck.ruleContext.version === 1) {
         return deck.ruleContext;
      }
      var deckNames = {};
      (deck.deck_snapshot && deck.deck_snapshot.cards || []).forEach(function (card) {
         if (card.name) {
            deckNames[card.name.toLowerCase()] = true;
         }
      });
      deck.ruleContext = {
         version: 1,
         swapQueue: deriveSwapQueue(deck),
         deckNames: deckNames,
         cutCandidates: null
      };
      return deck.ruleContext;
   }

   function getDeckSwapQueue(deck) {
      return buildDeckRuleContext(deck).swapQueue;
   }

   function tryRestoreSetPool(codesKey) {
      if (!codesKey) {
         return null;
      }
      if (setPoolCache[codesKey]) {
         return ensureSetPoolIndexed(setPoolCache[codesKey]);
      }
      var stored = HubStorage.loadSetPoolCache(codesKey);
      if (stored) {
         setPoolCache[codesKey] = ensureSetPoolIndexed(stored);
         return setPoolCache[codesKey];
      }
      return null;
   }

   async function fetchSetPool(codes, options) {
      options = options || {};
      var normalized = (codes || []).map(function (c) {
         return String(c).trim().toUpperCase();
      }).filter(Boolean);
      if (!normalized.length) {
         throw new Error('Enter at least one set code.');
      }
      var codesKey = HubStorage.normalizeSetCodesKey(normalized);
      if (!options.forceRefresh) {
         var cached = tryRestoreSetPool(codesKey);
         if (cached) {
            return cached;
         }
      } else {
         HubStorage.clearSetPoolCache(codesKey);
         delete setPoolCache[codesKey];
      }

      var cards = [];
      var seen = {};
      try {
         for (var i = 0; i < normalized.length; i += 1) {
            var code = normalized[i];
            var page = 1;
            var hasMore = true;
            while (hasMore) {
               var url = 'https://api.scryfall.com/cards/search?q=set:' + encodeURIComponent(code.toLowerCase()) +
                  '&unique=prints&order=name&page=' + page;
               var resp = await fetch(url);
               if (!resp.ok) {
                  throw new Error('Scryfall set fetch failed for ' + code + ' (' + resp.status + ')');
               }
               var json = await resp.json();
               (json.data || []).forEach(function (card) {
                  var oracleKey = card.name.toLowerCase();
                  if (seen[oracleKey]) {
                     return;
                  }
                  seen[oracleKey] = true;
                  cards.push({
                     name: card.name,
                     set_code: (card.set || code).toUpperCase(),
                     collector_number: String(card.collector_number || ''),
                     scryfall_id: card.id,
                     scryfall_uri: card.scryfall_uri,
                     mana_cost: card.mana_cost || '',
                     cmc: card.cmc != null ? card.cmc : 0,
                     type_line: card.type_line || '',
                     oracle_text: card.oracle_text || '',
                     keywords: card.keywords || []
                  });
               });
               hasMore = json.has_more === true;
               page += 1;
               if (hasMore) {
                  await sleep(100);
               }
            }
         }
      } catch (err) {
         throw err;
      }

      var scope = buildScopeFromCodes(normalized, cards, 'scryfall');
      setPoolCache[codesKey] = scope;
      HubStorage.saveSetPoolCache(codesKey, scope);
      return scope;
   }

   function loadSetScopeFromUpload(json) {
      var codes = (json.codes || []).map(function (c) { return String(c).toUpperCase(); });
      if (!codes.length && json.primaryCode) {
         codes = [String(json.primaryCode).toUpperCase()];
      }
      var scope = indexSetPool({
         primaryCode: (json.primaryCode || codes[0] || '').toUpperCase(),
         codes: codes,
         codesKey: HubStorage.normalizeSetCodesKey(codes),
         setName: json.setName || 'Uploaded set',
         cards: json.cards || [],
         fetchedAt: json.fetchedAt || new Date().toISOString().slice(0, 10),
         source: 'upload',
         complete: true
      });
      if (scope.codesKey) {
         setPoolCache[scope.codesKey] = scope;
         HubStorage.saveSetPoolCache(scope.codesKey, scope);
      }
      return scope;
   }

   async function loadDeckRegistry(folderUrl) {
      if (!bridgeAvailable() || typeof global.RayenzArchidektBridge.fetchFolder !== 'function') {
         throw new Error('Install Archidekt Deck Review Bridge userscript for folder fetch.');
      }
      var folderId = parseFolderId(folderUrl);
      if (!folderId) {
         throw new Error('Invalid Archidekt folder URL.');
      }
      return global.RayenzArchidektBridge.fetchFolder(folderId);
   }

   async function fetchDeckSnapshot(url) {
      if (!bridgeAvailable()) {
         throw new Error('Install Archidekt Deck Review Bridge userscript for live Archidekt fetch.');
      }
      var deckId = ArchidektExport.parseDeckId(url);
      if (!deckId) {
         throw new Error('Invalid Archidekt URL: ' + url);
      }
      return global.RayenzArchidektBridge.fetchDeckSnapshot(deckId);
   }

   async function readProfileForDeck(deckId) {
      if (!global.ProfileSync || !ProfileSync.readProfileYaml) {
         return null;
      }
      try {
         var text = await ProfileSync.readProfileYaml(deckId);
         return text ? parseYamlProfile(text) : null;
      } catch (err) {
         return null;
      }
   }

   async function enrichDeckWithProfile(deck) {
      var profile = deck.profile;
      if (!profile && deck.deck_id) {
         profile = await readProfileForDeck(deck.deck_id);
      }
      deck.profile = profile || deck.profile || {};
      if (!deck.format) {
         deck.format = deck.profile.format || 'commander';
      }
      var eligibility = resolveDeckEligibility(deck);
      deck.eligibility = eligibility;
      if (eligibility.eligible && deck.deck_snapshot) {
         buildDeckRuleContext(deck);
      }
      return deck;
   }

   function attachProfileLists(deck) {
      var profile = deck.profile || {};
      deck.profile_preferences = {
         protected_cards: profile.protected_cards || [],
         blocked_cards: profile.blocked_cards || []
      };
      return deck;
   }

   function humanizeSlug(slug) {
      return String(slug || '').replace(/-/g, ' ').replace(/\b\w/g, function (c) {
         return c.toUpperCase();
      });
   }

   function deckNameFromUrl(url) {
      var slugMatch = String(url || '').match(/archidekt\.com\/decks\/\d+\/([^/?#]+)/i);
      if (slugMatch) {
         return humanizeSlug(slugMatch[1]);
      }
      var deckId = ArchidektExport.parseDeckId(url);
      return deckId ? 'Deck ' + deckId : 'Deck';
   }

   function parseDeckListFromText(text) {
      var lines = String(text || '').split(/\r?\n/);
      var decks = [];
      var seen = {};
      lines.forEach(function (line) {
         var trimmed = line.trim();
         if (!trimmed || trimmed.charAt(0) === '#') {
            return;
         }
         var url = trimmed;
         if (url.indexOf('http') !== 0) {
            url = 'https://archidekt.com/decks/' + url.replace(/^\/+/, '');
         }
         var deckId = ArchidektExport.parseDeckId(url);
         if (!deckId) {
            throw new Error('Invalid Archidekt deck URL: ' + trimmed);
         }
         if (seen[deckId]) {
            return;
         }
         seen[deckId] = true;
         decks.push({
            deck_id: 'deck-' + deckId,
            deck_name: deckNameFromUrl(url),
            archidekt_url: url
         });
      });
      if (!decks.length) {
         throw new Error('Paste at least one Archidekt deck URL (one per line).');
      }
      return decks;
   }

   function buildDeckFromImportText(text, options) {
      options = options || {};
      var cards = ArchidektExport.parseImportText(text);
      var deckId = options.deck_id;
      if (!deckId && options.archidekt_url) {
         var parsedId = ArchidektExport.parseDeckId(options.archidekt_url);
         deckId = parsedId ? 'deck-' + parsedId : null;
      }
      if (!deckId) {
         deckId = 'paste-import-' + Date.now();
      }
      return {
         deck_id: deckId,
         deck_name: options.deck_name || 'Pasted deck',
         archidekt_url: options.archidekt_url || '',
         format: 'commander',
         deck_snapshot: {
            fetched_at: new Date().toISOString().slice(0, 10),
            source: 'paste-import',
            cards: cards
         }
      };
   }

   DS.Data = {
      parseYamlProfile: parseYamlProfile,
      resolveDeckEligibility: resolveDeckEligibility,
      indexSetPool: indexSetPool,
      ensureSetPoolIndexed: ensureSetPoolIndexed,
      buildDeckRuleContext: buildDeckRuleContext,
      getDeckSwapQueue: getDeckSwapQueue,
      fetchSetPool: fetchSetPool,
      tryRestoreSetPool: tryRestoreSetPool,
      loadSetScopeFromUpload: loadSetScopeFromUpload,
      loadDeckRegistry: loadDeckRegistry,
      parseDeckListFromText: parseDeckListFromText,
      buildDeckFromImportText: buildDeckFromImportText,
      fetchDeckSnapshot: fetchDeckSnapshot,
      readProfileForDeck: readProfileForDeck,
      enrichDeckWithProfile: enrichDeckWithProfile,
      attachProfileLists: attachProfileLists,
      clearSetPoolCache: function () { setPoolCache = {}; }
   };
})(window);
