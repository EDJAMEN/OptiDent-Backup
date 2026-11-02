import { MongoClient, ObjectId } from 'mongodb';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const dbName = process.env.DB_NAME || 'OptiDent';
const fallbackFile = path.resolve(__dirname, '../../database_mongo_storage.json');

let client = null;
let db = null;
let useNative = false;

// Connect to MongoDB
export async function connectDB() {
    try {
        client = new MongoClient(uri, { serverSelectionTimeoutMS: 2000 });
        await client.connect();
        await client.db(dbName).command({ ping: 1 });
        db = client.db(dbName);
        useNative = true;
        console.log(`[MongoDB] Connected successfully to native MongoDB (${uri}/${dbName})`);

        // Create performance indexes in background
        Promise.allSettled([
            db.collection('appointments').createIndex({ appointment_date: 1, status: 1 }),
            db.collection('appointments').createIndex({ doctor_email: 1, appointment_date: 1 }),
            db.collection('appointments').createIndex({ dentist_email: 1, appointment_date: 1 }),
            db.collection('appointments').createIndex({ is_deleted: 1, is_archived: 1 }),
            db.collection('users').createIndex({ email: 1 }),
            db.collection('invitations').createIndex({ token: 1 }),
            db.collection('invitations').createIndex({ email: 1 })
        ]).catch(() => {});

        // Auto-seed initial template data if collections are empty (e.g. fresh MongoDB Atlas cluster)
        try {
            const userCount = await db.collection('users').countDocuments();
            if (userCount === 0) {
                console.log('[MongoDB] Fresh cluster detected. Auto-seeding initial users and settings...');
                const seedData = readFallback();
                for (const [colName, docs] of Object.entries(seedData)) {
                    if (Array.isArray(docs) && docs.length > 0) {
                        const sanitized = docs.map(d => {
                            const copy = { ...d };
                            if (copy._id && typeof copy._id === 'string' && copy._id.length === 24) {
                                try { copy._id = new ObjectId(copy._id); } catch (e) {}
                            }
                            return copy;
                        });
                        await db.collection(colName).insertMany(sanitized).catch(() => {});
                    }
                }
                console.log('[MongoDB] Initial database seed successfully completed.');
            }
        } catch (seedErr) {
            console.warn('[MongoDB Seed Notice]', seedErr.message);
        }
    } catch (err) {
        useNative = false;
        console.warn(`[MongoDB Warning] Native connection failed (${err.message}). Using fallback local storage: ${fallbackFile}`);
    }
}

// Fallback JSON operations
function readFallback() {
    try {
        if (!fs.existsSync(fallbackFile)) {
            return {};
        }
        const raw = fs.readFileSync(fallbackFile, 'utf-8');
        return JSON.parse(raw);
    } catch (e) {
        return {};
    }
}

function writeFallback(data) {
    try {
        fs.writeFileSync(fallbackFile, JSON.stringify(data, null, 4), 'utf-8');
    } catch (e) {
        console.error('[Fallback] Write error:', e.message);
    }
}

// Helper to prepare ObjectId query
function prepareFilter(filter = {}) {
    if (!filter || typeof filter !== 'object') return {};
    const prepared = { ...filter };
    if (prepared._id && typeof prepared._id === 'string' && /^[a-f\d]{24}$/i.test(prepared._id)) {
        prepared.$or = [
            { _id: prepared._id },
            { _id: new ObjectId(prepared._id) }
        ];
        delete prepared._id;
    }
    return prepared;
}

// Format document output (convert ObjectId to string)
function formatDoc(doc) {
    if (!doc) return null;
    const formatted = { ...doc };
    if (formatted._id) {
        formatted._id = formatted._id.toString();
    }
    return formatted;
}

