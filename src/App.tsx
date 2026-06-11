import React from 'react';
import { Loader2 } from 'lucide-react';
import { Toaster } from 'sonner';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import './lib/heroSlidesCache';
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
import AdminHeroVideo from './pages/AdminHeroVideo';
import AdminCategoryTiles from './pages/AdminCategoryTiles';
import AdminCustomers from './pages/AdminCustomers';
import AdminOrders from './pages/AdminOrders';
import AdminWhatsApp from './pages/AdminWhatsApp';
import AdminLayout from './components/AdminLayout';
import Login from './pages/Login';
import Cart from './pages/Cart';
import Orders from './pages/Orders';
import OrderDetail from './pages/OrderDetail';
import OrderConfirmation from './pages/OrderConfirmation';
import CartDrawer from './components/CartDrawer';
import Footer from './components/Footer';
import BottomNav from './components/BottomNav';

const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, role, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50/50">
        <Loader2 className="h-7 w-7 animate-spin text-gray-400" aria-label="Loading" />
      </div>
    );
  }
  if (!user || role !== 'admin') return <Navigate to="/login" replace />;
  return <AdminLayout>{children}</AdminLayout>;
};

const AppContent = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <Routes>
        {/* Admin Routes */}
        <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
        <Route path="/admin/hero" element={<AdminRoute><AdminHero /></AdminRoute>} />
        <Route path="/admin/hero-video" element={<AdminRoute><AdminHeroVideo /></AdminRoute>} />
        <Route path="/admin/category-tiles" element={<AdminRoute><AdminCategoryTiles /></AdminRoute>} />
        <Route path="/admin/products" element={<AdminRoute><AdminProducts /></AdminRoute>} />
        <Route path="/admin/stock" element={<AdminRoute><AdminStock /></AdminRoute>} />
        <Route path="/admin/orders" element={<AdminRoute><AdminOrders /></AdminRoute>} />
        <Route path="/admin/customers" element={<AdminRoute><AdminCustomers /></AdminRoute>} />
        <Route path="/admin/whatsapp" element={<AdminRoute><AdminWhatsApp /></AdminRoute>} />
        <Route path="/admin/settings" element={<AdminRoute><div className="p-10 text-center">Settings Coming Soon</div></AdminRoute>} />

        {/* Public Routes */}
        <Route path="*" element={
          <>
            <Navbar />
            <main className="flex min-h-0 flex-1 flex-col">
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/catalog" element={<Catalog />} />
                <Route path="/product/:id" element={<ProductDetail />} />
                <Route path="/login" element={<Login />} />
                <Route path="/cart" element={<Cart />} />
                <Route path="/orders" element={<Orders />} />
                <Route path="/orders/confirmation/:orderId" element={<OrderConfirmation />} />
                <Route path="/orders/:orderId" element={<OrderDetail />} />
                <Route path="*" element={<Navigate to="/" />} />
              </Routes>
            </main>
            <Footer />
            <CartDrawer />
            <BottomNav />
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
            <Toaster
              position="top-center"
              richColors
              closeButton
              offset="5rem"
              visibleToasts={4}
              expand
              toastOptions={{
                classNames: {
                  toast: 'w-[min(100vw-2rem,26rem)] max-w-[min(100vw-2rem,26rem)]',
                  description: 'whitespace-pre-wrap break-words text-left leading-snug',
                },
              }}
            />
            <AppContent />
          </Router>
        </CartProvider>
      </LanguageProvider>
    </AuthProvider>
  );
}
