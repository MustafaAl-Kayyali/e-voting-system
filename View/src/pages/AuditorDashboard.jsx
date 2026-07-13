import { useState } from 'react';
import { useAuth } from '../context/authContext.jsx';
import { useNavigate } from 'react-router-dom';
import api from '../api/api';
import { Shield, LogOut, FileText, Activity, BarChart3, CheckCircle, AlertTriangle, Download } from 'lucide-react';

export default function AuditorDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('integrity');
  const [auditLogs, setAuditLogs] = useState([]);
  const [voterActivity, setVoterActivity] = useState(null);
  const [systemMetrics, setSystemMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadAuditLogs = async () => {
    try {
      setLoading(true);
      const response = await api.get('/audit/logs');
      setAuditLogs(response.data.data.logs);
    } catch (err) {
      setError('Failed to load audit logs');
      console.error('Error loading audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadVoterActivity = async () => {
    try {
      setLoading(true);
      const response = await api.get('/audit/analytics/voter-activity');
      setVoterActivity(response.data.data.analysis);
    } catch (err) {
      setError('Failed to load voter activity');
      console.error('Error loading voter activity:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadSystemMetrics = async () => {
    try {
      setLoading(true);
      const response = await api.get('/audit/metrics/system-performance');
      setSystemMetrics(response.data.data.metrics);
    } catch (err) {
      setError('Failed to load system metrics');
      console.error('Error loading system metrics:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const generateReport = async (reportType) => {
    try {
      setLoading(true);
      const response = await api.post('/audit/reports/generate', { reportType });
      const blob = new Blob([JSON.stringify(response.data.data.report, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-report-${reportType}-${new Date().toISOString()}.json`;
      a.click();
    } catch (err) {
      setError('Failed to generate report');
      console.error('Error generating report:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dashboard auditor-dashboard">
      <div className="dashboard-header">
        <div className="header-content">
          <div className="user-info">
            <Shield className="user-icon" size={32} />
            <div>
              <h2>{user?.firstName} {user?.lastName}</h2>
              <p>Auditor Dashboard</p>
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
          className={`nav-btn ${activeTab === 'integrity' ? 'active' : ''}`}
          onClick={() => setActiveTab('integrity')}
        >
          <CheckCircle size={20} />
          Integrity
        </button>
        <button
          className={`nav-btn ${activeTab === 'logs' ? 'active' : ''}`}
          onClick={() => { setActiveTab('logs'); loadAuditLogs(); }}
        >
          <FileText size={20} />
          System Logs
        </button>
        <button
          className={`nav-btn ${activeTab === 'activity' ? 'active' : ''}`}
          onClick={() => { setActiveTab('activity'); loadVoterActivity(); }}
        >
          <Activity size={20} />
          Voter Activity
        </button>
        <button
          className={`nav-btn ${activeTab === 'metrics' ? 'active' : ''}`}
          onClick={() => { setActiveTab('metrics'); loadSystemMetrics(); }}
        >
          <BarChart3 size={20} />
          System Metrics
        </button>
      </div>

      <div className="dashboard-content">
        {error && <div className="error-banner">{error}</div>}

        {activeTab === 'integrity' && (
          <div className="integrity-section">
            <h2>Distributed Register Integrity Verification</h2>
            <div className="integrity-cards">
              <div className="integrity-card">
                <CheckCircle size={48} />
                <h3>Verify Election Integrity</h3>
                <p>Cryptographically confirm the integrity of all distributed blocks</p>
                <button className="action-btn">
                  Select Election to Verify
                </button>
              </div>
              <div className="integrity-card">
                <AlertTriangle size={48} />
                <h3>Blockchain Verification</h3>
                <p>Verify blockchain hash integrity for all votes</p>
                <button className="action-btn">
                  Run Full Verification
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="logs-section">
            <div className="section-header">
              <h2>System Audit Logs</h2>
              <button
                onClick={() => generateReport('system_audit')}
                className="action-btn"
              >
                <Download size={20} />
                Generate Report
              </button>
            </div>
            {loading ? (
              <div className="loading">Loading audit logs...</div>
            ) : auditLogs.length === 0 ? (
              <div className="empty-state">
                <FileText size={48} />
                <p>No audit logs found</p>
              </div>
            ) : (
              <div className="logs-table">
                <table>
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Event Type</th>
                      <th>Action</th>
                      <th>Description</th>
                      <th>Severity</th>
                      <th>Success</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.slice(0, 50).map((log) => (
                      <tr key={log.id}>
                        <td>{new Date(log.timestamp).toLocaleString()}</td>
                        <td>{log.eventType}</td>
                        <td>{log.action}</td>
                        <td>{log.description}</td>
                        <td>
                          <span className={`severity-badge ${log.severity}`}>
                            {log.severity}
                          </span>
                        </td>
                        <td>
                          {log.success ? (
                            <CheckCircle className="status-icon success" size={18} />
                          ) : (
                            <AlertTriangle className="status-icon error" size={18} />
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

        {activeTab === 'activity' && (
          <div className="activity-section">
            <div className="section-header">
              <h2>Voter Activity Analysis</h2>
              <button
                onClick={() => generateReport('election_audit')}
                className="action-btn"
              >
                <Download size={20} />
                Generate Report
              </button>
            </div>
            {loading ? (
              <div className="loading">Loading voter activity...</div>
            ) : voterActivity ? (
              <div className="activity-stats">
                <div className="stat-card">
                  <Activity size={32} />
                  <h3>Total Votes</h3>
                  <p className="stat-value">{voterActivity.totalVotes}</p>
                </div>
                <div className="stat-card">
                  <BarChart3 size={32} />
                  <h3>Peak Voting Time</h3>
                  <p className="stat-value">
                    {voterActivity.peakVotingTime ? 
                      `${voterActivity.peakVotingTime.hour}:00` : 'N/A'}
                  </p>
                </div>
                <div className="stat-card">
                  <CheckCircle size={32} />
                  <h3>Peak Voting Day</h3>
                  <p className="stat-value">
                    {voterActivity.peakVotingDay ? 
                      voterActivity.peakVotingDay.date : 'N/A'}
                  </p>
                </div>
                <div className="stat-card">
                  <Activity size={32} />
                  <h3>Avg Votes/Hour</h3>
                  <p className="stat-value">
                    {voterActivity.averageVotesPerHour.toFixed(2)}
                  </p>
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <Activity size={48} />
                <p>No voter activity data available</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'metrics' && (
          <div className="metrics-section">
            <div className="section-header">
              <h2>System Performance Metrics</h2>
            </div>
            {loading ? (
              <div className="loading">Loading system metrics...</div>
            ) : systemMetrics ? (
              <div className="metrics-stats">
                <div className="stat-card">
                  <Activity size={32} />
                  <h3>Total Events</h3>
                  <p className="stat-value">{systemMetrics.eventMetrics.totalEvents}</p>
                </div>
                <div className="stat-card">
                  <AlertTriangle size={32} />
                  <h3>Error Rate</h3>
                  <p className="stat-value">{systemMetrics.eventMetrics.errorRate.toFixed(2)}%</p>
                </div>
                <div className="stat-card">
                  <Shield size={32} />
                  <h3>Security Events</h3>
                  <p className="stat-value">{systemMetrics.eventMetrics.securityEvents}</p>
                </div>
                <div className="stat-card">
                  <CheckCircle size={32} />
                  <h3>System Health</h3>
                  <p className={`stat-value ${systemMetrics.systemHealth.status}`}>
                    {systemMetrics.systemHealth.status}
                  </p>
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <BarChart3 size={48} />
                <p>No system metrics available</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
