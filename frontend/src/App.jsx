import { useState } from 'react'

const css = `
  :root { color-scheme: light dark; --ok: #1a7f37; --gap: #cf222e; --muted: #888; }
  body { font-family: system-ui, sans-serif; margin: 0; padding: 16px; max-width: 900px; margin-inline: auto; }
  label { display: block; font-weight: 600; margin: 12px 0 4px; }
  textarea, input { width: 100%; box-sizing: border-box; font: inherit; padding: 8px; }
  button { margin-top: 8px; padding: 8px 16px; font: inherit; cursor: pointer; }
  .error { color: var(--gap); }
  .job { border: 1px solid var(--muted); border-radius: 8px; padding: 12px; margin-top: 12px; }
  .job h3 { margin: 0; display: flex; justify-content: space-between; gap: 8px; }
  .bar { height: 8px; background: #8884; border-radius: 4px; margin: 8px 0; }
  .bar > div { height: 100%; background: var(--ok); border-radius: 4px; }
  .cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
  .ok li { color: var(--ok); } .gap li { color: var(--gap); }
  small { color: var(--muted); }
`

export default function App() {
  const [resume, setResume] = useState('')
  const [title, setTitle] = useState('')
  const [job, setJob] = useState('')
  const [jobs, setJobs] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function addJob(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume, job }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Request failed')
      setJobs((js) => [...js, { id: crypto.randomUUID(), title: title || `Job ${js.length + 1}`, ...data }])
      setTitle('')
      setJob('')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const ranked = [...jobs].sort((a, b) => b.score - a.score)

  return (
    <main>
      <style>{css}</style>
      <h1>Internship Matcher</h1>

      <form onSubmit={addJob}>
        <label htmlFor="resume">Your resume (one bullet per line)</label>
        <textarea id="resume" rows={8} value={resume} onChange={(e) => setResume(e.target.value)} required />

        <label htmlFor="title">Job title</label>
        <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Acme – SWE Intern" />

        <label htmlFor="job">Job post</label>
        <textarea id="job" rows={8} value={job} onChange={(e) => setJob(e.target.value)} required />

        <button type="submit" disabled={busy}>{busy ? 'Scoring…' : 'Add & score'}</button>
        {error && <p className="error" role="alert">{error}</p>}
      </form>

      <h2>Ranked jobs</h2>
      {ranked.length === 0 && <p><small>No jobs yet. Paste one above.</small></p>}
      {ranked.map((j, i) => (
        <section className="job" key={j.id}>
          <h3>
            <span>#{i + 1} {j.title}</span>
            <span>{j.score}%</span>
          </h3>
          <div className="bar" role="img" aria-label={`${j.score}% match`}><div style={{ width: `${j.score}%` }} /></div>
          <div className="cols">
            <div className="ok">
              <strong>Matched ({j.matched.length})</strong>
              <ul>{j.matched.map((m, k) => <li key={k} title={`Closest bullet: ${m.best_bullet}`}>{m.requirement} <small>{m.similarity}</small></li>)}</ul>
            </div>
            <div className="gap">
              <strong>Missing ({j.missing.length})</strong>
              <ul>{j.missing.map((m, k) => <li key={k}>{m.requirement} <small>{m.similarity}</small></li>)}</ul>
            </div>
            {j.not_scored?.length > 0 && (
              <div>
                <strong>Not scored ({j.not_scored.length})</strong>
                <ul>{j.not_scored.map((m, k) => <li key={k}>{m.requirement} <small>{m.reason}</small></li>)}</ul>
              </div>
            )}
          </div>
          <small>Embeddings: {j.backend}</small>{' '}
          <button type="button" onClick={() => setJobs((js) => js.filter((x) => x.id !== j.id))}>Remove</button>
        </section>
      ))}
    </main>
  )
}
