import { Address, parseUnits } from 'viem';
import { createViemPublicClient } from '../utils/createViemPublicClient';
import { createViemWalletClient } from '../utils/createViemWalletClient';
import { ToolConfig } from './allTools.js';
import { KodiakSwapRouter02ABI, KodiakUniswapV2Router02ABI} from '../constants/kodiakABI';
import { TokenABI } from "../constants/tokenABI";
import { CONTRACT, TOKEN } from "../constants";

// TODO: In the futures, we should detect tokenIn by token name or symbol. So that user can easy to use
interface KodiakSwapArgs {
    amountIn: number;
    amountOutMin: number;
    tokenIn?: Address; // Optional input token, defaults to ETH if null or undefined
    tokenOut: Address; // Output token address
    to?: Address; // Optional recipient address
}

export const kodiakSwapTool: ToolConfig<KodiakSwapArgs> = {
    definition: {
        type: 'function',
        function: {
            name: 'kodiak_swap',
            description: 'Perform a token swap on Kodiak',
            parameters: {
                type: 'object',
                properties: {
                    amountIn: {
                        type: 'number',
                        description: 'The amount of input tokens to swap',
                    },
                    amountOutMin: {
                        type: 'number',
                        description: 'The minimum amount of output tokens expected',
                    },
                    tokenIn: {
                        type: ['string'],
                        pattern: '^0x[a-fA-F0-9]{40}$',
                        description: 'Address of the input token (optional, defaults to ETH if null)',
                    },
                    tokenOut: {
                        type: 'string',
                        pattern: '^0x[a-fA-F0-9]{40}$',
                        description: 'Address of the output token',
                    },
                    to: {
                        type: 'string',
                        pattern: '^0x[a-fA-F0-9]{40}$',
                        description: 'The optional recipient\'s public address for the output tokens',
                    },
                },
                required: ['amountIn', 'amountOutMin', 'tokenOut'],
            },
        },
    },
    handler: async (args) => {
        try {
            const walletClient = createViemWalletClient();
            const publicClient = createViemPublicClient();

            const recipient = args.to || walletClient.account.address;
            const isNativeSwap = !args.tokenIn;

            console.log(`[INFO] Initiating Kodiak swap: ${args.amountIn} ${isNativeSwap ? 'BERA' : args.tokenIn} for ${args.tokenOut} to ${recipient}`);

            const deadline = Math.floor(Date.now() / 1000) + 1200;

            let tx;
            if (isNativeSwap) {
                const parsedAmountOutMin = parseUnits(args.amountOutMin.toString(), 18);
                tx = await walletClient.writeContract({
                    address: CONTRACT.KodiakUniswapV2Router02,
                    abi: KodiakUniswapV2Router02ABI,
                    functionName: 'swapExactETHForTokens',
                    args: [parsedAmountOutMin, [TOKEN.WBERA, args.tokenOut], recipient, BigInt(deadline)],
                    value: parseUnits(args.amountIn.toString(), 18),
                });
            } else {
                const inputTokenDecimals = await publicClient.readContract({
                    address: args.tokenIn!,
                    abi: TokenABI,
                    functionName: 'decimals',
                    args: [],
                });

                const parsedAmountIn = parseUnits(args.amountIn.toString(), Number(inputTokenDecimals));
                const parsedAmountOutMin = parseUnits(args.amountOutMin.toString(), Number(inputTokenDecimals));

                const approvalTx = await walletClient.writeContract({
                    address: args.tokenIn!,
                    abi: TokenABI,
                    functionName: 'approve',
                    args: [CONTRACT.KodiakSwapRouter02, parsedAmountIn],
                });

                const approvalReceipt = await walletClient.waitForTransactionReceipt({
                    hash: approvalTx as `0x${string}`,
                });

                if (approvalReceipt.status !== 'success') {
                    throw new Error('Approval transaction failed');
                }

                tx = await walletClient.writeContract({
                    address: CONTRACT.KodiakSwapRouter02,
                    abi: KodiakSwapRouter02ABI,
                    functionName: 'swapExactTokensForTokens',
                    args: [
                        parsedAmountIn,
                        parsedAmountOutMin,
                        [args.tokenIn!, args.tokenOut] as const,
                        recipient
                    ],
                });
            }

            const receipt = await walletClient.waitForTransactionReceipt({
                hash: tx as `0x${string}`,
            });

            if (receipt.status !== 'success') {
                throw new Error(`Swap transaction failed with status: ${receipt.status}`);
            }

            console.log(`[INFO] Kodiak swap successful: Transaction hash: ${tx}`);
            return tx;
        } catch (error: any) {
            console.error(`[ERROR] Kodiak swap failed: ${error.message}`);
            throw new Error(`Swap failed: ${error.message}`);
        }
    },
};