// Database helper functions exported as clean modular methods
export const dbClient = {
    isNative: () => useNative,
    getNativeDb: () => db,

    async find(collectionName, filter = {}, options = {}) {
        if (useNative && db) {
            try {
                let cursor = db.collection(collectionName).find(prepareFilter(filter));
                if (options.sort) cursor = cursor.sort(options.sort);
                if (options.skip) cursor = cursor.skip(options.skip);
                if (options.limit) cursor = cursor.limit(options.limit);
                const docs = await cursor.toArray();
                return docs.map(formatDoc);
            } catch (err) {
                console.error(`Native find error on ${collectionName}:`, err.message);
            }
        }

        // Fallback
        const data = readFallback();
        const list = Array.isArray(data[collectionName]) ? data[collectionName] : [];
        let filtered = list.filter(item => {
            for (const key of Object.keys(filter)) {
                if (key === '_id') {
                    if (String(item._id) !== String(filter._id)) return false;
                } else if (item[key] !== filter[key]) {
                    return false;
                }
            }
            return true;
        });
        if (options.limit) filtered = filtered.slice(0, options.limit);
        return filtered.map(formatDoc);
    },

    async findOne(collectionName, filter = {}) {
        if (useNative && db) {
            try {
                const doc = await db.collection(collectionName).findOne(prepareFilter(filter));
                return formatDoc(doc);
            } catch (err) {
                console.error(`Native findOne error on ${collectionName}:`, err.message);
            }
        }

        // Fallback
        const data = readFallback();
        const list = Array.isArray(data[collectionName]) ? data[collectionName] : [];
        const match = list.find(item => {
            for (const key of Object.keys(filter)) {
                if (key === '_id') {
                    if (String(item._id) !== String(filter._id)) return false;
                } else if (item[key] !== filter[key]) {
                    return false;
                }
            }
            return true;
        });
        return formatDoc(match) || null;
    },

    async insertOne(collectionName, document) {
        const toInsert = { ...document };
        if (!toInsert._id) {
            toInsert._id = new ObjectId().toString();
        }
        if (!toInsert.created_at) {
            toInsert.created_at = new Date().toISOString().replace('T', ' ').slice(0, 19);
        }

        if (useNative && db) {
            try {
                const res = await db.collection(collectionName).insertOne(toInsert);
                return { insertedId: toInsert._id, acknowledged: true };
            } catch (err) {
                console.error(`Native insertOne error on ${collectionName}:`, err.message);
            }
        }

        // Fallback
        const data = readFallback();
        if (!Array.isArray(data[collectionName])) {
            data[collectionName] = [];
        }
        data[collectionName].push(toInsert);
        writeFallback(data);
        return { insertedId: toInsert._id, acknowledged: true };
    },

    async updateOne(collectionName, filter = {}, update = {}) {
        const setFields = update.$set ? update.$set : update;

        if (useNative && db) {
            try {
                const res = await db.collection(collectionName).updateOne(
                    prepareFilter(filter),
                    update.$set ? update : { $set: setFields }
                );
                return { modifiedCount: res.modifiedCount, acknowledged: true };
            } catch (err) {
                console.error(`Native updateOne error on ${collectionName}:`, err.message);
            }
        }

        // Fallback
        const data = readFallback();
        const list = Array.isArray(data[collectionName]) ? data[collectionName] : [];
        let modifiedCount = 0;
        for (let i = 0; i < list.length; i++) {
            let match = true;
            for (const key of Object.keys(filter)) {
                if (key === '_id') {
                    if (String(list[i]._id) !== String(filter._id)) match = false;
                } else if (list[i][key] !== filter[key]) {
                    match = false;
                }
            }
            if (match) {
                list[i] = { ...list[i], ...setFields };
                modifiedCount++;
                break;
            }
        }
        if (modifiedCount > 0) {
            writeFallback(data);
        }
        return { modifiedCount, acknowledged: true };
    },

    async updateMany(collectionName, filter = {}, update = {}) {
        const setFields = update.$set ? update.$set : update;

        if (useNative && db) {
            try {
                const res = await db.collection(collectionName).updateMany(
                    prepareFilter(filter),
                    update.$set ? update : { $set: setFields }
                );
                return { modifiedCount: res.modifiedCount, acknowledged: true };
            } catch (err) {
                console.error(`Native updateMany error on ${collectionName}:`, err.message);
            }
        }

        // Fallback
        const data = readFallback();
        const list = Array.isArray(data[collectionName]) ? data[collectionName] : [];
        let modifiedCount = 0;
        for (let i = 0; i < list.length; i++) {
            let match = true;
            for (const key of Object.keys(filter)) {
                if (key === '_id') {
                    if (String(list[i]._id) !== String(filter._id)) match = false;
                } else if (list[i][key] !== filter[key]) {
                    match = false;
                }
            }
            if (match) {
                list[i] = { ...list[i], ...setFields };
                modifiedCount++;
            }
        }
        if (modifiedCount > 0) {
            writeFallback(data);
        }
        return { modifiedCount, acknowledged: true };
    },

    async deleteOne(collectionName, filter = {}) {
        if (useNative && db) {
            try {
                const res = await db.collection(collectionName).deleteOne(prepareFilter(filter));
                return { deletedCount: res.deletedCount, acknowledged: true };
            } catch (err) {
                console.error(`Native deleteOne error on ${collectionName}:`, err.message);
            }
        }

        // Fallback
        const data = readFallback();
        const list = Array.isArray(data[collectionName]) ? data[collectionName] : [];
        const index = list.findIndex(item => {
            for (const key of Object.keys(filter)) {
                if (key === '_id') {
                    if (String(item._id) !== String(filter._id)) return false;
                } else if (item[key] !== filter[key]) {
                    return false;
                }
            }
            return true;
        });
        let deletedCount = 0;
        if (index !== -1) {
            list.splice(index, 1);
            deletedCount = 1;
            writeFallback(data);
        }
        return { deletedCount, acknowledged: true };
    },

    async deleteMany(collectionName, filter = {}) {
        if (useNative && db) {
            try {
                const res = await db.collection(collectionName).deleteMany(prepareFilter(filter));
                return { deletedCount: res.deletedCount, acknowledged: true };
            } catch (err) {
                console.error(`Native deleteMany error on ${collectionName}:`, err.message);
            }
        }

        const data = readFallback();
        const list = Array.isArray(data[collectionName]) ? data[collectionName] : [];
        if (!filter || Object.keys(filter).length === 0) {
            const count = list.length;
            data[collectionName] = [];
            writeFallback(data);
            return { deletedCount: count, acknowledged: true };
        }
        const remaining = list.filter(item => {
            for (const key of Object.keys(filter)) {
                if (key === '_id') {
                    if (String(item._id) === String(filter._id)) return false;
                } else if (item[key] === filter[key]) {
                    return false;
                }
            }
            return true;
        });
        const deletedCount = list.length - remaining.length;
        data[collectionName] = remaining;
        writeFallback(data);
        return { deletedCount, acknowledged: true };
    },

    async countDocuments(collectionName, filter = {}) {
        if (useNative && db) {
            try {
                return await db.collection(collectionName).countDocuments(prepareFilter(filter));
            } catch (err) {
                console.error(`Native countDocuments error on ${collectionName}:`, err.message);
            }
        }

        const data = readFallback();
        const list = Array.isArray(data[collectionName]) ? data[collectionName] : [];
        if (!filter || Object.keys(filter).length === 0) return list.length;
        return list.filter(item => {
            for (const key of Object.keys(filter)) {
                if (key === '_id') {
                    if (String(item._id) !== String(filter._id)) return false;
                } else if (item[key] !== filter[key]) {
                    return false;
                }
            }
            return true;
        }).length;
    }
};

export default dbClient;

