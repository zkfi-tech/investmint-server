const axios = require('axios');
var debug = require('debug')('investmint-offchain-server:vinter-index');

const vinterIndexFetchJob = async () => {
  try {
    const multiIndexSymbol = 'vnby-bold1-2-d'; // Vinter index we are integrating with
    const response = await axios.get(
      `https://www.vinterapi.com/api/v3/active_multi_assets/?symbol=${multiIndexSymbol}`
    );

    const weightObject = response.data.data[0].weights;

    // Process the data as needed
    const precision = 1000000000000000000; // 18 decimal places (1e18)

    const tokens = Object.keys(weightObject);
    const weights = Object.values(weightObject).map((weight) =>
      Math.round(weight * precision)
    );

    debug(`Tokens: ${tokens}`);
    debug(`Weights: ${weights}`);
  } catch (error) {
    console.error('Failed to fetch index data:', error);
  }
};

module.exports = vinterIndexFetchJob;
