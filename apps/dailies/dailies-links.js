(function (global) {
   'use strict';

   var IMG = 'https://images.neopets.com/items/';

   var ALBUM_LINK_IDS = ['gourmet-club', 'stamp-album', 'books-read', 'booktastic-read'];

   var BOOK_SHOPS = [
      {
         id: 'magical-bookshop',
         label: 'Magical Bookshop',
         url: 'https://www.neopets.com/objects.phtml?type=shop&obj_type=7',
         img: IMG + 'boo_acy15vii_neotradbeg.gif'
      },
      {
         id: 'faerieland-bookshop',
         label: 'Faerieland Bookshop',
         url: 'https://www.neopets.com/objects.phtml?type=shop&obj_type=38',
         img: IMG + 'fbo_faerieland_history.gif'
      },
      {
         id: 'suteks-scrolls',
         label: "Sutek's Scrolls",
         url: 'https://www.neopets.com/objects.phtml?type=shop&obj_type=51',
         img: IMG + 'lds_deserteddesertscroll.gif'
      },
      {
         id: 'booktastic-shop',
         label: 'Booktastic Books',
         url: 'https://www.neopets.com/objects.phtml?type=shop&obj_type=70',
         img: IMG + 'boo_stuck_in_space.gif'
      },
      {
         id: 'brightvale-books',
         label: 'Brightvale Books',
         url: 'https://www.neopets.com/objects.phtml?type=shop&obj_type=77',
         img: IMG + 'boo_bori_picture.gif'
      },
      {
         id: 'words-of-antiquity',
         label: 'Words of Antiquity',
         url: 'https://www.neopets.com/objects.phtml?type=shop&obj_type=92',
         img: IMG + 'boo_aota_giantcrosswords.gif'
      },
      {
         id: 'neovian-printing',
         label: 'Neovian Printing Press',
         url: 'https://www.neopets.com/objects.phtml?type=shop&obj_type=106',
         img: IMG + 'sta_printing_press.gif'
      },
      {
         id: 'moltaran-books',
         label: 'Moltaran Books',
         url: 'https://www.neopets.com/objects.phtml?type=shop&obj_type=114',
         img: IMG + 'boo_moltaran_magma.gif'
      }
   ];

   var DAILIES_LINKS = [
      { id: 'main-pet', label: 'Main Pet', group: 1, petLink: true, petHref: 'https://www.neopets.com/island/fight_training.phtml?type=status', img: null, kind: 'pet' },
      { id: 'shop-wizard', label: 'Shop Wizard', group: 1, url: 'https://www.neopets.com/shops/wizard.phtml', img: 'https://images.neopets.com/shopkeepers/shopwizard.gif' },
      { id: 'safety-deposit', label: 'Safety Deposit', group: 1, url: 'https://www.neopets.com/safetydeposit.phtml', img: IMG + 'sch_high_security_lunchbox.gif' },
      { id: 'gallery', label: 'Gallery', group: 1, url: 'https://www.neopets.com/gallery/index.phtml', img: 'https://images.neopets.com/new_shopkeepers/1107.gif' },
      { id: 'premium', label: 'Premium', group: 1, url: 'https://www.neopets.com/premium/', img: IMG + 'mall_spacefaeriedoll.gif' },

      { id: 'gourmet-club', label: 'Gourmet Club', group: 2, petLink: true, petHref: 'https://www.neopets.com/gourmet_club.phtml?pet_name={pet}', img: 'https://images.neopets.com/games/trophies/trophy_gourmet_1.gif' },
      { id: 'stamp-album', label: 'Stamp Album', group: 2, url: 'https://www.neopets.com/stamps.phtml?type=progress', img: IMG + 'book_stamps.gif' },
      { id: 'books-read', label: 'Books', group: 2, petLink: true, petHref: 'https://www.neopets.com/books_read.phtml?pet_name={pet}', img: 'https://images.neopets.com/games/trophies/trophy_books_read_1.gif' },
      { id: 'booktastic-read', label: 'Booktastic Books', group: 2, petLink: true, petHref: 'https://www.neopets.com/moon/books_read.phtml?pet_name={pet}', img: 'https://images.neopets.com/games/trophies/trophy_booktastic_books_1.gif' },

      { id: 'quest-log', label: 'Quest Log', group: 3, url: 'https://www.neopets.com/questlog/', img: IMG + 'sch_nt_notebook.gif', note: 'Daily/Weekly' },
      { id: 'apple-bobbing', label: 'Apple Bobbing', group: 3, url: 'https://www.neopets.com/halloween/applebobbing.phtml', img: IMG + 'spf_grapple_apple.gif' },
      { id: 'anchor-management', label: 'Anchor Management', group: 3, url: 'https://www.neopets.com/pirates/anchormanagement.phtml', img: IMG + 'gar_pirate_bouncyship.gif' },
      { id: 'deserted-tomb', label: 'Deserted Tomb', group: 3, url: 'https://www.neopets.com/worlds/geraptiku/tomb.phtml', img: IMG + 'bd_ger_goldtalisman.gif' },
      { id: 'forgotten-shore', label: 'Forgotten Shore', group: 3, url: 'https://www.neopets.com/pirates/forgottenshore.phtml', img: IMG + 'toy_chest_discoveredtreasure.gif' },
      { id: 'fruit-machine', label: 'Fruit Machine', group: 3, url: 'https://www.neopets.com/desert/fruitmachine.phtml', img: IMG + 'food_desert3.gif' },
      { id: 'giant-jelly', label: 'Giant Jelly', group: 3, url: 'https://www.neopets.com/jelly/jelly.phtml', img: IMG + 'jel_stone_whole.gif', note: 'Once a day' },
      { id: 'giant-omelette', label: 'Giant Omelette', group: 3, url: 'https://www.neopets.com/prehistoric/omelette.phtml', img: IMG + 'om_sausage_pepperoni1.gif' },
      { id: 'lair-of-the-beast', label: 'Lair of the Beast', group: 3, url: 'https://www.neopets.com/prehistoric/thebeast.phtml', img: IMG + 'bd_tyrannia_beastclaw.gif' },
      { id: 'meteor', label: 'Meteor', group: 3, url: 'https://www.neopets.com/moon/meteor.phtml', img: IMG + 'bd_meteor_rock.gif', note: 'Once every hour' },
      { id: 'negg-cave', label: 'Mysterious Negg Cave', group: 3, url: 'https://www.neopets.com/shenkuu/neggcave/', img: IMG + 'plu_fony14_neggbreaker.gif' },
      { id: 'wheel-extravagance', label: 'Wheel of Extravagance', group: 3, url: 'https://www.neopets.com/desert/extravagance.phtml', img: IMG + 'sta_wheel_of_extravagance.gif', note: 'Twice a day' },
      { id: 'tdmbgpop', label: 'Discarded Magical Blue Grundo Plushie', group: 3, url: 'https://www.neopets.com/faerieland/tdmbgpop.phtml', img: IMG + 'plu_TDMBGPOP_replica.gif' },
      { id: 'tombola', label: 'Tombola', group: 3, url: 'https://www.neopets.com/island/tombola.phtml', img: IMG + 'toy_squeezy_tombola.gif' },
      { id: 'trudys', label: "Trudy's Surprise", group: 3, url: 'https://www.neopets.com/trudys_surprise.phtml', img: IMG + 'gif_trudy_coin_purse.gif' },
      { id: 'wise-king', label: 'Wise Old King', group: 3, url: 'https://www.neopets.com/medieval/wiseking.phtml', img: IMG + 'bvb_kinghagan.gif' },
      { id: 'grumpy-king', label: 'Grumpy King', group: 3, url: 'https://www.neopets.com/medieval/grumpyking.phtml', img: 'https://images.neopets.com/medieval/grumpy_king_notamused.gif' },
      { id: 'faerie-caverns', label: 'Faerie Caverns', group: 3, url: 'https://www.neopets.com/faerieland/caverns/index.phtml', img: IMG + 'bg_faerie_caverns.gif' },
      { id: 'wheel-starlight', label: 'Wheel of Starlight', group: 3, url: 'https://www.neopets.com/premium/wheel.phtml', img: IMG + '185mjdi5jd.gif' },
      { id: 'illusen', label: "Illusen's Glade", group: 3, url: 'https://www.neopets.com/medieval/earthfaerie.phtml', img: IMG + '8e40c22bf8.gif', faerieQuest: 'illusen' },
      { id: 'jhudora', label: "Jhudora's Bluff", group: 3, url: 'https://www.neopets.com/faerieland/darkfaerie.phtml', img: IMG + '798dd919f1.gif', faerieQuest: 'jhudora' },
      { id: 'haunted-hunt', label: 'Haunted Woods Haunt', group: 3, url: 'https://www.neopets.com/halloween/haunted_woods_hunt.phtml', img: IMG + 'f5enlcc6kk.gif' },

      { id: 'fashion-fever', label: 'Fashion Fever', group: 4, url: 'https://www.neopets.com/games/h5game.phtml?game_id=1391', img: 'https://images.neopets.com/themes/h5/constellations/images/games-icon.svg?d=20210209' },
      { id: 'customization', label: 'Customization', group: 4, url: 'https://www.neopets.com/customise/', img: 'https://images.neopets.com/themes/h5/constellations/images/customise-icon.svg' },

      { id: 'healing-springs', label: 'Healing Springs', group: 5, url: 'https://www.neopets.com/faerieland/springs.phtml', img: IMG + 'toy_faerie_water.gif', note: 'Every 30 min', school: 'healing-springs' },
      { id: 'battledome', label: 'Battledome', group: 5, url: 'https://www.neopets.com/dome/', img: IMG + 'bd_spirit_blade.gif', school: 'battledome' },
      { id: 'faerie-quests', label: 'Faerie Quests', group: 5, url: 'https://www.neopets.com/quests.phtml', img: IMG + 'toy_faerie_princess.gif', note: 'Cookie=Once/day', school: 'faerie-quests' },
      { id: 'swashbuckling', label: 'Swashbuckling Academy', group: 5, url: 'https://www.neopets.com/pirates/academy.phtml?type=status', img: IMG + 'toy_pirate_cutlass.gif', school: 'swashbuckling' },
      { id: 'mystery-island', label: 'Mystery Island Training', group: 5, url: 'https://www.neopets.com/island/training.phtml?type=status', img: IMG + 'bg_mystery_training.gif', school: 'mystery-island' },
      { id: 'secret-ninja', label: 'Secret Ninja Training', group: 5, url: 'https://www.neopets.com/island/fight_training.phtml?type=status', img: IMG + 'nin_smoke_bomb.gif', school: 'secret-ninja' },
      { id: 'lab-ray', label: 'Lab Ray', group: 5, url: 'https://www.neopets.com/lab2.phtml', img: IMG + 'labmap_09.gif', note: 'Once a day', school: 'lab-ray' },
      { id: 'kitchen-quests', label: 'Kitchen Quests', group: 5, url: 'https://www.neopets.com/island/kitchen.phtml', img: IMG + 'toy_kitchenquest_flotsam.gif', note: '10 times a day', school: 'kitchen-quests' },

      { id: 'fishing', label: 'Ye Olde Fishing Vortex', group: 6, url: 'https://www.neopets.com/water/fishing.phtml', img: IMG + 'vor_evilcarp.gif', note: 'Random' },
      { id: 'coltzan', label: "Coltzan's Shrine", group: 6, url: 'https://www.neopets.com/desert/shrine.phtml', img: IMG + 'bd_desert_deathmask.gif', note: 'Every 13 hours' },
      { id: 'grave-danger', label: 'Grave Danger', group: 6, url: 'https://www.neopets.com/halloween/gravedanger/', img: IMG + 'boo_zombiehandbook.gif', note: 'Up to 10 hours' },
      { id: 'ice-kiosk', label: 'Ice Caves Kiosk', group: 6, url: 'https://www.neopets.com/winter/kiosk.phtml', img: IMG + 'toy_kiosk_plushie.gif', note: 'Every 6 hours' },
      { id: 'wheel-excitement', label: 'Wheel of Excitement', group: 6, url: 'https://www.neopets.com/faerieland/wheel.phtml', img: IMG + 'sta_stw_wheelofexcitement.gif', note: 'Every 2 hours' },
      { id: 'wheel-knowledge', label: 'Wheel of Knowledge', group: 6, url: 'https://www.neopets.com/medieval/knowledge.phtml', img: IMG + 'bvb_wheelofknowledge.gif', note: 'Every 2 hours' },
      { id: 'test-strength', label: 'Test Your Strength', group: 6, url: 'https://www.neopets.com/halloween/strtest/index.phtml', img: IMG + 'gar_testyourstrength.gif' },
      { id: 'wheel-monotony', label: 'Wheel of Monotony', group: 6, url: 'https://www.neopets.com/prehistoric/monotony/monotony.phtml', img: IMG + 'toy_miniwheelofmonotony.gif' },

      { id: 'shop-till', label: 'Your Shop Till', group: 8, url: 'https://www.neopets.com/market.phtml?type=till', img: IMG + 'broken_bag_np.gif' },
      { id: 'bank', label: 'Bank Interest', group: 8, url: 'https://www.neopets.com/bank.phtml', img: IMG + 'ltoo_scorch_bank.gif' },
      { id: 'stocks', label: 'Stock Market Portfolio', group: 8, url: 'https://www.neopets.com/stockmarket.phtml?type=portfolio', img: 'https://images.neopets.com/games/game_stocks.gif' },
      { id: 'food-club', label: 'Food Club', group: 8, url: 'https://www.neopets.com/pirates/foodclub.phtml?type=bet', img: 'https://images.neopets.com/games/pages/trophies/88_1.png' }
   ];

   function getFilteredLinks(settings) {
      var DS = global.DailiesSettings;
      return DAILIES_LINKS.filter(function (link) {
         return DS.shouldShowLink(link, settings);
      });
   }

   function getLinksByGroup(settings) {
      var links = getFilteredLinks(settings);
      var groups = {};
      links.forEach(function (link) {
         var g = link.group || 0;
         if (!groups[g]) {
            groups[g] = [];
         }
         groups[g].push(link);
      });
      return groups;
   }

   global.DailiesLinks = {
      BOOK_SHOPS: BOOK_SHOPS,
      ALBUM_LINK_IDS: ALBUM_LINK_IDS,
      DAILIES_LINKS: DAILIES_LINKS,
      getFilteredLinks: getFilteredLinks,
      getLinksByGroup: getLinksByGroup
   };
})(window);
