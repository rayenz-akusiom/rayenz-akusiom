(function (global) {

   'use strict';

   /*
    * ItemDB wishlist picker — custom API + localStorage cache.
    *
    * Why not embed widgets: ItemDB list widgets returned 500 during trial; the public
    * API is GET-only (no documented hide endpoint). Rate limits apply to items pulled,
    * so we fetch full lists and normalize client-side into a compact cache.
    *
    * localStorage keys:
    *   rayenz-itemdb-cache:{user}:{slug}  — v2: { formatVersion, fetchedAt, fetches, items[] }
    *   rayenz-itemdb-blacklist            — { formatVersion, byList: { [listId]: itemIid[] } }
    *   rayenz-itemdb-refresh-meta         — { lastAnyRefreshAt, lastRefreshAt, rateLimitedUntil }
    *
    * WishlistItem (cached items[], pre-sorted cheapest-first):
    *   itemIid, itemdbId, name, priceNp, image, shopWizardUrl, description
    *
    * Refresh policy (CACHE_TTL_MS = 24h, MIN_REFRESH_GAP_MS = 2h):
    *   Per list — serve from cache when present (zero network).
    *   At most one network fetch per visit: uncached lists first, then TTL refresh.
    *   Skip network when rateLimitedUntil is active (429 backoff).
    *   On fetch failure, fall back to stale cache when available.
    *
    * Pick: first cached item not in session skip or persistent blacklist.
    *
    * Next item: session-only skip (re-pick until reload).
    * Blacklist: persistent via context menu; survives cache refresh.
    *
    * Legacy v1 caches (info + itemdata) are ignored — lists re-fetch one at a time.
    *
    * Debug: localStorage['dailies-itemdb-debug'] = '1' for verbose picker trace.
    */

   var ITEMDB_DEBUG_KEY = 'dailies-itemdb-debug';
   var CACHE_KEY_PREFIX = 'rayenz-itemdb-cache:';
   var REFRESH_META_KEY = 'rayenz-itemdb-refresh-meta';
   var BLACKLIST_KEY = 'rayenz-itemdb-blacklist';
   var BLACKLIST_MIGRATED_KEY = 'rayenz-itemdb-blacklist-migrated';
   var LOCAL_HIDDEN_KEY = 'rayenz-itemdb-local-hidden';
   var BLACKLIST_FORMAT_VERSION = 1;
   var CACHE_FORMAT_VERSION = 2;
   var CACHE_TTL_MS = 24 * 60 * 60 * 1000;
   var MIN_REFRESH_GAP_MS = 2 * 60 * 60 * 1000;
   var RATE_LIMIT_BACKOFF_MS = 30 * 60 * 1000;
   var SEED_GOURMET_BLACKLIST = [34756, 8781, 16232, 32402];

   var sessionSkipIds = {};

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
         if (!cache || cache.formatVersion !== CACHE_FORMAT_VERSION || !Array.isArray(cache.items)) {
            return null;
         }
         return list ? migrateCacheLocalSkips(list, cache) : cache;
      } catch (err) {
         return null;
      }
   }

   function stripDescriptionsFromItems(items) {
      return items.map(function (item) {
         if (!item || !item.description) {
            return item;
         }
         var trimmed = {};
         Object.keys(item).forEach(function (key) {
            if (key !== 'description') {
               trimmed[key] = item[key];
            }
         });
         return trimmed;
      });
   }

   function buildCachePayload(items, fetchedAt, fetches) {
      return {
         formatVersion: CACHE_FORMAT_VERSION,
         fetchedAt: fetchedAt,
         fetches: fetches || [],
         items: items
      };
   }

   function persistListCache(list, payload) {
      if (!global.localStorage) {
         return;
      }
      global.localStorage.setItem(cacheListKey(list), JSON.stringify(payload));
   }

   function writeListCache(list, cache) {
      persistListCache(list, cache);
   }

   function emptyBlacklistDoc() {
      return { formatVersion: BLACKLIST_FORMAT_VERSION, byList: {} };
   }

   function loadBlacklist() {
      ensureBlacklistMigrated();
      var raw = storageGet(BLACKLIST_KEY);
      if (!raw) {
         return emptyBlacklistDoc();
      }
      try {
         var doc = JSON.parse(raw);
         if (!doc || doc.formatVersion !== BLACKLIST_FORMAT_VERSION || !doc.byList) {
            return emptyBlacklistDoc();
         }
         return doc;
      } catch (err) {
         return emptyBlacklistDoc();
      }
   }

   function saveBlacklist(doc) {
      storageSet(BLACKLIST_KEY, JSON.stringify(doc));
   }

   function mergeBlacklistIds(doc, listId, ids) {
      if (!listId || !Array.isArray(ids) || !ids.length) {
         return;
      }
      var existing = doc.byList[listId] ? doc.byList[listId].slice() : [];
      ids.forEach(function (id) {
         if (id != null && existing.indexOf(id) === -1) {
            existing.push(id);
         }
      });
      if (existing.length) {
         doc.byList[listId] = existing;
      }
   }

   function ensureBlacklistMigrated() {
      if (storageGet(BLACKLIST_MIGRATED_KEY)) {
         return;
      }
      var doc = loadBlacklistRaw() || emptyBlacklistDoc();
      var legacyRaw = storageGet(LOCAL_HIDDEN_KEY);
      if (legacyRaw) {
         try {
            var map = JSON.parse(legacyRaw);
            if (map && typeof map === 'object') {
               Object.keys(map).forEach(function (listId) {
                  mergeBlacklistIds(doc, listId, map[listId]);
               });
            }
         } catch (err) {
            /* ignore */
         }
         try {
            if (global.localStorage) {
               global.localStorage.removeItem(LOCAL_HIDDEN_KEY);
            }
         } catch (err) {
            /* ignore */
         }
      }
      mergeBlacklistIds(doc, 'gourmet-food', SEED_GOURMET_BLACKLIST);
      saveBlacklist(doc);
      storageSet(BLACKLIST_MIGRATED_KEY, '1');
   }

   function loadBlacklistRaw() {
      var raw = storageGet(BLACKLIST_KEY);
      if (!raw) {
         return null;
      }
      try {
         return JSON.parse(raw);
      } catch (err) {
         return null;
      }
   }

   function migrateCacheLocalSkips(list, cache) {
      if (!cache || !Array.isArray(cache.localSkipIds) || !cache.localSkipIds.length) {
         if (cache && cache.localSkipIds) {
            delete cache.localSkipIds;
         }
         return cache;
      }
      var doc = loadBlacklist();
      mergeBlacklistIds(doc, list.id, cache.localSkipIds);
      saveBlacklist(doc);
      delete cache.localSkipIds;
      writeListCache(list, cache);
      return cache;
   }

   function getBlacklistIds(list) {
      if (!list || !list.id) {
         return [];
      }
      var doc = loadBlacklist();
      var ids = doc.byList[list.id];
      return Array.isArray(ids) ? ids.slice() : [];
   }

   function getSessionSkipIds(listId) {
      if (!listId || !sessionSkipIds[listId]) {
         return [];
      }
      return sessionSkipIds[listId].slice();
   }

   function addSessionSkip(listId, itemIid) {
      if (!listId || itemIid == null) {
         return;
      }
      var skips = getSessionSkipIds(listId);
      if (skips.indexOf(itemIid) === -1) {
         skips.push(itemIid);
      }
      sessionSkipIds[listId] = skips;
   }

   function getPickSkipIds(list) {
      return getSessionSkipIds(list && list.id).concat(getBlacklistIds(list));
   }

   function addToBlacklist(list, itemIid) {
      if (!list || !list.id || itemIid == null) {
         return pickNextForList(list);
      }
      var doc = loadBlacklist();
      mergeBlacklistIds(doc, list.id, [itemIid]);
      saveBlacklist(doc);
      return pickNextForList(list);
   }

   function removeFromBlacklist(list, itemIid) {
      if (!list || !list.id || itemIid == null) {
         return pickNextForList(list);
      }
      var doc = loadBlacklist();
      var ids = doc.byList[list.id];
      if (!Array.isArray(ids)) {
         return pickNextForList(list);
      }
      doc.byList[list.id] = ids.filter(function (id) {
         return id !== itemIid;
      });
      if (!doc.byList[list.id].length) {
         delete doc.byList[list.id];
      }
      saveBlacklist(doc);
      return pickNextForList(list);
   }

   function getBlacklistedItemsForMenu(list) {
      var ids = getBlacklistIds(list);
      var cache = loadListCache(list);
      var byId = {};
      if (cache && Array.isArray(cache.items)) {
         cache.items.forEach(function (item) {
            if (item && item.itemIid != null) {
               byId[item.itemIid] = item;
            }
         });
      }
      return ids.map(function (id) {
         var item = byId[id];
         return {
            itemIid: id,
            name: item && item.name ? item.name : ('Item ' + id)
         };
      });
   }

   function clearSessionSkips() {
      sessionSkipIds = {};
   }

   function saveListCache(list, data, fetchedAt) {
      var normalized = normalizeWishlistFromApi(data);
      var slug = (list && list.slug) || 'wishlist';
      var payload = buildCachePayload(normalized.items, fetchedAt, data.fetches);
      try {
         persistListCache(list, payload);
         return true;
      } catch (err) {
         console.warn('[Dailies ItemDB] cache save failed for ' + slug + ':', err);
         try {
            persistListCache(list, buildCachePayload(
               stripDescriptionsFromItems(normalized.items),
               fetchedAt,
               data.fetches
            ));
            return true;
         } catch (err2) {
            console.warn('[Dailies ItemDB] cache save failed (no descriptions) for ' + slug + ':', err2);
            return false;
         }
      }
   }

   function loadRefreshMeta() {
      var raw = storageGet(REFRESH_META_KEY);
      if (!raw) {
         return { lastAnyRefreshAt: 0, lastRefreshAt: {}, rateLimitedUntil: 0 };
      }
      try {
         var meta = JSON.parse(raw);
         return {
            lastAnyRefreshAt: meta.lastAnyRefreshAt || 0,
            lastRefreshAt: meta.lastRefreshAt || {},
            rateLimitedUntil: meta.rateLimitedUntil || 0
         };
      } catch (err) {
         return { lastAnyRefreshAt: 0, lastRefreshAt: {}, rateLimitedUntil: 0 };
      }
   }

   function saveRefreshMeta(meta) {
      storageSet(REFRESH_META_KEY, JSON.stringify(meta));
   }

   function pickListToRefresh(lists, caches, meta, now) {
      if (isRateLimited(meta, now)) {
         return null;
      }
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

   function isRateLimited(meta, now) {
      return !!(meta && meta.rateLimitedUntil && now < meta.rateLimitedUntil);
   }

   function setRateLimitedUntil(meta, now) {
      meta.rateLimitedUntil = now + RATE_LIMIT_BACKOFF_MS;
   }

   function is429Error(err) {
      var message = err && err.message ? err.message : '';
      return message.indexOf('rate limit') !== -1;
   }

   function pickUncachedList(lists, caches) {
      for (var i = 0; i < lists.length; i++) {
         if (!caches[lists[i].id]) {
            return lists[i];
         }
      }
      return null;
   }

   function buildUncachedTarget(list) {
      return {
         list: list,
         item: null,
         error: 'waiting-for-cache',
         fromCache: false,
         cachedAt: null,
         refreshed: false
      };
   }

   function targetFromFetchError(list, cache, err, debug, meta, now) {
      var message = err.message || 'fetch-failed';
      if (is429Error(err)) {
         setRateLimitedUntil(meta, now);
      }
      logItemdbSummary(list, cache, null, null, message);
      if (cache) {
         return buildTargetFromListData(list, cache, debug, meta, true, cache.fetchedAt, false, 'cached-fallback');
      }
      return {
         list: list,
         item: null,
         error: message,
         fromCache: false,
         cachedAt: null,
         refreshed: false
      };
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
         return 'ItemDB rate limit or temporary outage — wait and refresh';
      }
      if (status === 502 || status === 503 || status === 504 || status === 520) {
         return 'ItemDB temporarily unavailable — try again later';
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

   function priceNpFromItemdata(item) {
      if (item && item.price && typeof item.price.value === 'number') {
         return item.price.value;
      }
      return null;
   }

   function isEligibleForCache(row, item) {
      if (isListItemHidden(row)) {
         return false;
      }
      if (!item) {
         return false;
      }
      if (item.isNC) {
         return false;
      }
      if (item.specialType && item.specialType !== 'trading') {
         return false;
      }
      return true;
   }

   function mapRowToWishlistItem(row, item) {
      var shopWizardUrl = item.findAt && item.findAt.shopWizard ? item.findAt.shopWizard : null;
      return {
         itemIid: row.item_iid,
         itemdbId: item.internal_id != null ? item.internal_id : null,
         name: item.name,
         priceNp: priceNpFromItemdata(item),
         image: item.image || null,
         shopWizardUrl: shopWizardUrl,
         description: item.description || null
      };
   }

   function itemdbUrlForWishlistItem(item) {
      if (!item) {
         return null;
      }
      if (item.itemdbId != null) {
         return 'https://itemdb.com.br/items/' + item.itemdbId;
      }
      if (item.name) {
         return 'https://itemdb.com.br/items/' + encodeURIComponent(item.name);
      }
      return null;
   }

   function wishlistItemSortTier(priceNp) {
      if (priceNp == null) {
         return 2;
      }
      if (priceNp === 0) {
         return 1;
      }
      if (priceNp > 0) {
         return 0;
      }
      return 2;
   }

   function compareWishlistItems(a, b) {
      var tierA = wishlistItemSortTier(a.priceNp);
      var tierB = wishlistItemSortTier(b.priceNp);
      if (tierA !== tierB) {
         return tierA - tierB;
      }
      if (tierA === 0) {
         return a.priceNp - b.priceNp;
      }
      return 0;
   }

   function normalizeWishlistFromApi(raw) {
      var info = raw && raw.info;
      var itemdata = raw && raw.itemdata;
      if (!Array.isArray(info) || !Array.isArray(itemdata)) {
         return { items: [], fetches: raw && raw.fetches ? raw.fetches : [] };
      }
      var byItemId = buildItemLookup(itemdata);
      var items = [];
      info.forEach(function (row) {
         var item = byItemId[row.item_iid];
         if (!isEligibleForCache(row, item)) {
            return;
         }
         items.push(mapRowToWishlistItem(row, item));
      });
      items.sort(compareWishlistItems);
      return { items: items, fetches: raw.fetches || [] };
   }

   function pickFirstWishlistItem(items, options) {
      options = options || {};
      var skipItemIds = options.skipItemIds || [];
      if (!Array.isArray(items)) {
         return null;
      }
      for (var i = 0; i < items.length; i++) {
         if (!isSkippedItemId(skipItemIds, items[i].itemIid)) {
            return items[i];
         }
      }
      return null;
   }

   function formatPickPriceNp(priceNp) {
      if (priceNp == null) {
         return 'no price';
      }
      if (priceNp === 0) {
         return '0 NP';
      }
      if (priceNp > 0) {
         return priceNp.toLocaleString('en-US') + ' NP';
      }
      return 'no price';
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

   function buildTargetFromListData(list, cache, debug, meta, fromCache, cachedAt, refreshed, logSource) {
      var skipItemIds = getPickSkipIds(list);
      var wishlistItem = pickFirstWishlistItem(cache.items, { skipItemIds: skipItemIds });
      var source = logSource || (fromCache ? 'cached' : 'network');
      var cacheAge = cachedAt != null ? formatCacheAgeMs(Date.now() - cachedAt) : null;
      var fetches = fromCache ? [] : (cache.fetches || []);

      if (wishlistItem) {
         console.info(
            '[Dailies ItemDB] chosen item',
            (list && list.label) || (list && list.slug) || 'wishlist',
            (list && list.slug) || '',
            JSON.stringify(wishlistItem)
         );
      }

      logItemdbSummary(list, cache, wishlistItem, fetches, null, {
         source: source,
         cacheAge: cacheAge,
         blacklist: getBlacklistIds(list).length,
         sessionSkips: getSessionSkipIds(list && list.id).length
      });
      if (debug) {
         logItemdbDebug(list, cache, wishlistItem, fetches);
      }
      return {
         list: list,
         item: wishlistItem,
         error: null,
         fromCache: fromCache,
         cachedAt: cachedAt,
         refreshed: refreshed
      };
   }

   async function fetchAndCacheList(list, debug, now, meta) {
      var data = await fetchListData(list);
      saveListCache(list, data, now);
      var cache = loadListCache(list);
      if (!cache) {
         var normalized = normalizeWishlistFromApi(data);
         cache = buildCachePayload(normalized.items, now, data.fetches);
      }
      meta.lastAnyRefreshAt = now;
      meta.lastRefreshAt[list.id] = now;
      return buildTargetFromListData(list, cache, debug, meta, false, now, true);
   }

   function logItemdbSummary(list, cache, wishlistItem, fetches, error, logMeta) {
      var label = (list && list.label) || (list && list.slug) || 'wishlist';
      var slug = (list && list.slug) || '';
      var fetchNote = fetches && fetches.length ? fetches.join(' + ') : 'none';
      logMeta = logMeta || {};
      if (error) {
         console.info('[Dailies ItemDB] ' + label + ' (' + slug + '): error — ' + error + ' | fetches: ' + fetchNote);
         return;
      }
      var itemCount = cache && cache.items ? cache.items.length : 0;
      var pickLabel = wishlistItem ? '"' + wishlistItem.name + '" ' + formatPickPriceNp(wishlistItem.priceNp) : 'none';
      var sourceNote = logMeta.source ? ' source=' + logMeta.source : '';
      var cacheNote = logMeta.cacheAge != null ? ' cacheAge=' + logMeta.cacheAge : '';
      var skipNote = logMeta.blacklist != null ? ' blacklist=' + logMeta.blacklist : '';
      var sessionNote = logMeta.sessionSkips != null ? ' sessionSkips=' + logMeta.sessionSkips : '';
      console.info(
         '[Dailies ItemDB] ' + label + ' (' + slug + '): ' +
         'items=' + itemCount +
         ' picked=' + pickLabel + sourceNote + cacheNote + skipNote + sessionNote +
         ' | fetches: ' + fetchNote
      );
   }

   function logItemdbDebug(list, cache, wishlistItem, fetches) {
      var label = (list && list.label) || (list && list.slug) || 'wishlist';
      var preview = (cache.items || []).slice(0, 10).map(function (item, index) {
         return {
            index: index,
            itemIid: item.itemIid,
            name: item.name,
            priceNp: item.priceNp,
            picked: wishlistItem && wishlistItem.itemIid === item.itemIid
         };
      });
      console.group('[Dailies ItemDB debug] ' + label);
      console.info('fetches:', fetches);
      console.info('items merge:', fetches && fetches.indexOf('items') !== -1 ? 'yes (partial or missing isHidden on itemInfo)' : 'no');
      console.info('cached items (top 10):', preview);
      console.info('chosen:', wishlistItem);
      console.groupEnd();
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
      addSessionSkip(list && list.id, itemIid);
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

      lists.forEach(function (list) {
         caches[list.id] = loadListCache(list);
      });

      var results = lists.map(function (list) {
         var cache = caches[list.id];
         if (cache) {
            return buildTargetFromListData(list, cache, debug, meta, true, cache.fetchedAt, false);
         }
         return buildUncachedTarget(list);
      });

      if (!isRateLimited(meta, now)) {
         var toFetch = pickUncachedList(lists, caches) || pickListToRefresh(lists, caches, meta, now);
         if (toFetch) {
            var fetchIndex = lists.findIndex(function (list) {
               return list.id === toFetch.id;
            });
            try {
               results[fetchIndex] = await fetchAndCacheList(toFetch, debug, now, meta);
            } catch (err) {
               results[fetchIndex] = targetFromFetchError(toFetch, caches[toFetch.id], err, debug, meta, now);
            }
            saveRefreshMeta(meta);
         }
      }

      return results;
   }

   global.DailiesItemdb = {
      itemdbUrlForWishlistItem: itemdbUrlForWishlistItem,
      normalizeWishlistFromApi: normalizeWishlistFromApi,
      pickFirstWishlistItem: pickFirstWishlistItem,
      pickFirstTradeableItem: pickFirstWishlistItem,
      stripDescriptionsFromItems: stripDescriptionsFromItems,
      loadListTargets: loadListTargets,
      pickNextForList: pickNextForList,
      skipCurrentItem: skipCurrentItem,
      addToBlacklist: addToBlacklist,
      removeFromBlacklist: removeFromBlacklist,
      getBlacklistIds: getBlacklistIds,
      getBlacklistedItemsForMenu: getBlacklistedItemsForMenu,
      loadBlacklist: loadBlacklist,
      clearSessionSkips: clearSessionSkips,
      hasBridge: hasBridge,
      hubFetch: hubFetch,
      isListItemHidden: isListItemHidden,
      parseListItemInfo: parseListItemInfo,
      itemInfoHasHiddenFlags: itemInfoHasHiddenFlags,
      itemInfoNeedsItemsMerge: itemInfoNeedsItemsMerge,
      mergeListItemRows: mergeListItemRows,
      isItemdbDebugEnabled: isItemdbDebugEnabled,
      itemdbErrorMessage: itemdbErrorMessage,
      loadListCache: loadListCache,
      saveListCache: saveListCache,
      loadRefreshMeta: loadRefreshMeta,
      saveRefreshMeta: saveRefreshMeta,
      pickListToRefresh: pickListToRefresh,
      pickUncachedList: pickUncachedList,
      isRateLimited: isRateLimited,
      is429Error: is429Error,
      cacheListKey: cacheListKey,
      formatCacheAgeMs: formatCacheAgeMs,
      CACHE_FORMAT_VERSION: CACHE_FORMAT_VERSION,
      CACHE_TTL_MS: CACHE_TTL_MS,
      MIN_REFRESH_GAP_MS: MIN_REFRESH_GAP_MS,
      RATE_LIMIT_BACKOFF_MS: RATE_LIMIT_BACKOFF_MS,
      ITEMDB_DEBUG_KEY: ITEMDB_DEBUG_KEY,
      BLACKLIST_KEY: BLACKLIST_KEY
   };

})(window);
