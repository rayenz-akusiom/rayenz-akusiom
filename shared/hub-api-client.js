(function (global) {
   'use strict';

   var API_URL_KEY = 'rayenz-hub-api-url';
   var API_KEY_KEY = 'rayenz-hub-api-key';

   function getConfig() {
      var url = '';
      var key = '';
      try {
         url = (localStorage.getItem(API_URL_KEY) || '').replace(/\/$/, '');
         key = localStorage.getItem(API_KEY_KEY) || '';
      } catch (e) {
         /* ignore */
      }
      return { url: url, key: key, enabled: !!(url && key) };
   }

   function apiFetch(path, options) {
      var cfg = getConfig();
      if (!cfg.enabled) {
         return Promise.reject(new Error('Hub API not configured'));
      }
      options = options || {};
      var headers = Object.assign({}, options.headers || {}, {
         Authorization: 'Bearer ' + cfg.key,
         'Content-Type': 'application/json'
      });
      return fetch(cfg.url + path, {
         method: options.method || 'GET',
         headers: headers,
         body: options.body != null ? JSON.stringify(options.body) : undefined
      }).then(function (res) {
         if (res.status === 401) {
            throw new Error('Hub API unauthorized');
         }
         if (res.status === 404) {
            return null;
         }
         if (!res.ok) {
            return res.text().then(function (text) {
               throw new Error('Hub API error ' + res.status + ': ' + text);
            });
         }
         return res.json();
      });
   }

   function pullSettings(domain) {
      return apiFetch('/v1/settings/' + domain).then(function (data) {
         return data && data.payload ? data.payload : null;
      });
   }

   function pushSettings(domain, payload) {
      return apiFetch('/v1/settings/' + domain, {
         method: 'PUT',
         body: { payload: payload }
      });
   }

   function pullProfile(deckId) {
      return apiFetch('/v1/profiles/' + encodeURIComponent(deckId));
   }

   function pullProfileYaml(deckId) {
      return pullProfile(deckId).then(function (data) {
         return data && data.yaml ? data.yaml : null;
      });
   }

   function applyMainPetFromPayload(payload) {
      if (!payload || !global.DailiesSettings || !global.DailiesSettings.saveMainPet) {
         return;
      }
      var name = payload.mainPetName != null ? String(payload.mainPetName).trim() : '';
      var slug = payload.mainPetSlug != null ? String(payload.mainPetSlug).trim() : '';
      if (name) {
         global.DailiesSettings.saveMainPet(name, slug || null);
      }
   }

   function syncDailiesSettingsFromApi(fallbackLoader) {
      var cfg = getConfig();
      if (!cfg.enabled) {
         return Promise.resolve(fallbackLoader ? fallbackLoader() : null);
      }
      return pullSettings('dailies').then(function (payload) {
         if (!payload || !global.HubStorage) {
            return fallbackLoader ? fallbackLoader() : null;
         }
         global.HubStorage.saveDailiesSettings(payload);
         applyMainPetFromPayload(payload);
         return payload;
      }).catch(function () {
         return fallbackLoader ? fallbackLoader() : null;
      });
   }

   global.HubApiClient = {
      getConfig: getConfig,
      apiFetch: apiFetch,
      pullSettings: pullSettings,
      pushSettings: pushSettings,
      pullProfile: pullProfile,
      pullProfileYaml: pullProfileYaml,
      syncDailiesSettingsFromApi: syncDailiesSettingsFromApi
   };
})(window);
