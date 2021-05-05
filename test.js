const db = require('./src/db');

async function test() {
    let bitrixUserId = await db.getBitrixIdByExten('170');
    console.log(bitrixUserId);
}
test();