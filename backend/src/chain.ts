import { ethers } from "ethers";

export function erc20Iface() {
  return new ethers.Interface([
    "function decimals() view returns (uint8)",
    "function balanceOf(address) view returns (uint256)",
    "function transfer(address,uint256) returns (bool)",
    "event Transfer(address indexed from, address indexed to, uint256 value)"
  ]);
}
