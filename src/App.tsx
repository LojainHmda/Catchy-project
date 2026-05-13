import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { LanguageProvider, useLanguage } from './context/LanguageContext';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Catalog from './pages/Catalog';
import ProductDetail from './pages/ProductDetail';
import AdminDashboard from './pages/AdminDashboard';
import AdminProducts from './pages/AdminProducts';
import AdminStock from './pages/AdminStock';
import AdminHero from './pages/AdminHero';
import AdminLayout from './components/AdminLayout';
import Login from './pages/Login';
import Cart from './pages/Cart';
import Footer from './components/Footer';

const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, role, loading } = useAuth();
  if (loading) return null;
  if (!user || role !== 'admin') return <Navigate to="/login" />;
  return <AdminLayout>{children}</AdminLayout>;
};

const AppContent = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <Routes>
        {/* Admin Routes */}
        <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
        <Route path="/admin/hero" element={<AdminRoute><AdminHero /></AdminRoute>} />
        <Route path="/admin/products" element={<AdminRoute><AdminProducts /></AdminRoute>} />
        <Route path="/admin/stock" element={<AdminRoute><AdminStock /></AdminRoute>} />
        <Route path="/admin/orders" element={<AdminRoute><div className="p-10 text-center">Orders Management Coming Soon</div></AdminRoute>} />
        <Route path="/admin/customers" element={<AdminRoute><div className="p-10 text-center">Customer Management Coming Soon</div></AdminRoute>} />
        <Route path="/admin/settings" element={<AdminRoute><div className="p-10 text-center">Settings Coming Soon</div></AdminRoute>} />

        {/* Public Routes */}
        <Route path="*" element={
          <>
            <Navbar />
            <main className="flex-1">
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/catalog" element={<Catalog />} />
                <Route path="/product/:id" element={<ProductDetail />} />
                <Route path="/login" element={<Login />} />
                <Route path="/cart" element={<Cart />} />
                <Route path="*" element={<Navigate to="/" />} />
              </Routes>
            </main>
            <Footer />
          </>
        } />
      </Routes>
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <LanguageProvider>
        <CartProvider>
          <Router>
            <AppContent />
          </Router>
        </CartProvider>
      </LanguageProvider>
    </AuthProvider>
  );
}
