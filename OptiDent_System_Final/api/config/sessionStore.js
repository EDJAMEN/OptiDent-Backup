/**
 * express-session store backed by the app's database (MongoDB, or the JSON fallback).
 * Sessions survive server restarts — `node --watch` restarts on every file save, and the
 * default MemoryStore lost every login each time ("No active session. Please log in.").
 */
import session from 'express-session';
import dbClient from './db.js';

const COLLECTION = 'sessions';

export default class DbSessionStore extends session.Store {
    constructor() {
        super();
        this.indexed = false;
        // Write-through cache: express-session can answer the login request before the DB write lands,
        // so the very next request must still find the session in this process.
        this.cache = new Map();
    }

    async ensureIndexes() {
        if (this.indexed) return;
        this.indexed = true;
        const db = dbClient.isNative() && dbClient.getNativeDb();
        if (!db) return;
        // TTL index: MongoDB deletes expired sessions by itself
        await db.collection(COLLECTION).createIndex({ expires: 1 }, { expireAfterSeconds: 0 }).catch(() => {});
        await db.collection(COLLECTION).createIndex({ sid: 1 }, { unique: true }).catch(() => {});
    }

    expiryOf(sess) {
        const exp = sess?.cookie?.expires ? new Date(sess.cookie.expires) : null;
        return exp && !isNaN(exp) ? exp : new Date(Date.now() + 24 * 60 * 60 * 1000);
    }

    get(sid, cb) {
        const hit = this.cache.get(sid);
        if (hit) {
            if (hit.expires > new Date()) return cb(null, JSON.parse(hit.session));
            this.cache.delete(sid);
        }
        (async () => {
            const doc = await dbClient.findOne(COLLECTION, { sid });
            if (!doc) return null;
            if (new Date(doc.expires) <= new Date()) {
                await dbClient.deleteOne(COLLECTION, { sid });
                return null;
            }
            this.cache.set(sid, { session: doc.session, expires: new Date(doc.expires) });
            return JSON.parse(doc.session);
        })().then(s => cb(null, s), cb);
    }

    set(sid, sess, cb) {
        const fields = { session: JSON.stringify(sess), expires: this.expiryOf(sess) };
        this.cache.set(sid, fields);
        (async () => {
            await this.ensureIndexes();
            const existing = await dbClient.findOne(COLLECTION, { sid });
            if (existing) await dbClient.updateOne(COLLECTION, { sid }, { $set: fields });
            else await dbClient.insertOne(COLLECTION, { sid, ...fields });
        })().then(() => cb && cb(null), err => cb && cb(err));
    }

    destroy(sid, cb) {
        this.cache.delete(sid);
        dbClient.deleteOne(COLLECTION, { sid }).then(() => cb && cb(null), err => cb && cb(err));
    }
}
