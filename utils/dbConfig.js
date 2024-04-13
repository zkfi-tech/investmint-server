const { MongoClient, ServerApiVersion } = require('mongodb');
var debug = require('debug')('investmint-offchain-server:dbConfig');
const uri = process.env.MONGO_URI;
var db;

// Creating a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function connectDB() {
  try {
    await client.connect();

    // Send a ping to confirm a successful connection
    await client.db(process.env.INVESTMINT_DB).command({ ping: 1 });
    debug('You successfully connected to MongoDB!');

    db = await client.db(process.env.INVESTMINT_DB);
  } catch (e) {
    debug(e);
  }
};

function getDB() {
  if (!db) {
    throw new Error('Database connection not established. Call connectDB() first.');
  }
  return db;
}

async function closeDB() {
  await client.close();
}

module.exports = {connectDB, getDB, client, closeDB};