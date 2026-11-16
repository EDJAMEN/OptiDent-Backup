/**
 * OptiDent Framework-Free RESTful API
 * Centralized Database Adapter (Pure Native Node.js with MongoDB driver support & File Fallback)
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const dbName = process.env.DB_NAME || 'OptiDent';
const fallbackFile = path.resolve(__dirname, '../../OptiDent_NodeJS/database_mongo_storage.json');

let client = null;
let db = null;
let useNative = false;

// Pure native ObjectId implementation
export class ObjectId {
  constructor(id) {
    if (id && typeof id === 'string') {
      this.hex = id;
    } else {
      this.hex = crypto.randomBytes(12).toString('hex');
    }
  }
  toString() {
    return this.hex;
  }
}

export async function initDatabase() {
  if (db) return db;
  try {
    // Attempt to load mongodb from local or neighboring node_modules
    const candidatePaths = [
      path.resolve(__dirname, '../../node_modules/mongodb/lib/index.js'),
      path.resolve(__dirname, '../../../OptiDent_NodeJS/node_modules/mongodb/lib/index.js'),
      path.resolve(__dirname, '../../OptiDent_NodeJS/node_modules/mongodb/lib/index.js')
    ];
    const mongoPath = candidatePaths.find(p => fs.existsSync(p));
    if (mongoPath) {
      const { MongoClient: MC } = await import(`file://${mongoPath.replace(/\\/g, '/')}`);
      client = new MC(uri, { serverSelectionTimeoutMS: 2000 });
      await client.connect();
      await client.db(dbName).command({ ping: 1 });
      db = client.db(dbName);
      useNative = true;
      console.log(`[Database] Native MongoDB connected successfully (${uri}/${dbName})`);
      return db;
    }
  } catch (err) {
    // Native MongoDB unreachable or not installed, fallback smoothly
    console.warn(`[Database] Native MongoDB connection deferred (${err.message}). Using local JSON storage fallback.`);
  }

  useNative = false;
  return null;
}

function readFallback() {
  try {
    if (fs.existsSync(fallbackFile)) {
      return JSON.parse(fs.readFileSync(fallbackFile, 'utf8'));
    }
  } catch (e) {
    console.error('[Database Fallback] Read error:', e.message);
  }
  return { users: [], appointments: [], services: [], clinical_records: [], audit_logs: [] };
}

function writeFallback(data) {
  try {
    fs.writeFileSync(fallbackFile, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('[Database Fallback] Write error:', e.message);
  }
}

/**
 * Universal collection accessor with identical API for both native Mongo and JSON fallback
 * @param {string} collectionName 
 */
export function getCollection(collectionName) {
  if (useNative && db) {
    return db.collection(collectionName);
  }

  // Pure Native Node.js JSON storage wrapper
  return {
    async find(query = {}) {
      const data = readFallback();
      let list = data[collectionName] || [];
      
      const filterKeys = Object.keys(query);
      if (filterKeys.length > 0) {
        list = list.filter(item => {
          return filterKeys.every(k => {
            if (query[k] && typeof query[k] === 'object' && query[k].$ne !== undefined) {
              return item[k] !== query[k].$ne;
            }
            if (query[k] && typeof query[k] === 'object' && query[k].$in !== undefined) {
              return query[k].$in.includes(item[k]);
            }
            if (query[k] && typeof query[k] === 'object' && query[k].$nin !== undefined) {
              return !query[k].$nin.includes(item[k]);
            }
            if (k === '_id' && typeof query[k] === 'string') {
              return String(item._id) === query[k];
            }
            return item[k] === query[k];
          });
        });
      }

      return {
        sort(sortObj = {}) {
          const [sortKey, sortDir] = Object.entries(sortObj)[0] || ['_id', -1];
          list.sort((a, b) => {
            if (a[sortKey] > b[sortKey]) return sortDir === 1 ? 1 : -1;
            if (a[sortKey] < b[sortKey]) return sortDir === 1 ? -1 : 1;
            return 0;
          });
          return this;
        },
        skip(n = 0) {
          list = list.slice(n);
          return this;
        },
        limit(n = 50) {
          list = list.slice(0, n);
          return this;
        },
        async toArray() {
          return list;
        }
      };
    },

    async countDocuments(query = {}) {
      const cursor = await this.find(query);
      const arr = await cursor.toArray();
      return arr.length;
    },

    async findOne(query = {}) {
      const cursor = await this.find(query);
      const arr = await cursor.toArray();
      return arr[0] || null;
    },

    async insertOne(doc) {
      const data = readFallback();
      if (!data[collectionName]) data[collectionName] = [];
      const newDoc = {
        _id: doc._id || new ObjectId().toString(),
        ...doc,
        created_at: doc.created_at || new Date().toISOString()
      };
      data[collectionName].push(newDoc);
      writeFallback(data);
      return { insertedId: newDoc._id, acknowledged: true };
    },

    async updateOne(query, update) {
      const data = readFallback();
      const list = data[collectionName] || [];
      const item = list.find(it => {
        if (query._id) return String(it._id) === String(query._id);
        if (query.id) return String(it.id) === String(query.id);
        if (query.email) return it.email === query.email;
        return false;
      });

      if (!item) return { matchedCount: 0, modifiedCount: 0 };

      if (update.$set) {
        Object.assign(item, update.$set);
      }
      if (update.$unset) {
        for (const k of Object.keys(update.$unset)) {
          delete item[k];
        }
      }
      item.updated_at = new Date().toISOString();
      writeFallback(data);
      return { matchedCount: 1, modifiedCount: 1 };
    },

    async deleteOne(query) {
      const data = readFallback();
      const list = data[collectionName] || [];
      const idx = list.findIndex(it => {
        if (query._id) return String(it._id) === String(query._id);
        return false;
      });

      if (idx === -1) return { deletedCount: 0 };
      list.splice(idx, 1);
      writeFallback(data);
      return { deletedCount: 1 };
    }
  };
}
