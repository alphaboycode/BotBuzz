// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {BotBuzz} from "../src/BotBuzz.sol";

contract MaliciousAuthor {
    BotBuzz public botBuzz;
    bool public attackOnTip;
    bool public attackOnVote;
    uint256 public targetPostId;

    constructor(address _botBuzz) {
        botBuzz = BotBuzz(_botBuzz);
    }

    function setAttack(bool _attackOnTip, bool _attackOnVote, uint256 _targetPostId) external {
        attackOnTip = _attackOnTip;
        attackOnVote = _attackOnVote;
        targetPostId = _targetPostId;
    }

    function createPost(string calldata title, string calldata description) external returns (uint256) {
        return botBuzz.createPost(title, description);
    }

    receive() external payable {
        if (attackOnTip) {
            attackOnTip = false;
            botBuzz.tip{value: msg.value}(targetPostId);
        }
        if (attackOnVote) {
            attackOnVote = false;
            botBuzz.like(targetPostId);
        }
    }
}

contract RejectingAuthor {
    BotBuzz public botBuzz;

    constructor(address _botBuzz) {
        botBuzz = BotBuzz(_botBuzz);
    }

    function createPost(string calldata title, string calldata description) external returns (uint256) {
        return botBuzz.createPost(title, description);
    }

    // No receive or fallback: rejects any BOT/ETH transfers
}

