import dns from 'dns';
import { MongoClient, ServerApiVersion } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI || ''
const MONGODB_DB = process.env.DB_NAME || ''

// `mongodb+srv://` requires a DNS SRV lookup, which Node performs with its
// bundled resolver (c-ares) rather than the OS resolver. On some Windows / VPN
// setups c-ares can't read the system DNS servers and falls back to
// 127.0.0.1:53, producing `querySrv ECONNREFUSED _mongodb._tcp.<host>`. Setting
// MONGODB_DNS_SERVERS (e.g. "1.1.1.1,8.8.8.8") points c-ares at a reachable
// resolver. No-op when unset, so hosted environments (Vercel) are unaffected.
const DNS_SERVERS = process.env.MONGODB_DNS_SERVERS
if (DNS_SERVERS) {
  const servers = DNS_SERVERS.split(',').map((s) => s.trim()).filter(Boolean)
  if (servers.length) dns.setServers(servers)
}

// check the MongoDB URI
if (!MONGODB_URI) {
  throw new Error('Define the MONGODB_URI environmental variable')
}

// check the MongoDB DB
if (!MONGODB_DB) {
  throw new Error('Define the MONGODB_DB environmental variable')
}

let cachedClient: any = null
let cachedDb: any = null

export async function connectToDatabase() {
  // check the cached.
  if (cachedClient && cachedDb) {
    // load from cache
    return {
      client: cachedClient,
      db: cachedDb,
    }
  }

  // set the connection options
  const opts = {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    }
  }

  // Connect to cluster
  let client = new MongoClient(MONGODB_URI, opts)
  await client.connect()
  let db = client.db(MONGODB_DB)

  // set cache
  cachedClient = client
  cachedDb = db

  return {
    client: cachedClient,
    db: cachedDb,
  }
}
