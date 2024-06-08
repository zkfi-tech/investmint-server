const app = require('../../app');
const request = require('supertest');
const { connectDB, getDB, closeDB } = require('../../utils/dbConfig');
const { BigNumber } = require('bignumber.js');

describe("Testing routes", () => {
    const investmentAmountInDollars = 500;
    var db;

    beforeAll(async () => {
        await connectDB();
        db = getDB();
    }, 20000);

    afterAll(async () => {
        await closeDB(); // since importing app.js which opens connections to the DB
    })

    test('Root-route-should-sent-200-status-code', async () => {
        const response = await request(app).get("/");
        expect(response.statusCode).toBe(200);
    });

    test('/getAssetCompositionAndWeights returns status code 200', async () => {
        const response = await request(app).get(`/getAssetCompositionAndWeights?investmentAmount=${investmentAmountInDollars}`);
        expect(response.statusCode).toBe(200);
    });

    test('wts-received-to-dollar-value', async () => {
        const precision = new BigNumber(1e18.toString());
        const response = await request(app).get(`/getAssetCompositionAndWeights?investmentAmount=${investmentAmountInDollars}`);

        // getting the weights and asset prices from DB
        const collection = await db.collection('cryptoIndexes');
        const filter = {
            symbol: process.env.VINTER_INDEX_SYMBOL
        }
        const option = {
            projection: {
                _id: 1,
                currentPrices: 1
            }
        }

        const vinterIndex = await collection.findOne(filter, option);
        const assetPrices = vinterIndex.currentPrices;
        console.log(`AssetPrices: ${assetPrices}`);
        const assetQuantitiesToDeposit = response.body.assetQuantities;
        console.log(`AssetQuantities Returned: ${assetQuantitiesToDeposit}`);
        const numberOfAssets = assetPrices.length;
        let totalDollarValueBeingDeposited = new BigNumber(0);

        for (let a = 0; a < numberOfAssets; a++) {

            let assetPrice = new BigNumber(assetPrices[a]);
            let quantity = new BigNumber(assetQuantitiesToDeposit[a]);
            let assetsValueInDollar = quantity.multipliedBy(assetPrice);

            totalDollarValueBeingDeposited = totalDollarValueBeingDeposited.plus(assetsValueInDollar);
            console.log(`Value being deposited: ${totalDollarValueBeingDeposited.decimalPlaces(2)}`);
        }

        const tolerance = new BigNumber("0.01");
        const investmentAmount = new BigNumber(investmentAmountInDollars.toString());
        const diff = totalDollarValueBeingDeposited.minus(investmentAmount).absoluteValue();
        expect(diff.lte(tolerance)).toBeTruthy();
    });
});