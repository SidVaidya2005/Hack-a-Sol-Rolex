// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

/// @notice Key registry, encrypted-record anchors, time-bound grants, and break-glass.
/// @dev Stores only hashes, CIDs, public keys, and expiries. Never pass medical data here.
contract RecordAccess {
    struct Keys {
        uint256 eddsaAx;
        uint256 eddsaAy;
        bytes32 x25519PublicKey;
        bool registered;
    }

    struct Record {
        address patient;
        bytes32 bundleHash;
        string cid;
        uint64 keyVersion;
    }

    event KeysRegistered(address indexed wallet, uint256 eddsaAx, uint256 eddsaAy, bytes32 x25519PublicKey);
    event RecordAnchored(bytes32 indexed recordId, address indexed patient, bytes32 bundleHash, string cid);
    event AccessGranted(
        bytes32 indexed recordId,
        address indexed patient,
        address indexed reader,
        uint64 expiresAt,
        bytes32 bundleHash,
        string cid
    );
    event AccessRevoked(bytes32 indexed recordId, address indexed patient, address indexed reader);
    event RecordKeyRotated(bytes32 indexed recordId, address indexed patient, bytes32 bundleHash, string cid);
    event RecordViewed(bytes32 indexed recordId, address indexed patient, address indexed reader);
    event BreakGlassInvoked(bytes32 indexed recordId, address indexed patient, address indexed responder);
    event ResponderUpdated(address indexed responder, bool allowed);

    error KeysNotRegistered(address wallet);
    error RecordAlreadyExists(bytes32 recordId);
    error UnknownRecord(bytes32 recordId);
    error NotRecordPatient(bytes32 recordId, address caller);
    error InvalidExpiry(uint64 expiresAt);
    error AccessNotActive(bytes32 recordId, address reader);
    error NotResponder(address caller);
    error NotInsurer(address caller);

    address private immutable _insurer;

    mapping(address wallet => Keys) private _keys;
    mapping(bytes32 recordId => Record) private _records;
    mapping(bytes32 recordId => mapping(address reader => uint64)) private _expiry;
    mapping(address responder => bool) private _responders;

    constructor(address insurer_) {
        if (insurer_ == address(0)) revert NotInsurer(insurer_);
        _insurer = insurer_;
    }

    function registerKeys(uint256 eddsaAx, uint256 eddsaAy, bytes32 x25519PublicKey) external {
        _keys[msg.sender] = Keys(eddsaAx, eddsaAy, x25519PublicKey, true);
        emit KeysRegistered(msg.sender, eddsaAx, eddsaAy, x25519PublicKey);
    }

    function anchorRecord(bytes32 recordId, bytes32 bundleHash, string calldata cid) external {
        _requireKeys(msg.sender);
        if (_records[recordId].patient != address(0)) revert RecordAlreadyExists(recordId);
        _records[recordId] = Record(msg.sender, bundleHash, cid, 1);
        emit RecordAnchored(recordId, msg.sender, bundleHash, cid);
    }

    /// @dev A grant adds a wrapped key, so the bundle hash and CID change with it (D-031).
    function grantAccess(
        bytes32 recordId,
        address reader,
        uint64 expiresAt,
        bytes32 newBundleHash,
        string calldata newCid
    ) external {
        Record storage record = _patientRecord(recordId);
        _requireKeys(reader);
        if (expiresAt <= block.timestamp) revert InvalidExpiry(expiresAt);

        _expiry[recordId][reader] = expiresAt;
        record.bundleHash = newBundleHash;
        record.cid = newCid;
        emit AccessGranted(recordId, msg.sender, reader, expiresAt, newBundleHash, newCid);
    }

    /// @dev An expired grant can still be revoked, because that reader may hold the old key (D-031).
    function revokeAndRotate(
        bytes32 recordId,
        address reader,
        bytes32 newBundleHash,
        string calldata newCid
    ) external {
        Record storage record = _patientRecord(recordId);
        if (_expiry[recordId][reader] == 0) revert AccessNotActive(recordId, reader);

        delete _expiry[recordId][reader];
        record.bundleHash = newBundleHash;
        record.cid = newCid;
        record.keyVersion += 1;
        emit AccessRevoked(recordId, msg.sender, reader);
        emit RecordKeyRotated(recordId, msg.sender, newBundleHash, newCid);
    }

    function logView(bytes32 recordId) external {
        address patient = _records[recordId].patient;
        if (patient == address(0)) revert UnknownRecord(recordId);
        if (!hasAccess(recordId, msg.sender)) revert AccessNotActive(recordId, msg.sender);
        emit RecordViewed(recordId, patient, msg.sender);
    }

    function setResponder(address responder, bool allowed) external {
        if (msg.sender != _insurer) revert NotInsurer(msg.sender);
        _responders[responder] = allowed;
        emit ResponderUpdated(responder, allowed);
    }

    function invokeBreakGlass(address patient, bytes32 recordId) external {
        if (!_responders[msg.sender]) revert NotResponder(msg.sender);
        _requireKeys(msg.sender);
        address recordPatient = _records[recordId].patient;
        if (recordPatient == address(0)) revert UnknownRecord(recordId);
        if (recordPatient != patient) revert NotRecordPatient(recordId, patient);
        emit BreakGlassInvoked(recordId, patient, msg.sender);
    }

    function keysOf(
        address wallet
    ) external view returns (uint256 eddsaAx, uint256 eddsaAy, bytes32 x25519PublicKey, bool registered) {
        Keys storage keys = _keys[wallet];
        return (keys.eddsaAx, keys.eddsaAy, keys.x25519PublicKey, keys.registered);
    }

    function recordOf(
        bytes32 recordId
    ) external view returns (address patient, bytes32 bundleHash, string memory cid, uint64 keyVersion) {
        Record storage record = _records[recordId];
        return (record.patient, record.bundleHash, record.cid, record.keyVersion);
    }

    function accessExpiry(bytes32 recordId, address reader) external view returns (uint64) {
        return _expiry[recordId][reader];
    }

    function hasAccess(bytes32 recordId, address reader) public view returns (bool) {
        address patient = _records[recordId].patient;
        if (patient == address(0)) return false;
        return reader == patient || _expiry[recordId][reader] > block.timestamp;
    }

    function isResponder(address responder) external view returns (bool) {
        return _responders[responder];
    }

    function _patientRecord(bytes32 recordId) private view returns (Record storage record) {
        record = _records[recordId];
        if (record.patient == address(0)) revert UnknownRecord(recordId);
        if (record.patient != msg.sender) revert NotRecordPatient(recordId, msg.sender);
    }

    function _requireKeys(address wallet) private view {
        if (!_keys[wallet].registered) revert KeysNotRegistered(wallet);
    }
}
