/*
  Gong upload logic
*/
import './env.js'; // This file is expected to be executed in standalone mode, so adding env setup here.

import fs from 'fs';

import glob from 'glob';
import axios from 'axios';
import chalk from 'chalk';
import FormData from 'form-data';
import MD5 from 'crypto-js/md5.js';


// Default call owner assignee (used if email of the Chorus account is not registered in Gong)
const DEFAULT_USER_ID = '4968060599268269553'; // lauren@productboard.com

const MAX_UPLOAD_BODY_LENGTH = 1000000000; // 1Gb

const FILENAME_MATCH_RE = /output\/(?<emailAddress>.*@.*)\/(?<timestamp>[0-9-T.]*Z)\s(?<title>.*)\.(?<format>.*)$/;

// Set up authenticated netclient
const apiClient = axios.create({
  baseURL: 'https://api.gong.io/',
  maxBodyLength: MAX_UPLOAD_BODY_LENGTH
});
apiClient.defaults.headers.common['Authorization'] = `Basic ${process.env.GONG_API_TOKEN}`;
apiClient.interceptors.response.use(response => response, error => {
  if (error.response) {
    console.error('[apiClient] Response error:');
    console.log(error.response.data);
    console.log(error.response.status);
  } else if (error.request) {
    console.error('[apiClient] Request error: ', error.message);
  } else {
    console.log('[apiClient] Generic error', error.message);
  }

  return Promise.reject(error);
});

const asyncSleepSeconds = (seconds) => new Promise(resolve => setTimeout(resolve, seconds * 1000));

const userMapping = {};

async function downloadUsers() {
  const params = {};

  do {
    const { status, data } = await apiClient.get('/v2/users', { params });
    const { records: { cursor, currentPageNumber }, users } = data;

    params.cursor = cursor || null;

    users.forEach(({ id, emailAddress }) => {
      userMapping[emailAddress] = id;
    });

    console.log('[downloadUsers] Loaded user page ', currentPageNumber);

  } while (params.cursor);

  // console.log('[downloadUsers] userMapping: ', userMapping);
  console.log('[downloadUsers] Total users found: ', Object.keys(userMapping).length);

  return true;
}

function matchUserIdByEmail(emailAddress) {
  if (!Object.keys(userMapping).length) {
    throw new Error('User mapping not loaded before attempting a match.')
  }

  const userId = userMapping[emailAddress];
  if (userId) {
    console.log(`[matchUserIdByEmail] Found user id ${userId} for ${emailAddress}`);
  } else {
    console.log(`[matchUserIdByEmail] Unable to match ${emailAddress}, using default id...`);
  }

  return userId || DEFAULT_USER_ID;
}

const formatFileName = fileName => fileName
  .replace(/\s{2,}/g, ' ') // Remove multi-spaces
  .replace(/(\s)(?<ext>\.m.*)$/, "$<ext>"); // Remove trailing space before extension

// Convert timestamp format to no-milisecond ISO expected by Gong
const formatTimeStamp = timestamp => timestamp
  .replace(/T(?<hours>\d{2})(?<minutes>\d{2})(?<seconds>\d{2})\..*Z$/, 'T$<hours>:$<minutes>:$<seconds>Z');

function formatCallData(fileName) {
  const { groups } = fileName.match(FILENAME_MATCH_RE);
  const { emailAddress, timestamp, title, format } = groups;

  const callTitle = `${title} (Migrated)`;
  const actualStart = formatTimeStamp(timestamp);

  // Mandatory fields
  const userId = matchUserIdByEmail(emailAddress); // Match user id from email
  const clientUniqueId = MD5(fileName).toString(); // Hash filename
  const direction = 'Unknown';
  const customData = 'Migrated from Chorus by pb-chorus-migration';
  const parties = [{
    emailAddress,
    userId
  }];
  const workspaceId = process.env.GONG_WORKSPACE_ID;

  const callData = {
    title: callTitle,
    actualStart,
    clientUniqueId,
    customData,
    direction,
    primaryUser: userId,
    parties,
    workspaceId
  };

  return callData;
}

async function sendCreateCallRequest(callData) {
  const { status, data } = await apiClient.post('/v2/calls', callData);
  console.log('[sendCreateCallRequest] statusCode: ', status);

  return data;
}

