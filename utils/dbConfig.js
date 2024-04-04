const { MongoClient, ServerApiVersion } = require('mongodb');
var debug = require('debug')('investmint-offchain-server:dbConfig');
const uri = process.env.MONGO_URI;

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
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db('admin').command({ ping: 1 });
    debug('Pinged the DB. You successfully connected to MongoDB!');
  } catch (e) {
    debug(e);
  }
}

module.exports = connectDB;
