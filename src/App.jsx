import { useEffect, useMemo, useState } from 'react'
import { jsPDF } from 'jspdf'
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  CreditCard,
  Download,
  Eye,
  FileText,
  Gift,
  IndianRupee,
  LayoutDashboard,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Mail,
  Menu,
  Pencil,
  Plus,
  Power,
  Printer,
  Receipt,
  RotateCcw,
  Save,
  Scissors,
  Search,
  Send,
  Settings,
  Sparkles,
  Trash2,
  UserRound,
  Users,
  WalletCards,
  X,
} from 'lucide-react'
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { aggregateBills, calculateBill, dateRangeForPreset, indiaDateKey, revenueChartData } from './lib/calculations'
import { dataApi } from './lib/data'
import { formatDate, formatINR, todayInput } from './lib/format'
import { appUrl, isSupabaseConfigured, supabase } from './lib/supabase'
import { GiftCardBillingView } from './GiftCardBillingView'

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'billing', label: 'Generate Bill', icon: Receipt },
  { id: 'gift-card-billing', label: 'Gift Card Bill', icon: Gift },
  { id: 'bills', label: 'All Bills', icon: FileText },
  { id: 'services', label: 'Services', icon: Scissors },
  { id: 'gift-cards', label: 'Gift Cards', icon: CreditCard },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
  { id: 'settings', label: 'Settings', icon: Settings },
]

const emptyLine = () => ({ key: crypto.randomUUID(), service_id: '', name: '', unit_price: '', discount: 0 })

function Brand({ compact = false }) {
  return (
    <div className={`brand ${compact ? 'brand--compact' : ''}`}>
      <div className="brand__mark"><Sparkles size={compact ? 21 : 31} strokeWidth={1.8} /></div>
      <div>
        <strong>Uhaas</strong>
        <span>Beauty Studio</span>
      </div>
    </div>
  )
}

function App() {
  const [session, setSession] = useState(null)
  const [demoSignedIn, setDemoSignedIn] = useState(() => sessionStorage.getItem('glamour-touch-demo') === 'yes')
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured)
  const [data, setData] = useState(null)
  const [dataLoading, setDataLoading] = useState(false)
  const [dataError, setDataError] = useState('')
  const [activeView, setActiveView] = useState('dashboard')
  const [recoveryMode, setRecoveryMode] = useState(() => isSupabaseConfigured && window.location.hash.includes('type=recovery'))
  const [sideOpen, setSideOpen] = useState(false)
  const [notice, setNotice] = useState(null)

  const authenticated = Boolean(session) || demoSignedIn

  const notify = (message, tone = 'success') => {
    setNotice({ message, tone })
    window.setTimeout(() => setNotice(null), 4200)
  }

  useEffect(() => {
    try {
      sessionStorage.removeItem('glamour-touch-user')
      localStorage.removeItem('glamour_registered_users')
    } catch (error) {
      console.error('Could not clear legacy browser authentication data.', error)
    }
    if (!isSupabaseConfigured) {
      setAuthLoading(false)
      return undefined
    }
    let mounted = true
    supabase.auth.getSession()
      .then(({ data: authData, error }) => {
        if (error) throw error
        if (mounted) {
          setSession(authData.session)
          setAuthLoading(false)
        }
      })
      .catch((error) => {
        if (mounted) {
          console.error('Could not restore the Supabase session.', error)
          setNotice({ message: error.message || 'Could not connect to authentication. Please try again.', tone: 'error' })
          setAuthLoading(false)
        }
      })
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession)
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true)
    })
    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [])

  const refreshData = async (quiet = false) => {
    if (!authenticated) return false
    if (!quiet) setDataLoading(true)
    try {
      setData(await dataApi.getData())
      setDataError('')
      return true
    } catch (error) {
      const message = error.message || 'Could not load your parlour data.'
      setDataError(message)
      if (!quiet) notify(message, 'error')
      return false
    } finally {
      if (!quiet) setDataLoading(false)
    }
  }

  useEffect(() => { refreshData() }, [authenticated]) // eslint-disable-line react-hooks/exhaustive-deps

  const openDemo = () => {
    sessionStorage.setItem('glamour-touch-demo', 'yes')
    setDemoSignedIn(true)
  }

  const signOut = async () => {
    if (isSupabaseConfigured && session) {
      const { error } = await supabase.auth.signOut()
      if (error) {
        notify(error.message || 'Could not sign out. Please try again.', 'error')
        return
      }
    }
    sessionStorage.removeItem('glamour-touch-demo')
    setDemoSignedIn(false)
    setData(null)
    setActiveView('dashboard')
    setRecoveryMode(false)
  }

  if (authLoading) return <LoadingPage />
  if (!authenticated && !recoveryMode) return <AuthScreen onDemo={openDemo} notify={notify} notice={notice} />

  const userDisplayName = session?.user?.user_metadata?.full_name || data?.profile?.full_name || 'Admin'
  const userEmail = session?.user?.email || data?.profile?.email || 'admin@glamour.touch'

  return (
    <div className="app-shell">
      <Sidebar activeView={activeView} onNavigate={(view) => { setActiveView(view); setSideOpen(false) }} onSignOut={signOut} open={sideOpen} />
      {sideOpen && <button className="sidebar-scrim" aria-label="Close menu" onClick={() => setSideOpen(false)} />}
      <main className="main-panel">
        <Topbar
          activeView={activeView}
          onMenu={() => setSideOpen(true)}
          demo={dataApi.isDemo || demoSignedIn}
          profile={{
            ...(data?.profile || {}),
            full_name: userDisplayName,
            email: userEmail,
          }}
        />
        {data && dataError && (
          <div className="data-error-banner" role="alert">
            <span>Could not load the latest business data: {dataError}</span>
            <button className="secondary-button" onClick={() => refreshData()} disabled={dataLoading}>
              {dataLoading ? <LoaderCircle className="spin" size={16} /> : 'Retry'}
            </button>
          </div>
        )}
        {recoveryMode ? (
          <ResetPasswordScreen onComplete={() => { setRecoveryMode(false); setActiveView('dashboard') }} notify={notify} />
        ) : dataLoading && !data ? <LoadingPage embedded /> : dataError && !data ? (
          <DataLoadError message={dataError} onRetry={() => refreshData()} loading={dataLoading} />
        ) : (
          <ViewRouter
            view={activeView}
            data={{
              ...(data || { services: [], bills: [], giftCards: [], profile: null }),
              profile: {
                ...(data?.profile || {}),
                full_name: userDisplayName,
                email: userEmail,
              },
            }}
            onRefresh={refreshData}
            onNavigate={setActiveView}
            notify={notify}
            demo={dataApi.isDemo || demoSignedIn}
          />
        )}
      </main>
      {notice && <div className={`toast toast--${notice.tone}`}><span>{notice.tone === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}</span>{notice.message}</div>}
    </div>
  )
}

