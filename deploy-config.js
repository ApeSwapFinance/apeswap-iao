
function getNetworkConfig(network, accounts) {
    if(["bsc", "bsc-fork"].includes(network)) {
        console.log(`Deploying with BSC MAINNET config.`)
        return {
            adminAddress: '0x6c905b4108A87499CEd1E0498721F2B831c6Ab13', // General Admin
            proxyAdminAddress: '0xf81A0Ee9BB9606e375aeff30364FfA17Bb8a7FD1', // Proxy Admin
        }
    } else if (['testnet', 'testnet-fork'].includes(network)) {
        console.log(`Deploying with BSC testnet config.`)
        return {
            adminAddress: '0xE375D169F8f7bC18a544a6e5e546e63AD7511581',
            proxyAdminAddress: '0x56Cb8F9199A8F43933cAE300Ef548dfA4ADE7Da0',
        }
    } else if (['development'].includes(network)) {
        console.log(`Deploying with development config.`)
        return {
            adminAddress: '0xC9F40d1c8a84b8AeD12A241e7b99682Fb7A3FE84',
            proxyAdminAddress: '0xC9F40d1c8a84b8AeD12A241e7b99682Fb7A3FE84',
        }
    } else {
        throw new Error(`No config found for network ${network}.`)
    }
}

module.exports = { getNetworkConfig };
