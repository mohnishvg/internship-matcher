import { useEffect, useMemo, useRef, useState } from 'react'

const STORAGE_KEY = 'internship-matcher:v1'
const MODEL_NAMES = { lmstudio: 'Qwen3 · LM Studio', 'sentence-transformers': 'MiniLM · fallback' }
const NEAR_MISS = 0.03 // within this much of the cutoff counts as a near miss
const SERVER_DOWN = "Can't reach the scoring server. Start the backend (see README), then try again."

function loadSaved() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY))
    return saved && typeof saved.resume === 'string' && Array.isArray(saved.jobs) ? saved : null
  } catch {
    return null // private window or blocked storage: start empty
  }
}

async function scoreJob(resume, job) {
  let res
  let data
  try {
    res = await fetch('/api/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resume, job }),
    })
    data = await res.json()
  } catch {
    throw new Error(SERVER_DOWN) // network failure, or the dev proxy's HTML error page
  }
  if (!res.ok) {
    throw new Error(typeof data.detail === 'string' ? data.detail : 'The resume or job post is empty or too long.')
  }
  return data
}

function splitTitle(title) {
  const [company, ...rest] = title.split(/\s+[–-]\s+/)
  return { company, role: rest.join(' – ') }
}

const rank = (jobs) =>
  [...jobs].sort((a, b) => b.score - a.score || b.matched.length - a.matched.length || a.addedAt - b.addedAt)

const toolsMissing = (job) => [...new Set(job.missing.flatMap((m) => m.tools_not_in_resume || []))]

function Mark({ ok }) {
  return ok ? (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="var(--ok)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 8.5l3 3 6-7" /></svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="var(--danger)" strokeWidth="1.75" strokeLinecap="round"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" /></svg>
  )
}

