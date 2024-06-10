const app = require('../../app.js');
const { calculateAssetWts, withdrawAssetsForMM } = require('../../utils/withdrawalVault');
const { connectDB, getDB, closeDB } = require('../../utils/dbConfig');
const request = require('supertest');
const BigNumber = require('bignumber.js');
const mockVault = require('../fixtures/mockVaultObj.json'); // @dev The mockVault object `vaultAssetDepositAddress` should match `destinationAddress` property of fireblocks deposit object in fixtures
const mockVinterIndexObj = require('../fixtures/mockVinterIndexObj.json');
const depositETHFireblocksObj = require('../fixtures/depositETHFireblocksObj.json');
const { Web3 } = require('web3');
require('dotenv').config();
// jest.mock('axios');

describe('withdraw flow', () => {
    const mmAddress = process.env.ANVIL_PUBLIC_KEY;
    let redeemDFTQuantity = 0.001;

    beforeAll(async () => {
        await connectDB();
        const db = getDB();

        const ethAssetIndexInMockVinterIndexObj = mockVinterIndexObj.currentAssets.findIndex(asset => asset === "eth-usd-p-h");

        console.log(`ETH asset index in mock Vinter Index object: ${ethAssetIndexInMockVinterIndexObj}`);

        // add timeout `beforeAll` to avoid jest open handle error
        await db.collection('cryptoIndexes').insertOne(mockVinterIndexObj); // inserting the mock Vinter Index object
        // await db.collection('vaults').insertOne(mockVault); // inserting the mock vault object

        // creating a vault for the Market Maker
        let assetWithdrawAddressObj = {
            "withdrawalAddressesForAssets": [
                {
                    "asset": "ada-usd-p-h",
                    "withdrawalAddress": "dummy-withdraw-address-1"
                },
                {
                    "asset": "bnb-usd-p-h",
                    "withdrawalAddress": "dummy-withdraw-address-2"
                },
                {
                    "asset": "btc-usd-p-h",
                    "withdrawalAddress": "dummy-withdraw-address-3"
                },
                {
                    "asset": "eth-usd-p-h",
                    "withdrawalAddress": process.env.BASE_EOA_ADDRESS // will deposit ETH to test withdraw
                },
                {
                    "asset": "xrp-usd-p-h",
                    "withdrawalAddress": "dummy-withdraw-address-5"
                }
            ]
        }

        const fireblockVaultObj = await request(app)
            .post(`/intermediateVault/create/${mmAddress}`)
            .send(assetWithdrawAddressObj)
            .set('Accept', 'application/json')
            .set('Content-Type', 'application/json');

        const fireblocksEthDepositAddress = fireblockVaultObj.body.vaultAssets[ethAssetIndexInMockVinterIndexObj].vaultAssetDepositAddress; // the index 3 is for ETH. This corresponds to the index obj in `cryptoIndexes` collection. The same obj is used by `/intermediateVault/create` route to create the vault.

        console.log(`ETH vault deposit address: ${fireblocksEthDepositAddress}`);

        // deposit ETH to the Market Maker vault ETH wallet

        // Create a new web3 instance
        const web3 = new Web3(process.env.BASE_RPC_URL);

        let ethToDepositBasedOnDFT = mockVinterIndexObj.currentWeights[ethAssetIndexInMockVinterIndexObj] * redeemDFTQuantity;
        // Specify the destination address and the amount to transfer
        const amount = web3.utils.toWei(ethToDepositBasedOnDFT, 'ether');

        // EIP-1559 parameters
        let baseFee = await web3.eth.getBlock('latest').then(block => block.baseFeePerGas);
        baseFee = web3.utils.toHex(BigNumber(baseFee).plus(10)); // adding 10 gwei to the base fee

        // Create the transaction object
        const transactionObject = {
            from: process.env.BASE_EOA_ADDRESS,
            to: fireblocksEthDepositAddress,
            value: amount,
            maxPriorityFeePerGas: baseFee,
            maxFeePerGas: baseFee,
        };

        // Estimate the gas required for the transaction
        let gas = await web3.eth.estimateGas(transactionObject);
        transactionObject.gas = web3.utils.toHex(gas);

        // Sign the transaction with the private key
        const signedTransaction = await web3.eth.accounts.signTransaction(
            transactionObject,
            process.env.BASE_EOA_PRIVATE_KEY
        );

        // Send the signed transaction
        const transactionReceipt = await web3.eth.sendSignedTransaction(
            signedTransaction.rawTransaction
        );

        console.log('ETH Deposit to vault transaction successful:', transactionReceipt.transactionHash);

        await new Promise(resolve => setTimeout(resolve, 10000)); // 10 sec wait for fireblock system to propogate the deposit
    }, 200000);

    afterAll(async () => {
        const db = getDB();
        await db.collection('cryptoIndexes').deleteOne({
            "symbol": mockVinterIndexObj.symbol
        });

        await db.collection('vaults').deleteOne({
            "marketMaker": mmAddress
        });

        // TODO: clean up Fireblocks vault as well
    }, 50000);

    it('calculates asset weights based on the total DFT supply', async () => {
        const noOfDFTs = 1000;
        const assetThresholds = await calculateAssetWts(noOfDFTs);
        expect(assetThresholds).toEqual([
            {
                assetIdOnFireblock: 'ADA_TEST',
                assetQuantity: new BigNumber("188.7094862")
            },
            {
                assetIdOnFireblock: 'BNB_TEST',
                assetQuantity: new BigNumber("198.0078237")
            },
            {
                assetIdOnFireblock: 'BTC_TEST',
                assetQuantity: new BigNumber("230.2474888")
            },
            {
                assetIdOnFireblock: 'BASECHAIN_ETH_TEST5',
                assetQuantity: new BigNumber("205.8637818")
            },
            {
                assetIdOnFireblock: 'XRP_TEST',
                assetQuantity: new BigNumber("177.1714194")
            }
        ]);
    });

    it('tests withdrawal of assets from mm vault to respective withdrawal address', async () => {
        // Assuming your function is called `fetchVaultAssets`
        let withdrawTrxns = await withdrawAssetsForMM(mmAddress, redeemDFTQuantity);

        // Assertions
        expect(withdrawTrxns.length).toEqual(1);
        expect(withdrawTrxns[0].status).toEqual('SUBMITTED');
    }, 50000);
});


