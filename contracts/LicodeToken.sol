// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * LICODE — ERC20 with capped distributor-based distributions.
 *
 * Design choices:
 * - Entire supply is minted to this contract at deploy.
 * - A trusted `distributor` (your backend signer) can call `distribute()`
 *   to move tokens from the contract to users AFTER it has verified a valid USDC payment.
 * - We track an aggregate USDC cap and a per-wallet USDC cap (both in 6 decimals).
 * - Rate is `tokensPerUsdc` (18-dec tokens per 1e6 USDC units).
 */
contract LicodeToken is ERC20, Ownable {
    address public distributor;              // backend signer EOA

    uint256 public immutable tokensPerUsdc;  // e.g. 5000e18 tokens per 1 USDC(1e6)
    uint256 public immutable totalUsdcCap;   // e.g. 100_000e6 (in USDC 6-dec units)
    uint256 public immutable perWalletUsdcCap; // e.g. 10e6 (6-dec)

    uint256 public usdcCounted; // total USDC accounted in distributions (6-dec)
    mapping(address => uint256) public usdcByWallet; // (6-dec)

    event Distributed(address indexed to, uint256 usdcAmount6, uint256 tokenAmount);
    event DistributorChanged(address indexed newDistributor);

    constructor(
        string memory _name,
        string memory _symbol,
        uint256 _totalSupply,          // in 18 decimals
        address _owner,
        address _distributor,
        uint256 _tokensPerUsdc,        // tokens per 1 USDC, in 18 decimals (e.g., 5000e18)
        uint256 _totalUsdcCap,         // in 6 decimals (e.g., 100_000e6)
        uint256 _perWalletUsdcCap      // in 6 decimals (e.g., 10e6)
    ) ERC20(_name, _symbol) Ownable(_owner) {
        require(_owner != address(0), "owner=0");
        require(_distributor != address(0), "distributor=0");
        require(_tokensPerUsdc > 0, "rate=0");
        require(_totalUsdcCap > 0, "cap=0");
        require(_perWalletUsdcCap > 0, "walletCap=0");

        distributor = _distributor;
        tokensPerUsdc = _tokensPerUsdc;
        totalUsdcCap = _totalUsdcCap;
        perWalletUsdcCap = _perWalletUsdcCap;

        _mint(address(this), _totalSupply); // hold all supply in the contract
    }

    modifier onlyDistributor() {
        require(msg.sender == distributor, "not distributor");
        _;
    }

    function setDistributor(address _d) external onlyOwner {
        require(_d != address(0), "0");
        distributor = _d;
        emit DistributorChanged(_d);
    }

    /**
     * @notice Move tokens from contract to `to` based on `usdcAmount6` (6-dec).
     *         Enforces total cap & per-wallet cap. One call can represent 1 USDC or more.
     */
    function distribute(address to, uint256 usdcAmount6) external onlyDistributor {
        require(to != address(0), "to=0");
        require(usdcAmount6 > 0, "amt=0");

        // enforce caps
        require(usdcCounted + usdcAmount6 <= totalUsdcCap, "total cap reached");
        require(usdcByWallet[to] + usdcAmount6 <= perWalletUsdcCap, "wallet cap reached");

        // compute token amount: tokens = (usdcAmount6 * tokensPerUsdc) / 1e6
        uint256 tokenAmount = (usdcAmount6 * tokensPerUsdc) / 1e6;

        usdcCounted += usdcAmount6;
        usdcByWallet[to] += usdcAmount6;

        _transfer(address(this), to, tokenAmount);
        emit Distributed(to, usdcAmount6, tokenAmount);
    }

    /** Owner can withdraw leftover tokens (e.g., for LP or liquidity) */
    function ownerWithdraw(address to, uint256 amount) external onlyOwner {
        _transfer(address(this), to, amount);
    }
}
