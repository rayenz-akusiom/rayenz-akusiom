(function (global) {
   'use strict';

   var OR = global.OrderReconcile;
   var state = OR.state;
   var sleep = HubUtils.sleep;
   var bridgeAvailable = HubUtils.bridgeAvailable;
   var sortDecksByName = OR.sortDecksByName;
   var showProgress = OR.showProgress;
   var finishProgress = OR.finishProgress;
   var setStatus = OR.setStatus;

   function parseFolderId(url) {
      var match = String(url || '').match(/archidekt\.com\/folders\/(\d+)/);
      return match ? parseInt(match[1], 10) : null;
   }

   async function loadDeckRegistry() {
      var source = state.settings.registrySource || 'folder';
      if (source === 'urls') {
         var urls = (state.settings.customDeckUrls || '').split(/\r?\n/).filter(Boolean);
         return urls.map(function (url, i) {
            return {
               deck_id: 'custom-' + i,
               deck_name: 'Deck ' + (i + 1),
               archidekt_url: url.trim()
            };
         });
      }
      if (!bridgeAvailable() || typeof global.RayenzArchidektBridge.fetchFolder !== 'function') {
         throw new Error('Install Archidekt Deck Review Bridge userscript (2026-06-25-2+) for folder fetch.');
      }
      var folderId = parseFolderId(state.settings.folderUrl);
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

   async function fetchAllSnapshots() {
      try {
         state.decks = sortDecksByName(await loadDeckRegistry());
         var total = state.decks.length + 1;
         var step = 0;
         showProgress(step, total, 'Fetching staging deck…');
         state.stagingDeck = {
            deck_id: OR.STAGING_DECK_ID,
            deck_name: 'Buy / trade list',
            archidekt_url: state.settings.stagingDeckUrl,
            deck_snapshot: await fetchDeckSnapshot(state.settings.stagingDeckUrl)
         };
         step = 1;
         showProgress(step, total, 'Fetched staging deck');
         for (var i = 0; i < state.decks.length; i++) {
            step = i + 2;
            showProgress(step, total,
               'Fetching deck ' + (i + 1) + '/' + state.decks.length + ': ' + state.decks[i].deck_name + '…');
            state.decks[i].deck_snapshot = await fetchDeckSnapshot(state.decks[i].archidekt_url);
            if (i < state.decks.length - 1) {
               await sleep(150);
            }
         }
         setStatus('Fetched ' + state.decks.length + ' decks + staging list.');
         finishProgress('Fetched ' + state.decks.length + ' decks + staging list.');
      } catch (err) {
         finishProgress(err.message || String(err), 'error');
         throw err;
      }
   }

   async function validateScryfallName(name) {
      var url = 'https://api.scryfall.com/cards/named?exact=' + encodeURIComponent(name);
      var resp = await fetch(url);
      return resp.ok;
   }

   async function fetchColorIdentity(cardName) {
      if (!cardName) {
         return [];
      }
      var cacheKey = cardName.toLowerCase();
      if (state.colorIdentityCache[cacheKey]) {
         return state.colorIdentityCache[cacheKey];
      }
      try {
         var url = 'https://api.scryfall.com/cards/named?exact=' + encodeURIComponent(cardName);
         var resp = await fetch(url);
         if (!resp.ok) {
            return [];
         }
         var json = await resp.json();
         var ci = json.color_identity || [];
         state.colorIdentityCache[cacheKey] = ci;
         return ci;
      } catch (e) {
         return [];
      }
   }

   async function resolveCubeDestinationForCard(deck, cardName) {
      if (!deck || !deck.deck_snapshot || !cardName) {
         return '';
      }
      var snapshot = deck.deck_snapshot;
      var matched = null;
      (snapshot.cards || []).forEach(function (card) {
         if (matched) {
            return;
         }
         if (OrderReconcileExport.namesMatch(cardName, card.name) && card.color_identity) {
            matched = card;
         }
      });
      if (matched && matched.color_identity && matched.color_identity.length) {
         return OrderReconcileExport.resolveCubeDestinationCategory(snapshot, matched.color_identity);
      }
      var ci = await fetchColorIdentity(cardName);
      return OrderReconcileExport.resolveCubeDestinationCategory(snapshot, ci);
   }

   async function fetchPrintings(cardName) {
      return ScryfallCache.fetchPrintings(cardName);
   }

   function printOptionLines(p) {
      var lines = [];
      if (p.set_name || p.set) {
         lines.push((p.set_name || p.set).toUpperCase() + (p.collector_number ? ' #' + p.collector_number : ''));
      }
      return lines.length ? lines : [p.name];
   }

   function printingValueFromParts(parts) {
      return JSON.stringify({
         name: parts.name,
         set_code: parts.set_code,
         collector_number: parts.collector_number,
         finish: parts.finish || 'nonfoil'
      });
   }

   function readPrintingValue(raw) {
      try {
         return raw ? JSON.parse(raw) : null;
      } catch (e) {
         return null;
      }
   }

   OR.parseFolderId = parseFolderId;
   OR.loadDeckRegistry = loadDeckRegistry;
   OR.fetchDeckSnapshot = fetchDeckSnapshot;
   OR.fetchAllSnapshots = fetchAllSnapshots;
   OR.validateScryfallName = validateScryfallName;
   OR.fetchColorIdentity = fetchColorIdentity;
   OR.resolveCubeDestinationForCard = resolveCubeDestinationForCard;
   OR.fetchPrintings = fetchPrintings;
   OR.printOptionLines = printOptionLines;
   OR.printingValueFromParts = printingValueFromParts;
   OR.readPrintingValue = readPrintingValue;
})(window);
