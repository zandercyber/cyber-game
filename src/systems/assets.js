// Resolves art in src/assets to the URL the build gives it.
// Vite adds a content hash to each file name (e.g. dorm-3fa9c1.jpg), so when an
// image changes its URL changes too, and browsers can't show an old cached copy.

const files = import.meta.glob('../assets/**/*.{png,jpg}', { eager: true, query: '?url', import: 'default' });

/** asset('rooms/dorm.jpg') -> URL of src/assets/rooms/dorm.jpg in the current build. */
export function asset(path) {
  const url = files[`../assets/${path}`];
  if (!url) throw new Error(`Missing asset: src/assets/${path}`);
  return url;
}
