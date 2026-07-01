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

   async function fetchSetPool(codes) {
      var key = (codes || []).join(',').toUpperCase();
      if (setPoolCache[key]) {
         return setPoolCache[key];
      }
      var cards = [];
      var seen = {};
      for (var i = 0; i < codes.length; i += 1) {
         var code = String(codes[i]).toUpperCase();
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
      var scope = {
         primaryCode: codes[0].toUpperCase(),
         codes: codes.map(function (c) { return String(c).toUpperCase(); }),
         setName: codes.join('/'),
         cards: cards,
         fetchedAt: new Date().toISOString().slice(0, 10),
         source: 'scryfall'
      };
      setPoolCache[key] = scope;
      return scope;
   }

   function loadSetScopeFromUpload(json) {
      return {
         primaryCode: (json.primaryCode || json.codes[0] || '').toUpperCase(),
         codes: (json.codes || []).map(function (c) { return String(c).toUpperCase(); }),
         setName: json.setName || 'Uploaded set',
         cards: json.cards || [],
         fetchedAt: json.fetchedAt || new Date().toISOString().slice(0, 10),
         source: 'upload'
      };
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

   DS.Data = {
      parseYamlProfile: parseYamlProfile,
      resolveDeckEligibility: resolveDeckEligibility,
      fetchSetPool: fetchSetPool,
      loadSetScopeFromUpload: loadSetScopeFromUpload,
      loadDeckRegistry: loadDeckRegistry,
      fetchDeckSnapshot: fetchDeckSnapshot,
      readProfileForDeck: readProfileForDeck,
      enrichDeckWithProfile: enrichDeckWithProfile,
      attachProfileLists: attachProfileLists,
      clearSetPoolCache: function () { setPoolCache = {}; }
   };
})(window);
