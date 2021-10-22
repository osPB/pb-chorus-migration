/*
  Download helpers
*/
import fs from 'fs';
import * as stream from 'stream';
import { promisify } from 'util';

import axios from 'axios';


const finished = promisify(stream.finished);

export async function downloadFile(fileUrl, outputLocationPath, session) {
  const writer = fs.createWriteStream(outputLocationPath);

  return axios({
    method: 'get',
    url: fileUrl,
    responseType: 'stream',
    headers: {
      cookie: session
    }
  }).then(async response => {
    // console.log('[downloadFile] response: ', response);
    response.data.pipe(writer);

    return finished(writer); // Promise
  });
}

function getUserDirectory(userId) {
  // TODO: Create user directory if it does not exist yet
  return `${process.cwd()}/output/${userId}`;
}

// Download a single engagement using the provided session cookie for auth
export async function downloadEngagement(engagement, session) {
  if (!(engagement && engagement.engagement_id)) {
    throw new Error('Invalid engagement object');
  }
  // console.log('[downloadEngagement] session: ', session);
  // console.log('[downloadEngagement] engagement: ', engagement);

  const {
    user_id: userId, // id of the owning user
    subject, // Meeting title
    date_time: dateTime, // Meeting timestamp, in seconds.
    engagement_id: engagementId,
    engagement_type: engagementType // 'dialer' for audio, 'meeting' for video
  } = engagement;


  let urlToken = 'video';
  let fileExtension = 'mp4';

  if (engagementType === 'dialer') {
    urlToken = 'wav';
    fileExtension = 'm4a';
  }

  const fileUrl = `https://chorus.ai/${urlToken}/${engagementId}`;

  // Timestamp must be converted to milis.
  const dateObj = new Date(dateTime * 1000);
  // Formatting into ISO to allow string sorting by date.
  const dateStr = dateObj.toISOString();

  const fileName = `${dateStr} ${subject}.${fileExtension}`;
  const filePath = `${getUserDirectory(userId)}/${fileName}`; // Save files under owner's directory.

  console.log('[downloadEngagement] fileUrl: ', fileUrl);
  console.log('[downloadEngagement] filePath: ', filePath);

  await downloadFile(fileUrl, filePath, session);

  return true;
}

// Download a slice of the page (sequentially, uses one session)
export async function downloadMultiple(items, session) {
  let failedCount = 0;
  let downloadedCount = 0;

  for (let engagement of items) {
    try {
      await downloadEngagement(engagement, session);
      downloadedCount++;
    } catch (e) {
      console.error('[downloadMultiple] Failed to download engagement. E: ', e);
      failedCount++;
    }
  }

  console.log('[downloadMultiple] failedCount: ', failedCount);
  console.log('[downloadMultiple] downloadedCount: ', downloadedCount);

  return { failedCount, downloadedCount };
}
