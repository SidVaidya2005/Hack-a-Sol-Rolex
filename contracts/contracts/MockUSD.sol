// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Demo-only 6-decimal stablecoin. It has no real-world value.
contract MockUSD is ERC20 {
    error NotInsurer(address caller);

    address private immutable _insurer;
    uint8 private _decimals = 6;

    constructor(address insurer_) ERC20("Mock USD", "mUSD") {
        if (insurer_ == address(0)) revert NotInsurer(insurer_);
        _insurer = insurer_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        if (msg.sender != _insurer) revert NotInsurer(msg.sender);
        _mint(to, amount);
    }
}
