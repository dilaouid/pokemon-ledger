const { createPublicClient, http, getAddress, parseAbi } = require('viem');
const { sepolia } = require('viem/chains');

async function main() {
    const client = createPublicClient({ chain: sepolia, transport: http(process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com', { timeout: 15000, retryCount: 0 }) });
    if (await client.getChainId() !== 11155111) throw new Error('Wrong network');
    const abi = parseAbi(['function GAME_VERSION() view returns (bytes32)', 'function name() view returns (string)', 'function owner() view returns (address)']);
    for (const value of process.argv.slice(2)) {
        const address = getAddress(value);
        const code = await client.getCode({ address });
        const result = { address, codeBytes: code ? (code.length - 2) / 2 : 0 };
        if (code && code !== '0x') {
            for (const functionName of ['GAME_VERSION', 'name', 'owner']) {
                try { result[functionName] = await client.readContract({ address, abi, functionName }); }
                catch { result[functionName] = 'not exposed'; }
            }
        }
        console.log(JSON.stringify(result));
    }
}
main().catch(error => { console.error('Sepolia inspection failed:', error.name); process.exitCode = 1; });
