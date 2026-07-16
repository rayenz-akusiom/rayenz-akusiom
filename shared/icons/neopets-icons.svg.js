(function (global) {
    'use strict';

global.NeopetsIcons = {
    WISHLIST_NEXT_ICON: WISHLIST_NEXT_ICON,
    WISHLIST_MENU_ICON: WISHLIST_MENU_ICON
}

var WISHLIST_NEXT_ICON = global.StringUtils.svgDataUri(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<polyline points="9 6 15 12 9 18"/><line x1="4" y1="12" x2="14" y2="12"/>' +
    '</svg>'
 );

 var WISHLIST_MENU_ICON = global.StringUtils.svgDataUri(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#444">' +
    '<circle cx="12" cy="5" r="1.75"/><circle cx="12" cy="12" r="1.75"/><circle cx="12" cy="19" r="1.75"/>' +
    '</svg>'
 );
})(this);