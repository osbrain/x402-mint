import { ethers } from "ethers";

export const TRANSFER_WITH_AUTHORIZATION_TYPES: Record<
  string,
  { name: string; type: string }[]
> = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
};

export function erc20Iface() {
  return new ethers.Interface([
    "function decimals() view returns (uint8)",
    "function balanceOf(address) view returns (uint256)",
    "function transfer(address,uint256) returns (bool)",
    "event Transfer(address indexed from, address indexed to, uint256 value)",
  ]);
}

export function usdcEip3009Interface() {
  return new ethers.Interface([
    "function authorizationState(address authorizer, bytes32 nonce) view returns (bool)",
    "function transferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce,uint8 v,bytes32 r,bytes32 s)",
    "event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce)",
  ]);
}
