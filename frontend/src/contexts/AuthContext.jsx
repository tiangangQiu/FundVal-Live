import React, { createContext, useContext, useState, useEffect } from 'react';
import { login as apiLogin, logout as apiLogout } from '../api/auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [isMultiUserMode, setIsMultiUserMode] = useState(false);
  const [loading, setLoading] = useState(true);

  // 鉴权已关闭：始终视为单用户模式，不要求登录，直接进入主界面
  const checkAuth = async () => {
    setIsMultiUserMode(false);
    setCurrentUser(null);
    setLoading(false);
  };

  // 登录
  const login = async (username, password) => {
    const user = await apiLogin(username, password);
    setCurrentUser(user);
    return user;
  };

  // 登出
  const logout = async () => {
    await apiLogout();
    setCurrentUser(null);
  };

  // 初始化时检查认证状态
  useEffect(() => {
    checkAuth();
  }, []);

  const value = {
    currentUser,
    isAdmin: currentUser?.is_admin || false,
    isMultiUserMode,
    loading,
    login,
    logout,
    checkAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
