/*
  Chorus entity renaming and directory scripts
*/
import './env.js';

import { downloadMultiple } from './download.js';
import { engagementPageGenerator } from './generators.js';
import { DOWNLOAD_SESSION_COOKIES } from './constants.js';


async function processPage(engagements) {
  const maxConnections = DOWNLOAD_SESSION_COOKIES.length;
  const itemsPerPool = Math.ceil(engagements.length / maxConnections);
  // Split downloads across all available sessions;
  const downloadPools = DOWNLOAD_SESSION_COOKIES.map((session, index) => engagements.slice(index * itemsPerPool, (index + 1) * itemsPerPool));

  await Promise.all(
    downloadPools.map((pool, index) => downloadMultiple(pool, DOWNLOAD_SESSION_COOKIES[index]))
  );
}

async function main() {
  let total = 0;

  for await (let page of engagementPageGenerator()) {
    total += page.length;
    console.log('Running total: ', total);
    await processPage(page);
  }

  console.log('total: ', total);
}

main();
