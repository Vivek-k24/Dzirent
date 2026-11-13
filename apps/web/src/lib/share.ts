// P5C: the clean links people share, and the share text. Always the production address, never
// tracking parameters.
export const SITE = "https://dzirent.com";

export const listingLink = (id: string) => `${SITE}/listing/${id}`;
export const studioLink = (handle: string) => `${SITE}/studio/${encodeURIComponent(handle)}`;

export const listingShareText = (title: string, id: string) => `${title} on Dzirent: ${listingLink(id)}`;
export const studioShareText = (name: string, handle: string) => `${name} on Dzirent: ${studioLink(handle)}`;
