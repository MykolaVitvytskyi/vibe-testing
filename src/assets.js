const embedded = typeof __MATERIAL_IMAGES__ === 'undefined' ? {} : __MATERIAL_IMAGES__;

// The development server serves local files; the standalone build embeds the
// same bytes as data URLs. Neither mode uses a runtime CDN.
export function assetURL(path) { return embedded[path] || path; }
