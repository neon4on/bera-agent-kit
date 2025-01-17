import { getBalanceTool } from "./getBalance";
import {transferTool} from "./transfer";
import {kodiakSwapTool} from "./kodiakSwap";

export interface ToolConfig<T = any> {
    definition: {
        type: 'function';
        function: {
            name: string;
            description: string;
            parameters: {
                type: 'object';
                properties: Record<string, unknown>;
                required: string[];
            };
        };
    };
    handler: (args: T) => Promise<any>;
}

export const tools: Record<string, ToolConfig> = {
    // add more tools here
    get_balance: getBalanceTool,
    transfer: transferTool,
    kodiak_swap: kodiakSwapTool,
};