export default function App() {
  const saved = useMemo(loadSaved, [])
  const [resume, setResume] = useState(saved?.resume ?? '')
  const [editingResume, setEditingResume] = useState(!saved?.resume)
  const [jobs, setJobs] = useState(() => (saved?.jobs ?? []).map((j) => ({ ...j, isNew: false })))
  const [selectedId, setSelectedId] = useState(null)
  const [title, setTitle] = useState('')
  const [post, setPost] = useState('')
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState({})
  const [notice, setNotice] = useState('')
  const [announce, setAnnounce] = useState('')
  const [undo, setUndo] = useState(null)
  const titleRef = useRef(null)
  const undoRef = useRef(null)
  const undoTimer = useRef(null)

  const returnFocus = useRef(false)

  // Removing unmounts the focused button, so focus goes to Undo; when the toast closes it
  // comes back to the selected job (or the job form) instead of falling to the page body.
  useEffect(() => {
    if (undo) undoRef.current?.focus()
    else if (returnFocus.current) {
      returnFocus.current = false
      ;(document.querySelector('.rank-row[aria-current="true"]') ?? titleRef.current)?.focus()
    }
  }, [undo])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ resume, jobs }))
    } catch {
      /* storage full or blocked: keep working in memory */
    }
  }, [resume, jobs])

  const ranked = useMemo(() => rank(jobs), [jobs])
  const selected = jobs.find((j) => j.id === selectedId) ?? ranked[0]
  const currentResume = resume.trim()
  const stale = jobs.filter((j) => j.resume !== currentResume)
  // Same rule the scorer uses: lines of 3+ words are bullets; shorter ones are headings.
  const resumeLines = resume.split('\n').map((l) => l.replace(/^\s*[-*•]\s*/, '').trim()).filter((l) => l.split(/\s+/).length >= 3)

  function closeToast() {
    returnFocus.current = true
    setUndo(null)
    clearTimeout(undoTimer.current)
  }

  function startUndoTimer() {
    clearTimeout(undoTimer.current)
    undoTimer.current = setTimeout(() => setUndo(null), 7000)
  }

  function offerUndo(label, removed) {
    setUndo({ label, removed })
    startUndoTimer()
  }

  async function addJob(e) {
    e?.preventDefault()
    const p = post.trim()
    const next = {}
    if (!currentResume) next.resume = 'Paste your resume first, one bullet per line.'
    if (!p) next.post = 'Paste a job post to score.'
    setErrors(next)
    setNotice('')
    if (next.resume) setEditingResume(true)
    if (Object.keys(next).length) return

    const dupe = jobs.find((j) => j.text === p)
    if (dupe) {
      setSelectedId(dupe.id)
      setNotice(`Already scored as ${dupe.title}. Selected it.`)
      return
    }

    setBusy(true)
    try {
      const data = await scoreJob(currentResume, p)
      const job = {
        ...data,
        id: crypto.randomUUID(),
        title: title.trim() || `Job ${jobs.length + 1}`,
        text: p,
        resume: currentResume,
        addedAt: Date.now(),
        isNew: true,
      }
      const all = [...jobs.map((j) => ({ ...j, isNew: false })), job]
      setJobs(all)
      setSelectedId(job.id)
      setEditingResume(false)
      setTitle('')
      setPost('')
      const position = rank(all).findIndex((j) => j.id === job.id) + 1
      setAnnounce(`${job.title} scored ${job.score}%, ranked ${position} of ${all.length}.`)
      titleRef.current?.focus()
    } catch (err) {
      setErrors({ form: err.message })
    } finally {
      setBusy(false)
    }
  }

  async function rescoreAll() {
    setBusy(true)
    setErrors({})
    try {
      const fresh = []
      for (const j of jobs) {
        fresh.push(j.resume === currentResume ? j : { ...j, ...(await scoreJob(currentResume, j.text)), resume: currentResume })
      }
      setJobs(fresh)
      setAnnounce(`Rescored ${stale.length} jobs against your updated resume.`)
    } catch (err) {
      setErrors({ form: err.message })
    } finally {
      setBusy(false)
    }
  }

  function removeJob(job) {
    offerUndo(`Removed ${job.title}`, [job])
    setJobs((js) => js.filter((j) => j.id !== job.id))
    setSelectedId(null)
  }

  function clearAll() {
    offerUndo(`Cleared ${jobs.length} ${jobs.length === 1 ? 'job' : 'jobs'}`, jobs)
    setJobs([])
    setSelectedId(null)
  }

  function restore() {
    // Put back only what was removed, so jobs scored since then survive the undo.
    const { removed } = undo
    setJobs((js) => [...js, ...removed.filter((r) => !js.some((j) => j.id === r.id))])
    if (removed.length === 1) setSelectedId(removed[0].id)
    closeToast()
  }

  return (
    <div className="app">
      <header className="titlebar">
        <h1>Internship Matcher</h1>
        <p>{jobs.length ? `${jobs.length} ${jobs.length === 1 ? 'job' : 'jobs'} ranked against your resume · saved in this browser` : 'Saved in this browser only'}</p>
        <span className="spacer" />
        {jobs.length > 0 && <button type="button" className="btn btn-danger" onClick={clearAll}>Clear all jobs</button>}
      </header>

      <main className="workspace">
        <section className="panel" aria-labelledby="resume-head">
          <div className="panel-head">
            <h2 id="resume-head">Resume</h2>
            {!editingResume && <button type="button" className="btn btn-quiet" onClick={() => setEditingResume(true)}>Edit</button>}
          </div>
          <div className="section">
            {editingResume ? (
              <div className="field">
                <label htmlFor="resume">Paste your resume, one bullet per line</label>
                <textarea id="resume" className="resume-input" value={resume} onChange={(e) => setResume(e.target.value)}
                  aria-invalid={!!errors.resume} aria-describedby={errors.resume ? 'resume-error' : undefined} />
                {errors.resume && <p className="error" id="resume-error">{errors.resume}</p>}
                {resumeLines.length > 0 && (
                  <div className="row-between">
                    <span className="mono">{resumeLines.length} bullets</span>
                    <button type="button" className="btn btn-quiet" onClick={() => setEditingResume(false)}>Done</button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="resume-summary">{resumeLines.slice(0, 4).map((l, i) => <p key={i}>{l}</p>)}</div>
                <div className="row-between"><span className="mono">{resumeLines.length} bullets</span><span>Used for every score</span></div>
              </>
            )}
          </div>

          <form className="section" onSubmit={addJob} noValidate aria-labelledby="add-head">
            <h2 className="form-head" id="add-head">Add a job</h2>
            <div className="field">
              <label htmlFor="title">Company – role</label>
              <input id="title" type="text" ref={titleRef} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Capital One – Technology Intern" />
            </div>
            <div className="field">
              <label htmlFor="post">Job post</label>
              <textarea id="post" rows={9} value={post} onChange={(e) => setPost(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addJob(e) }}
                placeholder="Paste the requirements and responsibilities"
                aria-invalid={!!errors.post} aria-describedby={errors.post ? 'post-error' : 'post-hint'} />
              {errors.post
                ? <p className="error" id="post-error">{errors.post}</p>
                : <p className="hint" id="post-hint">Bullet lists work best. Press ⌘↵ to score.</p>}
            </div>
            <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy}>
              {busy ? 'Scoring…' : <>Score job <span className="kbd" aria-hidden="true">⌘↵</span></>}
            </button>
            {errors.form && <p className="error" role="alert">{errors.form}</p>}
            {notice && <p className="notice" role="status">{notice}</p>}
          </form>
        </section>

        <section className="panel" aria-labelledby="rank-head">
          <div className="panel-head">
            <h2 id="rank-head">Ranked jobs</h2>
            {jobs.length > 0 && <span className="meta">by % of requirements covered</span>}
          </div>
          {stale.length > 0 && (
            <div className="stale-bar">
              <span>Your resume changed since {stale.length === 1 ? '1 job was' : `${stale.length} jobs were`} scored.</span>
              <button type="button" className="btn btn-quiet" onClick={rescoreAll} disabled={busy}>Rescore</button>
            </div>
          )}
          {jobs.length === 0 ? (
            <div className="empty">
              <h3>No jobs yet</h3>
              <p>Paste your resume, then a job post. Each job lands here, ranked by how much of its requirements your resume covers.</p>
            </div>
          ) : (
            <>
              <div className="rank-cols" aria-hidden="true"><span>#</span><span>Company / role</span><span>Matched</span><span>Score</span></div>
              <ol className="rank-list">
                {ranked.map((j, i) => {
                  const { company, role } = splitTitle(j.title)
                  const tools = toolsMissing(j)
                  const total = j.matched.length + j.missing.length
                  return (
                    <li key={j.id}>
                      <button type="button" className="rank-row" aria-current={selected?.id === j.id}
                        onClick={() => setSelectedId(j.id)} title={j.title} aria-label={`${j.title}, ${j.score}%, ${j.matched.length} of ${total} matched`}>
                        <span className="rank-num mono">{i + 1}</span>
                        <span className="job-cell">
                          <span className="job-name">{company}
                            {j.isNew && <span className="chip chip-new">New</span>}
                            {j.resume !== currentResume && <span className="chip chip-stale">Stale</span>}
                          </span>
                          {role && <span className="job-role">{role}</span>}
                          {tools.length > 0 && <span className="job-tools">Lacks {tools.join(', ')}</span>}
                        </span>
                        <span className="matched-count mono">{j.matched.length}/{total}</span>
                        <span className="score">
                          <span className="bar"><i style={{ width: `${j.score}%` }} /></span>
                          <span className="score-val mono">{j.score}%</span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ol>
            </>
          )}
        </section>

        <section className="panel" aria-labelledby="evidence-head">
          <div className="panel-head">
            <h2 id="evidence-head">Evidence</h2>
            {selected && <span className="meta mono">{MODEL_NAMES[selected.backend] ?? selected.backend}</span>}
          </div>
          {selected
            ? <Evidence key={selected.id} job={selected} onRemove={() => removeJob(selected)} />
            : <div className="empty"><p>Pick a job to see its gaps first, then the matches, each with the resume line that came closest.</p></div>}
        </section>
      </main>

      <p className="sr-only" aria-live="polite">{announce}</p>
      {undo && (
        <div className="toast" role="status"
          onFocus={() => clearTimeout(undoTimer.current)} onBlur={startUndoTimer}
          onMouseEnter={() => clearTimeout(undoTimer.current)} onMouseLeave={startUndoTimer}
          onKeyDown={(e) => { if (e.key === 'Escape') closeToast() }}>
          <span>{undo.label}</span>
          <button type="button" className="btn btn-quiet" ref={undoRef} onClick={restore}>Undo</button>
        </div>
      )}
    </div>
  )
}

function Evidence({ job, onRemove }) {
  const { company, role } = splitTitle(job.title)
  const total = job.matched.length + job.missing.length
  const { cutoff } = job
  return (
    <div className="evidence">
      <h3 className="title">{company}</h3>
      {role && <p className="role">{role}</p>}
      <div className="scoreline">
        <span className="big mono">{job.score}%</span>
        <span>{job.matched.length} of {total} scored requirements met</span>
      </div>
      <div className="bar evidence-bar"><i style={{ width: `${job.score}%` }} /></div>
      <p className="legend">
        Numbers are similarity from 0 to 1 between a requirement and your closest resume line
        {cutoff != null && <>; {cutoff.toFixed(2)} or higher counts as met</>}.
      </p>

      <div className="group">
        <h4 className="group-head missing">Missing <span className="count mono">{job.missing.length}</span></h4>
        {job.missing.length === 0 ? <p className="none">Nothing missing.</p> : (
          <ul className="req req-missing">
            {job.missing.map((m, k) => (
              <li key={k}>
                <Mark ok={false} />
                <div>
                  <p className="text">{m.requirement}</p>
                  {m.tools_not_in_resume ? (
                    <div className="tags">Not on your resume: {m.tools_not_in_resume.map((t) => <span key={t} className="tag">{t}</span>)}</div>
                  ) : cutoff != null && m.similarity >= cutoff - NEAR_MISS ? (
                    <p className="near">Near miss: just under the cutoff. Check whether your closest line covers it.</p>
                  ) : null}
                  <p className="closest"><b>Closest:</b> {m.best_bullet}</p>
                </div>
                <span className="sim mono">{m.similarity.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="group">
        <h4 className="group-head matched">Matched <span className="count mono">{job.matched.length}</span></h4>
        {job.matched.length === 0 ? <p className="none">No requirement reached the cutoff.</p> : (
          <ul className="req">
            {job.matched.map((m, k) => (
              <li key={k}>
                <Mark ok />
                <div>
                  <p className="text">{m.requirement}</p>
                  <p className="closest"><b>From:</b> {m.best_bullet}</p>
                </div>
                <span className="sim mono">{m.similarity.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {job.not_scored?.length > 0 && (
        <details className="unscored">
          <summary>Not scored: {job.not_scored.length} soft-skill {job.not_scored.length === 1 ? 'line' : 'lines'}</summary>
          <ul>{job.not_scored.map((m, k) => <li key={k}>{m.requirement}</li>)}</ul>
        </details>
      )}

      <div className="isolated">
        <div className="rule">
          <span className="meta">Removing keeps your resume. You can undo.</span>
          <button type="button" className="btn btn-danger" onClick={onRemove}>Remove job</button>
        </div>
      </div>
    </div>
  )
}
