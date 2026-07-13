function serializeCastVoteResult(result) {
  const { vote, receipt, election } = result;

  return {
    vote: {
      id: vote._id.toString(),
      receipt: {
        id: receipt.receiptId,
        timestamp: receipt.timestamp,
        blockchainHash: vote.receipt?.blockchainHash || null
      }
    },
    election: {
      title: election.title,
      votedAt: new Date().toISOString()
    }
  };
}

module.exports = {
  serializeCastVoteResult
};