function LoadingPage({ embedded = false }) {
  return <div className={`loading-page ${embedded ? 'loading-page--embedded' : ''}`}><LoaderCircle className="spin" size={30} /><span>Preparing Uhaas Beauty Studio…</span></div>
}

function DataLoadError({ message, onRetry, loading }) {
  return <section className="page"><article className="panel data-load-error" role="alert"><AlertCircle size={28} /><h2>Business data is unavailable</h2><p>{message}</p><button className="primary-button" onClick={onRetry} disabled={loading}>{loading ? <LoaderCircle className="spin" size={17} /> : 'Retry loading data'}</button></article></section>
}

function AuthScreen({ onDemo, notify, notice }) {
  const [mode, setMode] = useState('login')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' })

  const change = (key) => (event) => setForm((old) => ({ ...old, [key]: event.target.value }))

  const handleRegister = async (event) => {
    event.preventDefault()
    if (!form.name.trim()) return notify('Please enter your full name.', 'error')
    if (!form.email.trim() || !form.email.includes('@')) return notify('Please enter a valid email address.', 'error')
    if (form.password.length < 6) return notify('Password must be at least 6 characters.', 'error')
    if (form.password !== form.confirm) return notify('Passwords do not match.', 'error')
    if (!isSupabaseConfigured) return notify('Connect a Supabase project before creating an account. Use the demo to explore the app.', 'error')

    setBusy(true)
    try {
      const { data: authData, error } = await supabase.auth.signUp({
        email: form.email.trim().toLowerCase(),
        password: form.password,
        options: { data: { full_name: form.name.trim() }, emailRedirectTo: appUrl },
      })
      if (error) throw error
      setMode('login')
      setForm((old) => ({ ...old, password: '', confirm: '' }))
      notify(authData.session
        ? 'Account created successfully. You can now sign in.'
        : 'Account created. Check your email to confirm it, then sign in.')
    } catch (err) {
      notify(err.message || 'Could not create your account.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleForgotPassword = async (event) => {
    event.preventDefault()
    if (!form.email.trim() || !form.email.includes('@')) return notify('Please enter your email address.', 'error')
    if (!isSupabaseConfigured) return notify('Password recovery requires a configured Supabase project. Use the demo to explore the app.', 'error')

    setBusy(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(form.email.trim().toLowerCase(), {
        redirectTo: appUrl,
      })
      if (error) throw error
      setMode('login')
      notify('If an account exists for that email, a password reset link has been sent.')
    } catch (err) {
      notify(err.message || 'Could not send a password reset link.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleLogin = async (event) => {
    event.preventDefault()
    if (!isSupabaseConfigured) return notify('Supabase authentication is not configured. Use Explore the live demo.', 'error')
    setBusy(true)
    try {
      const cleanEmail = form.email.trim().toLowerCase()
      const { data: authData, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: form.password,
      })
      if (error) throw error
      if (!authData.session) throw new Error('Sign-in did not create a session. Please try again.')
      notify('Logged in successfully.')
    } catch (err) {
      notify(err.message || 'Sign in failed.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <section className="auth-poster">
        <div className="auth-poster__glow auth-poster__glow--one" />
        <div className="auth-poster__glow auth-poster__glow--two" />
        <Brand />
        <div className="poster-salon">
          <div className="poster-arch poster-arch--a" /><div className="poster-arch poster-arch--b" />
          <div className="poster-mirror" /><div className="poster-counter" />
          <div className="poster-plant"><i /><i /><i /></div>
        </div>
        <div className="auth-poster__copy">
          <h1>Beauty made<br />beautifully simple.</h1>
          <p>Simple Billing<br />Smart Business<br />Beautiful Growth</p>
        </div>
      </section>

      <section className="auth-card-wrap">
        <div className="auth-card">
          <Brand />

          {/* Regular Login Screen */}
          {mode === 'login' && (
            <>
              <div className="auth-heading">
                <h2>Welcome back</h2>
                <p>Sign in to manage your beauty business.</p>
              </div>
              <form onSubmit={handleLogin} className="auth-form">
                <Field
                  icon={Mail}
                  type="email"
                  placeholder="Email address"
                  value={form.email}
                  onChange={change('email')}
                  required
                />
                <Field
                  icon={LockKeyhole}
                  type="password"
                  placeholder="Password"
                  value={form.password}
                  onChange={change('password')}
                  required
                />
                <div className="auth-options">
                  <label className="remember">
                    <input type="checkbox" defaultChecked /> <span>Remember me</span>
                  </label>
                  <button type="button" className="link-button" onClick={() => setMode('forgot')}>
                    Forgot password?
                  </button>
                </div>
                <button className="primary-button auth-submit" disabled={busy}>
                  {busy ? <LoaderCircle className="spin" size={18} /> : 'Login'}
                </button>
              </form>
              <p className="auth-switch">
                New to Uhaas Beauty Studio? <button onClick={() => setMode('register')}>Create account</button>
              </p>
              <button className="demo-button" onClick={onDemo}>
                <Sparkles size={16} /> Explore the live demo
              </button>
            </>
          )}

          {/* Registration Screen */}
          {mode === 'register' && (
            <>
              <div className="auth-heading">
                <h2>Create your account</h2>
                <p>Create a secure account with email confirmation.</p>
              </div>
              <form onSubmit={handleRegister} className="auth-form">
                <Field
                  icon={UserRound}
                  placeholder="Full name"
                  value={form.name}
                  onChange={change('name')}
                  required
                />
                <Field
                  icon={Mail}
                  type="email"
                  placeholder="Email address"
                  value={form.email}
                  onChange={change('email')}
                  required
                />
                <Field
                  icon={LockKeyhole}
                  type="password"
                  placeholder="Password (min 6 chars)"
                  value={form.password}
                  onChange={change('password')}
                  required
                  minLength="6"
                />
                <Field
                  icon={LockKeyhole}
                  type="password"
                  placeholder="Confirm password"
                  value={form.confirm}
                  onChange={change('confirm')}
                  required
                  minLength="6"
                />
                <button className="primary-button auth-submit" disabled={busy}>
                  {busy ? <LoaderCircle className="spin" size={18} /> : <>Create account <ChevronRight size={16} /></>}
                </button>
              </form>
              <p className="auth-switch">
                Already have an account? <button onClick={() => setMode('login')}>Login</button>
              </p>
            </>
          )}

          {/* Forgot Password Request Screen */}
          {mode === 'forgot' && (
            <>
              <div className="auth-heading">
                <h2>Forgot password?</h2>
                <p>Enter your account email and we’ll send a secure password reset link.</p>
              </div>
              <form onSubmit={handleForgotPassword} className="auth-form">
                <Field
                  icon={Mail}
                  type="email"
                  placeholder="Email address"
                  value={form.email}
                  onChange={change('email')}
                  required
                />
                <button className="primary-button auth-submit" disabled={busy}>
                  {busy ? <LoaderCircle className="spin" size={18} /> : <>Send reset link <ChevronRight size={16} /></>}
                </button>
              </form>
              <p className="auth-switch">
                <button onClick={() => setMode('login')}>
                  <ArrowLeft size={14} /> Back to login
                </button>
              </p>
            </>
          )}
        </div>
      </section>
      {notice && <div className={`toast toast--${notice.tone}`}><span>{notice.tone === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}</span>{notice.message}</div>}
    </div>
  )
}

function Field({ icon: Icon, ...props }) {
  return <label className="input-with-icon"><Icon size={17} /><input {...props} /></label>
}

function ResetPasswordScreen({ onComplete, notify }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (event) => {
    event.preventDefault()
    if (password.length < 6) return notify('Use at least 6 characters for your new password.', 'error')
    if (password !== confirm) return notify('New passwords do not match.', 'error')
    setBusy(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      window.history.replaceState({}, '', window.location.pathname)
      notify('Your password has been reset.')
      onComplete()
    } catch (error) {
      notify(error.message || 'Could not reset the password. Request a new link and try again.', 'error')
    } finally { setBusy(false) }
  }
  return <section className="page reset-page"><article className="panel reset-card"><div className="success-orb"><LockKeyhole size={25} /></div><span className="eyebrow">Secure recovery</span><h2>Choose a new password</h2><p>This password will replace the old one for your Uhaas Beauty Studio account.</p><form onSubmit={submit}><label>New password<input type="password" value={password} minLength="6" onChange={(event) => setPassword(event.target.value)} required /></label><label>Confirm new password<input type="password" value={confirm} minLength="6" onChange={(event) => setConfirm(event.target.value)} required /></label><button className="primary-button" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <LockKeyhole size={17} />} Set new password</button></form></article></section>
}

function Sidebar({ activeView, onNavigate, onSignOut, open }) {
  return (
    <aside className={`sidebar ${open ? 'sidebar--open' : ''}`}>
      <div className="sidebar__top"><Brand compact /><button className="icon-button sidebar__close" onClick={() => onNavigate(activeView)}><X size={19} /></button></div>
      <nav className="sidebar__nav">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => <button key={id} className={activeView === id ? 'active' : ''} onClick={() => onNavigate(id)}><Icon size={18} /><span>{label}</span></button>)}
      </nav>
      <button className="sidebar__logout" onClick={onSignOut}><LogOut size={18} /><span>Logout</span></button>
    </aside>
  )
}

function Topbar({ activeView, onMenu, demo, profile }) {
  const label = NAV_ITEMS.find((item) => item.id === activeView)?.label || 'Uhaas Beauty Studio'
  return <header className="topbar"><div className="topbar__title"><button className="icon-button menu-button" onClick={onMenu}><Menu size={21} /></button><div><span className="eyebrow">Uhaas Beauty Studio</span><h1>{label}</h1></div></div><div className="topbar__right">{demo && <span className="demo-pill">Demo mode</span>}<span className="today-chip"><CalendarDays size={15} /> {formatDate(new Date())}</span><div className="avatar">{(profile?.full_name || 'A').charAt(0).toUpperCase()}</div></div></header>
}

function ViewRouter({ view, data, onRefresh, onNavigate, notify, demo }) {
  if (view === 'gift-card-billing') return <GiftCardBillingView data={data} onRefresh={onRefresh} onNavigate={onNavigate} notify={notify} />
  if (view === 'billing') return <BillingView data={data} onRefresh={onRefresh} onNavigate={onNavigate} notify={notify} />
  if (view === 'bills') return <BillsView bills={data.bills} onRefresh={onRefresh} notify={notify} />
  if (view === 'services') return <ServicesView services={data.services} onRefresh={onRefresh} notify={notify} />
  if (view === 'gift-cards') return <GiftCardsView cards={data.giftCards} onRefresh={onRefresh} notify={notify} />
  if (view === 'reports') return <ReportsView bills={data.bills} cards={data.giftCards} notify={notify} />
  if (view === 'settings') return <SettingsView profile={data.profile} onRefresh={onRefresh} notify={notify} demo={demo} />
  return <DashboardView data={data} onNavigate={onNavigate} />
}

function DashboardView({ data, onNavigate }) {
  const [preset, setPreset] = useState('month')
  const range = useMemo(() => dateRangeForPreset(preset), [preset])
  const stats = useMemo(() => aggregateBills(data.bills, range), [data.bills, range])
  const allStats = useMemo(() => aggregateBills(data.bills), [data.bills])
  const todayStats = useMemo(() => aggregateBills(data.bills, dateRangeForPreset('day')), [data.bills])
  const activeCards = data.giftCards.filter((card) => card.status === 'active').length
  const cardBalance = data.giftCards.reduce((sum, card) => sum + Number(card.remaining_balance || 0), 0)
  const chartData = revenueChartData(data.bills, preset)
  const colors = ['#16834b', '#36a365', '#72bb83', '#0f6840', '#91c99c', '#4d9d6c']
  const serviceData = stats.byService.slice(0, 6)

  return <section className="page dashboard-page">
    <div className="page-heading dashboard-heading"><div><span className="eyebrow">Business overview</span><h2>Good morning, Uhaas <span>✦</span></h2><p>Here’s how Uhaas Beauty Studio is performing.</p></div><button className="primary-button" onClick={() => onNavigate('billing')}><Plus size={17} /> New bill</button></div>
    <div className="metric-grid">
      <MetricCard tone="pink" icon={IndianRupee} label="Today's Revenue" value={formatINR(todayStats.netServiceRevenue)} detail="Net services today" />
      <MetricCard tone="lilac" icon={CircleDollarSign} label="Total Revenue" value={formatINR(allStats.netServiceRevenue)} detail="All saved bills" />
      <MetricCard tone="blue" icon={Users} label="Total Services" value={allStats.totalServices.toLocaleString('en-IN')} detail="Services performed" />
      <MetricCard tone="peach" icon={Gift} label="Active Gift Cards" value={activeCards} detail={`${formatINR(cardBalance)} balance`} />
    </div>
    <div className="dashboard-grid">
      <article className="panel panel--chart"><div className="panel__header"><div><h3>Revenue overview</h3><p>{formatINR(stats.netServiceRevenue)} in selected period</p></div><div className="segmented">{['day', 'week', 'month', 'year'].map((item) => <button key={item} className={preset === item ? 'selected' : ''} onClick={() => setPreset(item)}>{item}</button>)}</div></div><div className="chart-wrap">{chartData.some((entry) => entry.revenue) ? <ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} margin={{ top: 12, right: 8, left: -14, bottom: 0 }}><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#8f8b9c' }} /><YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#8f8b9c' }} tickFormatter={(value) => `${value / 1000}k`} /><Tooltip cursor={{ fill: '#eef8f0' }} formatter={(value) => formatINR(value)} /><Bar dataKey="revenue" fill="#16834b" radius={[7, 7, 0, 0]} maxBarSize={42} /></BarChart></ResponsiveContainer> : <EmptyChart label="Your revenue chart will appear after you save a bill." />}</div></article>
      <article className="panel top-services"><div className="panel__header"><div><h3>Top services</h3><p>For this period</p></div><button className="small-link" onClick={() => onNavigate('reports')}>View report <ChevronRight size={15} /></button></div>{serviceData.length ? <ol>{serviceData.map((service, index) => <li key={service.name}><span className="rank">{String(index + 1).padStart(2, '0')}</span><div><b>{service.name}</b><small>{service.count} service{service.count !== 1 ? 's' : ''}</small></div><strong>{formatINR(service.revenue)}</strong></li>)}</ol> : <EmptyState icon={Scissors} title="No services yet" body="Save your first bill to see your top services." compact />}</article>
      <article className="panel recent-bills"><div className="panel__header"><div><h3>Recent bills</h3><p>Latest transactions</p></div><button className="small-link" onClick={() => onNavigate('bills')}>View all <ChevronRight size={15} /></button></div>{data.bills.length ? <div className="table-scroll"><table><thead><tr><th>Bill No.</th><th>Date</th><th>Services</th><th>Amount</th></tr></thead><tbody>{data.bills.slice(0, 5).map((bill) => <tr key={bill.id}><td><b>{bill.bill_number}</b></td><td>{formatDate(bill.created_at)}</td><td>{(bill.items || []).map((item) => item.service_name || item.name).slice(0, 2).join(', ')}{bill.items?.length > 2 ? '…' : ''}</td><td><b>{formatINR(bill.net_amount)}</b></td></tr>)}</tbody></table></div> : <EmptyState icon={Receipt} title="No bills saved" body="Create a bill to start tracking revenue." compact />}</article>
      <article className="panel revenue-snapshot"><div className="panel__header"><div><h3>Revenue split</h3><p>Selected period</p></div></div>{serviceData.length ? <div className="split-chart"><PieChart width={118} height={118}><Pie data={serviceData} dataKey="revenue" nameKey="name" innerRadius={32} outerRadius={54} paddingAngle={3}>{serviceData.map((entry, index) => <Cell key={entry.name} fill={colors[index % colors.length]} />)}</Pie><Tooltip formatter={(value) => formatINR(value)} /></PieChart><div className="legend">{serviceData.slice(0, 4).map((service, index) => <span key={service.name}><i style={{ background: colors[index] }} />{service.name}<b>{formatINR(service.revenue)}</b></span>)}</div></div> : <EmptyState icon={BarChart3} title="Nothing to chart" body="Service trends will show here." compact />}</article>
    </div>
  </section>
}

function MetricCard({ icon: Icon, label, value, detail, tone }) {
  return <article className={`metric-card metric-card--${tone}`}><div className="metric-card__icon"><Icon size={20} /></div><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></article>
}

function EmptyChart({ label }) { return <div className="empty-chart"><BarChart3 size={30} /><p>{label}</p></div> }
function EmptyState({ icon: Icon, title, body, compact = false }) { return <div className={`empty-state ${compact ? 'empty-state--compact' : ''}`}><div><Icon size={compact ? 22 : 30} /></div><h4>{title}</h4><p>{body}</p></div> }

function BillingView({ data, onRefresh, onNavigate, notify }) {
  const [lines, setLines] = useState([emptyLine()])
  const [giftNumber, setGiftNumber] = useState('')
  const [giftCard, setGiftCard] = useState(null)
  const [checking, setChecking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedBill, setSavedBill] = useState(null)
  const totals = useMemo(() => calculateBill(lines, giftCard?.remaining_balance || 0), [lines, giftCard])
  const activeServices = data.services.filter((service) => service.is_active)

  const updateLine = (key, field, value) => setLines((old) => old.map((line) => {
    if (line.key !== key) return line
    if (field === 'service_id') {
      const service = activeServices.find((item) => item.id === value)
      return { ...line, service_id: value, name: service?.name || '', unit_price: service?.default_price ?? '', discount: 0 }
    }
    return { ...line, [field]: value }
  }))
  const checkCard = async () => {
    setChecking(true)
    try {
      const card = await dataApi.findGiftCard(giftNumber)
      if (!card) throw new Error('Gift card not found. Check the card number.')
      if (card.status !== 'active' || card.remaining_balance <= 0) throw new Error('This gift card has already been used or is inactive.')
      setGiftCard(card)
      notify(`${card.card_number} is ready to use.`)
    } catch (error) {
      setGiftCard(null)
      notify(error.message, 'error')
    } finally { setChecking(false) }
  }
  const saveBill = async () => {
    if (!totals.lines.length) return notify('Add at least one service to the bill.', 'error')
    setSaving(true)
    try {
      const bill = await dataApi.saveBill({ items: totals.lines, giftCardNumber: giftCard?.card_number })
      setSavedBill(bill)
      if (!await onRefresh(true)) {
        notify(`${bill.bill_number || 'Bill'} was saved, but the latest bill list could not be loaded. Use Retry before continuing.`, 'error')
        return
      }
      notify(`${bill.bill_number || 'Bill'} saved successfully.`)
    } catch (error) { notify(error.message || 'Could not save bill.', 'error') } finally { setSaving(false) }
  }
  const clearBill = () => { setLines([emptyLine()]); setGiftNumber(''); setGiftCard(null); setSavedBill(null) }

  if (savedBill) return <InvoiceScreen bill={savedBill} onBack={() => { clearBill(); onNavigate('bills') }} onRefresh={onRefresh} notify={notify} />
  return <section className="page bill-page">
    <div className="page-heading">
      <div>
        <span className="eyebrow">Point of sale</span>
        <h2>Standard Bill</h2>
        <p>Create a quick, professional invoice.</p>
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button className="secondary-button" onClick={() => onNavigate('gift-card-billing')}>
          <Gift size={16} /> Switch to Gift Card Billing
        </button>
        <div className="bill-meta">
          <span><b>Bill No.</b> Generated when saved</span>
          <span><b>Date</b> {formatDate(new Date(), true)}</span>
        </div>
      </div>
    </div>
    <div className="billing-layout"><article className="panel bill-builder"><div className="bill-table table-scroll"><table><thead><tr><th>#</th><th>Service</th><th>Price (₹)</th><th>Discount (₹)</th><th>Final price</th><th></th></tr></thead><tbody>{lines.map((line, index) => { const calculated = calculateBill([line]).lines[0] || { line_total: 0 }; return <tr key={line.key}><td>{index + 1}</td><td><select aria-label="Select service" value={line.service_id} onChange={(event) => updateLine(line.key, 'service_id', event.target.value)}><option value="">Custom service</option>{activeServices.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select><input className="service-name-input" placeholder="Service name" value={line.name} disabled={Boolean(line.service_id)} onChange={(event) => updateLine(line.key, 'name', event.target.value)} /></td><td><input type="number" min="0" value={line.unit_price} placeholder="0" disabled={Boolean(line.service_id)} onChange={(event) => updateLine(line.key, 'unit_price', event.target.value)} /></td><td><input type="number" min="0" value={line.discount} placeholder="0" onChange={(event) => updateLine(line.key, 'discount', event.target.value)} /></td><td><b>{formatINR(calculated.line_total)}</b></td><td><button className="row-action row-action--delete" aria-label="Remove service" onClick={() => setLines((old) => old.length > 1 ? old.filter((item) => item.key !== line.key) : [emptyLine()])}><Trash2 size={16} /></button></td></tr> })}</tbody></table></div><button className="add-row" onClick={() => setLines((old) => [...old, emptyLine()])}><Plus size={16} /> Add service</button>
      <div className="gift-apply"><div><label>Apply gift card <small>(optional)</small></label><p>Use a card only after checking its remaining balance.</p></div><div className="gift-apply__input"><input value={giftNumber} onChange={(event) => { setGiftNumber(event.target.value.toUpperCase()); setGiftCard(null) }} placeholder="e.g. V100" /><button className="secondary-button" onClick={checkCard} disabled={checking || !giftNumber}>{checking ? <LoaderCircle className="spin" size={15} /> : 'Check'}</button></div></div>
      {giftCard && <div className="gift-valid"><CheckCircle2 size={20} /><div><b>Card No: {giftCard.card_number}</b><span>Original value {formatINR(giftCard.original_value)} · Remaining balance {formatINR(giftCard.remaining_balance)}</span></div></div>}
      <div className="bill-actions"><button className="secondary-button" onClick={clearBill}>Clear</button><button className="primary-button" onClick={saveBill} disabled={saving}>{saving ? <LoaderCircle className="spin" size={17} /> : <Save size={17} />} Save bill</button></div></article>
      <aside className="bill-summary panel"><h3>Bill summary</h3><SummaryRow label="Subtotal" value={formatINR(totals.subtotal)} /><SummaryRow label="Total discount" value={`− ${formatINR(totals.totalDiscount)}`} soft /><SummaryRow label="Gift card amount" value={`− ${formatINR(totals.giftCardAmount)}`} soft /><div className="summary-rule" /><SummaryRow label="Amount to pay" value={formatINR(totals.physicalAmount)} strong /><p className="summary-note">Service revenue is {formatINR(totals.netAmount)}. Gift card use is tracked separately from physical collection.</p></aside>
    </div></section>
}

export function SummaryRow({ label, value, soft = false, strong = false }) { return <div className={`summary-row ${soft ? 'summary-row--soft' : ''} ${strong ? 'summary-row--strong' : ''}`}><span>{label}</span><b>{value}</b></div> }

function BillsView({ bills, onRefresh, notify }) {
  const [selected, setSelected] = useState(null)
  const [query, setQuery] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const filtered = (bills || []).filter((bill) => `${bill.bill_number} ${(bill.items || []).map((item) => item.service_name || item.name).join(' ')}`.toLowerCase().includes(query.toLowerCase()))

  const handleDeleteBill = async () => {
    if (!deleteConfirm) return
    setDeleting(true)
    try {
      await dataApi.deleteBill(deleteConfirm.id)
      const refreshed = onRefresh ? await onRefresh(true) : true
      if (!refreshed) {
        setDeleteConfirm(null)
        notify(`Bill ${deleteConfirm.bill_number} was deleted, but the latest bill list could not be loaded. Use Retry.`, 'error')
        return
      }
      if (notify) notify(`Bill ${deleteConfirm.bill_number} deleted. Total revenue reduced by ${formatINR(deleteConfirm.net_amount)}.`)
      setDeleteConfirm(null)
    } catch (err) {
      if (notify) notify(err.message || 'Could not delete bill.', 'error')
    } finally {
      setDeleting(false)
    }
  }

  if (selected) return <InvoiceScreen bill={selected} onBack={() => setSelected(null)} onRefresh={onRefresh} notify={notify} />
  return <section className="page"><div className="page-heading"><div><span className="eyebrow">Invoice archive</span><h2>All bills</h2><p>Open, print, download, or delete saved invoices.</p></div></div><article className="panel"><div className="list-toolbar"><label className="search-field"><Search size={17} /><input placeholder="Search bill or service" value={query} onChange={(event) => setQuery(event.target.value)} /></label><span className="count-chip">{filtered.length} bill{filtered.length !== 1 ? 's' : ''}</span></div>{filtered.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Bill no.</th><th>Date & time</th><th>Services</th><th>Gift card</th><th>Collected</th><th>Bill total</th><th>Actions</th></tr></thead><tbody>{filtered.map((bill) => <tr key={bill.id}><td><b className="bill-number">{bill.bill_number}</b></td><td>{formatDate(bill.created_at, true)}</td><td>{(bill.items || []).map((item) => item.service_name || item.name).join(', ')}</td><td>{bill.gift_card_amount ? <span className="gift-mini">{bill.gift_card_number ? `${bill.gift_card_number}: ` : ''}{formatINR(bill.gift_card_amount)}</span> : '—'}</td><td>{formatINR(bill.physical_amount)}</td><td><b>{formatINR(bill.net_amount)}</b></td><td><div className="action-set"><button className="row-action" onClick={() => setSelected(bill)} title="Open invoice"><Eye size={16} /></button><button className="row-action row-action--delete" onClick={() => setDeleteConfirm(bill)} title="Delete bill"><Trash2 size={16} /></button></div></td></tr>)}</tbody></table></div> : <EmptyState icon={FileText} title="No matching bills" body="Bills you save will stay here permanently." />}</article>
    {deleteConfirm && (
      <div className="modal-backdrop" onMouseDown={() => setDeleteConfirm(null)}>
        <section className="modal delete-modal" onMouseDown={(e) => e.stopPropagation()}>
          <button className="icon-button modal__close" onClick={() => setDeleteConfirm(null)}><X size={19} /></button>
          <div className="delete-modal-icon"><Trash2 size={26} /></div>
          <h3>Delete Bill {deleteConfirm.bill_number}?</h3>
          <p>Are you sure you want to permanently delete this bill? This will cut the bill's amount from both today's and total revenue.</p>
          <div className="delete-modal__highlight">
            <div><b>Revenue Reduction:</b> −{formatINR(deleteConfirm.net_amount)}</div>
            {Number(deleteConfirm.gift_card_amount) > 0 && (
              <div style={{ marginTop: 6 }}>
                <b>Gift Card Refund:</b> {formatINR(deleteConfirm.gift_card_amount)} will be restored back to Card <b>{deleteConfirm.gift_card_number || 'Used Card'}</b>.
              </div>
            )}
          </div>
          <div className="delete-modal__actions">
            <button className="secondary-button" onClick={() => setDeleteConfirm(null)} disabled={deleting}>Cancel</button>
            <button className="danger-button" onClick={handleDeleteBill} disabled={deleting}>{deleting ? <LoaderCircle className="spin" size={16} /> : <Trash2 size={16} />} Confirm Delete</button>
          </div>
        </section>
      </div>
    )}
  </section>
}

function ServicesView({ services, onRefresh, notify }) {
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ service_code: '', name: '', default_price: '', category: 'General', is_active: true })
  const [busy, setBusy] = useState(false)
  const beginEdit = (service) => { setEditing(service); setForm({ service_code: service.service_code, name: service.name, default_price: service.default_price, category: service.category, is_active: service.is_active }); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const startNew = () => { setEditing('new'); setForm({ service_code: '', name: '', default_price: '', category: 'General', is_active: true }); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const save = async (event) => { event.preventDefault(); setBusy(true); try { await dataApi.saveService(form, editing === 'new' ? undefined : editing.id); const refreshed = await onRefresh(true); setEditing(null); if (!refreshed) { notify('Service was saved, but the service list could not be refreshed. Use Retry.', 'error'); return }; notify(editing === 'new' ? 'Service added.' : 'Service updated.') } catch (error) { notify(error.message || 'Could not save service.', 'error') } finally { setBusy(false) } }
  const toggle = async (service) => { try { await dataApi.deactivateService(service.id, !service.is_active); if (!await onRefresh(true)) { notify('Service status was updated, but the latest data could not be loaded. Use Retry.', 'error'); return }; notify(`${service.name} is now ${service.is_active ? 'inactive' : 'active'}.`) } catch (error) { notify(error.message, 'error') } }
  return <section className="page"><div className="page-heading"><div><span className="eyebrow">Catalogue</span><h2>Services</h2><p>Manage prices and the services available while billing.</p></div><button className="primary-button" onClick={startNew}><Plus size={17} /> Add service</button></div>{editing && <form className="panel service-form" onSubmit={save}><div className="panel__header"><div><h3>{editing === 'new' ? 'Add a service' : `Edit ${editing.name}`}</h3><p>These prices fill automatically during billing.</p></div><button type="button" className="icon-button" onClick={() => setEditing(null)}><X size={19} /></button></div><div className="form-grid"><label>Service ID<input value={form.service_code} placeholder="S008" onChange={(event) => setForm({ ...form, service_code: event.target.value })} /></label><label>Service name<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label>Default price (₹)<input type="number" min="0" required value={form.default_price} onChange={(event) => setForm({ ...form, default_price: event.target.value })} /></label><label>Category<input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} /></label></div><div className="form-footer"><label className="toggle"><input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} /><span /> Active for billing</label><div><button type="button" className="secondary-button" onClick={() => setEditing(null)}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <Save size={17} />} Save service</button></div></div></form>}<article className="panel"><div className="table-scroll"><table className="data-table"><thead><tr><th>ID</th><th>Service name</th><th>Category</th><th>Default price</th><th>Status</th><th>Actions</th></tr></thead><tbody>{services.map((service) => <tr key={service.id}><td><span className="service-code">{service.service_code}</span></td><td><b>{service.name}</b></td><td>{service.category}</td><td>{formatINR(service.default_price)}</td><td><span className={`status status--${service.is_active ? 'active' : 'inactive'}`}>{service.is_active ? 'Active' : 'Inactive'}</span></td><td><div className="action-set"><button className="text-action" onClick={() => beginEdit(service)}><Pencil size={14} /> Edit</button><button className="text-action" onClick={() => toggle(service)}><Power size={14} /> {service.is_active ? 'Deactivate' : 'Activate'}</button></div></td></tr>)}</tbody></table></div></article></section>
}

