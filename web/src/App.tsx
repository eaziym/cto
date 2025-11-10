import { Link, NavLink, Route, Routes } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Toaster } from 'react-hot-toast';
import AuthProvider from './components/AuthProvider';
import ProtectedRoute from './components/ProtectedRoute';
import LandingPage from './pages/Landing';
import LoginPage from './pages/Login';
import TermsOfService from './pages/TermsOfService';
import PrivacyPolicy from './pages/PrivacyPolicy';
import KnowledgeBasePage from './pages/KnowledgeBase';
import DashboardPage from './pages/Dashboard';
import JobsListPage from './pages/JobsList';
import JobDetailPage from './pages/JobDetail';
import ApplicationsPage from './pages/Applications';
import ProfileMenu from './components/ProfileMenu';
import UserMenu from './components/UserMenu';
import MobileProfileInfo from './components/MobileProfileInfo';
import { useAuthStore } from './store/auth';
import { useProfileStore } from './store/profile';

const navLinkClass = ({ isActive }: { isActive: boolean }): string =>
  [
    'px-3 py-2 rounded-md text-sm font-medium transition-colors',
    isActive ? 'bg-brand-100 text-brand-800' : 'text-slate-600 hover:bg-slate-100'
  ].join(' ');

const lockedNavLinkClass = (): string =>
  'px-3 py-2 rounded-md text-sm font-medium text-slate-300 cursor-not-allowed opacity-60 relative group';

export default function App(): JSX.Element {
  const { user } = useAuthStore();
  const profile = useProfileStore((state) => state.profile);
  const loadProfileFromDB = useProfileStore((state) => state.loadProfileFromDB);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  useEffect(() => {
    // Load profile from DB when user logs in
    if (user) {
      loadProfileFromDB().catch((err) => console.warn('Failed to load profile on init', err));
    }
  }, [user, loadProfileFromDB]);
  // Check if profile is activated (saved to DB with resume)
  // Must have a real ID (not 'local-user') and skills
  const isProfileActivated = !!(
    profile && 
    profile.id && 
    profile.id !== 'local-user' && 
    profile.skills && 
    profile.skills.length > 0
  );

  return (
    <AuthProvider>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#fff',
            color: '#0f172a',
            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
          },
          success: {
            iconTheme: {
              primary: '#10b981',
              secondary: '#fff',
            },
          },
          error: {
            iconTheme: {
              primary: '#ef4444',
              secondary: '#fff',
            },
          },
        }}
      />
      <div className="min-h-screen flex flex-col">
        {user && (
          <header className="border-b bg-white sticky top-0 z-30">
            <div className="flex items-center justify-between px-4 py-3 sm:py-4 w-full relative">
              <div className="flex items-center space-x-3 flex-shrink-0">
                <Link to="/" className="text-lg sm:text-xl font-semibold text-brand-600">
                  CTO
                </Link>
                <p className="hidden sm:block text-xs text-slate-500">Your Personal Chief Talent Officer</p>
              </div>

              {/* Desktop Navigation */}
              <nav className="hidden md:flex gap-2 absolute left-1/2 transform -translate-x-1/2">
                <NavLink to="/knowledge-base" className={navLinkClass}>
                  You
                </NavLink>
                {isProfileActivated ? (
                  <>
                    {/* <NavLink to="/dashboard" className={navLinkClass}>
                      Dashboard
                    </NavLink> */}
                    <NavLink to="/jobs" className={navLinkClass}>
                      Jobs
                    </NavLink>
                    <NavLink to="/applications" className={navLinkClass}>
                      Applications
                    </NavLink>
                  </>
                ) : (
                  <>
                    {/* <span data-tour="locked-navigation" className={lockedNavLinkClass()} title="Complete onboarding to unlock">
                      Dashboard
                    </span> */}
                    <span className={lockedNavLinkClass()} title="Complete onboarding to unlock">
                      Jobs
                    </span>
                    <span className={lockedNavLinkClass()} title="Complete onboarding to unlock">
                      Applications
                    </span>
                  </>
                )}
              </nav>
              
              {/* Desktop User Menu */}
              <div className="hidden md:flex items-center gap-3">
                <UserMenu />
              </div>

              {/* Mobile Menu Button */}
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden inline-flex items-center justify-center rounded-md p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-500"
                aria-expanded={mobileMenuOpen}
              >
                <span className="sr-only">Open main menu</span>
                {mobileMenuOpen ? (
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                  </svg>
                )}
              </button>
            </div>

            {/* Mobile Navigation Menu */}
            {mobileMenuOpen && (
              <div className="md:hidden border-t border-slate-200">
                <div className="space-y-1 px-4 pb-3 pt-2">
                  <NavLink
                    to="/knowledge-base"
                    className={({ isActive }) =>
                      `block px-3 py-2 rounded-md text-base font-medium ${
                        isActive
                          ? 'bg-brand-100 text-brand-800'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`
                    }
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    You
                  </NavLink>
                  {isProfileActivated ? (
                    <>
                      {/* <NavLink
                        to="/dashboard"
                        className={({ isActive }) =>
                          `block px-3 py-2 rounded-md text-base font-medium ${
                            isActive
                              ? 'bg-brand-100 text-brand-800'
                              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                          }`
                        }
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        Dashboard
                      </NavLink> */}
                      <NavLink
                        to="/jobs"
                        className={({ isActive }) =>
                          `block px-3 py-2 rounded-md text-base font-medium ${
                            isActive
                              ? 'bg-brand-100 text-brand-800'
                              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                          }`
                        }
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        Jobs
                      </NavLink>
                      <NavLink
                        to="/applications"
                        className={({ isActive }) =>
                          `block px-3 py-2 rounded-md text-base font-medium ${
                            isActive
                              ? 'bg-brand-100 text-brand-800'
                              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                          }`
                        }
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        Applications
                      </NavLink>
                    </>
                  ) : (
                    <>
                      {/* <span className="block px-3 py-2 rounded-md text-base font-medium text-slate-300 cursor-not-allowed">
                        Dashboard
                      </span> */}
                      <span className="block px-3 py-2 rounded-md text-base font-medium text-slate-300 cursor-not-allowed">
                        Jobs
                      </span>
                      <span className="block px-3 py-2 rounded-md text-base font-medium text-slate-300 cursor-not-allowed">
                        Applications
                      </span>
                    </>
                  )}
                  
                  {/* Mobile Profile Info - Always Visible */}
                  <div className="pt-4 mt-3 border-t border-slate-200">
                    <MobileProfileInfo />
                  </div>
                </div>
              </div>
            )}
          </header>
        )}
        <main className="flex-1 bg-slate-50">
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/terms" element={<TermsOfService />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/" element={<LandingPage />} />
            <Route
              path="/knowledge-base"
              element={
                <ProtectedRoute>
                  <KnowledgeBasePage />
                </ProtectedRoute>
              }
            />
            {/* Dashboard temporarily commented out */}
            {/* <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              }
            /> */}
            <Route
              path="/jobs"
              element={
                <ProtectedRoute>
                  <JobsListPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/jobs/:id"
              element={
                <ProtectedRoute>
                  <JobDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/applications"
              element={
                <ProtectedRoute>
                  <ApplicationsPage />
                </ProtectedRoute>
              }
            />
          </Routes>
        </main>
        {user && (
          <footer className="border-t bg-white flex-shrink-0">
            <div className="px-4 py-2 text-sm text-slate-500 w-full">
              &copy; {new Date().getFullYear()} CTO — Your Personal Chief Talent Officer.
            </div>
          </footer>
        )}
      </div>
    </AuthProvider>
  );
}
