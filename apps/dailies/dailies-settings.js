(function (global) {
   'use strict';

   var MAIN_PET_KEY = 'rayenz-main-pet';
   var MAIN_PET_SLUG_KEY = 'rayenz-main-pet-slug';
   var DEFAULT_PET = 'Blue_Eyes_WhDragon';
   var DEFAULT_SLUG = 'l88flmjv';

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
      SCHOOL_LABELS: SCHOOL_LABELS,
      loadSettings: loadSettings,
      saveSettings: saveSettings,
      getMainPet: getMainPet,
      getMainPetSlug: getMainPetSlug,
      saveMainPet: saveMainPet,
      shouldShowLink: shouldShowLink
   };
})(window);
