import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { ProfileProvider } from './contexts/ProfileContext'
import { TransactionModalProvider, useTransactionModal } from './contexts/TransactionModalContext'
import AppLayout from './components/AppLayout'
import TransactionForm from './components/TransactionForm'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Transactions from './pages/Transactions'
import Recurrences from './pages/Recurrences'
import Accounts from './pages/Accounts'
import Categories from './pages/Categories'
import SettingsPage from './pages/SettingsPage'
import MercadoPage from './pages/MercadoPage'
import BulkImport from './pages/BulkImport'

function GlobalTransactionModal() {
  const { open, transaction, close, notifySaved } = useTransactionModal()
  if (!open) return null
  return (
    <TransactionForm
      transaction={transaction}
      onClose={close}
      onSaved={() => { notifySaved(); close() }}
    />
  )
}

function PrivateArea() {
  const { user, loading } = useAuth()

  if (loading) {
    return <div className="full-page-loading">Carregando…</div>
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return (
    <ProfileProvider>
      <TransactionModalProvider>
        <AppLayout />
        <GlobalTransactionModal />
      </TransactionModalProvider>
    </ProfileProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<PrivateArea />}>
              <Route index element={<Dashboard />} />
              <Route path="lancamentos" element={<Transactions />} />
              <Route path="recorrencias" element={<Recurrences />} />
              <Route path="contas" element={<Accounts />} />
              <Route path="categorias" element={<Categories />} />
              <Route path="perfis" element={<Navigate to="/configuracoes" replace />} />
              <Route path="acessos" element={<Navigate to="/configuracoes" replace />} />
              <Route path="configuracoes" element={<SettingsPage />} />
              <Route path="mercado" element={<MercadoPage />} />
              <Route path="importar-lancamentos" element={<BulkImport />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ThemeProvider>
    </AuthProvider>
  )
}
