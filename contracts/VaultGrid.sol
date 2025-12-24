// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, eaddress, externalEaddress} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title VaultGrid confidential document registry
/// @notice Stores encrypted document keys and encrypted document bodies on-chain.
contract VaultGrid is ZamaEthereumConfig {
    struct Document {
        string name;
        string encryptedBody;
        eaddress encryptedKey;
        address owner;
        uint256 createdAt;
        uint256 updatedAt;
    }

    uint256 private _documentCount;
    mapping(uint256 => Document) private _documents;
    mapping(uint256 => mapping(address => bool)) private _editors;

    event DocumentCreated(uint256 indexed documentId, address indexed owner, string name);
    event DocumentUpdated(uint256 indexed documentId, address indexed editor);
    event AccessGranted(uint256 indexed documentId, address indexed user);

    error DocumentNotFound(uint256 documentId);
    error NotAuthorized(address caller);
    error InvalidAddress();

    /// @notice Returns the total number of documents.
    function documentCount() external view returns (uint256) {
        return _documentCount;
    }

    /// @notice Returns document data by id.
    function getDocument(
        uint256 documentId
    )
        external
        view
        returns (
            string memory name,
            string memory encryptedBody,
            eaddress encryptedKey,
            address owner,
            uint256 createdAt,
            uint256 updatedAt
        )
    {
        Document storage doc = _getDocument(documentId);
        return (doc.name, doc.encryptedBody, doc.encryptedKey, doc.owner, doc.createdAt, doc.updatedAt);
    }

    /// @notice Returns whether an address can edit a document.
    function isEditor(uint256 documentId, address user) external view returns (bool) {
        _getDocument(documentId);
        return _editors[documentId][user];
    }

    /// @notice Creates a document with an encrypted key and empty body.
    /// @param name Document name
    /// @param encryptedKey Encrypted address key
    /// @param inputProof Proof for the encrypted input
    function createDocument(
        string calldata name,
        externalEaddress encryptedKey,
        bytes calldata inputProof
    ) external returns (uint256 documentId) {
        documentId = ++_documentCount;
        eaddress key = FHE.fromExternal(encryptedKey, inputProof);

        _documents[documentId] = Document({
            name: name,
            encryptedBody: "",
            encryptedKey: key,
            owner: msg.sender,
            createdAt: block.timestamp,
            updatedAt: block.timestamp
        });
        _editors[documentId][msg.sender] = true;

        FHE.allowThis(key);
        FHE.allow(key, msg.sender);

        emit DocumentCreated(documentId, msg.sender, name);
    }

    /// @notice Updates the encrypted document body.
    /// @param documentId Document id
    /// @param encryptedBody Encrypted document body
    function updateDocument(uint256 documentId, string calldata encryptedBody) external {
        Document storage doc = _getDocument(documentId);
        if (!_editors[documentId][msg.sender]) {
            revert NotAuthorized(msg.sender);
        }

        doc.encryptedBody = encryptedBody;
        doc.updatedAt = block.timestamp;

        emit DocumentUpdated(documentId, msg.sender);
    }

    /// @notice Grants another user access to decrypt the document key and edit the document.
    /// @param documentId Document id
    /// @param user Address to grant access
    function grantAccess(uint256 documentId, address user) external {
        if (user == address(0)) {
            revert InvalidAddress();
        }

        Document storage doc = _getDocument(documentId);
        if (msg.sender != doc.owner) {
            revert NotAuthorized(msg.sender);
        }

        _editors[documentId][user] = true;
        FHE.allow(doc.encryptedKey, user);

        emit AccessGranted(documentId, user);
    }

    function _getDocument(uint256 documentId) private view returns (Document storage doc) {
        doc = _documents[documentId];
        if (doc.owner == address(0)) {
            revert DocumentNotFound(documentId);
        }
    }
}
