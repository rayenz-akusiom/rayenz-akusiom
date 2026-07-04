(function (global) {
   'use strict';

   var MAIN_PET_KEY = 'rayenz-main-pet';
   var MAIN_PET_SLUG_KEY = 'rayenz-main-pet-slug';
   var DEFAULT_PET = 'Blue_Eyes_WhDragon';
   var DEFAULT_SLUG = 'l88flmjv';
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
         return normalizeWishlist(wishlist, index);
      });
   }

   function loadSettings() {
      return global.HubStorage ? global.HubStorage.loadDailiesSettings() : {};
   }

   function saveSettings(settings) {
      if (global.HubStorage) {
         global.HubStorage.saveDailiesSettings(settings);
      }
   }

   function getMainPet() {
      try {
         return localStorage.getItem(MAIN_PET_KEY) || DEFAULT_PET;
      } catch (e) {
         return DEFAULT_PET;
      }
   }

   function getMainPetSlug() {
      try {
         return localStorage.getItem(MAIN_PET_SLUG_KEY) || DEFAULT_SLUG;
      } catch (e) {
         return DEFAULT_SLUG;
      }
   }

   function saveMainPet(petName, slug) {
      try {
         localStorage.setItem(MAIN_PET_KEY, petName);
         if (slug) {
            localStorage.setItem(MAIN_PET_SLUG_KEY, slug);
         }
      } catch (e) {
         /* ignore */
      }
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
      DEFAULT_PET: DEFAULT_PET,
      DEFAULT_SLUG: DEFAULT_SLUG,
      DEFAULT_WISHLISTS: DEFAULT_WISHLISTS,
      SCHOOL_LABELS: SCHOOL_LABELS,
      parseItemDbListUrl: parseItemDbListUrl,
      normalizeWishlist: normalizeWishlist,
      getWishlists: getWishlists,
      loadSettings: loadSettings,
      saveSettings: saveSettings,
      getMainPet: getMainPet,
      getMainPetSlug: getMainPetSlug,
      saveMainPet: saveMainPet,
      shouldShowLink: shouldShowLink
   };
})(window);
