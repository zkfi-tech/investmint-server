const app = require('../../app.js');
const request = require('supertest');
const { connectDB, closeDB } = require('../../utils/dbConfig.js');
const vinterIndexAssetUniverse = require('../fixtures/vinterIndexAssetUniverse.json');
const depositADAFireblocksObj = require('../fixtures/depositADAFireblocksObj.json');
const depositBTCFireblocksObj = require('../fixtures/depositBTCFireblocksObj.json');
const depositETHFireblocksObj = require('../fixtures/depositETHFireblocksObj.json');
const depositXRPFireblocksObj = require('../fixtures/depositXRPFireblocksObj.json');
const depositBNBFireblocksObj = require('../fixtures/depositBNBFireblocksObj.json');

beforeAll(async () => {
    await connectDB();
}, 50000);

afterAll(async () => {
    await closeDB();
});

test('test transfer events webhook call for each asset', async () => {

    // calling the /fireblocksWebhook/ api for each asset to mock asset deposits on fireblocks
    for (let a = 0; a < vinterIndexAssetUniverse.length; a++) {
        let asset = vinterIndexAssetUniverse[a];
        let assetTicker = asset.ticker;
        let depositObj = eval(`deposit${assetTicker}FireblocksObj`);

        console.log("sending deposit event for asset: ", assetTicker);
        // calling the custodianEvents webhook
        const fireblocksWebhookCallRes = await request(app)
            .post('/fireblocksWebhook/')
            .send(depositObj)
            .set('Accept', 'application/json')
            .set('Content-Type', 'application/json')
            .set('fireblocks-signature', 'VeZAQrpAHjmSItG8Ymn9xhIN335O6tQU0n9H5nQVNPexAqeDJpQMPu6uxfSSMRIMAoJx4UjTDTrPguqTHiXFe5jQEf8l3rDkchhwhXVqn8BeXUo05dpaI4VlCJIzIuwmaw0xsXjZBzcL/NmCFWQ4thkoiTNhS5Ng5XRfI36Q2gKbk0foacB5o/WLRRSi/QjJ/7P8WHAhQyHax4KImYTh+e396FQakh7NJZy5djXuNjpMh4Pv6NglhJtw/w5yYSqQyY+NqzL3WUykQQ4viTJhzmj98yVwTC2S/mjXhXlwq7o+nN3r72NEN+Cvd1QDdim4OmrNpvpAWMIyua3eKXFVgA==')
            .set('Fireblocks-Api-Version', '1.4.0');

        expect(fireblocksWebhookCallRes.statusCode).toBe(200);
    }
}, 200000);