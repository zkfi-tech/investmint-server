const express = require('express');
const router = express.Router();
const { getDB } = require('../utils/dbConfig.js');
const BigNumber = require('bignumber.js')
const { vinterIndexAssetPriceTracker } = require('../utils/vinter-index.js');

/* GET users listing. */
router.get('/', function (req, res, next) {
  res.status(200).send('Youre connected to the InvestMint Offchain server');
});

router.get('/getAssetCompositionAndWeights', async (req, res) => {
  /// @dev Getting the latest asset prices to calculate the quantity of underlying asset to be deposited
  /// @dev This job will update the latest prices in our DB
  await vinterIndexAssetPriceTracker();

  const precision = new BigNumber(1e18.toString());
  const db = getDB();
  const investmentAmount = new BigNumber(req.query.investmentAmount);

  const filter = {
    symbol: process.env.VINTER_INDEX_SYMBOL
  };

  const indexInfo = await db.collection('cryptoIndexes').findOne(filter);
  const currentAssets = indexInfo.currentAssets;
  const currentWeights = indexInfo.currentWeights;
  const currentPrices = indexInfo.currentPrices;
  const numberOfAssets = currentAssets.length;

  var assetToBeDepositedBasedOnWeights = new Array(currentAssets.length);
  for (let a = 0; a < numberOfAssets; a++) {
    let assetWt = new BigNumber(currentWeights[a].toString());
    let assetBasedSplitOfInvestment = assetWt.multipliedBy(investmentAmount);
    let assetCurrentPrice = new BigNumber(currentPrices[a].toString());

    let assetQuantityToDeposit = assetBasedSplitOfInvestment.dividedBy(assetCurrentPrice);

    // q should the asset quantities be returned in wei (1e18)? 
    // assetToBeDepositedBasedOnWeights[a] = assetQuantityToDeposit.multipliedBy(precision);
    assetToBeDepositedBasedOnWeights[a] = assetQuantityToDeposit;
  }

  res.status(200).json({
    assets: currentAssets,
    assetQuantities: assetToBeDepositedBasedOnWeights
  });
})

module.exports = router;
