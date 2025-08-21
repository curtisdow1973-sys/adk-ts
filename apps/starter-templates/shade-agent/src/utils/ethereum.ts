import { chainAdapters, contracts } from "chainsig.js";
import { http, createPublicClient } from "viem";

export const ethRpcUrl = "https://sepolia.drpc.org";
export const ethContractAddress = "0xcFB4BF3943A3e1c778278093c5b34B5e573e4803";

export const ethContractAbi = [
	{
		inputs: [],
		name: "getMarketData",
		outputs: [
			{ internalType: "uint256", name: "price", type: "uint256" },
			{ internalType: "string", name: "sentiment", type: "string" },
			{ internalType: "uint256", name: "timestamp", type: "uint256" },
		],
		stateMutability: "view",
		type: "function",
	},
	{
		inputs: [],
		name: "latestData",
		outputs: [
			{ internalType: "uint256", name: "price", type: "uint256" },
			{ internalType: "string", name: "sentiment", type: "string" },
			{ internalType: "uint256", name: "timestamp", type: "uint256" },
		],
		stateMutability: "view",
		type: "function",
	},
	{
		inputs: [
			{ internalType: "uint256", name: "_price", type: "uint256" },
			{ internalType: "string", name: "_sentiment", type: "string" },
		],
		name: "updateMarketData",
		outputs: [],
		stateMutability: "nonpayable",
		type: "function",
	},
] as const;

// Set up a chain signature contract instance
const MPC_CONTRACT = new contracts.ChainSignatureContract({
	networkId: "testnet",
	contractId: "v1.signer-prod.testnet",
});

// Set up a public client for the Ethereum network
const publicClient = createPublicClient({
	transport: http(ethRpcUrl),
});

// Set up a chain signatures chain adapter for the Ethereum network
export const Evm = new chainAdapters.evm.EVM({
	publicClient,
	contract: MPC_CONTRACT,
}) as any;
