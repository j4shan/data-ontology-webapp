import { lazy, Suspense, useEffect, useRef, useState, type ComponentType } from 'react';
import { health } from './api.ts';
import type { Health } from '../../shared/protocol.ts';
const tabs = [ { id: 'explorer', label: 'Graph explorer', number: '01' }, { id: 'workbench', label: 'AKG workbench', number: '02' } ] as const;
type Tab = typeof tabs[number]['id'];
export interface FeatureProps { connection?: Health; refresh: () => Promise<void> }
const entries = import.meta.glob<{ default: ComponentType<FeatureProps> }>('./*/Entry.tsx');
const features = Object.fromEntries(Object.entries(entries).map(([path, loader]) => [path.split('/')[1], lazy(loader)]));
function currentTab(): Tab { return new URLSearchParams(location.search).get('tab') === 'workbench' ? 'workbench' : 'explorer'; }
function Blueprint({ variant }: { variant: Tab }) {
  return <div className="blueprint" aria-hidden="true"><svg viewBox="0 0 560 280"><path d="M95 140 L245 65 L440 140 L245 220 Z M95 140 H440 M245 65 V220"/>
    <rect x="40" y="110" width="110" height="60" rx="12"/><rect x="190" y="35" width="110" height="60" rx="12"/><rect x="190" y="190" width="110" height="60" rx="12"/><rect x="385" y="110" width="110" height="60" rx="12"/>
    <text x="95" y="145">{variant === 'explorer' ? 'Focus' : 'Question'}</text><text x="245" y="70">{variant === 'explorer' ? 'Identity' : 'Evidence'}</text><text x="245" y="225">{variant === 'explorer' ? 'Dataset' : 'Tool calls'}</text><text x="440" y="145">{variant === 'explorer' ? 'Neighbor' : 'AKG'}</text></svg><span>Schematic · no catalog loaded</span></div>;
}
export function App() {
  const [tab, setTab] = useState<Tab>(currentTab);
  const [connection, setConnection] = useState<Health>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const request = useRef<AbortController | undefined>(undefined);
  async function refresh() {
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    setLoading(true); setError('');
    try { const value = await health(controller.signal); if (!controller.signal.aborted) setConnection(value); }
    catch (err) { if (!controller.signal.aborted) setError((err as Error).message); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }
  useEffect(() => { void refresh(); const pop = () => setTab(currentTab()); addEventListener('popstate', pop); return () => { request.current?.abort(); removeEventListener('popstate', pop); }; }, []);
  function choose(id: Tab) { setTab(id); const url = new URL(location.href); url.searchParams.set('tab', id); history.pushState({}, '', url); }
  function keyTab(event: React.KeyboardEvent, index: number) {
    const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
    if (next >= 0) { event.preventDefault(); choose(tabs[next].id); document.getElementById(`tab-${tabs[next].id}`)?.focus(); }
  }
  const connected = !error && connection?.graph === 'connected';
  return <div className="workspace">
    <a className="skip-link" href="#workspace-content">Skip to workspace</a>
    <header className="topbar"><a href="/" className="brand" aria-label="Data Ontology home"><span className="brand-mark">◈</span><span>Data Ontology<small>GRAPH WORKSPACE</small></span></a><div className="local-badge"><span/> Local workspace</div></header>
    <div className="page-heading"><div><p className="eyebrow">KNOWLEDGE, IN CONTEXT</p><h1>Follow the evidence.</h1><p className="subtitle">Explore dataset relationships. Inspect how an agent builds its answer.</p></div><span className="release-tag">STAGE {1 + Object.keys(features).length} / 3</span></div>
    <nav className="tabbar" role="tablist" aria-label="Workspace functions">{tabs.map((item, index) => <button key={item.id} id={`tab-${item.id}`} role="tab" aria-selected={tab === item.id} aria-controls={`panel-${item.id}`} tabIndex={tab === item.id ? 0 : -1} className={tab === item.id ? 'tab active' : 'tab'} onClick={() => choose(item.id)} onKeyDown={e => keyTab(e, index)}><span>{item.number}</span>{item.label}</button>)}</nav>
    <main id="workspace-content" tabIndex={-1}>
      <section className="service-strip" aria-live="polite"><div className="service-label"><span className={`status-dot ${connected ? 'online' : ''}`}/><strong>{loading ? 'Checking graph service…' : connected ? 'Graph service connected' : 'Graph service unavailable'}</strong></div><span>{connected ? `${connection.snapshot?.node_count} datasets · ${connection.snapshot?.edge_count} relationships` : 'Connect a published snapshot to start exploring.'}</span><button className="text-button" onClick={() => void refresh()} disabled={loading}>{loading ? 'Checking…' : 'Refresh connection'}</button></section>
      {(error || (!loading && connection?.message)) && <div className="notice" role="status">{error || connection?.message}</div>}
      {tabs.map(item => <section key={item.id} role="tabpanel" id={`panel-${item.id}`} aria-labelledby={`tab-${item.id}`} hidden={tab !== item.id} tabIndex={0}>
        {features[item.id] ? <Suspense fallback={<p role="status">Loading workspace…</p>}>{(() => { const Feature = features[item.id]; return <Feature connection={connection} refresh={refresh} />; })()}</Suspense> : <><div className="feature-card"><div className="feature-intro"><p className="eyebrow">{item.id === 'explorer' ? 'FUNCTION 01' : 'FUNCTION 02'}</p><h2>{item.id === 'explorer' ? 'A neighborhood, not the whole catalog.' : 'From a BI question to graph evidence.'}</h2><p>{item.id === 'explorer' ? 'Search for an entity, select one result, and follow the surrounding datasets. Each step keeps the selected object in focus.' : 'Choose a catalog and a question. Follow the agent’s graph API calls, then inspect the assembled abstract knowledge graph.'}</p><span className="stage-pill">{item.id === 'explorer' ? 'Coming in Stage 2' : 'Coming in Stage 3'}</span></div><Blueprint variant={item.id}/></div>
        <div className="steps">{(item.id === 'explorer' ? [['Search','Grouped lexical matches'],['Focus','One selected object'],['Explore','Bounded BFS neighborhood']] : [['Choose','Catalog and BI question'],['Trace','Actual graph API calls'],['Inspect','AKG and evidence gaps']]).map(([title, description],i) => <div className="step" key={title}><span className="step-number">0{i+1}</span><div><h3>{title}</h3><p>{description}</p></div></div>)}</div></>}
      </section>)}
      <aside className="foundation"><div><p className="eyebrow">AVAILABLE NOW</p><h2>The local foundation is ready.</h2><p>Both function tabs share a read-only graph connection. CLI and SDK callers can use the same local adapter.</p></div><div className="foundation-code"><span>CLI · snapshot information</span><code>npm run cli -- graph graph.snapshot_info</code><span>CLI · connection status</span><code>npm run cli -- health</code></div></aside>
    </main><footer><span>Published knowledge is read-only.</span><span>Localhost first · Website backbone</span></footer>
  </div>;
}
