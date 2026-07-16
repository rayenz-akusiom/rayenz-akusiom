(function (global) {
    'use strict';

global.StringUtils = {
    toUriEncodedKebabCase: toUriEncodedKebabCase,
    toKebabCase: toKebabCase
}

function toUriEncodedKebabCase(str) {
    return encodeURIComponent(toKebabCase(str));
}

function toKebabCase(str) {
    if (!str) return '';
    
    return str
      .match(/[A-Z]{2,}(?=[A-Z][a-z]+[0-9]*|\b)|[A-Z]?[a-z]+[0-9]*|[A-Z]|[0-9]+/g)
      .map(word => word.toLowerCase())
      .join('-');
  }
})(this);