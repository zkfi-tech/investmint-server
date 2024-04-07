const {vinterIndexAssetPriceTracker} = require('../../utils/vinter-index');
const { MongoClient, ServerApiVersion } = require('mongodb');

describe('insert', () => {
  let db;
  let client;

  beforeAll(async () => {
    client = new MongoClient(process.env.MONGO_URI, {
    serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
    await client.connect();
    db = await client.db(process.env.INVESTMINT_DB);
  });

  afterAll(async () => {
    await client.close();
  });

  it('should insert tokens, weights and prices into index collection', async () => {
    // make call to vinterIndexAssetPriceTracker
    // TODO: mock the Vinter API call when included in vinterIndexAssetPriceTracker
    await vinterIndexAssetPriceTracker();

    // expected IndexInfo (values derieved from the mock API response)
    const expectedCurrentAssets = ["ada-usd-p-h","bnb-usd-p-h","btc-usd-p-h","eth-usd-p-h","xrp-usd-p-h"];
    const expectedCurrentWeights = [188709486200000000, 198007823700000000, 230247488800000000, 205863781800000000, 177171419400000000];
    const expectedCurrentPrices = [0.3707, 312.88, 22843.11, 1569.9, 0.3907];

    // retrieve doc from MongoDB
    const updatedIndexInfo = await db.collection('cryptoIndexes').findOne({
        symbol: process.env.VINTER_INDEX_SYMBOL
    });
    
    const retrievedAssets = updatedIndexInfo.currentAssets;
    const retrievedWeights = updatedIndexInfo.currentWeights;
    const retrievedPrices = updatedIndexInfo.currentPrices;

    expect(retrievedAssets).toEqual(expectedCurrentAssets);
    expect(retrievedWeights).toEqual(expectedCurrentWeights);
    expect(retrievedPrices).toEqual(expectedCurrentPrices);
  });
});
