// Shared by the server schema and the browser script. No Zod here, so the
// client bundle stays tiny.
export const MESSAGE_MIN = 10;
export const MESSAGE_MAX = 2000;
export const MAX_LINKS = 2;
/** Minimum seconds between loading the form token and submitting. */
export const MIN_SECONDS = 3;

const LINK = /\bhttps?:\/\/|\bwww\./gi;
export const countLinks = (text: string) => text.match(LINK)?.length ?? 0;
