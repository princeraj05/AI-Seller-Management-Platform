import React from 'react';
import { createBrowserRouter } from 'react-router-dom';

import DashboardLayout from '../layouts/DashboardLayout';
import Login from '../pages/auth/Login';
import Onboarding from '../pages/auth/Onboarding';
import Dashboard from '../pages/dashboard/Dashboard';

import ProductCatalog from '../pages/products/ProductCatalog';
import AddProduct from '../pages/products/AddProduct';
import ProductDetails from '../pages/products/ProductDetails';
import EditProduct from '../pages/products/EditProduct';
import Variants from '../pages/products/Variants';
import Categories from '../pages/products/Categories';

import AIStudioOverview from '../pages/ai/AIStudioOverview';

import AllChannels from '../pages/marketplaces/AllChannels';
import AmazonChannel from '../pages/marketplaces/AmazonChannel';
import FlipkartChannel from '../pages/marketplaces/FlipkartChannel';
import MyntraChannel from '../pages/marketplaces/MyntraChannel';
import WebsiteChannel from '../pages/marketplaces/WebsiteChannel';
import POSChannel from '../pages/marketplaces/POSChannel';

import OrdersList from '../pages/orders/OrdersList';
import MyBillPOS from '../pages/pos/MyBillPOS';
import InventoryLedger from '../pages/inventory/InventoryLedger';
import PriceManagement from '../pages/pricing/PriceManagement';
import ReturnsList from '../pages/returns/ReturnsList';
import CustomersList from '../pages/customers/CustomersList';
import TrendsDashboard from '../pages/trends/TrendsDashboard';
import AnalyticsDashboard from '../pages/analytics/AnalyticsDashboard';
import SyncCenter from '../pages/sync/SyncCenter';
import NotificationsPage from '../pages/notifications/NotificationsPage';
import SettingsPage from '../pages/settings/SettingsPage';
import HelpSupport from '../pages/help/HelpSupport';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <Login />,
  },
  {
    path: '/onboarding',
    element: <Onboarding />,
  },
  {
    path: '/',
    element: <DashboardLayout />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'products', element: <ProductCatalog /> },
      { path: 'products/new', element: <AddProduct /> },
      { path: 'products/variants', element: <Variants /> },
      { path: 'products/categories', element: <Categories /> },
      { path: 'products/:id', element: <ProductDetails /> },
      { path: 'products/:id/edit', element: <EditProduct /> },

      { path: 'ai-studio', element: <AIStudioOverview /> },

      { path: 'channels', element: <AllChannels /> },
      { path: 'channels/amazon', element: <AmazonChannel /> },
      { path: 'channels/flipkart', element: <FlipkartChannel /> },
      { path: 'channels/myntra', element: <MyntraChannel /> },
      { path: 'channels/website', element: <WebsiteChannel /> },
      { path: 'channels/pos', element: <POSChannel /> },

      { path: 'orders', element: <OrdersList /> },
      { path: 'pos/billing', element: <MyBillPOS /> },
      { path: 'inventory', element: <InventoryLedger /> },
      { path: 'pricing', element: <PriceManagement /> },
      { path: 'returns', element: <ReturnsList /> },
      { path: 'customers', element: <CustomersList /> },
      { path: 'trends', element: <TrendsDashboard /> },
      { path: 'analytics', element: <AnalyticsDashboard /> },
      { path: 'sync-center', element: <SyncCenter /> },
      { path: 'notifications', element: <NotificationsPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'help', element: <HelpSupport /> },
    ],
  },
]);
