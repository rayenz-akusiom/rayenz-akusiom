(function (global) {

   'use strict';

   /*
    * ItemDB wishlist picker — custom API + localStorage cache.
    *
    * Why not embed widgets: ItemDB list widgets returned 500 during trial; the public
    * API is GET-only (no documented hide endpoint). Rate limits apply to items pulled,
    * so we fetch full lists and pick client-side from cached data.
    *
    * localStorage keys:
    *   rayenz-itemdb-cache:{user}:{slug}  — { fetchedAt, info, itemdata, fetches }
    *   rayenz-itemdb-refresh-meta         — { lastAnyRefreshAt, lastRefreshAt }
    *   rayenz-itemdb-local-hidden         — { [listId]: item_iid[] }
    *
    * Refresh policy (CACHE_TTL_MS = 24h, MIN_REFRESH_GAP_MS = 2h):
    *   Cold start — any list missing cache → fetch all lists sequentially.
    *   Warm path  — all cached → pick from cache; refresh at most one due list
    *                (oldest fetchedAt first) when TTL and gap both satisfied.
    *
    * Next item: skipCurrentItem appends item_iid to local hidden and re-picks from
    * cache (no network). On network refresh, reconcileLocalSkips drops IDs the API
    * now marks isHidden. Hide on ItemDB is manual via list URL in the UI.
    *
    * Hidden flags: when itemInfo rows omit isHidden, merge /items via
    * itemInfoNeedsItemsMerge before picking.
    *
    * Debug: localStorage['dailies-itemdb-debug'] = '1' for verbose picker trace.
    */

   var ITEMDB_DEBUG_KEY = 'dailies-itemdb-debug';
   var CACHE_KEY_PREFIX = 'rayenz-itemdb-cache:';
   var REFRESH_META_KEY = 'rayenz-itemdb-refresh-meta';
   var LOCAL_HIDDEN_KEY = 'rayenz-itemdb-local-hidden';
   var CACHE_TTL_MS = 24 * 60 * 60 * 1000;
   var MIN_REFRESH_GAP_MS = 2 * 60 * 60 * 1000;

   function hasBridge() {
      return typeof global.__bridgeFetch === 'function';
   }

   function isItemdbDebugEnabled() {
      try {
         return global.localStorage && global.localStorage.getItem(ITEMDB_DEBUG_KEY) === '1';
      } catch (err) {
         return false;
      }
   }

   function storageGet(key) {
      try {
         return global.localStorage ? global.localStorage.getItem(key) : null;
      } catch (err) {
         return null;
      }
   }

   function storageSet(key, value) {
      try {
         if (global.localStorage) {
            global.localStorage.setItem(key, value);
         }
      } catch (err) {
         /* ignore */
      }
   }

   function cacheListKey(list) {
      var user = (list && list.user) || 'rayenz';
      var slug = list && list.slug;
      return CACHE_KEY_PREFIX + encodeURIComponent(user) + ':' + encodeURIComponent(slug || '');
   }

   function loadListCache(list) {
      var raw = storageGet(cacheListKey(list));
      if (!raw) {
         return null;
      }
      try {
         var cache = JSON.parse(raw);
         if (!cache || !Array.isArray(cache.info) || !Array.isArray(cache.itemdata)) {
            return null;
         }
         return cache;
      } catch (err) {
         return null;
      }
   }

   function saveListCache(list, data, fetchedAt) {
      storageSet(cacheListKey(list), JSON.stringify({
         fetchedAt: fetchedAt,
         info: data.info,
         itemdata: data.itemdata,
         fetches: data.fetches || []
      }));
   }

   function loadRefreshMeta() {
      var raw = storageGet(REFRESH_META_KEY);
      if (!raw) {
         return { lastAnyRefreshAt: 0, lastRefreshAt: {} };
      }
      try {
         var meta = JSON.parse(raw);
         return {
            lastAnyRefreshAt: meta.lastAnyRefreshAt || 0,
            lastRefreshAt: meta.lastRefreshAt || {}
         };
      } catch (err) {
         return { lastAnyRefreshAt: 0, lastRefreshAt: {} };
      }
   }

   function saveRefreshMeta(meta) {
      storageSet(REFRESH_META_KEY, JSON.stringify(meta));
   }

   function loadLocalHiddenMap() {
      var raw = storageGet(LOCAL_HIDDEN_KEY);
      if (!raw) {
         return {};
      }
      try {
         var map = JSON.parse(raw);
         return map && typeof map === 'object' ? map : {};
      } catch (err) {
         return {};
      }
   }

   function saveLocalHiddenMap(map) {
      storageSet(LOCAL_HIDDEN_KEY, JSON.stringify(map || {}));
   }

   function getLocalSkipIds(listId) {
      var map = loadLocalHiddenMap();
      var ids = map[listId];
      return Array.isArray(ids) ? ids.slice() : [];
   }

   function saveLocalSkipIds(listId, ids) {
      var map = loadLocalHiddenMap();
      if (!ids || ids.length === 0) {
         delete map[listId];
      } else {
         map[listId] = ids.slice();
      }
      saveLocalHiddenMap(map);
   }

   function reconcileLocalSkips(listId, info) {
      var skips = getLocalSkipIds(listId);
      if (!skips.length) {
         return;
      }
      var infoById = {};
      info.forEach(function (row) {
         infoById[row.item_iid] = row;
      });
      var remaining = skips.filter(function (id) {
         var row = infoById[id];
         if (row && isListItemHidden(row)) {
            return false;
         }
         return true;
      });
      saveLocalSkipIds(listId, remaining);
   }

   function pickListToRefresh(lists, caches, meta, now) {
      if (meta.lastAnyRefreshAt && now - meta.lastAnyRefreshAt < MIN_REFRESH_GAP_MS) {
         return null;
      }
      var due = lists.filter(function (list) {
         var cache = caches[list.id];
         return cache && now - cache.fetchedAt >= CACHE_TTL_MS;
      }).sort(function (a, b) {
         return caches[a.id].fetchedAt - caches[b.id].fetchedAt;
      });
      return due.length ? due[0] : null;
   }

   function isSkippedItemId(skipItemIds, itemIid) {
      if (!skipItemIds || !skipItemIds.length || itemIid == null) {
         return false;
      }
      return skipItemIds.indexOf(itemIid) !== -1;
   }

   function hubFetch(url, options) {
      if (hasBridge()) {
         return global.__bridgeFetch(url, options || {});
      }
      return fetch(url, options);
   }

   function itemdbErrorMessage(status, context) {
      if (status === 401) {
         return 'ItemDB session expired — visit itemdb.com.br (log in if needed), then refresh';
      }
      if (status === 404) {
         return 'ItemDB list not found';
      }
      if (status === 429) {
         return 'ItemDB rate limit — wait a moment and refresh';
      }
      return 'ItemDB ' + context + ' fetch failed (' + status + ')';
   }

   async function parseJsonArray(resp, context) {
      if (!resp.ok) {
         throw new Error(itemdbErrorMessage(resp.status, context));
      }
      var data = await resp.json();
      if (!Array.isArray(data)) {
         throw new Error('ItemDB ' + context + ' returned unexpected data');
      }
      return data;
   }

   function isListItemHidden(row) {
      if (!row) {
         return true;
      }
      return row.isHidden === true || row.isHidden === 1;
   }

   function parseListItemInfo(listInfoPayload) {
      if (!Array.isArray(listInfoPayload) || !listInfoPayload[0]) {
         return null;
      }
      var itemInfo = listInfoPayload[0].itemInfo;
      return Array.isArray(itemInfo) ? itemInfo : null;
   }

   function itemInfoHasHiddenFlags(itemInfo) {
      if (!Array.isArray(itemInfo)) {
         return false;
      }
      return itemInfo.some(function (row) {
         return row && Object.prototype.hasOwnProperty.call(row, 'isHidden');
      });
   }

   function itemInfoNeedsItemsMerge(itemInfo) {
      if (!Array.isArray(itemInfo) || itemInfo.length === 0) {
         return false;
      }
      return itemInfo.some(function (row) {
         return row && !Object.prototype.hasOwnProperty.call(row, 'isHidden');
      });
   }

   function mergeListItemRows(primary, secondary) {
      if (!Array.isArray(primary) || primary.length === 0) {
         return Array.isArray(secondary) ? secondary.slice() : [];
      }
      if (!Array.isArray(secondary) || secondary.length === 0) {
         return primary.slice();
      }
      var secondaryByItemId = {};
      secondary.forEach(function (row) {
         secondaryByItemId[row.item_iid] = row;
      });
      return primary.map(function (row) {
         var other = secondaryByItemId[row.item_iid];
         if (!other) {
            return row;
         }
         var hidden = isListItemHidden(row) || isListItemHidden(other);
         return Object.assign({}, row, { isHidden: hidden });
      });
   }

   async function fetchListItemRows(base) {
      var fetches = ['list-info'];
      var listInfoResp = await hubFetch(base);
      if (!listInfoResp.ok) {
         throw new Error(itemdbErrorMessage(listInfoResp.status, 'list info'));
      }
      var listInfoPayload = await listInfoResp.json();
      var itemInfo = parseListItemInfo(listInfoPayload);
      if (itemInfo) {
         if (itemInfoNeedsItemsMerge(itemInfo)) {
            fetches.push('items');
            var itemsResp = await hubFetch(base + '/items');
            var itemsRows = await parseJsonArray(itemsResp, 'items');
            return { info: mergeListItemRows(itemInfo, itemsRows), fetches: fetches };
         }
         return { info: itemInfo, fetches: fetches };
      }
      fetches.push('items');
      var fallbackResp = await hubFetch(base + '/items');
      return { info: await parseJsonArray(fallbackResp, 'items'), fetches: fetches };
   }

   async function fetchListData(list) {
      var user = (list && list.user) || 'rayenz';
      var slug = list && list.slug;
      if (!slug) {
         throw new Error('ItemDB list slug missing');
      }
      var base = 'https://itemdb.com.br/api/v1/lists/' + encodeURIComponent(user) + '/' + encodeURIComponent(slug);
      var fetched = await Promise.all([
         hubFetch(base + '/itemdata').then(function (resp) {
            return parseJsonArray(resp, 'itemdata');
         }),
         fetchListItemRows(base)
      ]);
      return {
         info: fetched[1].info,
         itemdata: fetched[0],
         fetches: fetched[1].fetches.concat(['itemdata'])
      };
   }

   function buildItemLookup(itemdata) {
      var byItemId = {};
      if (!Array.isArray(itemdata)) {
         return byItemId;
      }
      itemdata.forEach(function (item) {
         byItemId[item.internal_id] = item;
         if (item.item_id != null) {
            byItemId[item.item_id] = item;
         }
      });
      return byItemId;
   }

   function findInfoRow(info, item) {
      if (!Array.isArray(info) || !item) {
         return null;
      }
      for (var i = 0; i < info.length; i++) {
         var row = info[i];
         if (row.item_iid === item.internal_id || row.item_iid === item.item_id) {
            return row;
         }
      }
      return null;
   }

   function getIneligibilityReason(row, byItemId, skipItemIds) {
      if (isSkippedItemId(skipItemIds, row && row.item_iid)) {
         return 'local-skip';
      }
      if (isListItemHidden(row)) {
         return 'hidden';
      }
      var item = byItemId[row.item_iid];
      if (!item) {
         return 'missing-itemdata';
      }
      if (item.isNC) {
         return 'nc';
      }
      if (item.specialType && item.specialType !== 'trading') {
         return 'non-trading';
      }
      return null;
   }

   function isEligibleTradeableItem(row, byItemId, skipItemIds) {
      return getIneligibilityReason(row, byItemId, skipItemIds) === null;
   }

   function itemPriceValue(item) {
      if (!item || !item.price || typeof item.price.value !== 'number') {
         return Infinity;
      }
      return item.price.value;
   }

   function formatPickPrice(item) {
      var value = itemPriceValue(item);
      if (value === Infinity) {
         return 'no price';
      }
      return value.toLocaleString('en-US') + ' NP';
   }

   function formatCacheAgeMs(ageMs) {
      if (ageMs == null || ageMs < 0) {
         return '';
      }
      var mins = Math.floor(ageMs / 60000);
      if (mins < 60) {
         return mins + 'm';
      }
      var hours = Math.floor(mins / 60);
      if (hours < 24) {
         return hours + 'h';
      }
      return Math.floor(hours / 24) + 'd';
   }

   function countPickerStats(info, itemdata) {
      var byItemId = buildItemLookup(itemdata);
      var stats = {
         infoRows: info.length,
         itemdataRows: itemdata.length,
         hidden: 0,
         nc: 0,
         nonTrading: 0,
         missingItemdata: 0,
         eligible: 0,
         withPrice: 0
      };
      info.forEach(function (row) {
         if (isListItemHidden(row)) {
            stats.hidden += 1;
            return;
         }
         var item = byItemId[row.item_iid];
         if (!item) {
            stats.missingItemdata += 1;
            return;
         }
         if (item.isNC) {
            stats.nc += 1;
            return;
         }
         if (item.specialType && item.specialType !== 'trading') {
            stats.nonTrading += 1;
            return;
         }
         stats.eligible += 1;
         if (itemPriceValue(item) !== Infinity) {
            stats.withPrice += 1;
         }
      });
      return stats;
   }

   function buildPriceDebugTrace(info, itemdata, picked, skipItemIds) {
      var byItemId = buildItemLookup(itemdata);
      var sorted = itemdata.slice().sort(function (a, b) {
         return itemPriceValue(a) - itemPriceValue(b);
      });
      var trace = [];
      for (var i = 0; i < sorted.length && trace.length < 10; i++) {
         var item = sorted[i];
         var row = findInfoRow(info, item);
         var skipReason = row ? getIneligibilityReason(row, byItemId, skipItemIds) : 'not-in-list-info';
         var entry = {
            name: item.name,
            price: itemPriceValue(item),
            isHidden: row ? isListItemHidden(row) : null,
            specialType: item.specialType || null,
            skipReason: skipReason || (picked && picked.internal_id === item.internal_id ? 'picked' : 'eligible')
         };
         if (!skipReason && picked && picked.internal_id === item.internal_id) {
            entry.skipReason = 'picked';
         } else if (!skipReason) {
            entry.skipReason = 'eligible';
         }
         trace.push(entry);
      }
      return trace;
   }

   function pickCheapestTradeableItem(info, itemdata, options) {
      options = options || {};
      var skipItemIds = options.skipItemIds || [];
      if (!Array.isArray(info) || !Array.isArray(itemdata)) {
         if (options.debug) {
            return { item: null, trace: [], stats: null };
         }
         return null;
      }
      var byItemId = buildItemLookup(itemdata);
      var sortedByPrice = itemdata.slice().sort(function (a, b) {
         return itemPriceValue(a) - itemPriceValue(b);
      });
      var picked = null;
      var unpricedFallback = null;
      for (var i = 0; i < sortedByPrice.length; i++) {
         var item = sortedByPrice[i];
         var row = findInfoRow(info, item);
         if (!row || !isEligibleTradeableItem(row, byItemId, skipItemIds)) {
            continue;
         }
         if (itemPriceValue(item) === Infinity) {
            if (!unpricedFallback) {
               unpricedFallback = item;
            }
            continue;
         }
         picked = item;
         break;
      }
      if (!picked) {
         picked = unpricedFallback;
      }
      if (options.debug) {
         return {
            item: picked,
            trace: buildPriceDebugTrace(info, itemdata, picked, skipItemIds),
            stats: countPickerStats(info, itemdata)
         };
      }
      return picked;
   }

   function logItemdbSummary(list, data, pickResult, fetches, error, logMeta) {
      var label = (list && list.label) || (list && list.slug) || 'wishlist';
      var slug = (list && list.slug) || '';
      var fetchNote = fetches && fetches.length ? fetches.join(' + ') : 'none';
      logMeta = logMeta || {};
      if (error) {
         console.info('[Dailies ItemDB] ' + label + ' (' + slug + '): error — ' + error + ' | fetches: ' + fetchNote);
         return;
      }
      var stats = pickResult && pickResult.stats ? pickResult.stats : countPickerStats(data.info, data.itemdata);
      var item = pickResult && pickResult.item !== undefined ? pickResult.item : pickResult;
      var pickLabel = item ? '"' + item.name + '" ' + formatPickPrice(item) : 'none';
      var sourceNote = logMeta.source ? ' source=' + logMeta.source : '';
      var cacheNote = logMeta.cacheAge != null ? ' cacheAge=' + logMeta.cacheAge : '';
      var skipNote = logMeta.localSkips != null ? ' localSkips=' + logMeta.localSkips : '';
      console.info(
         '[Dailies ItemDB] ' + label + ' (' + slug + '): ' +
         'info=' + stats.infoRows + ' itemdata=' + stats.itemdataRows +
         ' hidden=' + stats.hidden + ' eligible=' + stats.eligible +
         ' picked=' + pickLabel + sourceNote + cacheNote + skipNote +
         ' | fetches: ' + fetchNote
      );
   }

   function logItemdbDebug(list, data, pickResult, fetches) {
      var label = (list && list.label) || (list && list.slug) || 'wishlist';
      console.group('[Dailies ItemDB debug] ' + label);
      console.info('fetches:', fetches);
      console.info('items merge:', data.fetches && data.fetches.indexOf('items') !== -1 ? 'yes (partial or missing isHidden on itemInfo)' : 'no');
      console.info('stats:', pickResult.stats);
      console.info('top cheapest trace:', pickResult.trace);
      console.groupEnd();
   }

   function buildTargetFromListData(list, data, debug, meta, fromCache, cachedAt, refreshed) {
      var skipItemIds = getLocalSkipIds(list.id);
      var pickOptions = { skipItemIds: skipItemIds };
      if (debug) {
         pickOptions.debug = true;
      }
      var pickResult = pickCheapestTradeableItem(data.info, data.itemdata, pickOptions);
      var item = debug ? pickResult.item : pickResult;
      var source = fromCache ? 'cached' : 'network';
      var cacheAge = cachedAt != null ? formatCacheAgeMs(Date.now() - cachedAt) : null;
      logItemdbSummary(list, data, debug ? pickResult : item, fromCache ? [] : data.fetches, null, {
         source: source,
         cacheAge: cacheAge,
         localSkips: skipItemIds.length
      });
      if (debug) {
         logItemdbDebug(list, data, pickResult, data.fetches || []);
      }
      return {
         list: list,
         item: item,
         error: null,
         fromCache: fromCache,
         cachedAt: cachedAt,
         refreshed: refreshed
      };
   }

   async function fetchAndCacheList(list, debug, now, meta) {
      var data = await fetchListData(list);
      reconcileLocalSkips(list.id, data.info);
      saveListCache(list, data, now);
      meta.lastAnyRefreshAt = now;
      meta.lastRefreshAt[list.id] = now;
      return buildTargetFromListData(list, data, debug, meta, false, now, true);
   }

   function pickNextForList(list) {
      var cache = loadListCache(list);
      if (!cache) {
         return { list: list, item: null, error: 'no-cache', fromCache: false, cachedAt: null, refreshed: false };
      }
      var debug = isItemdbDebugEnabled();
      return buildTargetFromListData(list, cache, debug, null, true, cache.fetchedAt, false);
   }

   function skipCurrentItem(list, itemIid) {
      var skips = getLocalSkipIds(list.id);
      if (itemIid != null && skips.indexOf(itemIid) === -1) {
         skips.push(itemIid);
         saveLocalSkipIds(list.id, skips);
      }
      return pickNextForList(list);
   }

   async function loadListTargets(lists, settings, options) {
      options = options || {};
      var now = options.now != null ? options.now : Date.now();

      if (!hasBridge()) {
         return lists.map(function (list) {
            return { list: list, item: null, error: 'no-bridge', fromCache: false, cachedAt: null, refreshed: false };
         });
      }

      var debug = isItemdbDebugEnabled();
      var meta = loadRefreshMeta();
      var caches = {};
      var coldStart = false;

      lists.forEach(function (list) {
         caches[list.id] = loadListCache(list);
         if (!caches[list.id]) {
            coldStart = true;
         }
      });

      if (coldStart) {
         var coldResults = [];
         for (var i = 0; i < lists.length; i++) {
            try {
               coldResults.push(await fetchAndCacheList(lists[i], debug, now, meta));
            } catch (err) {
               var message = err.message || 'fetch-failed';
               logItemdbSummary(lists[i], null, null, null, message);
               coldResults.push({
                  list: lists[i],
                  item: null,
                  error: message,
                  fromCache: false,
                  cachedAt: null,
                  refreshed: false
               });
            }
         }
         saveRefreshMeta(meta);
         return coldResults;
      }

      var results = lists.map(function (list) {
         return buildTargetFromListData(list, caches[list.id], debug, meta, true, caches[list.id].fetchedAt, false);
      });

      var toRefresh = pickListToRefresh(lists, caches, meta, now);
      if (toRefresh) {
         var refreshIndex = lists.findIndex(function (list) {
            return list.id === toRefresh.id;
         });
         try {
            results[refreshIndex] = await fetchAndCacheList(toRefresh, debug, now, meta);
         } catch (err) {
            var refreshMessage = err.message || 'fetch-failed';
            logItemdbSummary(toRefresh, null, null, null, refreshMessage);
            results[refreshIndex] = {
               list: toRefresh,
               item: null,
               error: refreshMessage,
               fromCache: false,
               cachedAt: caches[toRefresh.id] ? caches[toRefresh.id].fetchedAt : null,
               refreshed: false
            };
         }
         saveRefreshMeta(meta);
      }

      return results;
   }

   global.DailiesItemdb = {
      pickCheapestTradeableItem: pickCheapestTradeableItem,
      pickFirstTradeableItem: pickCheapestTradeableItem,
      loadListTargets: loadListTargets,
      pickNextForList: pickNextForList,
      skipCurrentItem: skipCurrentItem,
      hasBridge: hasBridge,
      hubFetch: hubFetch,
      isListItemHidden: isListItemHidden,
      parseListItemInfo: parseListItemInfo,
      itemInfoHasHiddenFlags: itemInfoHasHiddenFlags,
      itemInfoNeedsItemsMerge: itemInfoNeedsItemsMerge,
      mergeListItemRows: mergeListItemRows,
      isItemdbDebugEnabled: isItemdbDebugEnabled,
      getIneligibilityReason: getIneligibilityReason,
      loadListCache: loadListCache,
      saveListCache: saveListCache,
      loadRefreshMeta: loadRefreshMeta,
      saveRefreshMeta: saveRefreshMeta,
      pickListToRefresh: pickListToRefresh,
      getLocalSkipIds: getLocalSkipIds,
      cacheListKey: cacheListKey,
      formatCacheAgeMs: formatCacheAgeMs,
      CACHE_TTL_MS: CACHE_TTL_MS,
      MIN_REFRESH_GAP_MS: MIN_REFRESH_GAP_MS,
      ITEMDB_DEBUG_KEY: ITEMDB_DEBUG_KEY
   };

})(window);
