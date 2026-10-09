const { subtask } = require('hardhat/config');
const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } = require('hardhat/builtin-tasks/task-names');

// Pinned local compiler: reproducible builds without downloading binaries.
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD).setAction(async ({ solcVersion }, _, runSuper) => {
    if (solcVersion !== '0.8.28') return runSuper();
    return { compilerPath: require.resolve('solc/soljson.js'), isSolcJs: true, version: solcVersion, longVersion: require('solc').version() };
});
module.exports = {
    solidity: { version: '0.8.28', settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'paris' } },
    networks: { hardhat: { chainId: 31337 } },
    paths: { sources: './contracts', tests: './test', cache: './cache', artifacts: './artifacts' },
};
