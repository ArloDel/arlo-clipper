/**
 * @fileoverview Webhook Dispatcher, Signature Verification, and Activity Logger for Arlo Clipper.
 * Supports HMAC SHA-256 signatures, exponential backoff retries, and comprehensive inbound/outbound event logging.
 * @module lib/webhooks
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const WEBHOOK_STORAGE_FILE = path.join(process.cwd(), 'data', 'webhooks.json');

/**
 * Initializes data storage folder and webhooks.json file if missing.
 * @private
 */
function initWebhookStorage() {
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(WEBHOOK_STORAGE_FILE)) {
    fs.writeFileSync(
      WEBHOOK_STORAGE_FILE,
      JSON.stringify({ logs: [], secret: process.env.WEBHOOK_SECRET || 'arlo_clipper_secret_key' }, null, 2)
    );
  }
}

/**
 * Reads data from webhooks storage file.
 * @private
 */
function readStorageData() {
  try {
    initWebhookStorage();
    const raw = fs.readFileSync(WEBHOOK_STORAGE_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
    throw new Error('Invalid JSON structure');
  } catch {
    const fallback = { logs: [], secret: process.env.WEBHOOK_SECRET || 'arlo_clipper_secret_key' };
    try {
      fs.writeFileSync(WEBHOOK_STORAGE_FILE, JSON.stringify(fallback, null, 2));
    } catch {
      // ignore
    }
    return fallback;
  }
}

/**
 * Retrieves configured webhook signing secret key from environment or storage.
 *
 * @returns {string} Secret key string
 */
export function getWebhookSecret() {
  if (process.env.WEBHOOK_SECRET) {
    return process.env.WEBHOOK_SECRET;
  }
  if (process.env.ARLO_WEBHOOK_SECRET) {
    return process.env.ARLO_WEBHOOK_SECRET;
  }
  try {
    const data = readStorageData();
    return data.secret || 'arlo_clipper_secret_key';
  } catch {
    return 'arlo_clipper_secret_key';
  }
}

/**
 * Generates an HMAC SHA-256 signature for a payload.
 *
 * @param {string|object} payload - Request payload object or string
 * @param {string} secret - Signing secret key
 * @returns {string} Formatted signature string ("sha256=hex...")
 * @example
 * const sig = generateHmacSignature({ event: 'clip.completed' }, 'my_secret');
 */
export function generateHmacSignature(payload, secret) {
  if (!secret) return '';
  const rawString = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(rawString);
  return `sha256=${hmac.digest('hex')}`;
}

/**
 * Verifies an incoming HMAC SHA-256 signature header against payload using timing-safe comparison.
 *
 * @param {string|object} payload - Incoming request body
 * @param {string} signatureHeader - Header value (e.g. "sha256=1234abcd...")
 * @param {string} secret - Shared secret key
 * @returns {boolean} True if signature is valid and authentic
 */
export function verifyHmacSignature(payload, signatureHeader, secret) {
  if (!secret || !signatureHeader) return false;
  const rawString = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const expectedSig = generateHmacSignature(rawString, secret);

  const cleanHeader = signatureHeader.trim().toLowerCase().replace(/^sha256=/, '');
  const cleanExpected = expectedSig.trim().toLowerCase().replace(/^sha256=/, '');

  try {
    const bufA = Buffer.from(cleanHeader);
    const bufB = Buffer.from(cleanExpected);
    if (bufA.length !== bufB.length) {
      return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Webhook activity log record.
 * @typedef {Object} WebhookLogEntry
 * @property {string} id - Unique delivery or job ID
 * @property {string} timestamp - ISO 8601 timestamp
 * @property {'inbound'|'outbound'} type - Inbound or outbound event
 * @property {string} event - Event name (e.g. 'clip.completed', 'pipeline.started')
 * @property {'success'|'failed'|'processing'} status - Delivery status
 * @property {number} statusCode - HTTP status code
 * @property {string} url - Target URL or source URL
 * @property {string} callbackUrl - Callback endpoint
 * @property {number} attempts - Delivery attempt count
 * @property {number} durationMs - Execution time in milliseconds
 * @property {any} [details] - Detailed metadata payload
 * @property {string|null} [error] - Error message if failed
 */

/**
 * Records a webhook activity event into persistent disk storage.
 *
 * @param {Partial<WebhookLogEntry>} logEntry - Log entry details
 * @returns {WebhookLogEntry|null} Saved log object
 */
export function addWebhookLog(logEntry) {
  try {
    const data = readStorageData();
    if (!Array.isArray(data.logs)) data.logs = [];

    const newLog = {
      id: logEntry.id || crypto.randomUUID(),
      timestamp: logEntry.timestamp || new Date().toISOString(),
      type: logEntry.type || 'inbound', // 'inbound' | 'outbound'
      event: logEntry.event || 'process.request',
      status: logEntry.status || 'success', // 'success' | 'failed' | 'processing'
      statusCode: logEntry.statusCode || (logEntry.status === 'failed' ? 500 : 200),
      url: logEntry.url || logEntry.callbackUrl || '',
      callbackUrl: logEntry.callbackUrl || '',
      attempts: logEntry.attempts || 1,
      durationMs: logEntry.durationMs || 0,
      details: logEntry.details || null,
      error: logEntry.error || null,
    };

    data.logs.unshift(newLog);
    // Keep last 100 logs
    if (data.logs.length > 100) {
      data.logs = data.logs.slice(0, 100);
    }

    fs.writeFileSync(WEBHOOK_STORAGE_FILE, JSON.stringify(data, null, 2));
    return newLog;
  } catch (err) {
    console.warn('[Webhooks] Failed to record webhook log:', err.message);
    return null;
  }
}

/**
 * Retrieves recent webhook activity logs.
 *
 * @param {number} [limit=50] - Maximum logs to return
 * @returns {WebhookLogEntry[]} Array of log entries
 */
export function getWebhookLogs(limit = 50) {
  try {
    const data = readStorageData();
    const logs = Array.isArray(data.logs) ? data.logs : [];
    return logs.slice(0, limit);
  } catch (err) {
    console.warn('[Webhooks] Failed to read webhook logs:', err.message);
    return [];
  }
}

/**
 * Clears all stored webhook activity logs.
 *
 * @returns {boolean} True if cleared successfully
 */
export function clearWebhookLogs() {
  try {
    const data = readStorageData();
    data.logs = [];
    fs.writeFileSync(WEBHOOK_STORAGE_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (err) {
    console.warn('[Webhooks] Failed to clear webhook logs:', err.message);
    return false;
  }
}

/**
 * Dispatches an outbound webhook event with exponential backoff retries and HMAC signatures.
 *
 * @param {Object} params
 * @param {string} params.callbackUrl - Target webhook callback URL
 * @param {string} [params.secret] - Signing secret key
 * @param {'clip.completed'|'clip.failed'|'test.ping'|string} [params.event='clip.completed'] - Event identifier
 * @param {Object} [params.data={}] - Event payload data
 * @param {number} [params.retries=3] - Maximum retry attempts
 * @param {number} [params.retryDelayMs=1000] - Base delay before retries in ms
 * @returns {Promise<{success: boolean, deliveryId: string, statusCode?: number, attempts: number, error?: string}>} Delivery status
 */
export async function dispatchWebhookEvent({
  callbackUrl,
  secret,
  event = 'clip.completed',
  data = {},
  retries = 3,
  retryDelayMs = 1000,
}) {
  if (!callbackUrl) {
    return {
      success: false,
      deliveryId: crypto.randomUUID(),
      error: 'No callbackUrl provided',
      attempts: 0,
    };
  }

  const deliveryId = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const signingSecret = secret || getWebhookSecret();

  const payload = {
    event,
    timestamp,
    deliveryId,
    ...(data && typeof data === 'object' ? data : {}),
    data,
  };

  const payloadString = JSON.stringify(payload);
  const signature = generateHmacSignature(payloadString, signingSecret);

  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'Arlo-Clipper-Webhook/1.0',
    'x-arlo-event': event,
    'x-arlo-delivery': deliveryId,
    'x-arlo-timestamp': timestamp,
  };

  if (signature) {
    headers['x-arlo-signature'] = signature;
    headers['x-hub-signature-256'] = signature;
  }

  console.log(`[Webhooks Outbound] Dispatching event '${event}' to ${callbackUrl} (deliveryId: ${deliveryId})...`);

  const startTime = Date.now();
  let attempt = 0;
  let lastError = null;
  let lastStatusCode = null;

  while (attempt < retries) {
    attempt++;
    let timeoutId;
    try {
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

      const res = await fetch(callbackUrl, {
        method: 'POST',
        headers,
        body: payloadString,
        signal: controller.signal,
      });

      lastStatusCode = res.status;

      if (res.ok || (res.status >= 200 && res.status < 300)) {
        const durationMs = Date.now() - startTime;
        console.log(`[Webhooks Outbound] Successfully delivered '${event}' on attempt ${attempt} (status ${res.status}, ${durationMs}ms)`);

        addWebhookLog({
          id: deliveryId,
          type: 'outbound',
          event,
          callbackUrl,
          status: 'success',
          statusCode: res.status,
          attempts: attempt,
          durationMs,
          details: {
            clipCount: Array.isArray(data.clips) ? data.clips.length : data.clip ? 1 : 0,
            jobId: data.jobId || null,
          },
        });

        return {
          success: true,
          deliveryId,
          statusCode: res.status,
          attempts: attempt,
        };
      }

      // If server returned 4xx client error (except 429 rate-limiting), don't retry fruitlessly
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        throw new Error(`Target returned client error HTTP ${res.status}`);
      }

      throw new Error(`Target returned server error HTTP ${res.status}`);
    } catch (err) {
      lastError = err.message;
      console.warn(`[Webhooks Outbound] Attempt ${attempt}/${retries} failed for ${callbackUrl}: ${err.message}`);

      if (attempt < retries) {
        const backoff = retryDelayMs * Math.pow(2, attempt - 1);
        await new Promise((r) => setTimeout(r, backoff));
      }
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  const durationMs = Date.now() - startTime;
  console.error(`[Webhooks Outbound] Delivery failed after ${attempt} attempts: ${lastError}`);

  addWebhookLog({
    id: deliveryId,
    type: 'outbound',
    event,
    callbackUrl,
    status: 'failed',
    statusCode: lastStatusCode || 500,
    attempts: attempt,
    durationMs,
    error: lastError,
    details: {
      jobId: data.jobId || null,
    },
  });

  return {
    success: false,
    deliveryId,
    statusCode: lastStatusCode || 500,
    attempts: attempt,
    error: lastError,
  };
}
