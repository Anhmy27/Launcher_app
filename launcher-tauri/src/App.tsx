import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { LocaleProvider, useLocale } from "./context/LocaleContext";
import Login from "./pages/Login";
import Layout from "./components/Layout";

function AppContent() {
  const { isAuthenticated, loading } = useAuth();
  const { t } = useLocale();

  if (loading) {
    return (
      <div className="page-loading" style={{ height: "100vh" }}>
        <div className="spinner" />
        <p>{t.loading}</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  return <Layout />;
}

function App() {
  return (
    <ThemeProvider>
      <LocaleProvider>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </LocaleProvider>
    </ThemeProvider>
  );
}

export default App;
