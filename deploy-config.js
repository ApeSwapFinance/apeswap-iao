
function getNetworkConfig(network, accounts) {
    if(["bsc", "bsc-fork"].includes(network)) {
        console.log(`Deploying with BSC MAINNET config.`)
        return {
            adminAddress: '0x50Cf6cdE8f63316b2BD6AACd0F5581aEf5dD235D', // BSC GSafe General Admin
            proxyAdminAddress: '0xA75125CF0A7be136D6745B39DB1FeBadE269ba4D', // BSC GSafe General Proxy Admin
            // adminAddress: '0x6c905b4108A87499CEd1E0498721F2B831c6Ab13', // (Deprecated) General Admin
            // proxyAdminAddress: '0xf81A0Ee9BB9606e375aeff30364FfA17Bb8a7FD1', // (Deprecated) Proxy Admin
            rpcProvider: 'https://bsc-dataseed.binance.org',
        }
    } else if (['bsc-testnet', 'bsc-testnet-fork'].includes(network)) {
        console.log(`Deploying with BSC testnet config.`)
        return {
            adminAddress: '0xE375D169F8f7bC18a544a6e5e546e63AD7511581',
            proxyAdminAddress: '0x56Cb8F9199A8F43933cAE300Ef548dfA4ADE7Da0',
            rpcProvider: 'https://data-seed-prebsc-2-s1.binance.org:8545', 
        }
    } else if (['development'].includes(network)) {
        console.log(`Deploying with development config.`)
        return {
            adminAddress: accounts[0],
            proxyAdminAddress: accounts[1],
            rpcProvider: 'http://127.0.0.1:8545',
        }
    } else {
        throw new Error(`No config found for network ${network}.`)
    }
}

module.exports = { getNetworkConfig };