function GiftCardsView({ cards, onRefresh, notify }) {
  const [amount, setAmount] = useState('')
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState(null)
  const create = async (event) => { event.preventDefault(); if (Number(amount) <= 0) return notify('Enter a gift card amount greater than zero.', 'error'); setCreating(true); try { const card = await dataApi.createGiftCard(amount); if (!await onRefresh(true)) { setAmount(''); notify(`${card.card_number || 'Gift card'} was created, but the latest list could not be loaded. Use Retry.`, 'error'); return }; setAmount(''); notify(`${card.card_number || 'Gift card'} created successfully.`) } catch (error) { notify(error.message || 'Could not create gift card.', 'error') } finally { setCreating(false) } }
  return <section className="page"><div className="page-heading"><div><span className="eyebrow">Customer value</span><h2>Gift cards</h2><p>Issue balances now, and recognize service revenue only when they are redeemed.</p></div></div><div className="gift-layout"><article className="panel create-gift"><div className="gift-art"><Gift size={32} /><span>Gift someone<br />a glow.</span></div><div><h3>Create gift card</h3><p>Enter the value in Indian rupees.</p><form onSubmit={create}><label>Amount (₹)<input type="number" min="1" placeholder="1000" value={amount} onChange={(event) => setAmount(event.target.value)} /></label><button className="primary-button" disabled={creating}>{creating ? <LoaderCircle className="spin" size={17} /> : <Gift size={17} />} Create gift card</button></form></div></article><article className="panel card-balance-card"><span>Outstanding card balance</span><strong>{formatINR(cards.reduce((sum, card) => sum + Number(card.remaining_balance), 0))}</strong><small>Across {cards.filter((card) => card.status === 'active').length} active cards</small></article></div><article className="panel"><div className="panel__header"><div><h3>All gift cards</h3><p>Every issue and redemption stays on record.</p></div></div>{cards.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Card no.</th><th>Issued</th><th>Value</th><th>Remaining</th><th>Used</th><th>Status</th><th></th></tr></thead><tbody>{cards.map((card) => <tr key={card.id}><td><b className="gift-card-number"><CreditCard size={15} /> {card.card_number}</b></td><td>{formatDate(card.created_at)}</td><td>{formatINR(card.original_value)}</td><td><b>{formatINR(card.remaining_balance)}</b></td><td>{formatINR(card.amount_used)}</td><td><span className={`status status--${card.status === 'active' ? 'active' : 'used'}`}>{card.status === 'active' ? 'Active' : 'Used'}</span></td><td><button className="row-action" onClick={() => setSelected(card)}><Eye size={16} /></button></td></tr>)}</tbody></table></div> : <EmptyState icon={Gift} title="No gift cards issued" body="Create a gift card above to get started." />}</article>{selected && <GiftCardModal card={selected} onClose={() => setSelected(null)} />}</section>
}

