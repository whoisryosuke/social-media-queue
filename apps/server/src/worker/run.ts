import { createDb, createPool } from '../db/client.js'
import { loadEnv } from '../env.js'
import { createAdapters, log } from './publisher.js'
import { startWorker } from './loop.js'

const env = loadEnv()
const pool = createPool(env.DATABASE_URL)
const db = createDb(pool)

log.info('worker starting')
startWorker({ db, adapters: createAdapters(), encryptionKey: env.ENCRYPTION_KEY })
