// ============================================================================
// LOCAL STORAGE MANAGER FOR SCANNED JSON ACCOUNTS
// ----------------------------------------------------------------------------
// - Persists all uploaded JSON accounts directly to local disk storage.
// - Organizes accounts into separate directories:
//     * data/local_storage/with_orders/  (Accounts with orders)
//     * data/local_storage/zero_orders/  (Accounts with 0 orders)
// - Maintains a persistent scanned_index.json ledger.
// - Automatically updates accounts.json and db.json with valid accounts.
// ============================================================================

import fs from 'fs';
import path from 'path';
import { importSessionJson } from './store.js';

const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
const LOCAL_STORAGE_DIR = path.join(DATA_DIR, 'local_storage');
const WITH_ORDERS_DIR = path.join(LOCAL_STORAGE_DIR, 'with_orders');
const ZERO_ORDERS_DIR = path.join(LOCAL_STORAGE_DIR, 'zero_orders');
const INDEX_FILE = path.join(LOCAL_STORAGE_DIR, 'scanned_index.json');

/**
 * Ensures required storage directories exist.
 */
export function initLocalStorage() {
  fs.mkdirSync(WITH_ORDERS_DIR, { recursive: true });
  fs.mkdirSync(ZERO_ORDERS_DIR, { recursive: true });
}

/**
 * Saves an uploaded JSON file and its analysis result to local storage.
 * @param {string} fileName - Original file name
 * @param {string} rawText - Raw JSON content
 * @param {object} analysis - Result from analyzeJsonAccountOrders
 * @returns {string|null} Saved file path
 */
export function saveToLocalStorage(fileName, rawText, analysis) {
  try {
    initLocalStorage();

    const safeName = path.basename(fileName || 'account.json').replace(/[^a-zA-Z0-9._-]/g, '_');
    const targetDir = analysis?.hasOrders ? WITH_ORDERS_DIR : ZERO_ORDERS_DIR;
    const destPath = path.join(targetDir, safeName);

    // Write file to local disk
    fs.writeFileSync(destPath, rawText, 'utf-8');

    // If it has orders, also register into active accounts pool
    if (analysis?.hasOrders) {
      try {
        importSessionJson(rawText);
      } catch (_) {}
    }

    // Update scanned ledger
    let index = [];
    if (fs.existsSync(INDEX_FILE)) {
      try {
        index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8'));
      } catch (_) {
        index = [];
      }
    }

    const entry = {
      fileName: safeName,
      phone: analysis?.phone || 'Unknown',
      orderCount: analysis?.orderCount || 0,
      orderIds: analysis?.orderIds || [],
      hasOrders: Boolean(analysis?.hasOrders),
      storagePath: destPath,
      savedAt: new Date().toISOString()
    };

    const existingIdx = index.findIndex((e) => e.fileName === safeName);
    if (existingIdx >= 0) {
      index[existingIdx] = entry;
    } else {
      index.push(entry);
    }

    fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2), 'utf-8');
    return destPath;
  } catch (err) {
    console.warn('[LocalStorage] Save warning:', err.message);
    return null;
  }
}

/**
 * Returns overall local storage statistics.
 */
export function getLocalStorageStats() {
  try {
    if (!fs.existsSync(INDEX_FILE)) {
      return { totalFiles: 0, withOrders: 0, zeroOrders: 0, totalOrders: 0 };
    }
    const index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8'));
    if (!Array.isArray(index)) {
      return { totalFiles: 0, withOrders: 0, zeroOrders: 0, totalOrders: 0 };
    }
    const withOrders = index.filter((e) => e.hasOrders).length;
    const zeroOrders = index.filter((e) => !e.hasOrders).length;
    const totalOrders = index.reduce((sum, e) => sum + Number(e.orderCount || 0), 0);

    return {
      totalFiles: index.length,
      withOrders,
      zeroOrders,
      totalOrders
    };
  } catch (_) {
    return { totalFiles: 0, withOrders: 0, zeroOrders: 0, totalOrders: 0 };
  }
}
