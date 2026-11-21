// Debug mode: add ?debug or #debug to the URL.
export const DEBUG =
  new URLSearchParams(window.location.search).has('debug') || window.location.hash === '#debug';
