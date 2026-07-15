(function (global) {
   'use strict';

   var MAIN_PET_KEY = 'rayenz-main-pet';
   var MAIN_PET_SLUG_KEY = 'rayenz-main-pet-slug';
   var IMG = 'https://images.neopets.com/items/';

   var DEFAULT_WISHLISTS = [
      {
         id: 'stamps-wishlist',
         label: 'Stamps Wishlist',
         listUrl: 'https://itemdb.com.br/lists/rayenz/all-collectibles-checklist',
         slug: 'all-collectibles-checklist',
         user: 'rayenz',
         img: IMG + 'd3cf0h2ki5.gif'
      },
      {
         id: 'gourmet-food',
         label: 'Gourmet Food',
         listUrl: 'https://itemdb.com.br/lists/rayenz/gourmet-food-checklist',
         slug: 'gourmet-food-checklist',
         user: 'rayenz',
         img: IMG + 'food_acara_cone.gif'
      },
      {
         id: 'books-checklist',
         label: 'Books',
         listUrl: 'https://itemdb.com.br/lists/rayenz/book-award-checklist-2',
         slug: 'book-award-checklist-2',
         user: 'rayenz',
         img: IMG + 'boo_acy15vii_neotradbeg.gif'
      },
      {
         id: 'booktastic-checklist',
         label: 'Booktastic',
         listUrl: 'https://itemdb.com.br/lists/rayenz/booktastic-book-award-checklist-2',
         slug: 'booktastic-book-award-checklist-2',
         user: 'rayenz',
         img: IMG + 'boo_stuck_in_space.gif'
      }
   ];

   var SCHOOL_LABELS = {
      swashbuckling: 'Swashbuckling Academy',
      'mystery-island': 'Mystery Island Training',
      'secret-ninja': 'Secret Ninja Training',
      'lab-ray': 'Lab Ray',
      'kitchen-quests': 'Kitchen Quests',
      'healing-springs': 'Healing Springs',
      battledome: 'Battledome',
      'faerie-quests': 'Faerie Quests'
   };

   function parseItemDbListUrl(url) {
      if (!url) {
         return null;
      }
      var match = String(url).trim().match(/itemdb\.com\.br\/lists\/([^/?#]+)\/([^/?#]+)/i);
      if (!match) {
         return null;
      }
      return {
         user: decodeURIComponent(match[1]),
         slug: decodeURIComponent(match[2])
      };
   }

   function normalizeWishlist(entry, index) {
      entry = entry || {};
      var parsed = parseItemDbListUrl(entry.listUrl || '');
      var slug = entry.slug || (parsed && parsed.slug) || '';
      var user = entry.user || (parsed && parsed.user) || 'rayenz';
      var listUrl = entry.listUrl || (slug ? 'https://itemdb.com.br/lists/' + encodeURIComponent(user) + '/' + encodeURIComponent(slug) : '');
      return {
         id: entry.id || slug || ('wishlist-' + (index || 0)),
         label: String(entry.label || slug || 'Wishlist').trim(),
         listUrl: listUrl,
         slug: slug,
         user: user,
         img: entry.img || ''
      };
   }

   function getWishlists(settings) {
      if (!settings || !Array.isArray(settings.wishlists)) {
         return DEFAULT_WISHLISTS.map(function (wishlist, index) {
            return normalizeWishlist(wishlist, index);
         });
      }
      return settings.wishlists.map(function (wishlist, index) {
         if (wishlist && wishlist.slug && wishlist.user && wishlist.id && wishlist.listUrl) {
            return wishlist;
         }
         return normalizeWishlist(wishlist, index);
      });
   }

   function normalizeWishlistsForSave(wishlists) {
      if (!Array.isArray(wishlists)) {
         return [];
      }
      return wishlists.map(function (entry, index) {
         return normalizeWishlist(entry, index);
      });
   }

   function loadSettings() {
      return global.HubStorage ? global.HubStorage.loadDailiesSettings() : {};
   }

   function saveSettings(settings) {
      if (global.HubStorage && settings) {
         var payload = Object.assign({}, settings);
         if (Array.isArray(payload.wishlists)) {
            payload.wishlists = normalizeWishlistsForSave(payload.wishlists);
         }
         global.HubStorage.saveDailiesSettings(payload);
      }
   }

   function getMainPet() {
      try {
         return String(localStorage.getItem(MAIN_PET_KEY) || '').trim();
      } catch (e) {
         return '';
      }
   }

   function getMainPetSlug() {
      try {
         return String(localStorage.getItem(MAIN_PET_SLUG_KEY) || '').trim();
      } catch (e) {
         return '';
      }
   }

   function hasMainPet() {
      return !!getMainPet();
   }

   function saveMainPet(petName, slug) {
      try {
         var name = String(petName || '').trim();
         if (!name) {
            localStorage.removeItem(MAIN_PET_KEY);
            localStorage.removeItem(MAIN_PET_SLUG_KEY);
            return;
         }
         localStorage.setItem(MAIN_PET_KEY, name);
         if (slug) {
            localStorage.setItem(MAIN_PET_SLUG_KEY, String(slug).trim());
         } else {
            localStorage.removeItem(MAIN_PET_SLUG_KEY);
         }
      } catch (e) {
         /* ignore */
      }
   }

   /**
    * Extract a pet image slug from petlookup HTML.
    * Prefers the main /1/1.png portrait over the first /cp/ hit (often the active-pet chrome).
    * When the pet name changed, rejects a result that only matches the previous slug.
    */
   function parsePetImageSlug(html, options) {
      options = options || {};
      var previousSlug = options.previousSlug ? String(options.previousSlug).trim() : '';
      var nameChanged = !!options.nameChanged;
      var text = String(html || '');
      var mainMatch = text.match(/pets\.neopets\.com\/cp\/([a-z0-9]+)\/1\/1\.png/i);
      if (mainMatch) {
         var mainSlug = mainMatch[1];
         if (nameChanged && previousSlug && mainSlug === previousSlug) {
            return null;
         }
         return mainSlug;
      }
      var found = [];
      var re = /pets\.neopets\.com\/cp\/([a-z0-9]+)\//gi;
      var match;
      while ((match = re.exec(text)) !== null) {
         if (found.indexOf(match[1]) === -1) {
            found.push(match[1]);
         }
      }
      if (found.length === 0) {
         return null;
      }
      if (nameChanged && previousSlug) {
         for (var i = 0; i < found.length; i++) {
            if (found[i] !== previousSlug) {
               return found[i];
            }
         }
         return null;
      }
      return found[0];
   }

   function isSchoolEnabled(settings, schoolId) {
      if (!settings.schools) {
         return true;
      }
      if (settings.schools[schoolId] === undefined) {
         return true;
      }
      return !!settings.schools[schoolId];
   }

   function shouldShowLink(link, settings) {
      if (link.faerieQuest) {
         return settings.faerieQuest === link.faerieQuest;
      }
      if (link.school) {
         return isSchoolEnabled(settings, link.school);
      }
      return true;
   }

   global.DailiesSettings = {
      MAIN_PET_KEY: MAIN_PET_KEY,
      MAIN_PET_SLUG_KEY: MAIN_PET_SLUG_KEY,
      DEFAULT_WISHLISTS: DEFAULT_WISHLISTS,
      SCHOOL_LABELS: SCHOOL_LABELS,
      parseItemDbListUrl: parseItemDbListUrl,
      normalizeWishlist: normalizeWishlist,
      normalizeWishlistsForSave: normalizeWishlistsForSave,
      getWishlists: getWishlists,
      loadSettings: loadSettings,
      saveSettings: saveSettings,
      getMainPet: getMainPet,
      getMainPetSlug: getMainPetSlug,
      hasMainPet: hasMainPet,
      saveMainPet: saveMainPet,
      parsePetImageSlug: parsePetImageSlug,
      shouldShowLink: shouldShowLink
   };
})(window);