function GiftCardModal({ card, onClose }) { const transactions = card.gift_card_transactions || []; const labels = { issuance: 'Card issued', redemption: 'Redeemed against bill', adjustment: 'Balance adjustment', refund: 'Refund from deleted bill' }; return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal" onMouseDown={(event) => event.stopPropagation()}><button className="icon-button modal__close" onClick={onClose}><X size={19} /></button><div className="modal__card"><CreditCard size={25} /><span>Uhaas Beauty Studio</span><strong>{card.card_number}</strong><small>Available balance</small><b>{formatINR(card.remaining_balance)}</b></div><h3>Card history</h3><div className="transaction-list">{transactions.length ? transactions.map((transaction) => { const amount = Number(transaction.amount) || 0; const displayedAmount = transaction.transaction_type === 'redemption' ? -Math.abs(amount) : amount; return <div key={transaction.id}><span className="transaction-icon"><Receipt size={16} /></span><p><b>{labels[transaction.transaction_type] || 'Balance adjustment'}</b><small>{formatDate(transaction.created_at, true)}</small></p><strong className={displayedAmount < 0 ? 'negative' : ''}>{displayedAmount < 0 ? '−' : '+'}{formatINR(Math.abs(displayedAmount))}</strong></div> }) : <p className="muted">This card has not been redeemed yet.</p>}</div></section></div> }

function ReportsView({ bills, cards, notify }) {
  const [range, setRange] = useState(() => dateRangeForPreset('month'))
  const stats = useMemo(() => aggregateBills(bills, range), [bills, range])
  const exportCsv = () => {
    const rows = [['Service', 'Times performed', 'Revenue (INR)'], ...stats.byService.map((service) => [service.name, service.count, service.revenue])]
    const blob = new Blob([rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `uhaas-beauty-studio-report-${range.from}-${range.to}.csv`; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const printReport = () => { const printWindow = window.open('', '_blank'); if (!printWindow) return notify('Allow pop-ups to print this report.', 'error'); printWindow.opener = null; printWindow.document.write(`<html><head><title>Uhaas Beauty Studio Report</title><style>body{font-family:Arial;padding:32px;color:#292333}table{width:100%;border-collapse:collapse}th,td{padding:10px;border-bottom:1px solid #ddd;text-align:left}h1{color:#16834b}</style></head><body><h1>Uhaas Beauty Studio</h1><h2>Revenue report: ${escapeHtml(range.from)} to ${escapeHtml(range.to)}</h2><p>Net service revenue: <b>${formatINR(stats.netServiceRevenue)}</b></p><p>Physical collections: <b>${formatINR(stats.physicalCollections)}</b></p><table><tr><th>Service</th><th>Times performed</th><th>Revenue</th></tr>${stats.byService.map((service) => `<tr><td>${escapeHtml(service.name)}</td><td>${service.count}</td><td>${formatINR(service.revenue)}</td></tr>`).join('')}</table></body></html>`); printWindow.document.close(); printWindow.focus(); printWindow.print() }
  const issuedValue = cards.filter((card) => {
    const date = indiaDateKey(card.created_at)
    return date && date >= range.from && date <= range.to
  }).reduce((sum, card) => sum + Number(card.original_value), 0)
  return <section className="page"><div className="page-heading"><div><span className="eyebrow">Business intelligence</span><h2>Reports & analytics</h2><p>All figures are calculated from permanently saved bills.</p></div><div className="heading-actions"><button className="secondary-button" onClick={printReport}><Printer size={16} /> Print</button><button className="primary-button" onClick={exportCsv}><Download size={16} /> Export CSV</button></div></div><article className="panel report-filter"><label>From<input type="date" value={range.from} onChange={(event) => setRange({ ...range, from: event.target.value })} /></label><label>To<input type="date" value={range.to} onChange={(event) => setRange({ ...range, to: event.target.value })} /></label><div className="report-presets">{['day', 'week', 'month', 'year'].map((preset) => <button key={preset} onClick={() => setRange(dateRangeForPreset(preset))}>{preset}</button>)}</div></article><div className="report-metrics"><MetricCard tone="pink" icon={IndianRupee} label="Net service revenue" value={formatINR(stats.netServiceRevenue)} detail={`Gross ${formatINR(stats.grossServiceValue)}`} /><MetricCard tone="blue" icon={WalletCards} label="Physical collections" value={formatINR(stats.physicalCollections)} detail="Cash / digital payments" /><MetricCard tone="lilac" icon={Gift} label="Gift card redemptions" value={formatINR(stats.giftCardRedemptions)} detail="Applied to saved bills" /><MetricCard tone="peach" icon={Receipt} label="Bills generated" value={stats.totalBills} detail={`${stats.totalServices} services performed`} /></div><div className="report-grid"><article className="panel"><div className="panel__header"><div><h3>Service details</h3><p>Performance for the selected dates.</p></div></div>{stats.byService.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Service name</th><th>Times done</th><th>Total revenue</th></tr></thead><tbody>{stats.byService.map((service) => <tr key={service.name}><td><b>{service.name}</b></td><td>{service.count}</td><td>{formatINR(service.revenue)}</td></tr>)}</tbody></table></div> : <EmptyState icon={BarChart3} title="No data in this range" body="Try another date range after saving bills." compact />}</article><article className="panel report-summary"><h3>Collection summary</h3><SummaryRow label="Gross services" value={formatINR(stats.grossServiceValue)} /><SummaryRow label="Discounts given" value={`− ${formatINR(stats.discounts)}`} soft /><SummaryRow label="Net service revenue" value={formatINR(stats.netServiceRevenue)} strong /><div className="summary-rule" /><SummaryRow label="Gift cards issued" value={formatINR(issuedValue)} /><SummaryRow label="Remaining card balances" value={formatINR(cards.reduce((sum, card) => sum + Number(card.remaining_balance), 0))} /></article></div></section>
}

function SettingsView({ profile, onRefresh, notify, demo }) {
  const [form, setForm] = useState({ full_name: profile?.full_name || '', password: '', confirm: '' })
  const [busy, setBusy] = useState(false)
  const save = async (event) => { event.preventDefault(); if (form.password && form.password !== form.confirm) return notify('New passwords do not match.', 'error'); setBusy(true); try { await dataApi.updateProfile(form); if (!await onRefresh(true)) { setForm((old) => ({ ...old, password: '', confirm: '' })); notify('Profile was updated, but the latest data could not be loaded. Use Retry.', 'error'); return }; setForm((old) => ({ ...old, password: '', confirm: '' })); notify('Profile updated successfully.') } catch (error) { notify(error.message || 'Could not update your profile.', 'error') } finally { setBusy(false) } }
  return (
    <section className="page settings-page">
      <div className="page-heading"><div><span className="eyebrow">Account & security</span><h2>Settings</h2><p>Update the administrator profile and password.</p></div></div>
      <div className="settings-layout">
        <form className="panel settings-form" onSubmit={save}>
          <div className="profile-heading"><div className="profile-avatar">{(profile?.full_name || 'A').charAt(0)}</div><div><h3>Administrator profile</h3><p>{profile?.email || 'Signed-in administrator'}</p></div></div>
          <label>Full name<input required value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} /></label>
          {demo
            ? <p className="muted">Password changes are available after connecting a Supabase account.</p>
            : <div className="form-grid"><label>New password <small>(optional)</small><input type="password" minLength="6" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label><label>Confirm new password<input type="password" minLength="6" value={form.confirm} onChange={(event) => setForm({ ...form, confirm: event.target.value })} /></label></div>}
          <button className="primary-button" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <Save size={17} />} Save changes</button>
        </form>
        <article className="panel setup-card">
          <div className="setup-card__icon"><LockKeyhole size={21} /></div>
          <h3>{demo ? 'Demo mode' : 'Supabase security'}</h3>
          {demo
            ? <><p>You are viewing a browser-only demo. Connect a Supabase project to enable secure accounts and permanent cloud storage.</p><button className="text-action" onClick={async () => { await dataApi.resetDemo(); await onRefresh(); notify('Demo data reset.') }}><RotateCcw size={15} /> Reset demo data</button></>
            : <p>Your profile, services, invoices, and gift-card transactions are protected by Supabase authentication and row-level security.</p>}
        </article>
      </div>
    </section>
  )
}

export function InvoiceScreen({ bill, onBack, onRefresh, notify }) {
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const items = bill.items || bill.bill_items || []
  const print = () => window.print()
  const download = () => downloadInvoicePdf(bill)

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await dataApi.deleteBill(bill.id)
      const refreshed = onRefresh ? await onRefresh(true) : true
      if (!refreshed) {
        notify(`Bill ${bill.bill_number} was deleted, but the latest bill list could not be loaded. Use Retry.`, 'error')
        onBack()
        return
      }
      if (notify) notify(`Bill ${bill.bill_number} deleted. Total revenue reduced by ${formatINR(bill.net_amount)}.`)
      onBack()
    } catch (err) {
      if (notify) notify(err.message || 'Could not delete bill.', 'error')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <section className="page invoice-page">
      <div className="invoice-actions">
        <button className="secondary-button" onClick={onBack}>
          <ArrowLeft size={16} /> Back
        </button>
        <span />
        <button className="secondary-button invoice-delete-btn" onClick={() => setDeleteConfirm(true)}>
          <Trash2 size={16} /> Delete bill
        </button>
        <button className="secondary-button" onClick={print}>
          <Printer size={16} /> Print bill
        </button>
        <button className="primary-button" onClick={download}>
          <Download size={16} /> Download PDF
        </button>
      </div>
      <article className="invoice" id="invoice-print">
        <div className="invoice__header">
          <Brand />
          <div>
            <b>Uhaas Beauty Studio</b>
            <span>123 Beauty Street, Guntur</span>
            <span>+91 98765 43210</span>
          </div>
        </div>
        <div className="invoice__title">
          <div><span>Bill no.</span><b>{bill.bill_number}</b></div>
          <h2>INVOICE</h2>
          <div><span>Date & time</span><b>{formatDate(bill.created_at, true)}</b></div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Service name</th>
                <th>Price</th>
                <th>Discount</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={item.id || index}>
                  <td>{index + 1}</td>
                  <td>{item.service_name || item.name}</td>
                  <td>{formatINR(item.unit_price)}</td>
                  <td>{formatINR(item.discount)}</td>
                  <td><b>{formatINR(item.line_total ?? item.final_price)}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="invoice__bottom">
          <p>
            Thank you for visiting Uhaas Beauty Studio!<br />
            <span>Beauty Today, Confidence Always…</span>
          </p>
          <div>
            <SummaryRow label="Subtotal" value={formatINR(bill.subtotal)} />
            <SummaryRow label="Total discount" value={`− ${formatINR(bill.total_discount)}`} />
            <SummaryRow
              label="Gift card used"
              value={
                bill.gift_card_amount
                  ? `− ${formatINR(bill.gift_card_amount)}${bill.gift_card_number ? ` (${bill.gift_card_number})` : ''}`
                  : '—'
              }
            />
            <div className="summary-rule" />
            <SummaryRow label="Physical amount paid" value={formatINR(bill.physical_amount)} />
            <SummaryRow label="Final bill total" value={formatINR(bill.net_amount)} strong />
          </div>
        </div>
      </article>

      {/* Delete Confirmation Modal from Invoice */}
      {deleteConfirm && (
        <div className="modal-backdrop" onMouseDown={() => setDeleteConfirm(false)}>
          <section className="modal delete-modal" onMouseDown={(e) => e.stopPropagation()}>
            <button className="icon-button modal__close" onClick={() => setDeleteConfirm(false)}>
              <X size={19} />
            </button>
            <div className="delete-modal-icon">
              <Trash2 size={26} />
            </div>
            <h3>Delete Bill {bill.bill_number}?</h3>
            <p>
              Are you sure you want to delete this bill? This will reduce revenue by {formatINR(bill.net_amount)}.
            </p>
            <div className="delete-modal__highlight">
              <div><b>Revenue Reduction:</b> −{formatINR(bill.net_amount)}</div>
              {Number(bill.gift_card_amount) > 0 && (
                <div style={{ marginTop: 6 }}>
                  <b>Gift Card Refund:</b> {formatINR(bill.gift_card_amount)} will be restored back to Card{' '}
                  <b>{bill.gift_card_number || 'Used Card'}</b>.
                </div>
              )}
            </div>
            <div className="delete-modal__actions">
              <button className="secondary-button" onClick={() => setDeleteConfirm(false)} disabled={deleting}>
                Cancel
              </button>
              <button className="danger-button" onClick={handleDelete} disabled={deleting}>
                {deleting ? <LoaderCircle className="spin" size={16} /> : <Trash2 size={16} />} Confirm Delete
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  )
}

function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character])) }

