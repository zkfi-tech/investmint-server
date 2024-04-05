const axios = require('axios');
var debug = require('debug')('investmint-offchain-server:vinter-index');
var { getDB } = require('./dbConfig');
var schedule = require('node-schedule');

async function vinterIndexAssetPriceTracker() {
  try{
  const multiIndexSymbol = process.env.VINTER_INDEX_SYMBOL; // Vinter index we are integrating with
  /// @dev Working with a sample response since we dont have the API key at the moment
  // TODO: replace with API call
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

  const assetPrices = vinterHourlyAPIResponse.data[0].current_values;
  const weightObject = vinterHourlyAPIResponse.data[0].current_weights;
   // Processing data as needed by the smart contracts
    const precision = 1000000000000000000; // 18 decimal places (1e18)

    const tokens = Object.keys(weightObject);
    const weights = Object.values(weightObject).map((weight) =>
      Math.round(weight * precision)
    );
    const prices = [];
    for(let t = 0; t < tokens.length; t++) {
      const assetObj = assetPrices.find( assetObj => assetObj.symbol == tokens[t] );
      prices[t] = assetObj.value;
    }

    debug(`Tokens: ${tokens}`);
    debug(`Weights: ${weights}`);
    debug(`Price: ${prices}`);

    const db = getDB();
    const filter = { symbol: multiIndexSymbol };
    const updateDoc = {
      $set: {
        currentAssets: tokens,
        currentWeights: weights,
        currentPrices: prices,
      }
    }
    await db.collection('cryptoIndexes').updateOne(filter, updateDoc);
  } catch(e) {
    debug(`Error from PriceTracker: ${e}`);
  }
}

async function vinterIndexRebalanceDateTracker() {
  try {
    const multiIndexSymbol = process.env.VINTER_INDEX_SYMBOL; // Vinter index we are integrating with
    const response = await axios.get(
      `https://www.vinterapi.com/api/v3/active_multi_assets/?symbol=${multiIndexSymbol}`
    );

    const latestRebalancingDateString =
      response.data.data[0].next_rebalance_date;
    const latestRebalancingDate = new Date(latestRebalancingDateString); // UTC 00:00:00

    // rebalancing date
    const db = getDB();
    const indexCollection = await db.collection(
      'cryptoIndexes'
    );

    const indexFilter = { symbol: multiIndexSymbol };
    const indexInfo = await indexCollection.findOne(
      indexFilter
    );

    if (indexInfo) {
      const storedRebalanceDate = new Date(
        indexInfo.rebalanceDate
      );

      if (storedRebalanceDate != latestRebalancingDate) {
        const updateRebalanceDateDocument = {
          $set: {
            rebalanceDate: latestRebalancingDateString,
          },
        };
        await indexCollection.updateOne(indexFilter, updateRebalanceDateDocument);
        debug(`Latest Rebal Date: ${(latestRebalancingDate.toISOString())}`);
        
        // Scheduling Jobs
        // Todo: Schedule RebalanceJob at T-3, T to rebalance composition
        // Todo: Schedule LatestAssetPriceTracker at T to get latest prices of composition
        
        // Schedule vinterIndexRebalanceDateTracker at T+2 to get next rebalancing date
        /// @dev Since according to Vinter docs, the next rebalancing date will be updated 12-24 hours after the latest rebalancing schedule, we will schedule the next update job at `latestRebalancingDate + 2 days`
        const scheduleRebalanceDateTrackerJobOn = new Date(latestRebalancingDate.setDate(latestRebalancingDate.getDate() + 2));
        debug(`Scheduling rebal tracker to run on: ${(scheduleRebalanceDateTrackerJobOn.toISOString())}`);
        schedule.scheduleJob(scheduleRebalanceDateTrackerJobOn, vinterIndexRebalanceDateTracker); // UTC 00:00:00
      }
    }

    // TODO: send the tokens & weights onchain using web3.js
  } catch (error) {
    console.error('Error from RebalanceDateTracker:', error);
  }
};

module.exports = {vinterIndexAssetPriceTracker, vinterIndexRebalanceDateTracker};
