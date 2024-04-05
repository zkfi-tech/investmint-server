const axios = require('axios');
var debug = require('debug')('investmint-offchain-server:vinter-index');
var { getDB } = require('./dbConfig');
var schedule = require('node-schedule');

const vinterIndexRebalanceDateTracker = async () => {
  try {
    const multiIndexSymbol = 'vnby-bold1-2-d'; // Vinter index we are integrating with
    const response = await axios.get(
      `https://www.vinterapi.com/api/v3/active_multi_assets/?symbol=${multiIndexSymbol}`
    );

    const weightObject = response.data.data[0].weights;
    const latestRebalancingDateString =
      response.data.data[0].next_rebalance_date;
    const latestRebalancingDate = new Date(latestRebalancingDateString); // UTC 00:00:00

    // rebalancing date
    const db = getDB();
    const indexRebalancingCollection = await db.collection(
      'cryptoIndexes'
    );

    const indexFilter = { symbol: multiIndexSymbol };
    const indexInfo = await indexRebalancingCollection.findOne(
      indexFilter
    );

    if (indexInfo) {
      const storedRebalanceDate = new Date(
        indexInfo.rebalanceDate
      );

      if (storedRebalanceDate != latestRebalancingDate) {
        const updateDocument = {
          $set: {
            rebalanceDate: latestRebalancingDateString,
          },
        };
        await indexRebalancingCollection.updateOne(indexFilter, updateDocument);
        debug(`Latest Rebal Date: ${(latestRebalancingDate.toISOString())}`);
        
        // Scheduling Jobs
        // Todo: Schedule RebalanceJob at T-3, T to rebalance composition
        // Todo: Schedule LatestAssetPriceTracker at T to get latest prices of composition
        
        // Schedule vinterIndexRebalanceDateTracker at T+2 to get next rebalancing date
        /// @dev Since according to Vinter docs, the next rebalancing date will be updated 12-24 hours after the latest rebalancing schedule, we will schedule the next update job at `latestRebalancingDate + 2 days`
        const scheduleRebalancingDateTrackerJob = new Date(latestRebalancingDate.setDate(latestRebalancingDate.getDate() + 2));
        debug(`Scheduling rebal tracker to run on: ${(scheduleRebalancingDateTrackerJob.toISOString())}`);
        schedule.scheduleJob(scheduleRebalancingDateTrackerJob, vinterIndexRebalanceDateTracker); // UTC 00:00:00
      }
    }

    // Processing data as needed by the smart contracts
    const precision = 1000000000000000000; // 18 decimal places (1e18)

    const tokens = Object.keys(weightObject);
    const weights = Object.values(weightObject).map((weight) =>
      Math.round(weight * precision)
    );

    debug(`Tokens: ${tokens}`);
    debug(`Weights: ${weights}`);

    // TODO: send the tokens & weights onchain using web3.js
  } catch (error) {
    console.error('Error from RebalanceDateTracker:', error);
  }
};

module.exports = vinterIndexRebalanceDateTracker;