async function createCall(fileName) {
  const callData = formatCallData(fileName);

  // 429 -> grab Retry-After header -> wait specified time in seconds -> retry
  try {
    return await sendCreateCallRequest(callData);
  } catch (e) {
    if (e.response && e.response.status) {
      // Response error
      if (e.response.status === 429 && e.response.headers['retry-after'] ) {
        // Rate limit exceeded, wait and try again
        const timeToWait = Number(e.response.headers['retry-after']) || 1;
        console.log('[createCall] Received 429, waiting for (s): ', timeToWait);
        await asyncSleepSeconds(timeToWait);
        console.log('[createCall] Retrying...');

        return await sendCreateCallRequest(callData);
      } else {
        throw e; // Propagate 400 up
      }
    }
  }
}

async function sendUploadMediaRequest(callId, form, headers) {
  const { status, data } = await apiClient.put(`/v2/calls/${callId}/media`, form, { headers });
  console.log('[sendUploadMediaRequest] statusCode: ', status);

  return data;
}

async function uploadCallMedia(callId, fileName, fileTitle) {
  const fileStream = fs.createReadStream(fileName);

  const form = new FormData();
  form.append('mediaFile', fileStream, fileTitle);

  const formHeaders = { ...form.getHeaders() };

  console.log('[uploadCallMedia] Starting file upload...');

  try {
    return await sendUploadMediaRequest(callId, form, formHeaders);
  } catch (e) {
    if (e.response && e.response.status) {
      // Response error
      if (e.response.status === 429 && e.response.headers['retry-after'] ) {
        // Rate limit exceeded, wait and try again
        const timeToWait = Number(e.response.headers['retry-after']) || 1;
        console.log('[createCall] Received 429, waiting for (s): ', timeToWait);
        await asyncSleepSeconds(timeToWait);
        console.log('[createCall] Retrying...');

        return await sendUploadMediaRequest(callId, form, formHeaders);
      } else {
        throw e; // Propagate 400 up
      }
    }
  }
}

async function assertCallIncomplete(callId) {
  try {
    const { status } = await apiClient.get(`/v2/calls/${callId}`);
    return status > 400;
  } catch (e) {
    return e.response.status === 404;
  }
}

async function processEngagement(fileName) {
  const sanitizedFileName = formatFileName(fileName);

  let createCallId;
  let createRequestId;

  // Create call with retry
  const response = await createCall(sanitizedFileName);
  createCallId = response.callId;
  createRequestId = response.requestId;

  console.log(`[processEngagement] Call created with requestId: ${createRequestId} and callId: ${chalk.yellow.bold(createCallId)}`);

  // Upload call media

  const { requestId: uploadRequestId, callId: uploadCallId, url } = await uploadCallMedia(createCallId, fileName, sanitizedFileName.split('/').pop());
  console.log(`[processEngagement] Call media uploaded with requestId: ${uploadRequestId} and callId: ${chalk.yellow(uploadCallId)}`);
  if (createCallId !== uploadCallId) {
    console.warn(chalk.red('WARNING: Create and Upload calls returned different call IDs'));
  }

  console.log('Call will be available at this URL shortly: ', chalk.blue.underline.bold(url));
}

// Steps to be executed before starting the uploads
async function setup() {
  console.log('Preparing upload setup...');
  await downloadUsers();
  console.log('Ready for upload.');
}

// main
async function uploadEngagements(year) {
  if (!year) {
    throw new Error('Valid year not provided, exiting.');
  }

  console.log('[uploadEngagements] Uploading engagements for year: ', year);
  await setup();
  // Match files for requested year from all user folders
  const filesToUpload = glob.sync(`${process.cwd()}/output/**/${year}-*`);
  const fileCount = filesToUpload.length;

  console.log('[uploadEngagements] filesToUpload: ', filesToUpload);
  console.log('[uploadEngagements] # of files to upload: ', fileCount);
  if (!fileCount) {
    console.log('Nothing matches requested year. Exiting...');
    return;
  }

  let totalUploaded = 0;
  const failedFiles = [];

  for (let fileName of filesToUpload) {
    console.log('[uploadEngagements] Processing ', chalk.blue(fileName));
    try {
      await processEngagement(fileName);
      totalUploaded++;
    } catch (e) {
      console.log(e.toString());
      failedFiles.push(fileName)
    } finally {
      console.log(`[uploadEngagements] totalUploaded: ${chalk.green(totalUploaded)}/${fileCount}`);
      console.log('[uploadEngagements] Failure count: ', chalk.red(failedFiles.length));
    }
  }

  console.log('Failed files: ', failedFiles);
}

// argv.0 and argv.1 are the Node default binary+file. Year supplied to the command will come at argv.2
const targetYear = process.argv[2];
if (!targetYear) {
  console.error(chalk.red('Error: Must specify target year'));
  process.exit(-1);
}

// Converting to Number will also validate the arg
uploadEngagements(Number(targetYear));
