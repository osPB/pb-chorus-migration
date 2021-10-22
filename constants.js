/*
  Config constants
*/
export const CHORUS_API_TOKEN = process.env.CHORUS_API_TOKEN;
export const CHORUS_API_URL = 'https://chorus.ai/v3/engagements/';

// `eval` usage is unsafe, but here it is used to load a local config that needs to be parsed into an Array.
export const DOWNLOAD_SESSION_COOKIES = eval(process.env.DOWNLOAD_SESSION_COOKIES);
