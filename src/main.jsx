import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowRight, Check, ChevronDown, CircleAlert, ClipboardCheck, Factory, Layers3, LogOut, PackageCheck, Plus, RefreshCw, Scissors, ShieldCheck, Shirt, X } from 'lucide-react';
import './styles.css';

const DEMOS = [
  { role: 'cutting_supervisor', title: 'Cutting supervisor', name: 'Maya Perera', email: 'supervisor@apparelflow.demo', password: 'Supervisor123!', icon: Scissors },
  { role: 'cutting_verifier', title: 'Cutting verifier', name: 'Nilan Fernando', email: 'verifier@apparelflow.demo', password: 'Verifier123!', icon: ClipboardCheck },
  { role: 'sewing_supervisor', title: 'Sewing supervisor', name: 'Asha Silva', email: 'sewing@apparelflow.demo', password: 'Sewing123!', icon: Shirt },
];

const STATUS_LABELS = {
  PENDING_VERIFICATION: 'Pending verification', REJECTED: 'Rejected', VERIFIED: 'Verified', IN_SEWING: 'In sewing',
};

async function api(path, { method = 'GET', body } = {}) {
  const response = await fetch(`/api${path}`, {
    method, credentials: 'same-origin',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}

function formatDate(value) {
  if (!value) return '—';
  const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
  return new Date(normalized).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function StatusPill({ status }) {
  return <span className={`status-pill ${status?.toLowerCase() || ''}`}><span className="status-dot" />{STATUS_LABELS[status] || status}</span>;
}

function Metric({ label, value, icon: Icon, tone }) {
  return <div className={`metric ${tone || ''}`}><div className="metric-icon"><Icon size={19} strokeWidth={1.9} /></div><div><span className="metric-label">{label}</span><strong>{value}</strong></div></div>;
}

function Login({ onLogin, busy, error }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showManual, setShowManual] = useState(false);
  return <div className="login-page">
    <div className="login-brand"><div className="brand-mark"><Layers3 size={23} /></div><span>APPARELFLOW <small>ERP</small></span></div>
    <main className="login-layout">
      <div className="login-copy"><span className="eyebrow">PRODUCTION CONTROL · CUTTING TO SEWING</span><h1>Every piece counts.<br /><em>Every batch moves with confidence.</em></h1><p>A single checkpoint between the cutting floor and the sewing line. Create orders, verify every component, and release only complete batches.</p><div className="login-flow"><span><Scissors size={17} /> Cut</span><i /><span><ClipboardCheck size={17} /> Verify</span><i /><span><Shirt size={17} /> Sew</span></div></div>
      <section className="login-card" aria-labelledby="login-heading"><div className="card-topline"><span className="live-dot" /> FACTORY WORKSPACE</div><h2 id="login-heading">Choose a demo role</h2><p>Each role signs in with a real account and has its own permissions.</p><div className="demo-list">{DEMOS.map(persona => <button key={persona.role} className="demo-role" type="button" disabled={busy} onClick={() => onLogin(persona.email, persona.password)}><span className="demo-icon"><persona.icon size={20} /></span><span className="demo-text"><strong>{persona.title}</strong><small>{persona.name}</small></span><ArrowRight size={18} /></button>)}</div><button className="text-button manual-toggle" type="button" onClick={() => setShowManual(value => !value)} aria-expanded={showManual}>Sign in with credentials <ChevronDown className={showManual ? 'rotated' : ''} size={16} /></button>{showManual && <form className="manual-form" onSubmit={event => { event.preventDefault(); onLogin(email, password); }}><label>Email<input type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} required /></label><label>Password<input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required /></label><button className="button button-primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button></form>}{error && <p className="inline-error" role="alert"><CircleAlert size={16} />{error}</p>}</section>
    </main><div className="login-footer">WEBTEZZA · APPARELFLOW PRODUCTION GATE</div>
  </div>;
}

function OrderForm({ recipes, onClose, onCreate, busy }) {
  const firstField = useRef(null);
  const [recipeId, setRecipeId] = useState(recipes[0]?.id || '');
  const [quantity, setQuantity] = useState('');
  const [roll, setRoll] = useState('');
  const [yards, setYards] = useState('');
  const [error, setError] = useState('');
  const recipe = recipes.find(item => item.id === Number(recipeId));
  const validQuantity = /^[1-9]\d*$/.test(quantity) && Number.isSafeInteger(Number(quantity));
  const expectedFabric = validQuantity && recipe ? Number(quantity) * recipe.std_fabric_yards : null;
  useEffect(() => {
    firstField.current?.focus();
    const onKeyDown = event => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);
  async function submit(event) {
    event.preventDefault();
    if (!validQuantity) return setError('Batch quantity must be a positive whole number.');
    if (!/^[A-Za-z0-9][A-Za-z0-9-]{1,39}$/.test(roll.trim())) return setError('Use 2–40 letters, numbers, or hyphens for the fabric roll ID.');
    if (!/^\d+(?:\.\d+)?$/.test(yards) || Number(yards) <= 0) return setError('Actual fabric used must be a positive number.');
    setError('');
    try { await onCreate({ recipe_id: Number(recipeId), target_qty: Number(quantity), fabric_roll_id: roll.trim(), actual_fabric_yds: Number(yards) }); }
    catch (cause) { setError(cause.message); }
  }
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="new-order-title"><div className="modal-head"><div><span className="eyebrow">CUTTING OPERATIONS</span><h2 id="new-order-title">New cutting order</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close"><X size={20} /></button></div><form onSubmit={submit}><div className="form-grid"><label className="field field-full">Production recipe<select ref={firstField} value={recipeId} onChange={event => setRecipeId(Number(event.target.value))}>{recipes.map(item => <option value={item.id} key={item.id}>{item.name} · {item.recipe_code}</option>)}</select></label><label className="field">Target batch quantity<input type="text" inputMode="numeric" value={quantity} onChange={event => setQuantity(event.target.value)} placeholder="e.g. 50" required /></label><label className="field">Fabric roll ID<input value={roll} onChange={event => setRoll(event.target.value)} placeholder="e.g. FAB-ROLL-882" required /></label><label className="field field-full">Actual fabric used <span className="field-suffix">yards</span><input type="text" inputMode="decimal" value={yards} onChange={event => setYards(event.target.value)} placeholder="e.g. 92" required /></label></div>{recipe && <div className="recipe-preview"><div><strong>Expected cut parts</strong><span>{expectedFabric !== null ? `Standard fabric: ${expectedFabric.toFixed(1)} yards` : 'Enter a quantity to preview requirements'}</span></div><div className="preview-items">{recipe.components.map(item => <span key={item.id}>{item.component_name} <b>× {validQuantity ? item.pieces_per_garment * Number(quantity) : '—'}</b></span>)}</div></div>}{error && <p className="inline-error" role="alert"><CircleAlert size={16} />{error}</p>}<div className="modal-actions"><button className="button button-secondary" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy} type="submit">{busy ? 'Creating…' : 'Create order'} <ArrowRight size={17} /></button></div></form></section></div>;
}

function OrderList({ orders, selectedId, onSelect, emptyTitle, emptyText }) {
  if (!orders.length) return <div className="empty-state"><div className="empty-icon"><PackageCheck size={28} /></div><strong>{emptyTitle}</strong><p>{emptyText}</p></div>;
  return <div className="order-list">{orders.map(order => <button type="button" className={`order-row ${selectedId === order.id ? 'selected' : ''}`} key={order.id} onClick={() => onSelect(order.id)}><span className="order-row-main"><span className="order-row-title">{order.recipe_name}</span><span className="order-row-meta">{order.order_no} <span>·</span> {order.target_qty} garments</span></span><span className="order-row-right"><StatusPill status={order.status} /><small>{formatDate(order.created_at)}</small></span></button>)}</div>;
}

function VerificationPanel({ order, refresh, runAction, busy }) {
  const [draft, setDraft] = useState({});
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { setDraft(Object.fromEntries(order.items.map(item => [item.id, item.actual_qty === null ? '' : String(item.actual_qty)]))); setReason(''); setError(''); }, [order.id, order.updated_at]);
  const counts = order.items.map(item => { const entered = draft[item.id] ?? ''; const numeric = /^\d+$/.test(entered) ? Number(entered) : null; return { ...item, entered, actual: Number.isSafeInteger(numeric) ? numeric : null }; });
  const complete = counts.every(item => item.actual !== null && Number.isSafeInteger(item.actual));
  const shortage = counts.some(item => item.actual !== null && item.actual < item.expected_qty);
  const dirty = counts.some(item => (item.actual === null ? null : item.actual) !== item.actual_qty);
  const canApprove = complete && !shortage && !dirty && order.status === 'PENDING_VERIFICATION';
  async function saveCounts() {
    if (!complete) return setError('Enter a non-negative whole count for every component.');
    setError('');
    try { await runAction(`/orders/${order.id}/counts`, 'PUT', { counts: counts.map(item => ({ item_id: item.id, actual_qty: item.actual })) }, 'Counts saved'); }
    catch (cause) { setError(cause.message); }
  }
  async function reject() {
    if (reason.trim().length < 5) return setError('Add a rejection reason of at least 5 characters.');
    setError('');
    try { await runAction(`/orders/${order.id}/reject`, 'POST', { reason }, 'Batch rejected and returned to cutting'); }
    catch (cause) { setError(cause.message); }
  }
  return <div className="detail-body"><div className="detail-intro"><span className="eyebrow">COMPONENT COUNT</span><h3>Verification terminal</h3><p>Count each physical part against the recipe requirement. Save counts before approval.</p></div><div className="count-table" role="group" aria-label="Component counts"><div className="count-head"><span>COMPONENT</span><span>EXPECTED</span><span>ACTUAL</span><span>STATUS</span></div>{counts.map(item => { const flag = item.actual === null ? 'UNCOUNTED' : item.actual < item.expected_qty ? 'RED' : item.actual > item.expected_qty ? 'YELLOW' : 'GREEN'; return <div className="count-row" key={item.id}><div className="component-name"><strong>{item.component_name}</strong><small>{item.pieces_per_garment} per garment</small></div><strong className="expected-number">{item.expected_qty}</strong><label className="count-input-label"><span className="sr-only">Actual count for {item.component_name}</span><input type="text" inputMode="numeric" value={item.entered} onChange={event => setDraft(value => ({ ...value, [item.id]: event.target.value }))} aria-invalid={item.entered !== '' && item.actual === null} disabled={order.status !== 'PENDING_VERIFICATION'} /></label><span className={`flag ${flag.toLowerCase()}`}>{flag === 'UNCOUNTED' ? 'Not counted' : flag === 'GREEN' ? 'Match' : flag === 'YELLOW' ? 'Excess' : 'Shortage'}</span></div>; })}</div><div className="verification-actions"><button type="button" className="button button-secondary" onClick={saveCounts} disabled={busy || !complete || !dirty || order.status !== 'PENDING_VERIFICATION'}>Save counts</button><button type="button" className="button button-primary" onClick={() => runAction(`/orders/${order.id}/approve`, 'POST', undefined, 'Batch verified and released to sewing').catch(cause => setError(cause.message))} disabled={busy || !canApprove}><ShieldCheck size={17} /> Approve batch</button></div>{shortage && <p className="warning-note"><CircleAlert size={17} /> Approval is blocked while any component has a shortage.</p>}{dirty && complete && !shortage && <p className="helper-note">Save these counts to enable approval.</p>}<div className="reject-box"><strong>Reject this batch</strong><p>Record a reason so cutting can correct the batch and send it back for verification.</p><label className="field">Reason note<textarea value={reason} onChange={event => setReason(event.target.value)} rows="3" placeholder="Describe the shortage or defect" disabled={order.status !== 'PENDING_VERIFICATION'} /></label><button type="button" className="button button-danger" onClick={reject} disabled={busy || order.status !== 'PENDING_VERIFICATION'}>Reject batch</button></div>{error && <p className="inline-error" role="alert"><CircleAlert size={16} />{error}</p>}</div>;
}

function DetailPanel({ order, role, refresh, runAction, busy }) {
  const [resubmitFabric, setResubmitFabric] = useState('');
  const [localError, setLocalError] = useState('');
  useEffect(() => { setResubmitFabric(String(order.actual_fabric_yds)); setLocalError(''); }, [order.id, order.status]);
  const approved = order.logs.find(log => log.decision === 'APPROVED');
  return <section className="detail-panel" aria-label="Order details"><div className="detail-header"><div><span className="eyebrow">{order.order_no}</span><h2>{order.recipe_name}</h2><p>{order.recipe_code} · Fabric roll {order.fabric_roll_id}</p></div><StatusPill status={order.status} /></div><div className="detail-facts"><div><span>Batch quantity</span><strong>{order.target_qty} garments</strong></div><div><span>Actual fabric</span><strong>{order.actual_fabric_yds} yards</strong></div><div><span>Created by</span><strong>{order.creator_name}</strong></div></div>{role === 'cutting_verifier' && order.status === 'PENDING_VERIFICATION' ? <VerificationPanel order={order} refresh={refresh} runAction={runAction} busy={busy} /> : <div className="detail-body"><div className="detail-intro"><span className="eyebrow">BATCH COMPONENTS</span><h3>Piece requirements</h3></div><div className="summary-list">{order.items.map(item => <div key={item.id}><span>{item.component_name}</span><strong>{item.actual_qty === null ? '—' : item.actual_qty} <small>/ {item.expected_qty} expected</small></strong></div>)}</div>{role === 'cutting_supervisor' && order.status === 'REJECTED' && <div className="resubmit-box"><strong>Ready for another check?</strong><p>After recutting, update total fabric used and send this batch back to the verifier. Counts will be cleared for a fresh inspection.</p><label className="field">Total fabric used (yards)<input type="text" inputMode="decimal" value={resubmitFabric} onChange={event => setResubmitFabric(event.target.value)} /></label><button className="button button-primary" disabled={busy} onClick={() => { if (!/^\d+(?:\.\d+)?$/.test(resubmitFabric) || Number(resubmitFabric) <= 0) return setLocalError('Enter a positive fabric amount.'); runAction(`/orders/${order.id}/resubmit`, 'POST', { actual_fabric_yds: Number(resubmitFabric) }, 'Batch returned to verification').catch(cause => setLocalError(cause.message)); }}>Resubmit for verification <ArrowRight size={16} /></button>{localError && <p className="inline-error" role="alert">{localError}</p>}</div>}{role === 'sewing_supervisor' && order.status === 'VERIFIED' && <div className="sewing-action"><div><strong>Released to assembly</strong><p>All required pieces were verified by {approved?.verifier_name || 'the verifier'}.</p></div><button className="button button-primary" disabled={busy} onClick={() => runAction(`/sewing/${order.id}/start`, 'POST', undefined, 'Sewing assembly started').catch(cause => setLocalError(cause.message))}>Start sewing <ArrowRight size={16} /></button>{localError && <p className="inline-error" role="alert">{localError}</p>}</div>}{approved && <div className="audit-highlight"><ShieldCheck size={21} /><div><strong>Verified by {approved.verifier_name}</strong><span>{formatDate(approved.created_at)} · Fabric variance {approved.wastage_pct > 0 ? '+' : ''}{approved.wastage_pct}%</span></div></div>}</div>}{order.logs.length > 0 && <div className="audit-section"><span className="eyebrow">IMMUTABLE HISTORY</span><h3>Audit trail</h3>{order.logs.map(log => <div className="audit-row" key={log.id}><span className={`audit-symbol ${log.decision.toLowerCase()}`}>{log.decision === 'APPROVED' ? <Check size={16} /> : <X size={16} />}</span><div><strong>{log.decision === 'APPROVED' ? 'Batch approved' : 'Batch rejected'} <span>by {log.verifier_name}</span></strong><small>{formatDate(log.created_at)}{log.rejection_note ? ` · ${log.rejection_note}` : ''}</small></div></div>)}</div>}</section>;
}

function App() {
  const [user, setUser] = useState(null);
  const [recipes, setRecipes] = useState([]);
  const [orders, setOrders] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load(currentUser = user, preferredId = selectedId) {
    if (!currentUser) return;
    const [orderResult, recipeResult] = await Promise.all([api('/orders'), api('/recipes')]);
    setOrders(orderResult.orders);
    setRecipes(recipeResult.recipes);
    const available = currentUser.role === 'cutting_verifier'
      ? orderResult.orders.filter(item => item.status === 'PENDING_VERIFICATION')
      : orderResult.orders;
    const id = preferredId && available.some(item => item.id === preferredId) ? preferredId : available[0]?.id;
    setSelectedId(id || null);
    setSelected(id ? (await api(`/orders/${id}`)).order : null);
  }
  useEffect(() => { api('/auth/me').then(async result => { setUser(result.user); await load(result.user, null); }).catch(() => {}).finally(() => setBooting(false)); }, []);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 4500); return () => clearTimeout(timer); }, [notice]);

  async function login(email, password) {
    setBusy(true); setError('');
    try { const result = await api('/auth/login', { method: 'POST', body: { email, password } }); setUser(result.user); setSelectedId(null); await load(result.user, null); }
    catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }
  async function switchRole(persona) {
    setBusy(true); setError('');
    try { await api('/auth/logout', { method: 'POST' }); const result = await api('/auth/login', { method: 'POST', body: { email: persona.email, password: persona.password } }); setUser(result.user); setSelectedId(null); setSelected(null); await load(result.user, null); setNotice(`Switched to ${persona.title}`); }
    catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }
  async function logout() {
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* Clear the local view even if the session expired. */ }
    setUser(null); setOrders([]); setSelected(null); setError('');
  }
  async function selectOrder(id) {
    setSelectedId(id); setError('');
    try { setSelected((await api(`/orders/${id}`)).order); } catch (cause) { setError(cause.message); }
  }
  async function runAction(path, method, body, message) {
    setBusy(true); setError('');
    try { await api(path, { method, body }); await load(user, selectedId); setNotice(message); }
    catch (cause) { setError(cause.message); throw cause; }
    finally { setBusy(false); }
  }
  async function createOrder(body) {
    setBusy(true);
    try { const result = await api('/orders', { method: 'POST', body }); setShowCreate(false); await load(user, result.order.id); setNotice('Cutting order created and sent to verification'); }
    finally { setBusy(false); }
  }

  const role = user?.role;
  const visibleOrders = useMemo(() => role === 'cutting_verifier' ? orders.filter(order => order.status === 'PENDING_VERIFICATION') : orders, [orders, role]);
  const selectedVisible = selected && visibleOrders.some(order => order.id === selected.id);
  const activeOrder = selectedVisible ? selected : null;
  const pending = orders.filter(order => order.status === 'PENDING_VERIFICATION').length;
  const verified = orders.filter(order => order.status === 'VERIFIED').length;
  const rejected = orders.filter(order => order.status === 'REJECTED').length;
  if (booting) return <div className="loading-screen"><div className="brand-mark"><Layers3 size={24} /></div><span>Loading ApparelFlow…</span></div>;
  if (!user) return <Login onLogin={login} busy={busy} error={error} />;
  const persona = DEMOS.find(item => item.role === role);
  return <div className="app-shell"><aside className="sidebar"><div className="sidebar-brand"><div className="brand-mark"><Layers3 size={22} /></div><span>APPARELFLOW <small>ERP</small></span></div><div className="sidebar-section">WORKSPACE</div><div className="nav-item active">{role === 'cutting_supervisor' ? <Scissors size={19} /> : role === 'cutting_verifier' ? <ClipboardCheck size={19} /> : <Shirt size={19} />}<span>{role === 'cutting_supervisor' ? 'Cutting orders' : role === 'cutting_verifier' ? 'Verification' : 'Sewing queue'}</span></div><div className="sidebar-spacer" /><div className="sidebar-divider" /><div className="sidebar-section">DEMO ROLE SWITCHER</div><div className="role-switcher">{DEMOS.map(item => <button className={`role-option ${role === item.role ? 'active' : ''}`} key={item.role} type="button" onClick={() => role !== item.role && switchRole(item)} disabled={busy} aria-current={role === item.role ? 'page' : undefined}><item.icon size={17} /><span>{item.title}</span>{role === item.role && <Check size={14} />}</button>)}</div><button className="sidebar-user" type="button" onClick={logout}><span className="avatar">{user.full_name.split(' ').map(word => word[0]).slice(0, 2).join('')}</span><span><strong>{user.full_name}</strong><small>Sign out</small></span><LogOut size={17} /></button></aside><div className="main-area"><header className="topbar"><span><span className="live-dot" /> PRODUCTION WORKSPACE</span><div><Factory size={17} /> <span>ApparelFlow · Gatekeeper</span></div><div className="mobile-actions"><label className="sr-only" htmlFor="mobile-role">Demo role</label><select id="mobile-role" value={role} disabled={busy} onChange={event => { const next = DEMOS.find(item => item.role === event.target.value); if (next && next.role !== role) switchRole(next); }}>{DEMOS.map(item => <option value={item.role} key={item.role}>{item.title}</option>)}</select><button type="button" className="icon-button" onClick={logout} aria-label="Sign out"><LogOut size={18} /></button></div></header><main className="content"><div className="page-heading"><div><span className="eyebrow">{role === 'cutting_supervisor' ? 'CUTTING OPERATIONS' : role === 'cutting_verifier' ? 'QUALITY CHECKPOINT' : 'ASSEMBLY FLOOR'}</span><h1>{role === 'cutting_supervisor' ? 'Cutting orders' : role === 'cutting_verifier' ? 'Verification terminal' : 'Sewing queue'}</h1><p>{role === 'cutting_supervisor' ? 'Create production batches and track every handoff to verification.' : role === 'cutting_verifier' ? 'Inspect every cut component before a batch reaches sewing.' : 'Only complete, verified batches are released for assembly.'}</p></div>{role === 'cutting_supervisor' && <button className="button button-primary create-button" type="button" onClick={() => setShowCreate(true)}><Plus size={18} /> New cutting order</button>}</div><div className="metrics"><Metric label={role === 'sewing_supervisor' ? 'Ready for sewing' : 'Total orders'} value={orders.length} icon={Layers3} /><Metric label="Pending verification" value={role === 'sewing_supervisor' ? '—' : pending} icon={ClipboardCheck} tone="amber" /><Metric label="Verified batches" value={verified} icon={ShieldCheck} tone="green" />{role !== 'sewing_supervisor' && <Metric label="Need correction" value={rejected} icon={CircleAlert} tone="red" />}</div>{notice && <div className="notice" role="status"><Check size={17} />{notice}<button type="button" aria-label="Dismiss notification" onClick={() => setNotice('')}><X size={16} /></button></div>}{error && <div className="global-error" role="alert"><CircleAlert size={17} />{error}<button type="button" aria-label="Dismiss error" onClick={() => setError('')}><X size={16} /></button></div>}<div className="workspace-grid"><section className="list-panel"><div className="panel-heading"><div><h2>{role === 'cutting_verifier' ? 'Awaiting inspection' : role === 'sewing_supervisor' ? 'Released batches' : 'All batches'}</h2><span>{visibleOrders.length} {visibleOrders.length === 1 ? 'batch' : 'batches'}</span></div><button className="icon-button" type="button" onClick={() => load().catch(cause => setError(cause.message))} aria-label="Refresh orders"><RefreshCw size={17} /></button></div><OrderList orders={visibleOrders} selectedId={activeOrder?.id} onSelect={selectOrder} emptyTitle={role === 'sewing_supervisor' ? 'No batches released yet' : role === 'cutting_verifier' ? 'All caught up' : 'No cutting orders yet'} emptyText={role === 'sewing_supervisor' ? 'Approved batches will appear here after verification.' : role === 'cutting_verifier' ? 'New cutting batches will appear here when they are ready for inspection.' : 'Create the first cutting order to get production moving.'} /></section>{activeOrder ? <DetailPanel key={activeOrder.id} order={activeOrder} role={role} refresh={load} runAction={runAction} busy={busy} /> : <section className="detail-panel detail-placeholder"><div className="empty-icon"><PackageCheck size={30} /></div><h2>{visibleOrders.length ? 'Select a batch' : 'Waiting for a batch'}</h2><p>{visibleOrders.length ? 'Choose an order to inspect its parts and history.' : 'Batch details will appear here when work is available.'}</p></section>}</div></main></div>{showCreate && <OrderForm recipes={recipes} onClose={() => setShowCreate(false)} onCreate={createOrder} busy={busy} />}</div>;
}

createRoot(document.getElementById('root')).render(<App />);
