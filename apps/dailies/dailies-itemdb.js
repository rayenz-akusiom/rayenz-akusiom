(function (global) {

   'use strict';



   var ITEMDB_USER = 'rayenz';

   var ITEMDB_TOKEN = null;

   var ITEMDB_TOKEN_EXPIRY = 0;



   function getApiKey(settings) {

      return (settings && settings.itemdbApiKey) || '';

   }



   function hubFetch(url, options) {

      if (typeof global.__bridgeFetch === 'function') {

         return global.__bridgeFetch(url, options || {});

      }

      return fetch(url, options);

   }



   async function fetchItemDbToken(apiKey) {

      if (!apiKey) {

         return null;

      }

      if (ITEMDB_TOKEN && Date.now() < ITEMDB_TOKEN_EXPIRY) {

         return ITEMDB_TOKEN;

      }

      var resp = await hubFetch('https://itemdb.com.br/api/auth/token', {

         method: 'GET',

         headers: { 'x-itemdb-key': apiKey }

      });

      if (!resp.ok) {

         throw new Error('ItemDB auth failed');

      }

      var data = await resp.json();

      ITEMDB_TOKEN = data.token || data.jwt || data.access_token || null;

      ITEMDB_TOKEN_EXPIRY = Date.now() + 50 * 60 * 1000;

      return ITEMDB_TOKEN;

   }



   async function fetchListData(slug, apiKey) {

      var token = await fetchItemDbToken(apiKey);

      if (!token) {

         return null;

      }

      var headers = { 'x-itemdb-token': token };

      var base = 'https://itemdb.com.br/api/v1/lists/' + ITEMDB_USER + '/' + slug;

      var infoResp = await hubFetch(base + '/items', { headers: headers });

      var dataResp = await hubFetch(base + '/itemdata', { headers: headers });

      if (!infoResp.ok || !dataResp.ok) {

         throw new Error('ItemDB list fetch failed');

      }

      var info = await infoResp.json();

      var itemdata = await dataResp.json();

      return { info: info, itemdata: itemdata };

   }



   function pickFirstTradeableItem(info, itemdata) {

      if (!Array.isArray(info) || !Array.isArray(itemdata)) {

         return null;

      }

      var byItemId = {};

      itemdata.forEach(function (item) {

         byItemId[item.internal_id] = item;

         if (item.item_id != null) {

            byItemId[item.item_id] = item;

         }

      });

      var sorted = info.slice().sort(function (a, b) {

         return (a.order || 0) - (b.order || 0);

      });

      for (var i = 0; i < sorted.length; i++) {

         var row = sorted[i];

         if (row.isHidden) {

            continue;

         }

         var item = byItemId[row.item_iid];

         if (!item) {

            continue;

         }

         if (item.isNC) {

            continue;

         }

         if (item.specialType && item.specialType !== 'trading') {

            continue;

         }

         return item;

      }

      return null;

   }



   async function loadListTargets(lists, settings) {

      var apiKey = getApiKey(settings);

      if (!apiKey) {

         return lists.map(function (list) {

            return { list: list, item: null, error: 'no-key' };

         });

      }

      return Promise.all(lists.map(function (list) {

         return fetchListData(list.slug, apiKey)

            .then(function (data) {

               var item = data ? pickFirstTradeableItem(data.info, data.itemdata) : null;

               return { list: list, item: item, error: null };

            })

            .catch(function (err) {

               return { list: list, item: null, error: err.message || 'fetch-failed' };

            });

      }));

   }



   global.DailiesItemdb = {

      pickFirstTradeableItem: pickFirstTradeableItem,

      loadListTargets: loadListTargets,

      getApiKey: getApiKey,

      hubFetch: hubFetch

   };

})(window);