function downloadInvoicePdf(bill) {
  const items = bill.items || bill.bill_items || []
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
  const left = 46; let y = 52
  pdf.setTextColor(22, 131, 75); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(22); pdf.text('Uhaas Beauty Studio', left, y)
  pdf.setTextColor(60, 53, 68); pdf.setFontSize(11); pdf.text('Beauty Studio', left, y + 17)
  pdf.setFontSize(10); pdf.text(`Invoice: ${bill.bill_number}`, 420, y); pdf.text(formatDate(bill.created_at, true), 420, y + 17)
  y += 60; pdf.setDrawColor(230, 220, 225); pdf.line(left, y, 550, y); y += 25
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11); pdf.text('#', left, y); pdf.text('Service', 80, y); pdf.text('Price', 300, y); pdf.text('Discount', 380, y); pdf.text('Amount', 468, y); y += 14; pdf.setFont('helvetica', 'normal')
  items.forEach((item, index) => { if (y > 710) { pdf.addPage(); y = 50 } pdf.text(String(index + 1), left, y); pdf.text(String(item.service_name || item.name).slice(0, 31), 80, y); pdf.text(formatINR(item.unit_price), 300, y); pdf.text(formatINR(item.discount), 380, y); pdf.text(formatINR(item.line_total ?? item.final_price), 468, y); y += 22 })
  y += 18; pdf.line(330, y, 550, y); y += 18
  const totalRows = [['Subtotal', bill.subtotal], ['Discount', bill.total_discount], ['Gift card used', bill.gift_card_amount], ['Physical collected', bill.physical_amount], ['Bill total', bill.net_amount]]
  totalRows.forEach(([label, value], index) => { pdf.setFont('helvetica', index === totalRows.length - 1 ? 'bold' : 'normal'); if (index === totalRows.length - 1) pdf.setTextColor(22, 131, 75); pdf.text(label, 350, y); pdf.text(formatINR(value), 480, y); pdf.setTextColor(60, 53, 68); y += 20 })
  pdf.setFont('helvetica', 'italic'); pdf.setFontSize(10); pdf.text('Thank you for visiting Uhaas Beauty Studio!', left, 790); pdf.save(`Uhaas-Beauty-Studio-${bill.bill_number}.pdf`)
}

export default App
