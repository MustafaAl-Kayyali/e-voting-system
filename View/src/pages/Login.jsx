import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/authContext.jsx';
import { Lock, User, Shield } from 'lucide-react';

export default function Login() {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorToken, setTwoFactorToken] = useState('');
  const [userType, setUserType] = useState('voter');
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(loginId, password, twoFactorToken, userType);

    if (result.success) {
      if (result.data?.requiresTwoFactor) {
        setRequiresTwoFactor(true);
        setError('Please enter your two-factor authentication code');
      } else {
        const role = result.data?.role || userType;
        const adminRoles = ['admin', 'super_admin', 'election_admin', 'voter_registry_admin'];
        const targetDashboard = adminRoles.includes(role) ? 'admin' : role;
        navigate(`/${targetDashboard}-dashboard`);
      }
    } else {
      setError(result.error);
    }

    setLoading(false);
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <User className="logo-icon" size={48} />
          <h1>Sign In</h1>
          <p>Sign in to your account to participate</p>
        </div>

        <div className="user-type-selector">
          <button
            type="button"
            className={`type-btn ${userType === 'voter' ? 'active' : ''}`}
            onClick={() => { setUserType('voter'); setLoginId(''); setError(''); }}
          >
            <User size={18} />
            Voter
          </button>
          <button
            type="button"
            className={`type-btn ${userType === 'admin' ? 'active' : ''}`}
            onClick={() => { setUserType('admin'); setLoginId(''); setError(''); }}
          >
            <Shield size={18} />
            Admin
          </button>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {error && <div className="error-message">{error}</div>}

          <div className="form-group">
            <label htmlFor="loginId">
              {userType === 'admin' ? 'Username or Email' : 'ID'}
            </label>
            <div className="input-wrapper">
              <User className="input-icon" size={20} />
              <input
                id="loginId"
                type="text"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                placeholder={
                  userType === 'admin'
                    ? 'Username or email address'
                    : 'Enter your ID from registration'
                }
                autoComplete="username"
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <div className="input-wrapper">
              <Lock className="input-icon" size={20} />
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </div>
          </div>

          {requiresTwoFactor && (
            <div className="form-group">
              <label htmlFor="twoFactorToken">2FA Code</label>
              <div className="input-wrapper">
                <Lock className="input-icon" size={20} style={{ color: '#667eea' }} />
                <input
                  id="twoFactorToken"
                  type="text"
                  value={twoFactorToken}
                  onChange={(e) => setTwoFactorToken(e.target.value)}
                  placeholder="000000"
                  maxLength={6}
                  autoComplete="one-time-code"
                  style={{ letterSpacing: '0.5em', textAlign: 'center', fontWeight: 'bold' }}
                  required
                />
              </div>
            </div>
          )}

          <button 
            type="submit" 
            className="login-btn"
            disabled={loading}
          >
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>

        <div className="login-footer">
          <p>Don't have an account?</p>
          <button 
            onClick={() => navigate(userType === 'voter' ? '/signup' : '/admin/signup')} 
            className="link-btn"
          >
            Sign up as {userType === 'voter' ? 'Voter' : 'Admin'}
          </button>
        </div>
      </div>
    </div>
  );
}
