import { useState, useEffect } from 'react';
import { useAuth } from '../context/authContext.jsx';
import { useNavigate } from 'react-router-dom';
import api from '../api/api';
import {
  Shield,
  LogOut,
  Plus,
  Users,
  Vote,
  FileText,
  Settings,
  Play,
  Pause,
  Square,
  CheckCircle,
  XCircle,
} from 'lucide-react';

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('elections');
  const [elections, setElections] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [voters, setVoters] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showResultsModal, setShowResultsModal] = useState(false);
  const [selectedElectionResults, setSelectedElectionResults] = useState(null);
  const [selectedElectionRow, setSelectedElectionRow] = useState(null);

  const [newElection, setNewElection] = useState({
    title: '',
    description: '',
    type: 'parliamentary',
    startDate: '',
    endDate: '',
    electoralDistricts: '',
    candidates: ['', ''],
  });

  const [focusedField, setFocusedField] = useState(null);

  const ELECTION_TYPES = [
    'parliamentary',
    'presidential',
    'municipal',
    'referendum',
    'club_president',
    'company_ceo',
    'union_leader',
  ];

  const inputStyle = (field) => ({
    padding: '9px 12px',
    fontSize: '14px',
    borderRadius: '8px',
    border:
      focusedField === field
        ? '0.5px solid #7F77DD'
        : '0.5px solid rgba(255,255,255,0.1)',
    background:
      focusedField === field
        ? 'rgba(127,119,221,0.08)'
        : 'rgba(255,255,255,0.05)',
    color: '#e8e6f8',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    colorScheme: 'dark',
  });

  const labelStyle = {
    fontSize: '11px',
    fontWeight: 500,
    color: '#8b8aab',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    marginBottom: '6px',
    display: 'block',
  };

  const clearMessages = () => {
    setError('');
    setSuccess('');
  };

  const normalizeList = (value) => {
    return Array.isArray(value) ? value : [];
  };

  const getElectionResultsObject = () => {
    const apiElection =
      selectedElectionResults?.election ||
      selectedElectionResults?.data?.election ||
      selectedElectionResults ||
      {};

    return {
      ...(selectedElectionRow || {}),
      ...(apiElection || {}),
    };
  };

  const getResultsArray = () => {
    const election = getElectionResultsObject();
    const apiResults = normalizeList(election?.results);

    if (apiResults.length > 0) {
      return apiResults;
    }

    return normalizeList(selectedElectionRow?.results);
  };

  const getSafeElectionTitle = (election) => {
    if (!election) return 'Unknown Election';
    if (typeof election === 'string') return election;
    return election?.title || election?._id || 'Unknown Election';
  };

  const formatElectionNames = (candidate) => {
    const candidateElections = normalizeList(candidate?.elections);

    if (candidateElections.length === 0) {
      return 'N/A';
    }

    return candidateElections.map((election) => getSafeElectionTitle(election)).join(', ');
  };

  const loadElections = async () => {
    try {
      setLoading(true);
      clearMessages();

      const response = await api.get('/admin/elections');

      const loadedElections =
        response.data?.data?.elections ||
        response.data?.elections ||
        response.data?.data ||
        [];

      setElections(normalizeList(loadedElections));
    } catch (err) {
      setError('Failed to load elections');
      console.error('Error loading elections:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadCandidates = async () => {
    try {
      setLoading(true);
      clearMessages();

      const response = await api.get('/candidates');

      const loadedCandidates =
        response.data?.data?.candidates ||
        response.data?.candidates ||
        response.data?.data ||
        [];

      setCandidates(normalizeList(loadedCandidates));
    } catch (err) {
      setError('Failed to load candidates');
      console.error('Error loading candidates:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadVoters = async () => {
    try {
      setLoading(true);
      clearMessages();

      const response = await api.get('/voter-registry');

      const loadedVoters =
        response.data?.data?.voters ||
        response.data?.voters ||
        response.data?.data ||
        [];

      setVoters(normalizeList(loadedVoters));
    } catch (err) {
      setError('Failed to load voters');
      console.error('Error loading voters:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'elections') {
      loadElections();
    }

    if (activeTab === 'candidates') {
      loadCandidates();
    }

    if (activeTab === 'voters') {
      loadVoters();
    }
  }, [activeTab]);

  const handleElectionAction = async (electionId, action) => {
    try {
      setLoading(true);
      clearMessages();

      await api.post(`/admin/elections/${electionId}/${action}`);

      setSuccess(`Election ${action} successful`);
      await loadElections();
    } catch (err) {
      setError(`Failed to ${action} election`);
      console.error(`Error ${action} election:`, err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateElection = async (e) => {
    e.preventDefault();

    try {
      setLoading(true);
      clearMessages();

      const districts = newElection.electoralDistricts
        .split(',')
        .map((district) => district.trim())
        .filter(Boolean);

      const candidateNames = newElection.candidates
        .map((candidate) => candidate.trim())
        .filter(Boolean);

      const payload = {
        ...newElection,
        electoralDistricts: districts,
        candidates: candidateNames,
        settings: {
          allowMultipleVotes: false,
          maxVotesPerVoter: 1,
          requireTwoFactor: false,
          enableBiometric: false,
          publishResultsImmediately: true,
          allowAudit: true,
        },
      };

      await api.post('/admin/elections', payload);

      setSuccess('Election created successfully');
      setShowCreateModal(false);

      setNewElection({
        title: '',
        description: '',
        type: 'parliamentary',
        startDate: '',
        endDate: '',
        electoralDistricts: '',
        candidates: ['', ''],
      });

      await loadElections();
    } catch (err) {
      setError(`Failed to create election: ${err.response?.data?.message || err.message}`);
      console.error('Error creating election:', err);
    } finally {
      setLoading(false);
    }
  };

  const addCandidateField = () => {
    if (newElection.candidates.length < 5) {
      setNewElection({
        ...newElection,
        candidates: [...newElection.candidates, ''],
      });
    }
  };

  const removeCandidateField = (index) => {
    if (newElection.candidates.length > 2) {
      setNewElection({
        ...newElection,
        candidates: newElection.candidates.filter((_, i) => i !== index),
      });
    }
  };

  const handleCandidateChange = (index, value) => {
    const updatedCandidates = [...newElection.candidates];
    updatedCandidates[index] = value;

    setNewElection({
      ...newElection,
      candidates: updatedCandidates,
    });
  };

  const loadElectionResults = async (election) => {
    try {
      setLoading(true);
      clearMessages();

      setSelectedElectionRow(election);

      const response = await api.get(`/admin/elections/${election._id}/results`);
      const data = response.data?.data || response.data || null;

      setSelectedElectionResults(data);
      setShowResultsModal(true);
    } catch (err) {
      setError('Failed to load election results');
      console.error('Error loading results:', err);

      setSelectedElectionResults(null);
      setShowResultsModal(true);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const electionResultsObject = getElectionResultsObject();
  const electionResultsArray = getResultsArray();

  const totalVotes =
    electionResultsObject?.totalVotes ??
    selectedElectionRow?.totalVotes ??
    0;

  const validVotes =
    electionResultsObject?.validVotes ??
    selectedElectionRow?.validVotes ??
    0;

  const invalidVotes =
    electionResultsObject?.invalidVotes ??
    selectedElectionRow?.invalidVotes ??
    0;

  return (
    <div className="dashboard admin-dashboard">
      {showCreateModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            padding: '24px',
          }}
        >
          <div
            style={{
              background: '#1a1a2e',
              borderRadius: '16px',
              border: '0.5px solid rgba(127,119,221,0.25)',
              width: '100%',
              maxWidth: '480px',
              overflow: 'hidden',
              boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
            }}
          >
            <div
              style={{
                padding: '22px 28px 18px',
                borderBottom: '0.5px solid rgba(255,255,255,0.07)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: 'rgba(127,119,221,0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Plus size={16} color="#AFA9EC" />
                </div>

                <div>
                  <p style={{ margin: 0, fontSize: '15px', fontWeight: 500, color: '#e8e6f8' }}>
                    Create new election
                  </p>
                  <p style={{ margin: 0, fontSize: '12px', color: '#8b8aab' }}>
                    Fill in the details below
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '0.5px solid rgba(255,255,255,0.1)',
                  borderRadius: '6px',
                  width: '28px',
                  height: '28px',
                  cursor: 'pointer',
                  color: '#8b8aab',
                }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateElection}>
              <div
                style={{
                  padding: '22px 28px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '18px',
                }}
              >
                <div>
                  <label style={labelStyle}>Title</label>
                  <input
                    required
                    type="text"
                    placeholder="e.g. Barcelona Presidential Election 2026"
                    style={inputStyle('title')}
                    value={newElection.title}
                    onChange={(e) => setNewElection({ ...newElection, title: e.target.value })}
                    onFocus={() => setFocusedField('title')}
                    onBlur={() => setFocusedField(null)}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Description</label>
                  <textarea
                    required
                    rows={2}
                    placeholder="Brief description of the election..."
                    style={{ ...inputStyle('description'), resize: 'none' }}
                    value={newElection.description}
                    onChange={(e) =>
                      setNewElection({ ...newElection, description: e.target.value })
                    }
                    onFocus={() => setFocusedField('description')}
                    onBlur={() => setFocusedField(null)}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Type</label>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {ELECTION_TYPES.map((type) => {
                      const isActive = newElection.type === type;

                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setNewElection({ ...newElection, type })}
                          style={{
                            flex: 1,
                            minWidth: '100px',
                            padding: '8px 10px',
                            fontSize: '12px',
                            fontWeight: 500,
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            textTransform: 'capitalize',
                            border: isActive
                              ? '0.5px solid #7F77DD'
                              : '0.5px solid rgba(255,255,255,0.1)',
                            background: isActive
                              ? 'rgba(127,119,221,0.18)'
                              : 'rgba(255,255,255,0.04)',
                            color: isActive ? '#CCC8F6' : '#8b8aab',
                          }}
                        >
                          {type.replaceAll('_', ' ')}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div>
                    <label style={labelStyle}>Start date</label>
                    <input
                      required
                      type="datetime-local"
                      style={inputStyle('startDate')}
                      value={newElection.startDate}
                      onChange={(e) => setNewElection({ ...newElection, startDate: e.target.value })}
                      onFocus={() => setFocusedField('startDate')}
                      onBlur={() => setFocusedField(null)}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>End date</label>
                    <input
                      required
                      type="datetime-local"
                      style={inputStyle('endDate')}
                      value={newElection.endDate}
                      onChange={(e) => setNewElection({ ...newElection, endDate: e.target.value })}
                      onFocus={() => setFocusedField('endDate')}
                      onBlur={() => setFocusedField(null)}
                    />
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>
                    Districts{' '}
                    <span style={{ textTransform: 'none', fontWeight: 400, color: '#5f5e7a' }}>
                      — comma separated
                    </span>
                  </label>
                  <input
                    required
                    type="text"
                    placeholder="Barcelona, Amman"
                    style={inputStyle('districts')}
                    value={newElection.electoralDistricts}
                    onChange={(e) =>
                      setNewElection({ ...newElection, electoralDistricts: e.target.value })
                    }
                    onFocus={() => setFocusedField('districts')}
                    onBlur={() => setFocusedField(null)}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Candidates Min 2, Max 5</label>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {newElection.candidates.map((name, index) => (
                      <div key={index} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input
                          required
                          type="text"
                          placeholder={`Candidate ${index + 1} Name`}
                          style={inputStyle(`candidate-${index}`)}
                          value={name}
                          onChange={(e) => handleCandidateChange(index, e.target.value)}
                          onFocus={() => setFocusedField(`candidate-${index}`)}
                          onBlur={() => setFocusedField(null)}
                        />

                        {newElection.candidates.length > 2 && (
                          <button
                            type="button"
                            onClick={() => removeCandidateField(index)}
                            style={{
                              background: 'rgba(255,59,48,0.1)',
                              color: '#ff3b30',
                              border: 'none',
                              borderRadius: '6px',
                              padding: '8px',
                              cursor: 'pointer',
                            }}
                          >
                            <XCircle size={16} />
                          </button>
                        )}
                      </div>
                    ))}

                    {newElection.candidates.length < 5 && (
                      <button
                        type="button"
                        onClick={addCandidateField}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          background: 'rgba(127,119,221,0.1)',
                          color: '#7F77DD',
                          border: '0.5px dashed #7F77DD',
                          borderRadius: '8px',
                          padding: '8px',
                          fontSize: '12px',
                          fontWeight: 500,
                          cursor: 'pointer',
                          marginTop: '4px',
                        }}
                      >
                        <Plus size={14} />
                        Add Candidate
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div
                style={{
                  padding: '16px 28px 22px',
                  borderTop: '0.5px solid rgba(255,255,255,0.07)',
                  display: 'flex',
                  gap: '10px',
                  justifyContent: 'flex-end',
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={{
                    padding: '9px 18px',
                    fontSize: '13px',
                    fontWeight: 500,
                    borderRadius: '8px',
                    border: '0.5px solid rgba(255,255,255,0.1)',
                    background: 'transparent',
                    color: '#8b8aab',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    padding: '9px 20px',
                    fontSize: '13px',
                    fontWeight: 500,
                    borderRadius: '8px',
                    border: 'none',
                    background: loading ? '#3a3380' : '#534AB7',
                    color: '#fff',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontFamily: 'inherit',
                    opacity: loading ? 0.7 : 1,
                  }}
                >
                  <Plus size={14} />
                  {loading ? 'Creating...' : 'Create election'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showResultsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">
                Results: {electionResultsObject?.title || 'Election Results'}
              </h3>

              <button
                type="button"
                onClick={() => {
                  setShowResultsModal(false);
                  setSelectedElectionResults(null);
                  setSelectedElectionRow(null);
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <XCircle size={24} />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="bg-blue-50 p-4 rounded-lg text-center">
                <div className="text-sm text-blue-600 font-semibold mb-1">Total Votes</div>
                <div className="text-2xl font-bold text-blue-800">{totalVotes}</div>
              </div>

              <div className="bg-green-50 p-4 rounded-lg text-center">
                <div className="text-sm text-green-600 font-semibold mb-1">Valid Votes</div>
                <div className="text-2xl font-bold text-green-800">{validVotes}</div>
              </div>

              <div className="bg-red-50 p-4 rounded-lg text-center">
                <div className="text-sm text-red-600 font-semibold mb-1">Invalid Votes</div>
                <div className="text-2xl font-bold text-red-800">{invalidVotes}</div>
              </div>
            </div>

            <h4 className="font-bold text-lg mb-4 border-b pb-2">Candidate Standings</h4>

            {electionResultsArray.length > 0 ? (
              <div className="space-y-4">
                {[...electionResultsArray]
                  .sort((a, b) => (b?.votes || 0) - (a?.votes || 0))
                  .map((result, idx) => {
                    const percentage =
                      validVotes > 0
                        ? (((result?.votes || 0) / validVotes) * 100).toFixed(1)
                        : '0';

                    return (
                      <div
                        key={result?._id || idx}
                        className="bg-gray-50 p-4 rounded-lg border flex justify-between items-center"
                      >
                        <div>
                          <div className="font-semibold text-lg">
                            {result?.candidate?.firstName || 'Unknown'}{' '}
                            {result?.candidate?.lastName || 'Candidate'}
                          </div>
                          <div className="text-sm text-gray-500">
                            {result?.candidate?.party || 'Independent'}
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-xl font-bold text-[#5c6bc0]">
                            {result?.votes || 0} Votes
                          </div>
                          <div className="text-sm text-gray-500">{percentage}%</div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            ) : (
              <div className="text-center text-gray-500 py-8">
                No results data available yet.
              </div>
            )}
          </div>
        </div>
      )}

      <div className="dashboard-header">
        <div className="header-content">
          <div className="user-info">
            <Shield className="user-icon" size={32} />
            <div>
              <h2>{user?.name || user?.firstName || 'Administrator'}</h2>
              <p>Administrator Dashboard</p>
            </div>
          </div>

          <button type="button" onClick={handleLogout} className="logout-btn">
            <LogOut size={20} />
            Logout
          </button>
        </div>
      </div>

      <div className="dashboard-nav">
        <button
          type="button"
          className={`nav-btn ${activeTab === 'elections' ? 'active' : ''}`}
          onClick={() => setActiveTab('elections')}
        >
          <Vote size={20} /> Elections
        </button>

        <button
          type="button"
          className={`nav-btn ${activeTab === 'candidates' ? 'active' : ''}`}
          onClick={() => setActiveTab('candidates')}
        >
          <Users size={20} /> Candidates
        </button>

        <button
          type="button"
          className={`nav-btn ${activeTab === 'voters' ? 'active' : ''}`}
          onClick={() => setActiveTab('voters')}
        >
          <FileText size={20} /> Voter Registry
        </button>
      </div>

      <div className="dashboard-content">
        {error && <div className="error-banner">{error}</div>}
        {success && <div className="success-banner">{success}</div>}

        {activeTab === 'elections' && (
          <div className="elections-section">
            <div className="section-header">
              <h2>Election Management</h2>

              <button type="button" className="action-btn" onClick={() => setShowCreateModal(true)}>
                <Plus size={20} />
                Create Election
              </button>
            </div>

            {loading ? (
              <div className="loading">Loading elections...</div>
            ) : elections.length === 0 ? (
              <div className="empty-state">
                <Vote size={48} />
                <p>No elections found</p>
              </div>
            ) : (
              <div className="elections-table">
                <table>
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Start Date</th>
                      <th>End Date</th>
                      <th>Total Votes</th>
                      <th>Valid/Invalid</th>
                      <th>Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {elections.map((election) => (
                      <tr key={election?._id || Math.random()}>
                        <td>{election?.title || 'Untitled Election'}</td>
                        <td>{election?.type || 'N/A'}</td>
                        <td>
                          <span className={`status-badge ${election?.status || ''}`}>
                            {election?.status || 'unknown'}
                          </span>
                        </td>
                        <td>
                          {election?.startDate
                            ? new Date(election.startDate).toLocaleDateString()
                            : 'N/A'}
                        </td>
                        <td>
                          {election?.endDate
                            ? new Date(election.endDate).toLocaleDateString()
                            : 'N/A'}
                        </td>
                        <td>{election?.totalVotes || 0}</td>
                        <td>
                          <span className="text-green-600 font-medium">
                            {election?.validVotes || 0}
                          </span>
                          <span className="text-gray-400 mx-1">/</span>
                          <span className="text-red-600 font-medium">
                            {election?.invalidVotes || 0}
                          </span>
                        </td>

                        <td className="actions-cell">
                          {election?.status === 'draft' && (
                            <button
                              type="button"
                              onClick={() => handleElectionAction(election._id, 'start')}
                              className="icon-btn start"
                              title="Start Election"
                            >
                              <Play size={18} />
                            </button>
                          )}

                          {election?.status === 'active' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleElectionAction(election._id, 'pause')}
                                className="icon-btn pause"
                                title="Pause Election"
                              >
                                <Pause size={18} />
                              </button>

                              <button
                                type="button"
                                onClick={() => handleElectionAction(election._id, 'end')}
                                className="icon-btn end"
                                title="End Election"
                              >
                                <Square size={18} />
                              </button>
                            </>
                          )}

                          {election?.status === 'paused' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleElectionAction(election._id, 'start')}
                                className="icon-btn start"
                                title="Resume Election"
                              >
                                <Play size={18} />
                              </button>

                              <button
                                type="button"
                                onClick={() => handleElectionAction(election._id, 'end')}
                                className="icon-btn end"
                                title="End Election"
                              >
                                <Square size={18} />
                              </button>
                            </>
                          )}

                          {election?._id && (
                            <button
                              type="button"
                              onClick={() => loadElectionResults(election)}
                              className="icon-btn text-blue-600 hover:text-blue-800"
                              title="View Results"
                            >
                              <FileText size={18} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'candidates' && (
          <div className="candidates-section">
            <div className="section-header">
              <h2>Candidate Management</h2>

              <button type="button" className="action-btn">
                <Plus size={20} />
                Add Candidate
              </button>
            </div>

            {loading ? (
              <div className="loading">Loading candidates...</div>
            ) : candidates.length === 0 ? (
              <div className="empty-state">
                <Users size={48} />
                <p>No candidates found</p>
              </div>
            ) : (
              <div className="candidates-table">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Party</th>
                      <th>Position</th>
                      <th>District</th>
                      <th>Election</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {candidates.map((candidate) => (
                      <tr key={candidate?._id || Math.random()}>
                        <td>
                          {candidate?.firstName || 'Unknown'} {candidate?.lastName || 'Candidate'}
                        </td>
                        <td>{candidate?.party || 'N/A'}</td>
                        <td>{candidate?.position || 'N/A'}</td>
                        <td>{candidate?.electoralDistrict || 'N/A'}</td>
                        <td>{formatElectionNames(candidate)}</td>
                        <td>
                          <span className={`status-badge ${candidate?.status || ''}`}>
                            {candidate?.status || 'unknown'}
                          </span>
                        </td>
                        <td className="actions-cell">
                          {candidate?.status === 'pending' && (
                            <>
                              <button type="button" className="icon-btn approve" title="Approve">
                                <CheckCircle size={18} />
                              </button>

                              <button type="button" className="icon-btn reject" title="Reject">
                                <XCircle size={18} />
                              </button>
                            </>
                          )}

                          <button type="button" className="icon-btn edit" title="Edit">
                            <Settings size={18} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'voters' && (
          <div className="voters-section">
            <div className="section-header">
              <h2>Voter Registry</h2>

              <button type="button" className="action-btn">
                <Plus size={20} />
                Upload Voter List
              </button>
            </div>

            {loading ? (
              <div className="loading">Loading voters...</div>
            ) : voters.length === 0 ? (
              <div className="empty-state">
                <FileText size={48} />
                <p>No voters found</p>
              </div>
            ) : (
              <div className="voters-table">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>National ID</th>
                      <th>Email</th>
                      <th>District</th>
                      <th>Verified</th>
                      <th>Whitelisted</th>
                      <th>Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {voters.slice(0, 20).map((voter) => (
                      <tr key={voter?._id || Math.random()}>
                        <td>
                          {voter?.firstName || 'Unknown'} {voter?.lastName || 'Voter'}
                        </td>
                        <td>{voter?.nationalId || 'N/A'}</td>
                        <td>{voter?.email || 'N/A'}</td>
                        <td>{voter?.electoralDistrict || 'N/A'}</td>
                        <td>
                          {voter?.isVerified ? (
                            <CheckCircle className="status-icon success" size={18} />
                          ) : (
                            <XCircle className="status-icon error" size={18} />
                          )}
                        </td>
                        <td>
                          {voter?.isWhitelisted ? (
                            <CheckCircle className="status-icon success" size={18} />
                          ) : (
                            <XCircle className="status-icon error" size={18} />
                          )}
                        </td>
                        <td className="actions-cell">
                          <button type="button" className="icon-btn" title="View Details">
                            <Settings size={18} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}