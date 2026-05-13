import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { LogIn, ArrowRight, User, Lock } from 'lucide-react';
import { Navigate } from 'react-router-dom';

const Login = () => {
  const { user, login, loginWithCredentials, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  if (loading) return null;
  if (user) return <Navigate to="/" />;

  const handleCredentialsLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await loginWithCredentials(email, password);
    } catch (err) {
      setError('Invalid credentials. Try admin/admin');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 pt-20">
      <div className="max-w-md w-full bg-white rounded-[2.5rem] shadow-2xl p-10 text-center border border-gray-100">
        <div className="w-16 h-16 bg-[#4CAF50] rounded-2xl flex items-center justify-center text-white font-black text-3xl mx-auto mb-6 shadow-xl shadow-[#4CAF50]/20">
          C
        </div>
        <h1 className="text-3xl font-black text-gray-900 mb-2 tracking-tight">Welcome Back</h1>
        <p className="text-gray-500 font-medium mb-8 text-sm">Sign in with admin/admin for the Admin Hub.</p>

        <form onSubmit={handleCredentialsLogin} className="space-y-4 mb-8">
          <div className="relative">
            <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full pl-12 pr-4 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-2 focus:ring-catchy/20 focus:border-catchy outline-none transition-all"
            />
          </div>
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full pl-12 pr-4 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-2 focus:ring-catchy/20 focus:border-catchy outline-none transition-all"
            />
          </div>
          {error && <p className="text-red-500 text-xs font-bold">{error}</p>}
          <button
            type="submit"
            className="w-full bg-catchy text-white py-4 rounded-2xl font-black hover:bg-catchy-dark transition-all transform hover:scale-[1.02] shadow-lg shadow-catchy/20"
          >
            Sign In
          </button>
        </form>

        <div className="relative mb-8">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-100"></div></div>
          <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-2 text-gray-400 font-bold">Or continue with</span></div>
        </div>

        <button
          onClick={login}
          className="w-full bg-white border border-gray-100 text-gray-900 py-4 rounded-2xl font-black flex items-center justify-center gap-4 hover:bg-gray-50 transition-all transform hover:scale-[1.02] shadow-sm"
        >
          <LogIn size={20} />
          Sign in with Google
        </button>
      </div>
    </div>
  );
};

export default Login;
