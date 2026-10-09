// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @notice Hackathon only: block randomness is manipulable. No valuable rewards.
contract LedgerMon is ERC721, ReentrancyGuard {
    using Strings for uint256;
    uint8 public constant REGULAR_TRAINERS = 13;
    uint8 public constant BOSS_ID = 13;
    uint16 public constant ALL_TRAINERS_MASK = 8191;
    bytes32 public constant GAME_VERSION = keccak256("LEDGERMON_V3_FRIENDLY_BATTLES");

    struct Player { uint256 starterTokenId; uint16 defeatedMask; bool bossDefeated; }
    struct Token { address player; uint8 kind; uint8 opponentId; }
    mapping(address => Player) public players;
    mapping(uint256 => Token) public tokens;
    mapping(address => mapping(uint8 => uint256)) public trophyOf;
    mapping(address => uint256) public attempts;
    uint256 public nextTokenId = 1;
    address public immutable metadataAdmin;
    string public trainerImageBaseURI;

    error AlreadyClaimed();
    error StarterRequired();
    error InvalidOpponent();
    error InvalidStrategy();
    error AlreadyDefeated();
    error BossLocked();
    error StarterBoundToPlayer();
    error MetadataAdminOnly();
    error InvalidImageURI();
    error SecurityChallengeRequired();
    error IncorrectWarning();

    event StarterClaimed(address indexed player, uint256 indexed tokenId, uint8 species, uint8 attack, uint8 defense);
    event BattleResolved(address indexed player, uint8 indexed opponentId, uint8 strategy, bool won, uint8 chance, uint8 roll);
    event TrainerDefeated(address indexed player, uint8 indexed opponentId);
    event TrophyMinted(address indexed player, uint8 indexed opponentId, uint256 indexed tokenId);
    event ChampionMinted(address indexed player, uint256 indexed tokenId);
    event TrainerImagesUpdated(string baseURI);
    event BatchMetadataUpdate(uint256 _fromTokenId, uint256 _toTokenId);
    event WarningAnswered(address indexed player, uint8 indexed opponentId);

    constructor() ERC721("LedgerMon", "LMON") { metadataAdmin = msg.sender; }

    /// @notice Configure a public directory, e.g. ipfs://CID/ or https://site/nft/trainers/.
    function setTrainerImageBaseURI(string calldata baseURI) external {
        if (msg.sender != metadataAdmin) revert MetadataAdminOnly();
        bytes memory uri = bytes(baseURI);
        bool https = uri.length > 8 && bytes8(uri) == bytes8("https://");
        bool ipfs = uri.length > 7 && bytes7(uri) == bytes7("ipfs://");
        if ((!https && !ipfs) || uri[uri.length - 1] != bytes1('/')) revert InvalidImageURI();
        for (uint256 i; i < uri.length; ++i) {
            if (uint8(uri[i]) < 33 || uint8(uri[i]) > 126 || uri[i] == bytes1('"') || uri[i] == bytes1('\\')) revert InvalidImageURI();
        }
        trainerImageBaseURI = baseURI;
        emit TrainerImagesUpdated(baseURI);
        if (nextTokenId > 1) emit BatchMetadataUpdate(1, nextTokenId - 1);
    }

    function supportsInterface(bytes4 interfaceId) public view override returns (bool) {
        return interfaceId == 0x49064906 || super.supportsInterface(interfaceId);
    }

    function trainerImage(uint8 opponentId) public view returns (string memory) {
        bytes memory slug = bytes(trainerName(opponentId));
        for (uint256 i; i < slug.length; ++i) slug[i] = bytes1(uint8(slug[i]) + 32);
        return string.concat(trainerImageBaseURI, string(slug), opponentId == BOSS_ID ? ".svg" : ".png");
    }

    function deriveStarter(address player) public pure returns (uint8 species, uint8 attack, uint8 defense) {
        uint256 seed = uint256(keccak256(abi.encodePacked("LEDGERMON_V1", player)));
        species = uint8(seed % 3);
        attack = uint8(40 + ((seed >> 16) % 41));
        defense = 120 - attack;
    }

    function getPlayer(address player) external view returns (uint256 starterTokenId, uint16 defeatedMask, bool bossDefeated) {
        Player memory p = players[player];
        return (p.starterTokenId, p.defeatedMask, p.bossDefeated);
    }

    function claimStarter() external nonReentrant {
        if (players[msg.sender].starterTokenId != 0) revert AlreadyClaimed();
        uint256 id = nextTokenId++;
        players[msg.sender].starterTokenId = id;
        tokens[id] = Token(msg.sender, 0, 0);
        (uint8 species, uint8 attack, uint8 defense) = deriveStarter(msg.sender);
        _safeMint(msg.sender, id);
        emit StarterClaimed(msg.sender, id, species, attack, defense);
    }

    function victoryChance(address player, uint8 opponentId, uint8 strategy) public pure returns (uint8) {
        if (opponentId > BOSS_ID) revert InvalidOpponent();
        if (strategy > 1) revert InvalidStrategy();
        (, uint8 attack, uint8 defense) = deriveStarter(player);
        uint8 stat = strategy == 0 ? attack : defense;
        uint8 chance = 60 + stat / 2 - (opponentId == BOSS_ID ? 10 : opponentId % 4);
        uint8 minimum = opponentId == BOSS_ID ? 70 : 80;
        uint8 maximum = opponentId == BOSS_ID ? 85 : 95;
        return chance < minimum ? minimum : chance > maximum ? maximum : chance;
    }

    function battle(uint8 opponentId, uint8 strategy) external nonReentrant {
        if (opponentId == 2) revert SecurityChallengeRequired();
        uint8 chance = victoryChance(msg.sender, opponentId, strategy);
        Player storage p = players[msg.sender];
        if (p.starterTokenId == 0) revert StarterRequired();
        if (opponentId == BOSS_ID) {
            if (p.bossDefeated) revert AlreadyDefeated();
            if (p.defeatedMask != ALL_TRAINERS_MASK) revert BossLocked();
        } else if ((p.defeatedMask & (uint16(1) << opponentId)) != 0) revert AlreadyDefeated();

        // Deliberately simplified; validators and callers can bias/grind outcomes.
        uint8 roll = uint8(uint256(keccak256(abi.encodePacked(block.prevrandao, blockhash(block.number - 1), msg.sender, attempts[msg.sender]++, opponentId, strategy))) % 100);
        bool won = roll < chance;
        emit BattleResolved(msg.sender, opponentId, strategy, won, chance, roll);
        if (!won) return;
        _award(msg.sender, opponentId);
    }

    /// @notice A public knowledge challenge, NOT a cryptographic proof of clicking Reject.
    /// Anyone who knows the warning can answer it. Rewards have no economic value.
    function claimDiyaeddineReward(string calldata warning) external nonReentrant {
        if (players[msg.sender].starterTokenId == 0) revert StarterRequired();
        if ((players[msg.sender].defeatedMask & (uint16(1) << 2)) != 0) revert AlreadyDefeated();
        if (keccak256(bytes(warning)) != keccak256("YOU LOSE IMMEDIATLY")) revert IncorrectWarning();
        emit WarningAnswered(msg.sender, 2);
        _award(msg.sender, 2);
    }

    function _award(address player, uint8 opponentId) internal {
        Player storage p = players[player];
        if (opponentId == BOSS_ID) p.bossDefeated = true;
        else p.defeatedMask |= uint16(1) << opponentId;
        emit TrainerDefeated(player, opponentId);
        uint256 id = nextTokenId++;
        trophyOf[player][opponentId] = id;
        tokens[id] = Token(player, opponentId == BOSS_ID ? 2 : 1, opponentId);
        _safeMint(player, id);
        if (opponentId == BOSS_ID) emit ChampionMinted(player, id);
        else emit TrophyMinted(player, opponentId, id);
    }

    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        if (_ownerOf(tokenId) != address(0) && tokens[tokenId].kind == 0) revert StarterBoundToPlayer();
        return super._update(to, tokenId, auth);
    }

    function trainerName(uint8 id) public pure returns (string memory) {
        if (id > BOSS_ID) revert InvalidOpponent();
        string[14] memory names = ["TEDDY", "BENOIT", "DIYAEDDINE", "STEPHANE", "HENRI", "LIVIO", "MOUSTAFA", "OSCAR", "FRANCOIS", "QUENTIN", "PIOTR", "HEDI", "TRISTAN", "PANORAMIX"];
        return names[id];
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        Token memory token = tokens[tokenId];
        (uint8 species, uint8 attack, uint8 defense) = deriveStarter(token.player);
        string[3] memory names = ["LUMEN", "GENERIC", "MODULE"];
        string memory kind = token.kind == 0 ? "Starter" : token.kind == 1 ? "Trophy" : "Champion";
        string memory label = token.kind == 0 ? names[species] : trainerName(token.opponentId);
        string memory svg = string.concat('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#102038"/><circle cx="200" cy="155" r="75" fill="#f8e060"/><text x="200" y="165" text-anchor="middle" font-size="28">', kind, '</text><text x="200" y="285" text-anchor="middle" fill="white" font-size="24">', label, '</text></svg>');
        string memory attributes = string.concat('[{"trait_type":"Kind","value":"', kind, '"},{"trait_type":"Species","value":"', names[species], '"},{"trait_type":"Attack","value":', uint256(attack).toString(), '},{"trait_type":"Defense","value":', uint256(defense).toString(), '}]');
        string memory image = token.kind != 0 && bytes(trainerImageBaseURI).length > 0
            ? trainerImage(token.opponentId) : string.concat("data:image/svg+xml;base64,", Base64.encode(bytes(svg)));
        return string.concat("data:application/json;base64,", Base64.encode(bytes(string.concat('{"name":"', label, ' ', kind, ' #', tokenId.toString(), '","description":"LedgerMon Sepolia hackathon. Only starters are combat Pokemon.","image":"', image, '","attributes":', attributes, '}'))));
    }
}
