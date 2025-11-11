import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useState, useRef } from 'react';
import { useAuthStore } from '../store/auth';
import { fetchKnowledgeSources } from '../api/client';
import { CheckCircle, Github, Star } from 'lucide-react';

export default function LandingPage(): JSX.Element {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [isCheckingProfile, setIsCheckingProfile] = useState(false);
  const [demoInterests, setDemoInterests] = useState<string[]>(['Software Engineering', 'Machine Learning']);
  const [demoMessage, setDemoMessage] = useState('');
  const [showResumePreview, setShowResumePreview] = useState(false);
  const [showCoverLetterPreview, setShowCoverLetterPreview] = useState(false);
  const [showAddSourceSuccess, setShowAddSourceSuccess] = useState(false);
  const [githubStars, setGithubStars] = useState<number | null>(null);
  
  // Fetch GitHub stars
  useEffect(() => {
    fetch('https://api.github.com/repos/eaziym/cto')
      .then(res => res.json())
      .then(data => setGithubStars(data.stargazers_count))
      .catch(() => setGithubStars(null));
  }, []);
  
  // Intersection Observer for fade-in animations
  useEffect(() => {
    const observerOptions = {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('fade-in-visible');
        }
      });
    }, observerOptions);

    // Observe all elements with fade-in class
    const fadeElements = document.querySelectorAll('.fade-in-section');
    fadeElements.forEach(el => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (user) {
      checkUserProfile();
    }
  }, [user]);

  const checkUserProfile = async () => {
    setIsCheckingProfile(true);
    try {
      const { sources } = await fetchKnowledgeSources();
      
      // All users go to knowledge base (You page)
      // New users (no sources) will see onboarding
      // Existing users can navigate from there
      navigate('/knowledge-base');
    } catch (err) {
      // If error fetching, route to knowledge base for new users to start setup
      console.error('Error checking profile:', err);
      navigate('/knowledge-base');
    } finally {
      setIsCheckingProfile(false);
    }
  };

  if (user && isCheckingProfile) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent mx-auto"></div>
          <p className="text-gray-600">Loading your profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <style>{`
        .fade-in-section {
          opacity: 0;
          transform: translateY(30px);
          transition: opacity 0.6s ease-out, transform 0.6s ease-out;
        }
        
        .fade-in-visible {
          opacity: 1;
          transform: translateY(0);
        }
        
        .fade-in-section:nth-child(1) { transition-delay: 0s; }
        .fade-in-section:nth-child(2) { transition-delay: 0.1s; }
        .fade-in-section:nth-child(3) { transition-delay: 0.2s; }
      `}</style>

      {/* Hero Section */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-16">
        <div className="grid gap-8 lg:grid-cols-2 lg:gap-16 items-center">
          {/* Left Column - Content */}
          <div className="fade-in-section fade-in-visible">{/* Hero starts visible */}
            <div className="flex items-center gap-2 mb-4">
              <img src="/android-chrome-192x192.png" alt="CTO Logo" className="w-8 h-8" />
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-900">
                Your personal Chief Talent Officer
              </p>
            </div>
            <h1 className="mt-4 text-3xl font-bold text-slate-900 sm:text-4xl lg:text-5xl">
              A platform that actually gets you
            </h1>
            <p className="mt-6 text-base sm:text-lg text-slate-600 leading-relaxed">
              Connect your resume, LinkedIn, GitHub, and more. We'll piece together your full story to match you with jobs that truly fit, and help you craft applications that stand out.
            </p>
            
            <div className="mt-8 flex justify-center sm:justify-start">
              {user ? (
                <Link
                  to="/knowledge-base"
                  className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-brand-700 hover:shadow-md"
                >
                  Go to Profile
                </Link>
              ) : (
                <Link
                  to="/login"
                  className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-brand-700 hover:shadow-md hover:text-white"
                >
                  Get Started
                </Link>
              )}
            </div>
          </div>

          {/* Right Column - Highlights */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm fade-in-section fade-in-visible">{/* Hero starts visible */}
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              Platform Highlights
            </h2>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  <svg className="h-5 w-5 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <span className="text-sm text-slate-700">
                  Smart matching that considers your full background, not just keywords
                </span>
              </li>
              <li className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  <svg className="h-5 w-5 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <span className="text-sm text-slate-700">
                  Custom resumes and cover letters for every role you apply to
                </span>
              </li>
              <li className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  <svg className="h-5 w-5 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <span className="text-sm text-slate-700">
                  Find the right people to reach out to — no more black holes
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* How It Works Section */}
      <div className="bg-white border-y border-slate-200 fade-in-section">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-16">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">How It Works</h2>
            <p className="mt-3 text-base text-slate-600">Three steps to landing your dream job</p>
          </div>
          
          <div className="grid gap-8 md:grid-cols-3">
            {/* Step 1 */}
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-brand-100 text-brand-600 font-bold text-lg mb-4">
                1
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Tell Us Your Story</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Upload your resume, connect LinkedIn, add GitHub projects—whatever tells your professional story. We'll combine it all into one complete picture of who you are.
              </p>
            </div>

            {/* Step 2 */}
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-brand-100 text-brand-600 font-bold text-lg mb-4">
                2
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Find Your Perfect Match</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Browse thousands of jobs with intelligent matching. See exactly why you're a great fit and what makes each role interesting for you.
              </p>
            </div>

            {/* Step 3 */}
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-brand-100 text-brand-600 font-bold text-lg mb-4">
                3
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Stand Out From the Crowd</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Get custom resumes and cover letters tailored to each role. Find the right people to talk to and reach out in a way that actually gets responses.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* UI Preview Section */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-16 fade-in-section">
        <div className="text-center mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">See It In Action</h2>
          <p className="mt-3 text-base text-slate-600">Here's what your experience will look like</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Demo Sources Panel */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm fade-in-section">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
              <h3 className="text-sm font-medium text-gray-900">Your Sources</h3>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-green-100 flex items-center justify-center">
                    <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">resume_2024.pdf</p>
                    <p className="text-xs text-green-600 flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Processed
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-blue-100 flex items-center justify-center">
                    <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">linkedin.com/in/johndoe</p>
                    <p className="text-xs text-green-600 flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Processed
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-purple-100 flex items-center justify-center">
                    <svg className="w-4 h-4 text-purple-600 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">github.com/johndoe</p>
                    <p className="text-xs text-blue-600">Processing...</p>
                  </div>
                </div>
              </div>

              <button 
                onClick={() => {
                  setShowAddSourceSuccess(true);
                  setTimeout(() => setShowAddSourceSuccess(false), 3000);
                }}
                className="w-full px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-brand-400 hover:text-brand-600 transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Source
              </button>
              {showAddSourceSuccess && (
                <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-lg text-center">
                  <p className="text-xs text-green-600 font-medium">✓ Source added! Sign up to start building your profile</p>
                </div>
              )}
            </div>
          </div>

          {/* Demo Profile Panel */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm fade-in-section">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
              <h3 className="text-sm font-medium text-gray-900">The Complete You</h3>
            </div>
            <div className="p-4 max-h-[400px] overflow-y-auto">
              <div className="mb-4">
                <h4 className="text-lg font-semibold text-gray-900">John Doe</h4>
                <p className="text-sm text-gray-600 mt-1">
                  Senior Software Engineer with 5+ years of experience building scalable web applications. 
                  Passionate about clean code, user experience, and continuous learning.
                </p>
              </div>

              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <h5 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Experience</h5>
                </div>
                <div className="space-y-3">
                  <div className="pl-2 border-l-2 border-brand-200">
                    <p className="text-sm font-medium text-gray-900">Senior Software Engineer</p>
                    <p className="text-xs text-gray-600">Tech Corp · 2021 - Present</p>
                  </div>
                  <div className="pl-2 border-l-2 border-gray-200">
                    <p className="text-sm font-medium text-gray-900">Software Engineer</p>
                    <p className="text-xs text-gray-600">StartupCo · 2019 - 2021</p>
                  </div>
                </div>
              </div>

              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  <h5 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Skills</h5>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <span className="px-2 py-1 bg-brand-50 text-brand-700 text-xs rounded-full">React</span>
                  <span className="px-2 py-1 bg-brand-50 text-brand-700 text-xs rounded-full">TypeScript</span>
                  <span className="px-2 py-1 bg-brand-50 text-brand-700 text-xs rounded-full">Node.js</span>
                  <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full">Python</span>
                  <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full">PostgreSQL</span>
                  <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full">Docker</span>
                </div>
              </div>
            </div>
          </div>

          {/* Demo Interests Selection */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm lg:col-span-2 fade-in-section">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
              <h3 className="text-sm font-medium text-gray-900">Your Career Interests</h3>
            </div>
            <div className="p-4">
              <p className="text-sm text-gray-600 mb-4">
                Based on your background, we predicted these might interest you. Click to toggle or add your own!
              </p>
              
              <div className="mb-4">
                <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Industries</h4>
                <div className="flex flex-wrap gap-2">
                  {['Technology', 'Finance', 'Healthcare', 'E-commerce'].map((industry) => (
                    <button
                      key={industry}
                      onClick={() => {
                        setDemoInterests(prev => 
                          prev.includes(industry) 
                            ? prev.filter(i => i !== industry)
                            : [...prev, industry]
                        );
                      }}
                      className={`px-3 py-1.5 text-sm rounded-full border-2 transition-all ${
                        demoInterests.includes(industry)
                          ? 'bg-purple-100 border-purple-300 text-purple-700 hover:bg-purple-200'
                          : 'bg-white border-gray-300 text-gray-600 hover:border-purple-300'
                      }`}
                    >
                      {demoInterests.includes(industry) && (
                        <CheckCircle className="w-3 h-3 inline mr-1" />
                      )}
                      {industry}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-4">
                <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Roles</h4>
                <div className="flex flex-wrap gap-2">
                  {['Software Engineering', 'Product Management', 'Data Science', 'Machine Learning'].map((role) => (
                    <button
                      key={role}
                      onClick={() => {
                        setDemoInterests(prev => 
                          prev.includes(role) 
                            ? prev.filter(i => i !== role)
                            : [...prev, role]
                        );
                      }}
                      className={`px-3 py-1.5 text-sm rounded-full border-2 transition-all ${
                        demoInterests.includes(role)
                          ? 'bg-blue-100 border-blue-300 text-blue-700 hover:bg-blue-200'
                          : 'bg-white border-gray-300 text-gray-600 hover:border-blue-300'
                      }`}
                    >
                      {demoInterests.includes(role) && (
                        <CheckCircle className="w-3 h-3 inline mr-1" />
                      )}
                      {role}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-sm text-purple-700">
                <strong>Selected {demoInterests.length} interests</strong> - We'll use these to find jobs that match what you're looking for!
              </div>
            </div>
          </div>

          {/* Demo Fit Analysis */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm lg:col-span-2 fade-in-section">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
              <h3 className="text-sm font-medium text-gray-900">Job Fit Analysis</h3>
            </div>
            <div className="p-4">
              <div className="flex items-center gap-6 mb-6">
                <div className="text-center">
                  <div className="text-5xl font-bold text-brand-600">87%</div>
                  <p className="text-xs text-gray-500 mt-1">Overall Fit</p>
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-gray-900 mb-2">Senior Full-Stack Engineer at InnovateCo</h4>
                  <p className="text-sm text-gray-600">
                    Great match! Your React and TypeScript expertise aligns perfectly with their tech stack. 
                    Your experience building scalable systems matches their core needs.
                  </p>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-semibold text-green-700">Technical Skills</p>
                    <p className="text-sm font-bold text-green-600">95%</p>
                  </div>
                  <p className="text-xs text-green-600">Strong match in React, TypeScript, and cloud technologies</p>
                </div>

                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-semibold text-blue-700">Experience Level</p>
                    <p className="text-sm font-bold text-blue-600">90%</p>
                  </div>
                  <p className="text-xs text-blue-600">Your 5 years of experience fits their senior role perfectly</p>
                </div>

                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-semibold text-amber-700">Domain Knowledge</p>
                    <p className="text-sm font-bold text-amber-600">75%</p>
                  </div>
                  <p className="text-xs text-amber-600">Some fintech experience would be beneficial but not required</p>
                </div>
              </div>
            </div>
          </div>

          {/* Demo Resume & Cover Letter Generation - 2 Column */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm lg:col-span-2 fade-in-section">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
              <h3 className="text-sm font-medium text-gray-900">Tailored Materials</h3>
            </div>
            <div className="grid md:grid-cols-2 divide-x divide-gray-200">
              {/* Resume Column */}
              <div className="p-4 space-y-4">
                <button
                  onClick={() => setShowResumePreview(!showResumePreview)}
                  className="w-full px-4 py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors font-medium text-sm flex items-center justify-between"
                >
                  <span>{showResumePreview ? 'Hide Resume Preview' : 'Generate Resume'}</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </button>
                {showResumePreview && (
                  <div className="p-4 bg-white border border-gray-300 rounded-lg max-h-80 overflow-y-auto text-xs">
                    <div className="prose prose-sm max-w-none">
                      <h3 className="text-sm font-bold text-gray-900 mb-1">John Doe</h3>
                      <p className="text-xs text-gray-600 mb-3">Senior Software Engineer | React & TypeScript Expert</p>
                      
                      <h4 className="text-xs font-semibold text-gray-900 mt-3 mb-1">Professional Summary</h4>
                      <p className="text-xs text-gray-700 leading-relaxed">
                        Results-driven Senior Software Engineer with 5+ years of experience in building scalable web applications 
                        using React and TypeScript. Proven track record in developing high-performance systems and leading technical initiatives.
                      </p>
                      
                      <h4 className="text-xs font-semibold text-gray-900 mt-3 mb-1">Key Skills</h4>
                      <p className="text-xs text-gray-700">
                        <strong>Frontend:</strong> React, TypeScript, JavaScript, HTML/CSS, Next.js<br/>
                        <strong>Backend:</strong> Node.js, Python, PostgreSQL<br/>
                        <strong>Tools:</strong> Docker, Git, AWS, CI/CD
                      </p>
                      
                      <h4 className="text-xs font-semibold text-gray-900 mt-3 mb-1">Experience</h4>
                      <p className="text-xs text-gray-700">
                        <strong>Senior Software Engineer</strong> - Tech Corp (2021-Present)<br/>
                        • Built and maintained scalable React applications serving 100K+ users<br/>
                        • Led migration from JavaScript to TypeScript, improving code quality by 40%
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Cover Letter Column */}
              <div className="p-4 space-y-4">
                <button
                  onClick={() => setShowCoverLetterPreview(!showCoverLetterPreview)}
                  className="w-full px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors font-medium text-sm flex items-center justify-between"
                >
                  <span>{showCoverLetterPreview ? 'Hide Cover Letter' : 'Generate Cover Letter'}</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </button>
                {showCoverLetterPreview && (
                  <div className="p-4 bg-white border border-gray-300 rounded-lg max-h-80 overflow-y-auto text-xs">
                    <div className="prose prose-sm max-w-none">
                      <p className="text-xs text-gray-700 mb-2">Dear Hiring Manager,</p>
                      <p className="text-xs text-gray-700 mb-2">
                        I am writing to express my strong interest in the <strong>Senior Full-Stack Engineer</strong> position at 
                        <strong> InnovateCo</strong>. With over 5 years of experience specializing in React and TypeScript, 
                        I am confident in my ability to contribute to your team's success.
                      </p>
                      <p className="text-xs text-gray-700 mb-2">
                        At Tech Corp, I led the development of scalable web applications serving over 100,000 users, 
                        and spearheaded our migration to TypeScript, resulting in a 40% improvement in code quality. 
                        This experience aligns perfectly with your requirements for building robust, scalable systems.
                      </p>
                      <p className="text-xs text-gray-700 mb-2">
                        I am particularly excited about InnovateCo's focus on innovative solutions and would welcome 
                        the opportunity to discuss how my expertise can contribute to your team's goals.
                      </p>
                      <p className="text-xs text-gray-700">
                        Thank you for considering my application.<br/>
                        Best regards,<br/>
                        John Doe
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Demo HR Contact Finder - 2 Column */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm lg:col-span-2 fade-in-section">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
              <h3 className="text-sm font-medium text-gray-900">Direct Outreach</h3>
            </div>
            <div className="grid md:grid-cols-2 divide-x divide-gray-200">
              {/* Contacts Column */}
              <div className="p-4 space-y-4">
                <p className="text-sm text-gray-600 font-medium">
                  Found 2 relevant contacts at InnovateCo:
                </p>

                <div className="space-y-3">
                  <div className="p-3 bg-white border border-gray-200 rounded-lg">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-semibold text-sm">
                        SM
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">Sarah Martinez</p>
                        <p className="text-xs text-gray-600">Senior Recruiter at InnovateCo</p>
                        <p className="text-xs text-brand-600 mt-1">sarah.m@innovateco.com</p>
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-white border border-gray-200 rounded-lg">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center text-white font-semibold text-sm">
                        JC
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">James Chen</p>
                        <p className="text-xs text-gray-600">Engineering Manager at InnovateCo</p>
                        <p className="text-xs text-brand-600 mt-1">j.chen@innovateco.com</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Message Column */}
              <div className="p-4 space-y-4">
                <label className="block text-sm font-semibold text-gray-700">Personalized Outreach Message</label>
                <textarea
                  value={demoMessage || "Hi Sarah,\n\nI'm very interested in the Senior Full-Stack Engineer position at InnovateCo. With 5+ years of React and TypeScript experience, I believe I'd be a great fit for your team.\n\nWould you be open to a brief conversation about this opportunity?\n\nBest regards,\nJohn"}
                  onChange={(e) => setDemoMessage(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-none"
                  rows={10}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Clean CTA Section */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16 text-center fade-in-section">
        <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-8">
          Get Started with Your CTO
        </h2>
        {user ? (
          <Link
            to="/knowledge-base"
            className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-8 py-4 text-base font-semibold text-white shadow-sm transition-all hover:bg-brand-700 hover:shadow-md hover:text-white"
          >
            Go to Your Profile
          </Link>
        ) : (
          <Link
            to="/login"
            className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-8 py-4 text-base font-semibold text-white shadow-sm transition-all hover:bg-brand-700 hover:shadow-md hover:text-white"
          >
            Sign In
          </Link>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8">
          <div className="flex flex-col sm:flex-row justify-center items-center gap-6 text-sm text-gray-600">
            <Link to="/privacy" className="hover:text-brand-600 transition-colors">
              Privacy Policy
            </Link>
            <span className="hidden sm:inline text-gray-400">•</span>
            <Link to="/terms" className="hover:text-brand-600 transition-colors">
              Terms of Service
            </Link>
            <span className="hidden sm:inline text-gray-400">•</span>
            <a
              href="https://github.com/eaziym/cto"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 hover:text-brand-600 transition-colors"
            >
              <Github className="w-4 h-4" />
              <span>GitHub</span>
              {githubStars !== null && githubStars > 0 && (
                <span className="flex items-center gap-1 px-2 py-0.5 bg-gray-200 rounded-full text-xs font-semibold">
                  <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                  {githubStars}
                </span>
              )}
            </a>
          </div>
          <div className="text-center mt-4 text-xs text-gray-500">
            © {new Date().getFullYear()} CTO — Your Personal Chief Talent Officer. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
