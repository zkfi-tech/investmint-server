const app = require('../../app');
const request = require('supertest');
const { connectDB, getDB, closeDB } = require('../../utils/dbConfig');

describe("Testing vault routes", () => {
    var db;

    beforeAll(async () => {
        await connectDB();
        db = getDB();
    }, 20000);

    afterAll(async () => {
        let deleteFilter = {
            "marketMaker": "0x689EcF264657302052c3dfBD631e4c20d3ED0baC"
        }
        await db.collection(`vaults`).deleteOne(deleteFilter);
        await closeDB();
    });

    test('test vault and asset wallet creation', async () => {
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
                    "withdrawalAddress": "dummy-withdraw-address-4"
                },
                {
                    "asset": "xrp-usd-p-h",
                    "withdrawalAddress": "dummy-withdraw-address-5"
                }
            ]
        }
        const mmAddressParam = "0x689EcF264657302052c3dfBD631e4c20d3ED0baC";

        const vaultCreationRes = await request(app)
            .post(`/intermediateVault/create/${mmAddressParam}`)
            .send(assetWithdrawAddressObj)
            .set('Accept', 'application/json')
            .set('Content-Type', 'application/json');

        expect(vaultCreationRes.statusCode).toBe(200);
        const assetWallets = vaultCreationRes.body.vaultAssets;

        for (let a = 0; a < assetWallets.length; a++) {
            expect(assetWallets[a].vaultAssetDepositAddress).not.toBe(0x0000000000000000000000000000000000000000);
        }

        const vault = await request(app).get(`/intermediateVault/getVault/${mmAddressParam}`);
        expect(vault.statusCode).toBe(200);
    }, 50000);

    test('is vault created', async () => {
        const vaultRes = await request(app).get('/intermediateVault/isVaultCreated/0x689EcF264657302052c3dfBD631e4c20d3ED0baC');
        expect(vaultRes.statusCode).toBe(200);
        expect(vaultRes.body).toBe(false);
    });
});
