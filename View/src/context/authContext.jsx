import { createContext, useContext, useState } from 'react';
import api from '../api/api';

export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    return token && savedUser ? JSON.parse(savedUser) : null;
  });
  const loading = false;
  const [userType, setUserType] = useState(() => {
    return localStorage.getItem('userType');
  });

  const login = async (loginId, password, twoFactorToken = null, type = 'voter') => {
    try {
      const isAdmin = type === 'admin';
      const endpoint = isAdmin ? '/auth/login/admin' : '/auth/login/voter';

      const payload = isAdmin
        ? {
            identifier: String(loginId).trim(),
            password,
            ...(twoFactorToken ? { twoFactorToken } : {})
          }
        : {
            nationalId: String(loginId).trim(),
            password,
            ...(twoFactorToken ? { twoFactorToken } : {})
          };

      const response = await api.post(endpoint, payload);

      const { data } = response.data;

      if (data?.requiresTwoFactor || response.data.requiresTwoFactor) {
        return { success: true, data: { requiresTwoFactor: true } };
      }

      const token = data?.token;
      const profile = isAdmin ? data?.admin : data?.voter;

      if (!token || !profile) {
        return { success: false, error: 'Invalid login response from server' };
      }

      const userData = {
        ...profile,
        id: profile.id,
        role: profile.role || (isAdmin ? 'admin' : 'voter')
      };

      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(userData));
      localStorage.setItem('userType', userData.role);

      setUser(userData);
      setUserType(userData.role);

      return { success: true, data: userData };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || 'Login failed'
      };
    }
  };

  const signup = async (userData, type = 'voter') => {
    try {
      if (type === 'voter') {
        const response = await api.post('/auth/signup/voter', {
          nationalId: userData.nationalId || userData.id,
          id: userData.nationalId || userData.id,
          firstName: userData.firstName,
          lastName: userData.lastName,
          email: userData.email,
          phoneNumber: userData.phoneNumber,
          dateOfBirth: userData.dateOfBirth,
          electoralDistrict: userData.electoralDistrict,
          password: userData.password
        });

        const token = response.data.data?.token;
        const voter = response.data.data?.voter;

        if (!token || !voter) {
          return { success: false, error: 'Invalid signup response from server' };
        }

        const userObj = { ...voter, role: 'voter' };
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(userObj));
        localStorage.setItem('userType', 'voter');
        setUser(userObj);
        setUserType('voter');
        return { success: true, data: userObj };
      }

      const response = await api.post('/users/signup', {
        Id: Number(userData.nationalId),
        name: `${userData.firstName} ${userData.lastName}`.trim(),
        email: userData.email,
        phone: Number(userData.phoneNumber),
        DOB: userData.dateOfBirth,
        electoralDistrict: userData.electoralDistrict,
        password: userData.password,
        confirmPassword: userData.password,
        role: type
      });

      const { token } = response.data;
      const userObj = response.data[type] || response.data.voter || response.data.admin;

      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(userObj));
      localStorage.setItem('userType', type);
      setUser(userObj);
      setUserType(type);
      return { success: true, data: userObj };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || 'Signup failed'
      };
    }
  };

  const signupAdmin = async (adminData) => {
    try {
      const response = await api.post('/auth/signup/admin', adminData);
      const token = response.data.data?.token;
      const adminObj = response.data.data?.admin;

      if (!token || !adminObj) {
        return { success: false, error: 'Invalid admin signup response from server' };
      }

      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(adminObj));
      localStorage.setItem('userType', adminObj.role);

      setUser(adminObj);
      setUserType(adminObj.role);

      return { success: true, data: adminObj };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || 'Admin signup failed'
      };
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('userType');
    setUser(null);
    setUserType(null);
  };

  const value = {
    user,
    userType,
    loading,
    login,
    signup,
    signupAdmin,
    logout,
    isAuthenticated: !!user
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
