/*
  Iteration helpers
*/
import axios from 'axios';

import { CHORUS_API_URL, CHORUS_API_TOKEN, DOWNLOAD_SESSION_COOKIES } from './constants.js';


const apiClient = axios.create({
  baseURL: CHORUS_API_URL,
  headers: { 'Authorization': CHORUS_API_TOKEN }
});

const getEngagementPage = (params) => apiClient.get('/', { params }).then(({ data }) => data);

// Iterable Engagement API page generator
export async function* engagementPageGenerator() {
  let continuationKey = null;
  const params = {};

  do {
    let { continuation_key: nextKey, engagements } = await getEngagementPage(params);
    console.log('Next Continuation Key: ', nextKey);

    continuationKey = nextKey.replace(/^\s$/, ''); // Takes care of empty key being sent as ' ' from the API
    params.continuation_key = continuationKey;

    yield engagements;
  } while (!!continuationKey);
}

export function* sessionGenerator() {
  let index = 0;
  const totalCount = DOWNLOAD_SESSION_COOKIES.length;

  while (true) {
    index = (index + 1) % totalCount;
    yield DOWNLOAD_SESSION_COOKIES[index];
  }
}