contract BotBuzzTest is Test {
    BotBuzz public buzz;

    address public alice = address(0xA11CE);
    address public bob = address(0xB0B);
    address public charlie = address(0xCAFE);

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

    function setUp() public {
        buzz = new BotBuzz();
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(charlie, 100 ether);
    }

    // --- createPost tests ---
    function test_CreatePost_StoresCorrectData() public {
        vm.warp(1700000000);
        vm.prank(alice);
        vm.expectEmit(true, true, false, true);
        emit PostCreated(1, alice, "First News", "This is the very first news story.", 1700000000);
        uint256 postId = buzz.createPost("First News", "This is the very first news story.");

        assertEq(postId, 1);
        assertEq(buzz.postCount(), 1);

        BotBuzz.Post memory p = buzz.getPost(1);
        assertEq(p.id, 1);
        assertEq(p.author, alice);
        assertEq(p.title, "First News");
        assertEq(p.description, "This is the very first news story.");
        assertEq(p.createdAt, 1700000000);
        assertEq(p.likes, 0);
        assertEq(p.dislikes, 0);
        assertEq(p.totalTips, 0);
    }

    function test_CreatePost_RevertOnEmptyTitle() public {
        vm.prank(alice);
        vm.expectRevert(BotBuzz.InvalidTitleLength.selector);
        buzz.createPost("", "Valid description");
    }

    function test_CreatePost_RevertOnOverLengthTitle() public {
        // 101 bytes title
        bytes memory longTitle = new bytes(101);
        for (uint256 i = 0; i < 101; i++) {
            longTitle[i] = "a";
        }

        vm.prank(alice);
        vm.expectRevert(BotBuzz.InvalidTitleLength.selector);
        buzz.createPost(string(longTitle), "Valid description");
    }

    function test_CreatePost_MaxBoundaryTitle() public {
        bytes memory maxTitle = new bytes(100);
        for (uint256 i = 0; i < 100; i++) {
            maxTitle[i] = "a";
        }

        vm.prank(alice);
        uint256 postId = buzz.createPost(string(maxTitle), "Valid description");
        assertEq(postId, 1);
    }

    function test_CreatePost_RevertOnEmptyDescription() public {
        vm.prank(alice);
        vm.expectRevert(BotBuzz.InvalidDescriptionLength.selector);
        buzz.createPost("Valid title", "");
    }

    function test_CreatePost_RevertOnOverLengthDescription() public {
        // 501 bytes description
        bytes memory longDesc = new bytes(501);
        for (uint256 i = 0; i < 501; i++) {
            longDesc[i] = "b";
        }

        vm.prank(alice);
        vm.expectRevert(BotBuzz.InvalidDescriptionLength.selector);
        buzz.createPost("Valid title", string(longDesc));
    }

    function test_CreatePost_MaxBoundaryDescription() public {
        bytes memory maxDesc = new bytes(500);
        for (uint256 i = 0; i < 500; i++) {
            maxDesc[i] = "b";
        }

        vm.prank(alice);
        uint256 postId = buzz.createPost("Valid title", string(maxDesc));
        assertEq(postId, 1);
    }

    // --- like and dislike tests ---
    function test_LikeAndDislike_UpdateCountersCorrectly() public {
        vm.prank(alice);
        uint256 postId = buzz.createPost("Title", "Desc");

        // Bob likes
        vm.prank(bob);
        vm.expectEmit(true, true, false, true);
        emit Voted(postId, bob, 1);
        buzz.like(postId);

        assertEq(buzz.getVote(postId, bob), 1);
        BotBuzz.Post memory p = buzz.getPost(postId);
        assertEq(p.likes, 1);
        assertEq(p.dislikes, 0);

        // Charlie dislikes
        vm.prank(charlie);
        vm.expectEmit(true, true, false, true);
        emit Voted(postId, charlie, -1);
        buzz.dislike(postId);

        assertEq(buzz.getVote(postId, charlie), -1);
        p = buzz.getPost(postId);
        assertEq(p.likes, 1);
        assertEq(p.dislikes, 1);
    }

    function test_VotingTwiceWithSameVote_Reverts() public {
        vm.prank(alice);
        uint256 postId = buzz.createPost("Title", "Desc");

        // Like once
        vm.prank(bob);
        buzz.like(postId);

        // Like again
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(BotBuzz.AlreadyVoted.selector, postId, int8(1)));
        buzz.like(postId);

        // Dislike test
        vm.prank(charlie);
        buzz.dislike(postId);

        vm.prank(charlie);
        vm.expectRevert(abi.encodeWithSelector(BotBuzz.AlreadyVoted.selector, postId, int8(-1)));
        buzz.dislike(postId);
    }

    function test_SwitchingVote_MovesCount() public {
        vm.prank(alice);
        uint256 postId = buzz.createPost("Title", "Desc");

        // Bob starts with like
        vm.prank(bob);
        buzz.like(postId);

        BotBuzz.Post memory p = buzz.getPost(postId);
        assertEq(p.likes, 1);
        assertEq(p.dislikes, 0);
        assertEq(buzz.getVote(postId, bob), 1);

        // Bob switches to dislike
        vm.prank(bob);
        vm.expectEmit(true, true, false, true);
        emit Voted(postId, bob, -1);
        buzz.dislike(postId);

        p = buzz.getPost(postId);
        assertEq(p.likes, 0);
        assertEq(p.dislikes, 1);
        assertEq(buzz.getVote(postId, bob), -1);

        // Bob switches back to like
        vm.prank(bob);
        buzz.like(postId);

        p = buzz.getPost(postId);
        assertEq(p.likes, 1);
        assertEq(p.dislikes, 0);
        assertEq(buzz.getVote(postId, bob), 1);
    }

    // --- removeVote tests ---
    function test_RemoveVote_RestoresCounters() public {
        vm.prank(alice);
        uint256 postId = buzz.createPost("Title", "Desc");

        // Bob likes then removes
        vm.prank(bob);
        buzz.like(postId);

        vm.prank(bob);
        vm.expectEmit(true, true, false, true);
        emit VoteRemoved(postId, bob);
        buzz.removeVote(postId);

        assertEq(buzz.getVote(postId, bob), 0);
        BotBuzz.Post memory p = buzz.getPost(postId);
        assertEq(p.likes, 0);
        assertEq(p.dislikes, 0);

        // Bob dislikes then removes
        vm.prank(bob);
        buzz.dislike(postId);

        vm.prank(bob);
        buzz.removeVote(postId);

        assertEq(buzz.getVote(postId, bob), 0);
        p = buzz.getPost(postId);
        assertEq(p.likes, 0);
        assertEq(p.dislikes, 0);
    }

    function test_RemoveVote_RevertsWhenNoVote() public {
        vm.prank(alice);
        uint256 postId = buzz.createPost("Title", "Desc");

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(BotBuzz.NoVoteToRemove.selector, postId));
        buzz.removeVote(postId);
    }

    function test_VotesOnDifferentPostsAreIndependent() public {
        vm.prank(alice);
        uint256 post1 = buzz.createPost("Post 1", "Desc 1");
        vm.prank(alice);
        uint256 post2 = buzz.createPost("Post 2", "Desc 2");

        vm.prank(bob);
        buzz.like(post1);

        vm.prank(bob);
        buzz.dislike(post2);

        assertEq(buzz.getVote(post1, bob), 1);
        assertEq(buzz.getVote(post2, bob), -1);

        assertEq(buzz.getPost(post1).likes, 1);
        assertEq(buzz.getPost(post1).dislikes, 0);

        assertEq(buzz.getPost(post2).likes, 0);
        assertEq(buzz.getPost(post2).dislikes, 1);
    }

    // --- tip tests ---
    function test_Tip_SendsExactAmount_IncreasesTotalTips_ContractBalanceZero() public {
        vm.prank(alice);
        uint256 postId = buzz.createPost("Title", "Desc");

        uint256 aliceBefore = alice.balance;
        uint256 bobBefore = bob.balance;
        uint256 tipAmount = 2.5 ether;

        vm.prank(bob);
        vm.expectEmit(true, true, true, true);
        emit Tipped(postId, bob, alice, tipAmount);
        buzz.tip{value: tipAmount}(postId);

        assertEq(alice.balance, aliceBefore + tipAmount);
        assertEq(bob.balance, bobBefore - tipAmount);
        assertEq(buzz.getPost(postId).totalTips, tipAmount);
        assertEq(address(buzz).balance, 0);
    }

    function test_Tip_RevertsOnZeroValue() public {
        vm.prank(alice);
        uint256 postId = buzz.createPost("Title", "Desc");

        vm.prank(bob);
        vm.expectRevert(BotBuzz.ZeroTipValue.selector);
        buzz.tip{value: 0}(postId);
    }

    function test_Tip_RevertsOnNonexistentPost() public {
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(BotBuzz.PostNotFound.selector, 999));
        buzz.tip{value: 1 ether}(999);
    }

    function test_Tip_RevertsOnSelfTip() public {
        vm.prank(alice);
        uint256 postId = buzz.createPost("Title", "Desc");

        vm.prank(alice);
        vm.expectRevert(BotBuzz.CannotTipOwnPost.selector);
        buzz.tip{value: 1 ether}(postId);
    }

    function test_ContractRejectsDirectEtherTransfer() public {
        vm.prank(bob);
        (bool success, ) = address(buzz).call{value: 1 ether}("");
        assertFalse(success);
    }

    // --- Reentrancy tests ---
    function test_Reentrancy_BlockedOnTip() public {
        MaliciousAuthor attacker = new MaliciousAuthor(address(buzz));
        vm.deal(address(attacker), 10 ether);

        // Attacker creates a post
        uint256 postId = attacker.createPost("Attacker News", "Malicious desc");

        // Attacker sets attack trigger on receive: attempt to tip during tip
        attacker.setAttack(true, false, postId);

        vm.prank(bob);
        vm.expectRevert();
        buzz.tip{value: 1 ether}(postId);
    }

    function test_Reentrancy_BlockedOnVote() public {
        MaliciousAuthor attacker = new MaliciousAuthor(address(buzz));
        vm.deal(address(attacker), 10 ether);

        uint256 postId = attacker.createPost("Attacker News 2", "Malicious desc 2");

        // Attacker sets attack trigger on receive: attempt to vote during tip
        attacker.setAttack(false, true, postId);

        vm.prank(bob);
        vm.expectRevert();
        buzz.tip{value: 1 ether}(postId);
    }

    // --- Rejecting author test ---
    function test_RejectingAuthor_TipRevertsCleanlyWithoutBreakingOtherPosts() public {
        RejectingAuthor rejecting = new RejectingAuthor(address(buzz));

        // Normal post by Alice
        vm.prank(alice);
        uint256 goodPost = buzz.createPost("Good Post", "Good Desc");

        // Post by Rejecting author
        uint256 badPost = rejecting.createPost("Rejecting Post", "Rejecting Desc");

        // Tipping bad post reverts with TipTransferFailed
        vm.prank(bob);
        vm.expectRevert(BotBuzz.TipTransferFailed.selector);
        buzz.tip{value: 1 ether}(badPost);

        // Good post can still be tipped normally
        uint256 aliceBefore = alice.balance;
        vm.prank(bob);
        buzz.tip{value: 1 ether}(goodPost);
        assertEq(alice.balance, aliceBefore + 1 ether);
        assertEq(buzz.getPost(goodPost).totalTips, 1 ether);
    }

    // --- Pagination tests ---
    function test_Pagination_NewestFirstAndEdgeCases() public {
        // Edge case: 0 total posts
        BotBuzz.Post[] memory emptyPosts = buzz.getPosts(0, 10);
        assertEq(emptyPosts.length, 0);

        // Create 5 posts
        for (uint256 i = 1; i <= 5; i++) {
            vm.prank(alice);
            buzz.createPost(
                string(abi.encodePacked("Title ", vm.toString(i))),
                string(abi.encodePacked("Desc ", vm.toString(i)))
            );
        }
        assertEq(buzz.postCount(), 5);

        // First page: offset 0, limit 2 -> should return posts 5 and 4
        BotBuzz.Post[] memory page1 = buzz.getPosts(0, 2);
        assertEq(page1.length, 2);
        assertEq(page1[0].id, 5);
        assertEq(page1[1].id, 4);

        // Second page: offset 2, limit 2 -> should return posts 3 and 2
        BotBuzz.Post[] memory page2 = buzz.getPosts(2, 2);
        assertEq(page2.length, 2);
        assertEq(page2[0].id, 3);
        assertEq(page2[1].id, 2);

        // Third page: offset 4, limit 2 -> should return only post 1 (only 1 available)
        BotBuzz.Post[] memory page3 = buzz.getPosts(4, 2);
        assertEq(page3.length, 1);
        assertEq(page3[0].id, 1);

        // Beyond available: offset 5, limit 2 -> empty
        BotBuzz.Post[] memory page4 = buzz.getPosts(5, 2);
        assertEq(page4.length, 0);

        // Large offset: offset 100, limit 5 -> empty
        BotBuzz.Post[] memory pageOver = buzz.getPosts(100, 5);
        assertEq(pageOver.length, 0);

        // Limit 0: offset 0, limit 0 -> empty
        BotBuzz.Post[] memory pageZeroLimit = buzz.getPosts(0, 0);
        assertEq(pageZeroLimit.length, 0);

        // Limit greater than total: offset 0, limit 10 -> returns all 5
        BotBuzz.Post[] memory allPosts = buzz.getPosts(0, 10);
        assertEq(allPosts.length, 5);
        assertEq(allPosts[0].id, 5);
        assertEq(allPosts[1].id, 4);
        assertEq(allPosts[2].id, 3);
        assertEq(allPosts[3].id, 2);
        assertEq(allPosts[4].id, 1);
    }

    // --- Fuzz test for voting ---
    function testFuzz_RandomVotingSequences(uint8[15] memory actions, uint8[15] memory voterIndices) public {
        vm.prank(alice);
        uint256 postId = buzz.createPost("Fuzz Title", "Fuzz Desc");

        address[4] memory voters = [
            address(0x101),
            address(0x102),
            address(0x103),
            address(0x104)
        ];

        for (uint256 i = 0; i < actions.length; i++) {
            address voter = voters[voterIndices[i] % 4];
            uint8 action = actions[i] % 3; // 0 = remove, 1 = like, 2 = dislike

            int8 currentVote = buzz.getVote(postId, voter);

            vm.prank(voter);
            if (action == 1) {
                if (currentVote == 1) {
                    vm.expectRevert(abi.encodeWithSelector(BotBuzz.AlreadyVoted.selector, postId, int8(1)));
                    buzz.like(postId);
                } else {
                    buzz.like(postId);
                }
            } else if (action == 2) {
                if (currentVote == -1) {
                    vm.expectRevert(abi.encodeWithSelector(BotBuzz.AlreadyVoted.selector, postId, int8(-1)));
                    buzz.dislike(postId);
                } else {
                    buzz.dislike(postId);
                }
            } else {
                if (currentVote == 0) {
                    vm.expectRevert(abi.encodeWithSelector(BotBuzz.NoVoteToRemove.selector, postId));
                    buzz.removeVote(postId);
                } else {
                    buzz.removeVote(postId);
                }
            }

            // Invariant check: stored votes match counters
            uint256 expectedLikes = 0;
            uint256 expectedDislikes = 0;
            for (uint256 v = 0; v < voters.length; v++) {
                int8 vote = buzz.getVote(postId, voters[v]);
                if (vote == 1) expectedLikes++;
                if (vote == -1) expectedDislikes++;
            }

            BotBuzz.Post memory p = buzz.getPost(postId);
            assertEq(p.likes, expectedLikes, "Likes counter mismatch");
            assertEq(p.dislikes, expectedDislikes, "Dislikes counter mismatch");
        }
    }
}
