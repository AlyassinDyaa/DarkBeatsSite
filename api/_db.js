import { MongoClient } from 'mongodb'

/* The site's database (MongoDB, for example a free MongoDB Atlas cluster). It holds the customer
   accounts, their sessions, one-time links (password reset, email confirmation), the orders, and
   short-lived counts of login attempts. Nothing in it is ever written to the repository.

   MONGODB_URI   the connection string (Vercel project settings; .env.local on this computer)
   MONGODB_DB    the database's name (optional, "jbeatsart" when not set)

   One connection is opened per warm function and reused by every request after the first, and
   the indexes the collections need are made the first time (making one that exists is a no-op). */
export const dbReady = () => Boolean(process.env.MONGODB_URI || globalThis.__jbTestDb)

export const db = async () => {
  if (globalThis.__jbTestDb) return globalThis.__jbTestDb // a stand-in, only ever set by tests
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set')
  if (!globalThis.__jbMongo) {
    globalThis.__jbMongo = (async () => {
      const client = new MongoClient(process.env.MONGODB_URI, { maxPoolSize: 5, serverSelectionTimeoutMS: 8000 })
      await client.connect()
      const d = client.db(process.env.MONGODB_DB || 'jbeatsart')
      await Promise.all([
        d.collection('users').createIndex({ email: 1 }, { unique: true }),
        d.collection('sessions').createIndex({ hash: 1 }, { unique: true }),
        d.collection('sessions').createIndex({ userId: 1 }),
        d.collection('sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        d.collection('tokens').createIndex({ hash: 1 }, { unique: true }),
        d.collection('tokens').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        d.collection('attempts').createIndex({ key: 1, at: -1 }),
        d.collection('attempts').createIndex({ at: 1 }, { expireAfterSeconds: 2 * 3600 }),
        d.collection('orders').createIndex({ ref: 1 }, { unique: true }),
        d.collection('orders').createIndex({ userId: 1, createdAt: -1 }),
        d.collection('orders').createIndex({ email: 1, createdAt: -1 }),
        d.collection('orders').createIndex({ pi: 1 }),
      ])
      return d
    })().catch((e) => { globalThis.__jbMongo = null; throw e })
  }
  return globalThis.__jbMongo
}
