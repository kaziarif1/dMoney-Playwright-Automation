const crypto = require('node:crypto');

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Set ${name} to run the dMoney regression scenario.`);
  return value;
}

function makeAgentData() {
  const inbox = required('DMONEY_TEST_GMAIL').toLowerCase();
  if (!/^[^@\s]+@gmail\.com$/.test(inbox)) {
    throw new Error('DMONEY_TEST_GMAIL must be a Gmail inbox you can access for OTP.');
  }
  const [local, domain] = inbox.split('@');
  const unique = `${Date.now()}${crypto.randomInt(100, 999)}`;
  return {
    name: `Batch 19 Agent ${unique}`,
    email: `${local}+b19${unique}@${domain}`,
    password: process.env.DMONEY_AGENT_PASSWORD || `Agent!${crypto.randomBytes(5).toString('hex')}9`,
    phone: `01${String(Date.now()).slice(-9)}`,
    nid: String(1000000 + crypto.randomInt(0, 8999999)),
  };
}

module.exports = { makeAgentData, required };
