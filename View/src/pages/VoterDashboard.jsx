import { useState, useEffect } from 'react';
import { useAuth } from '../context/authContext.jsx';
import { useNavigate } from 'react-router-dom';
import api from '../api/api';
import { 
  Vote, 
  CheckCircle, 
  Clock, 
  Shield, 
  LogOut, 
  User,
  FileText,
  BarChart3
} from 'lucide-react';

export default function VoterDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('elections');
  const [elections, setElections] = useState([]);
  const [selectedElection, setSelectedElection] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [votingStatus, setVotingStatus] = useState(null);
  const [voteHistory, setVoteHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showConfirmation, setShowConfirmation] = useState(false);

  const loadVotingStatus = async () => {
    try {
      const response = await api.get('/voting/status');
      setVotingStatus(response.data.data);
    } catch (err) {
      console.error('Error loading voting status:', err);
    }
  };

  const loadElections = async () => {
    try {
      setLoading(true);
      const response = await api.get('/voting/elections');
      setElections(response.data.data.elections);
    } catch (err) {
      setError('Failed to load elections');
      console.error('Error loading elections:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadVoteHistory = async () => {
    try {
      const response = await api.get('/voting/votes');
      setVoteHistory(response.data.data.votes);
    } catch (err) {
      console.error('Error loading vote history:', err);
    }
  };

  const loadCandidates = async (electionId) => {
    try {
      const response = await api.get(`/voting/elections/${electionId}/candidates`);
      setCandidates(response.data.data.candidates);
      setSelectedElection(elections.find(e => e._id === electionId));
    } catch (err) {
      setError('Failed to load candidates');
      console.error('Error loading candidates:', err);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      await Promise.all([loadVotingStatus(), loadElections(), loadVoteHistory()]);
      setLoading(false);
    };

    fetchData();
  }, []);

  const pollVoteJob = async (jobId, maxAttempts = 30) => {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const statusRes = await api.get(`/voting/vote/jobs/${jobId}`);
      const { status, data, message } = statusRes.data;

      if (status === 'success' && data?.result?.vote) {
        return data.result;
      }

      if (status === 'fail') {
        throw new Error(message || 'Vote processing failed');
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error('Vote processing timed out. Check your vote history shortly.');
  };

  const handleVote = async () => {
    if (!selectedCandidate || !selectedElection) return;

    try {
      setLoading(true);
      setError('');

      const idempotencyKey = crypto.randomUUID();
      const response = await api.post(
        '/voting/vote',
        {
          electionId: selectedElection._id,
          candidateId: selectedCandidate._id,
          authenticationMethod: 'password'
        },
        {
          headers: { 'Idempotency-Key': idempotencyKey }
        }
      );

      let voteResult = response.data.data;

      if (response.status === 202 && voteResult?.jobId) {
        voteResult = await pollVoteJob(voteResult.jobId);
      }

      const receiptId = voteResult?.vote?.receipt?.id;
      setSuccess(
        receiptId
          ? `Vote cast successfully! Your receipt: ${receiptId}`
          : 'Vote cast successfully!'
      );
      setShowConfirmation(false);
      setSelectedCandidate(null);
      setSelectedElection(null);

      const statusRes = await api.get('/voting/status');
      setVotingStatus(statusRes.data.data);
      const historyRes = await api.get('/voting/votes');
      setVoteHistory(historyRes.data.data.votes);
      const electionsRes = await api.get('/voting/elections');
      setElections(electionsRes.data.data.elections);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to cast vote');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div className="header-content">
          <div className="user-info">
            <User className="user-icon" size={32} />
            <div>
              <h2>{user?.firstName} {user?.lastName}</h2>
              <p>Voter Dashboard</p>
            </div>
          </div>
          <button onClick={handleLogout} className="logout-btn">
            <LogOut size={20} />
            Logout
          </button>
        </div>
      </div>

      <div className="dashboard-nav">
        <button
          className={`nav-btn ${activeTab === 'elections' ? 'active' : ''}`}
          onClick={() => setActiveTab('elections')}
        >
          <Vote size={20} />
          Elections
        </button>
        <button
          className={`nav-btn ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          <FileText size={20} />
          Vote History
        </button>
        <button
          className={`nav-btn ${activeTab === 'status' ? 'active' : ''}`}
          onClick={() => setActiveTab('status')}
        >
          <BarChart3 size={20} />
          Voting Status
        </button>
      </div>

      <div className="dashboard-content">
        {error && <div className="error-banner">{error}</div>}
        {success && <div className="success-banner">{success}</div>}

        {activeTab === 'elections' && (
          <div className="elections-section">
            {!selectedElection ? (
              <>
                <h2>Available Elections</h2>
                {loading ? (
                  <div className="loading">Loading elections...</div>
                ) : elections.length === 0 ? (
                  <div className="empty-state">
                    <Clock size={48} />
                    <p>No active elections available for your account at this time</p>
                    <small>District check: your voter district is <strong>{user?.electoralDistrict || 'not loaded'}</strong>. It must match the election district exactly.</small>
                  </div>
                ) : (
                  <div className="elections-grid">
                    {elections.map((election) => (
                      <div key={election._id} className="election-card">
                        <h3>{election.title}</h3>
                        <p className="election-type">{election.type}</p>
                        <p className="election-description">{election.description}</p>
                        <div className="election-dates">
                          <span>Start: {new Date(election.startDate).toLocaleDateString()}</span>
                          <span>End: {new Date(election.endDate).toLocaleDateString()}</span>
                        </div>
                        <button
                          onClick={() => loadCandidates(election._id)}
                          className="view-candidates-btn"
                        >
                          View Candidates
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <button onClick={() => setSelectedElection(null)} className="back-btn">
                  ← Back to Elections
                </button>
                <h2>{selectedElection.title} - Candidates</h2>
                <div className="candidates-list">
                  {candidates.map((candidate) => (
                    <div
                      key={candidate._id}
                      className={`candidate-card ${selectedCandidate?._id === candidate._id ? 'selected' : ''}`}
                      onClick={() => setSelectedCandidate(candidate)}
                    >
                      <div className="candidate-info">
                        <h3>{candidate.firstName} {candidate.lastName}</h3>
                        <p className="party">{candidate.party}</p>
                        <p className="position">{candidate.position}</p>
                        {candidate.biography && (
                          <p className="biography">{candidate.biography}</p>
                        )}
                      </div>
                      <div className="candidate-select">
                        {selectedCandidate?._id === candidate._id && (
                          <CheckCircle className="check-icon" size={24} />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {selectedCandidate && (
                  <div className="vote-actions">
                    <button
                      onClick={() => setShowConfirmation(true)}
                      className="confirm-selection-btn"
                    >
                      Review Selection
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="history-section">
            <h2>Your Voting History</h2>
            {voteHistory.length === 0 ? (
              <div className="empty-state">
                <FileText size={48} />
                <p>You haven't voted in any elections yet</p>
              </div>
            ) : (
              <div className="vote-history-list">
                {voteHistory.map((vote) => (
                  <div key={vote.id} className="vote-history-item">
                    <div className="vote-info">
                      <h3>{vote.election.title}</h3>
                      <p>Candidate: {vote.candidate.firstName} {vote.candidate.lastName}</p>
                      <p className="vote-date">Voted on: {new Date(vote.votedAt).toLocaleString()}</p>
                    </div>
                    <div className="vote-receipt">
                      <Shield size={20} />
                      <span>Receipt: {vote.receipt.id}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'status' && (
          <div className="status-section">
            <h2>Voting Status</h2>
            {votingStatus && (
              <div className="status-cards">
                <div className="status-card">
                  <CheckCircle size={32} />
                  <h3>{votingStatus.voter.hasVoted ? 'Has Voted' : 'Not Voted'}</h3>
                  <p>{votingStatus.voter.hasVoted ? 'You have participated in elections' : 'You have not voted yet'}</p>
                <small>Make sure your voter district matches the election district. Your district: {user?.electoralDistrict || 'not saved on this session'}.</small>
                </div>
                <div className="status-card">
                  <Shield size={32} />
                  <h3>{votingStatus.voter.isVerified ? 'Verified' : 'Not Verified'}</h3>
                  <p>{votingStatus.voter.isVerified ? 'Your account is verified' : 'Account verification pending'}</p>
                </div>
                <div className="status-card">
                  <Vote size={32} />
                  <h3>{votingStatus.statistics.availableToVote} Available</h3>
                  <p>Elections you can participate in</p>
                </div>
                <div className="status-card">
                  <Clock size={32} />
                  <h3>{votingStatus.statistics.alreadyVotedIn} Completed</h3>
                  <p>Elections you have voted in</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {showConfirmation && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>Confirm Your Vote</h2>
            <div className="confirmation-details">
              <p><strong>Election:</strong> {selectedElection?.title}</p>
              <p><strong>Candidate:</strong> {selectedCandidate?.firstName} {selectedCandidate?.lastName}</p>
              <p><strong>Party:</strong> {selectedCandidate?.party}</p>
            </div>
            <div className="modal-actions">
              <button onClick={() => setShowConfirmation(false)} className="cancel-btn">
                Cancel
              </button>
              <button onClick={handleVote} className="confirm-vote-btn" disabled={loading}>
                {loading ? 'Casting Vote...' : 'Confirm and Cast Vote'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
