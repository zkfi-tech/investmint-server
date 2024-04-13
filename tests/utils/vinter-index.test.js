const { vinterIndexAssetPriceTracker, vinterIndexRebalanceDateTracker, vinterIndexRebalancer } = require('../../utils/vinter-index');
const { MongoClient, ServerApiVersion } = require('mongodb');
const axios = require('axios');
const { connectDB, getDB, closeDB } = require('../../utils/dbConfig');
jest.mock('axios');

describe('insert', () => {
  let db;
  let client;
  let collection;
  // TODO: axios API calls to `multi_assets_daily` API to be mocked when implemented 
  const vinterHourlyAPIResponse = {
    "data": [
      {
        "created_at": "2023-01-31T06:00:52.356Z",
        "current_values": [
          {
            "datetime": "2023-01-31T06:00:24.133666Z",
            "symbol": "ada-usd-p-h",
            "timestamp": 1675144824133,
            "value": 0.3707
          },
          {
            "datetime": "2023-01-31T06:00:51.971547Z",
            "symbol": "bnb-usd-p-h",
            "timestamp": 1675144851971,
            "value": 312.88
          },
          {
            "datetime": "2023-01-31T06:00:27.345517Z",
            "symbol": "btc-usd-p-h",
            "timestamp": 1675144827345,
            "value": 22843.11
          },
          {
            "datetime": "2023-01-31T06:00:24.191368Z",
            "symbol": "eth-usd-p-h",
            "timestamp": 1675144824191,
            "value": 1569.9
          },
          {
            "datetime": "2023-01-31T06:00:24.121833Z",
            "symbol": "xrp-usd-p-h",
            "timestamp": 1675144824121,
            "value": 0.3907
          }
        ],
        "current_weights": {
          "ada-usd-p-h": 0.1887094862,
          "bnb-usd-p-h": 0.1980078237,
          "btc-usd-p-h": 0.2302474888,
          "eth-usd-p-h": 0.2058637818,
          "xrp-usd-p-h": 0.1771714194
        },
        "date": "2023-01-31",
        "hour": 6,
        "id": 100282,
        "rebalance_values": [
          {
            "datetime": "2022-10-31T16:00:06.384Z",
            "symbol": "ada-usd-p-d",
            "timestamp": 1667232006383,
            "value": 0.4032
          },
          {
            "datetime": "2022-10-31T16:00:11.707Z",
            "symbol": "bnb-usd-p-d",
            "timestamp": 1667232011706,
            "value": 324.33
          },
          {
            "datetime": "2022-10-31T16:00:07.907Z",
            "symbol": "btc-usd-p-d",
            "timestamp": 1667232007905,
            "value": 20363.48
          },
          {
            "datetime": "2022-10-31T16:00:04.531Z",
            "symbol": "eth-usd-p-d",
            "timestamp": 1667232002445,
            "value": 1565.25
          },
          {
            "datetime": "2022-10-31T16:00:07.781Z",
            "symbol": "xrp-usd-p-d",
            "timestamp": 1667232007780,
            "value": 0.452628
          },
          {
            "datetime": "2022-10-31T16:00:21.381Z",
            "symbol": "vntr-eq-5-d",
            "timestamp": 1667232021379,
            "value": 2341.2
          }
        ],
        "rebalance_weights": {
          "ada-usd-p-h": 0.2,
          "bnb-usd-p-h": 0.2,
          "btc-usd-p-h": 0.2,
          "eth-usd-p-h": 0.2,
          "xrp-usd-p-h": 0.2
        },
        "symbol": "vntr-eq-5-h",
        "timestamp": 1675144852354,
        "value": 2281.27
      }
    ],
    "message": "Success",
    "params": {
      "symbol": "vntr-eq-5-h"
    },
    "result": "success"
  }
  const rebalanceWeightObject = vinterHourlyAPIResponse.data[0].rebalance_weights;

  beforeAll(async () => {
    await connectDB();
    db = getDB();
    collection = await db.collection('cryptoIndexes');
    filter = {
      symbol: process.env.VINTER_INDEX_SYMBOL
    }
  });

  afterAll(async () => {
    await closeDB();
  });

  it('vinterIndexAssetPriceTracker() should insert tokens, weights and prices into index collection', async () => {
    // TODO: Add mock network call once VinterIndex Price API is integrated

    // expected IndexInfo (values derieved from the mock API response)
    const weightObject = vinterHourlyAPIResponse.data[0].current_weights;
    const expectedCurrentAssets = Object.keys(weightObject);
    const expectedCurrentWeights = Object.values(weightObject);

    let expectedCurrentPrices = [];

    const assetPrices = vinterHourlyAPIResponse.data[0].current_values;
    for (let t = 0; t < expectedCurrentAssets.length; t++) {
      const assetObj = assetPrices.find(assetObj => assetObj.symbol == expectedCurrentAssets[t]);
      expectedCurrentPrices[t] = assetObj.value;
    }

    // make call to vinterIndexAssetPriceTracker
    // TODO: mock the Vinter API call when included in vinterIndexAssetPriceTracker
    await vinterIndexAssetPriceTracker();

    // retrieve doc from MongoDB
    const updatedIndexInfo = await collection.findOne(filter);

    const retrievedAssets = updatedIndexInfo.currentAssets;
    const retrievedWeights = updatedIndexInfo.currentWeights;
    const retrievedPrices = updatedIndexInfo.currentPrices;

    expect(retrievedAssets).toEqual(expectedCurrentAssets);
    expect(retrievedWeights).toEqual(expectedCurrentWeights);
    expect(retrievedPrices).toEqual(expectedCurrentPrices);
  });

  it('vinterIndexRebalancerDateTracker() should store the latest rebalancing date in the index collection', async () => {
    const vinterIndexActiveMultiIndexResponse = {
      "result": "success",
      "message": "Success",
      "data": [
        {
          "symbol": "vntr-eq-5-h",
          "weights": {
            "bnb-usd-p-d": 0.2,
            "btc-usd-p-d": 0.2,
            "eth-usd-p-d": 0.2,
            "sol-usd-p-d": 0.2,
            "xrp-usd-p-d": 0.2
          },
          "previous_rebalance_date": "2024-01-31",
          "next_rebalance_date": "2024-04-30",
          "previous_review_date": "2024-01-24",
          "next_review_date": "2024-04-23",
          "next_rebalance_weights": null,
          "indicative_rebalance_weights": null,
          "indicative_rebalance_date": null,
          "short_name": "VNEQ5",
          "long_name": "Vinter Equal Weighted 5 Index",
          "bloomberg_ticker": null,
          "eikon_ticker": null
        }
      ],
      "params": {
        "symbol": "vntr-eq-5-h"
      }
    }
    axios.get.mockResolvedValue(vinterIndexActiveMultiIndexResponse);
    await vinterIndexRebalanceDateTracker();

    const expectedRebalanceDate = vinterIndexActiveMultiIndexResponse.data[0].next_rebalance_date;

    const indexInfo = await collection.findOne(filter);
    const retrievedRebalanceDate = indexInfo.rebalanceDate;

    expect(retrievedRebalanceDate).toBe(expectedRebalanceDate);
  })

  it('vinterIndexRebalancer() should update the rebalanced assets, weights and prices', async () => {
    // TODO: Add mock network call once VinterIndex Price API is integrated

    await vinterIndexRebalancer();
    console.log(`DB query executed!`);

    const updatedIndexInfo = await collection.findOne(filter);

    const storedRebalanceDate = new Date(updatedIndexInfo.rebalanceDate); // expected values will be based on this
    const today = new Date();

    let expectedCurrentAssets, expectedCurrentWeights, expectedRebalanceAssets, expectedRebalancedWeights = [];

    /// @dev T-4 scenario (rebal. info available but rebal. not executed)
    if (today < storedRebalanceDate) {
      // preparing expected values for T-4 scenario
      expectedRebalanceAssets = Object.keys(rebalanceWeightObject);
      expectedRebalancedWeights = Object.values(rebalanceWeightObject)

      expect(updatedIndexInfo.rebalanceAssets).toEqual(expectedRebalanceAssets);
      expect(updatedIndexInfo.rebalanceWeights).toEqual(expectedRebalancedWeights);
    }
    else {
      /// @dev T scenario: Rebalancing executed
      expectedCurrentAssets = Object.keys(rebalanceWeightObject);
      expectedCurrentWeights = Object.values(rebalanceWeightObject);
      expectedRebalanceAssets = [];
      expectedRebalancedWeights = [];

      expect(updatedIndexInfo.currentAssets).toEqual(expectedCurrentAssets);
      expect(updatedIndexInfo.currentWeights).toEqual(expectedCurrentWeights);
      expect(updatedIndexInfo.rebalanceAssets).toEqual(expectedRebalanceAssets);
      expect(updatedIndexInfo.rebalanceWeights).toEqual(expectedRebalanceWeights);
    }
  })
});
