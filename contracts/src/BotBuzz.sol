// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title BotBuzz
/// @notice Decentralized, onchain news board where users can publish posts, like/dislike, and tip authors.
contract BotBuzz is ReentrancyGuard {
    struct Post {
        uint256 id;
        address author;
        string title;
        string description;
        uint64 createdAt;
        uint256 likes;
        uint256 dislikes;
        uint256 totalTips;
    }

    uint256 private _postCount;
    mapping(uint256 postId => Post) private _posts;
    mapping(uint256 postId => mapping(address voter => int8 vote)) private _votes;

    // Custom errors
    error InvalidTitleLength();
    error InvalidDescriptionLength();
    error PostNotFound(uint256 postId);
    error AlreadyVoted(uint256 postId, int8 vote);
    error NoVoteToRemove(uint256 postId);
    error ZeroTipValue();
    error CannotTipOwnPost();
    error TipTransferFailed();

    // Events
    event PostCreated(
        uint256 indexed id,
        address indexed author,
        string title,
        string description,
        uint64 createdAt
    );
    event Voted(uint256 indexed postId, address indexed voter, int8 vote);
    event VoteRemoved(uint256 indexed postId, address indexed voter);
    event Tipped(
        uint256 indexed postId,
        address indexed tipper,
        address indexed author,
        uint256 amount
    );

    /// @notice Create a new news post
    /// @param title Post title (1-100 bytes)
    /// @param description Post description (1-500 bytes)
    /// @return postId Unique ID of the created post
    function createPost(string calldata title, string calldata description) external returns (uint256) {
        uint256 titleLen = bytes(title).length;
        if (titleLen == 0 || titleLen > 100) revert InvalidTitleLength();

        uint256 descLen = bytes(description).length;
        if (descLen == 0 || descLen > 500) revert InvalidDescriptionLength();

        uint256 postId = ++_postCount;
        // casting block.timestamp to uint64 will not overflow for hundreds of billions of years
        // forge-lint: disable-next-line(unsafe-typecast)
        uint64 createdAt = uint64(block.timestamp);

        _posts[postId] = Post({
            id: postId,
            author: msg.sender,
            title: title,
            description: description,
            createdAt: createdAt,
            likes: 0,
            dislikes: 0,
            totalTips: 0
        });

        emit PostCreated(postId, msg.sender, title, description, createdAt);
        return postId;
    }

    /// @notice Like a post (vote = 1)
    /// @param postId ID of the post
    function like(uint256 postId) external nonReentrant {
        if (postId == 0 || postId > _postCount) revert PostNotFound(postId);

        int8 currentVote = _votes[postId][msg.sender];
        if (currentVote == 1) revert AlreadyVoted(postId, 1);

        if (currentVote == -1) {
            _posts[postId].dislikes -= 1;
        }
        _posts[postId].likes += 1;
        _votes[postId][msg.sender] = 1;

        emit Voted(postId, msg.sender, 1);
    }

    /// @notice Dislike a post (vote = -1)
    /// @param postId ID of the post
    function dislike(uint256 postId) external nonReentrant {
        if (postId == 0 || postId > _postCount) revert PostNotFound(postId);

        int8 currentVote = _votes[postId][msg.sender];
        if (currentVote == -1) revert AlreadyVoted(postId, -1);

        if (currentVote == 1) {
            _posts[postId].likes -= 1;
        }
        _posts[postId].dislikes += 1;
        _votes[postId][msg.sender] = -1;

        emit Voted(postId, msg.sender, -1);
    }

    /// @notice Remove caller's vote on a post
    /// @param postId ID of the post
    function removeVote(uint256 postId) external nonReentrant {
        if (postId == 0 || postId > _postCount) revert PostNotFound(postId);

        int8 currentVote = _votes[postId][msg.sender];
        if (currentVote == 0) revert NoVoteToRemove(postId);

        if (currentVote == 1) {
            _posts[postId].likes -= 1;
        } else if (currentVote == -1) {
            _posts[postId].dislikes -= 1;
        }
        _votes[postId][msg.sender] = 0;

        emit VoteRemoved(postId, msg.sender);
    }

    /// @notice Tip the author of a post in native BOT tokens
    /// @param postId ID of the post
    function tip(uint256 postId) external payable nonReentrant {
        if (msg.value == 0) revert ZeroTipValue();
        if (postId == 0 || postId > _postCount) revert PostNotFound(postId);

        Post storage post = _posts[postId];
        address author = post.author;
        if (msg.sender == author) revert CannotTipOwnPost();

        post.totalTips += msg.value;

        emit Tipped(postId, msg.sender, author, msg.value);

        // forge-lint: disable-next-line(reentrancy-eth,arbitrary-send-eth)
        (bool success, ) = author.call{value: msg.value}("");
        if (!success) revert TipTransferFailed();
    }

    /// @notice Get a single post by ID
    /// @param postId ID of the post
    /// @return Post struct
    function getPost(uint256 postId) external view returns (Post memory) {
        if (postId == 0 || postId > _postCount) revert PostNotFound(postId);
        return _posts[postId];
    }

    /// @notice Total number of posts created
    /// @return Number of posts
    function postCount() external view returns (uint256) {
        return _postCount;
    }

    /// @notice Paginated posts query, newest first
    /// @param offset Number of newest posts to skip
    /// @param limit Maximum number of posts to return
    /// @return posts Array of posts in descending chronological order
    function getPosts(uint256 offset, uint256 limit) external view returns (Post[] memory) {
        uint256 total = _postCount;
        if (offset >= total || limit == 0) {
            return new Post[](0);
        }

        uint256 available = total - offset;
        uint256 count = limit < available ? limit : available;
        Post[] memory posts = new Post[](count);

        for (uint256 i = 0; i < count; i++) {
            posts[i] = _posts[total - offset - i];
        }

        return posts;
    }

    /// @notice Get a voter's current vote on a post
    /// @param postId ID of the post
    /// @param voter Address of the voter
    /// @return vote 1 for like, -1 for dislike, 0 for none
    function getVote(uint256 postId, address voter) external view returns (int8) {
        return _votes[postId][voter];
    }
}
