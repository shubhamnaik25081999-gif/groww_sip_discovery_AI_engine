'use client';

import { useState, useTransition } from 'react';
import {
  updateContradictionStatusAction,
  updateResearchQuestionAction,
  createResearchQuestionAction,
} from '@/app/actions';

export interface ContradictionItem {
  id: string;
  title: string;
  description: string;
  status: string;
  resolutionNotes: string | null;
  evidenceA: {
    id: string;
    originalText: string;
    platform: string;
    sourceUrl: string;
    collectedAt: string;
  };
  evidenceB: {
    id: string;
    originalText: string;
    platform: string;
    sourceUrl: string;
    collectedAt: string;
  };
}

export interface ResearchQuestionItem {
  id: string;
  question: string;
  origin: string;
  relatedJourneyStage: string | null;
  status: string;
  answerSummary: string | null;
  createdAt: string;
}

export interface StageCoverageItem {
  stageKey: string;
  stageLabel: string;
  count: number;
  pct: number;
  density: 'healthy' | 'moderate' | 'thin';
}

export function TrackerView({
  contradictions,
  questions,
  stageCoverage,
  platformCoverage,
}: {
  contradictions: ContradictionItem[];
  questions: ResearchQuestionItem[];
  stageCoverage: StageCoverageItem[];
  platformCoverage: Array<{ platform: string; count: number; pct: number }>;
}) {
  const [activeTab, setActiveTab] = useState<'contradictions' | 'gaps' | 'questions'>('contradictions');
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Contradiction editing state
  const [editingContradictionId, setEditingContradictionId] = useState<string | null>(null);
  const [contradictionNotes, setContradictionNotes] = useState('');
  const [contradictionStatus, setContradictionStatus] = useState<'open' | 'explained' | 'resolved'>('open');

  // Question answering state
  const [answeringQuestionId, setAnsweringQuestionId] = useState<string | null>(null);
  const [questionAnswer, setQuestionAnswer] = useState('');
  const [questionStatus, setQuestionStatus] = useState<'open' | 'investigating' | 'answered' | 'deferred'>('open');

  // New question modal state
  const [isNewQuestionOpen, setIsNewQuestionOpen] = useState(false);
  const [newQuestionText, setNewQuestionText] = useState('');
  const [newQuestionStage, setNewQuestionStage] = useState('first_instalment');

  const handleUpdateContradiction = (id: string) => {
    setMsg(null);
    startTransition(async () => {
      const res = await updateContradictionStatusAction(id, contradictionStatus, contradictionNotes);
      if (res.success) {
        setMsg({ type: 'success', text: 'Contradiction resolution updated.' });
        setEditingContradictionId(null);
      } else {
        setMsg({ type: 'error', text: res.error || 'Failed to update contradiction.' });
      }
    });
  };

  const handleUpdateQuestion = (id: string) => {
    setMsg(null);
    startTransition(async () => {
      const res = await updateResearchQuestionAction(id, questionStatus, questionAnswer);
      if (res.success) {
        setMsg({ type: 'success', text: 'Research question status and answer recorded.' });
        setAnsweringQuestionId(null);
      } else {
        setMsg({ type: 'error', text: res.error || 'Failed to update question.' });
      }
    });
  };

  const handleCreateQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestionText.trim()) return;
    setMsg(null);
    startTransition(async () => {
      const res = await createResearchQuestionAction(newQuestionText, newQuestionStage);
      if (res.success) {
        setMsg({ type: 'success', text: 'New research inquiry logged.' });
        setIsNewQuestionOpen(false);
        setNewQuestionText('');
      } else {
        setMsg({ type: 'error', text: res.error || 'Failed to create question.' });
      }
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Navigation Tabs */}
      <div
        className="card"
        style={{
          padding: '12px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className={`btn ${activeTab === 'contradictions' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('contradictions')}
          >
            ⚡ Evidence Contradictions ({contradictions.length})
          </button>

          <button
            className={`btn ${activeTab === 'gaps' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('gaps')}
          >
            📊 Coverage & Research Gaps
          </button>

          <button
            className={`btn ${activeTab === 'questions' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('questions')}
          >
            ❓ Inquiries & Open Questions ({questions.length})
          </button>
        </div>

        {activeTab === 'questions' && (
          <button className="btn btn-primary" onClick={() => setIsNewQuestionOpen(true)}>
            + Log Research Inquiry
          </button>
        )}
      </div>

      {msg && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            fontSize: '13px',
            background: msg.type === 'success' ? 'var(--emerald-glow)' : 'var(--red-glow)',
            border: `1px solid ${msg.type === 'success' ? 'var(--emerald-border)' : 'var(--red-border)'}`,
            color: msg.type === 'success' ? 'var(--emerald-400)' : 'var(--red-400)',
          }}
        >
          {msg.text}
        </div>
      )}

      {/* TAB 1: CONTRADICTIONS */}
      {activeTab === 'contradictions' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="card" style={{ padding: '18px 20px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Tension Points & Divergent Investor Mentalities</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
              Real qualitative evidence frequently presents opposing expectations across investor cohorts. Rather than ignoring discrepancies, we track both polarities to understand segment dynamics.
            </p>
          </div>

          {contradictions.length === 0 ? (
            <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              No contradiction pairs identified yet.
            </div>
          ) : (
            contradictions.map((c) => {
              const isEditing = editingContradictionId === c.id;

              return (
                <div
                  key={c.id}
                  className="card"
                  style={{
                    padding: '24px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '18px',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          className={`badge ${
                            c.status === 'explained'
                              ? 'badge-emerald'
                              : c.status === 'resolved'
                              ? 'badge-blue'
                              : 'badge-amber'
                          }`}
                          style={{ textTransform: 'capitalize' }}
                        >
                          {c.status}
                        </span>
                        <h4 style={{ fontSize: '16px', fontWeight: 600 }}>{c.title}</h4>
                      </div>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
                        {c.description}
                      </p>
                    </div>

                    <button
                      className="btn btn-secondary"
                      style={{ padding: '4px 10px', fontSize: '12px' }}
                      onClick={() => {
                        if (isEditing) {
                          setEditingContradictionId(null);
                        } else {
                          setEditingContradictionId(c.id);
                          setContradictionNotes(c.resolutionNotes || '');
                          setContradictionStatus(c.status as any);
                        }
                      }}
                    >
                      {isEditing ? 'Cancel Edit' : 'Edit Explanation'}
                    </button>
                  </div>

                  {/* Opposing Evidence Sides */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    {/* Side A */}
                    <div
                      style={{
                        padding: '14px',
                        borderRadius: 'var(--radius-md)',
                        background: 'rgba(59, 130, 246, 0.05)',
                        border: '1px solid var(--blue-border)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--blue-400)', fontWeight: 600 }}>
                        <span>PERSPECTIVE A</span>
                        <span style={{ textTransform: 'capitalize' }}>{c.evidenceA.platform}</span>
                      </div>
                      <p style={{ fontFamily: 'var(--font-serif)', fontSize: '13px', color: 'var(--text-primary)', fontStyle: 'italic', lineHeight: '1.45' }}>
                        “{c.evidenceA.originalText}”
                      </p>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        <a href={c.evidenceA.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline' }}>
                          Source Link
                        </a>
                      </div>
                    </div>

                    {/* Side B */}
                    <div
                      style={{
                        padding: '14px',
                        borderRadius: 'var(--radius-md)',
                        background: 'rgba(239, 68, 68, 0.05)',
                        border: '1px solid var(--red-border)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--red-400)', fontWeight: 600 }}>
                        <span>PERSPECTIVE B (OPPOSING)</span>
                        <span style={{ textTransform: 'capitalize' }}>{c.evidenceB.platform}</span>
                      </div>
                      <p style={{ fontFamily: 'var(--font-serif)', fontSize: '13px', color: 'var(--text-primary)', fontStyle: 'italic', lineHeight: '1.45' }}>
                        “{c.evidenceB.originalText}”
                      </p>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        <a href={c.evidenceB.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline' }}>
                          Source Link
                        </a>
                      </div>
                    </div>
                  </div>

                  {/* Resolution Notes */}
                  {c.resolutionNotes && !isEditing && (
                    <div
                      style={{
                        padding: '12px 14px',
                        borderRadius: 'var(--radius-md)',
                        background: 'var(--bg-canvas)',
                        border: '1px solid var(--border-subtle)',
                        fontSize: '13px',
                      }}
                    >
                      <strong style={{ color: 'var(--emerald-400)', display: 'block', marginBottom: '3px' }}>
                        Cohort Reconciliation Synthesis:
                      </strong>
                      <p style={{ color: 'var(--text-secondary)', lineHeight: '1.45' }}>
                        {c.resolutionNotes}
                      </p>
                    </div>
                  )}

                  {/* Editing form */}
                  {isEditing && (
                    <div
                      style={{
                        padding: '16px',
                        borderRadius: 'var(--radius-md)',
                        background: 'var(--bg-canvas)',
                        border: '1px solid var(--border-subtle)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                      }}
                    >
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Status:</label>
                        <select
                          value={contradictionStatus}
                          onChange={(e) => setContradictionStatus(e.target.value as any)}
                          style={{
                            padding: '6px 10px',
                            borderRadius: 'var(--radius-md)',
                            background: 'var(--bg-surface-raised)',
                            border: '1px solid var(--border-subtle)',
                            color: 'var(--text-primary)',
                            fontSize: '12px',
                          }}
                        >
                          <option value="open">Open (Unexplained Tension)</option>
                          <option value="explained">Explained (Segment Specific)</option>
                          <option value="resolved">Resolved (Addressed in Product)</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                          Cohort Reconciliation / Behavioral Nuance:
                        </label>
                        <textarea
                          rows={3}
                          value={contradictionNotes}
                          onChange={(e) => setContradictionNotes(e.target.value)}
                          placeholder="Explain why both sentiments are true across different investor segments (e.g. salaried professionals with cash buffers vs students/first-jobbers)..."
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            borderRadius: 'var(--radius-md)',
                            background: 'var(--bg-surface-raised)',
                            border: '1px solid var(--border-subtle)',
                            color: 'var(--text-primary)',
                            fontSize: '13px',
                          }}
                        />
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                        <button className="btn btn-secondary" onClick={() => setEditingContradictionId(null)}>
                          Cancel
                        </button>
                        <button
                          className="btn btn-primary"
                          onClick={() => handleUpdateContradiction(c.id)}
                          disabled={isPending}
                        >
                          {isPending ? 'Saving...' : 'Save Explanation'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB 2: COVERAGE & GAPS */}
      {activeTab === 'gaps' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Journey Stage Coverage */}
          <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 600 }}>12-Month Lifecycle Evidence Distribution</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '2px' }}>
                Detecting research blind spots across investor journey milestones. Under-represented stages require targeted interviews or churn outreach.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {stageCoverage.map((item) => {
                return (
                  <div key={item.stageKey}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', marginBottom: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{item.stageLabel}</span>
                        <span
                          className={`badge ${
                            item.density === 'healthy'
                              ? 'badge-emerald'
                              : item.density === 'moderate'
                              ? 'badge-blue'
                              : 'badge-amber'
                          }`}
                          style={{ fontSize: '10px', textTransform: 'capitalize' }}
                        >
                          {item.density === 'thin' ? '⚠️ Under-represented' : item.density}
                        </span>
                      </div>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                        {item.count} records ({item.pct}%)
                      </span>
                    </div>

                    <div style={{ height: '8px', background: 'var(--bg-surface-raised)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${Math.max(4, item.pct)}%`,
                          height: '100%',
                          background:
                            item.density === 'healthy'
                              ? 'var(--emerald-500)'
                              : item.density === 'moderate'
                              ? 'var(--blue-400)'
                              : 'var(--amber-400)',
                          borderRadius: '4px',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Platform Source Diversity */}
          <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Source Channel Representation</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '2px' }}>
                Over-reliance on a single channel (e.g. Play Store reviews skewing towards bugs) is balanced by community threads and in-depth user interviews.
              </p>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '14px',
              }}
            >
              {platformCoverage.map((p) => (
                <div
                  key={p.platform}
                  style={{
                    padding: '14px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-canvas)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
                    <span style={{ textTransform: 'capitalize' }}>{p.platform.replace(/_/g, ' ')}</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.pct}%</span>
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>
                    {p.count}
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>ingested items</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: INQUIRIES & QUESTIONS */}
      {activeTab === 'questions' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="card" style={{ padding: '18px 20px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Open Research Inquiries ({questions.length})</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
              Specific investigative questions triggered by qualitative discovery. These guide user interview protocols and database cohort queries.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {questions.map((q) => {
              const isAnswering = answeringQuestionId === q.id;

              return (
                <div
                  key={q.id}
                  className="card"
                  style={{
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          className={`badge ${
                            q.status === 'answered'
                              ? 'badge-emerald'
                              : q.status === 'investigating'
                              ? 'badge-blue'
                              : 'badge-amber'
                          }`}
                          style={{ textTransform: 'capitalize' }}
                        >
                          {q.status}
                        </span>
                        <span className="badge badge-gray" style={{ fontSize: '10px' }}>
                          {q.origin.replace(/_/g, ' ')}
                        </span>
                        {q.relatedJourneyStage && (
                          <span className="badge badge-purple" style={{ fontSize: '10px' }}>
                            Stage: {q.relatedJourneyStage.replace(/_/g, ' ')}
                          </span>
                        )}
                      </div>
                      <h4 style={{ fontSize: '15px', fontWeight: 600, marginTop: '8px', color: 'var(--text-primary)' }}>
                        {q.question}
                      </h4>
                    </div>

                    <button
                      className="btn btn-secondary"
                      style={{ padding: '4px 10px', fontSize: '12px' }}
                      onClick={() => {
                        if (isAnswering) {
                          setAnsweringQuestionId(null);
                        } else {
                          setAnsweringQuestionId(q.id);
                          setQuestionAnswer(q.answerSummary || '');
                          setQuestionStatus(q.status as any);
                        }
                      }}
                    >
                      {isAnswering ? 'Cancel' : 'Update Answer'}
                    </button>
                  </div>

                  {q.answerSummary && !isAnswering && (
                    <div
                      style={{
                        padding: '12px 14px',
                        borderRadius: 'var(--radius-md)',
                        background: 'var(--bg-canvas)',
                        border: '1px solid var(--border-subtle)',
                        fontSize: '13px',
                      }}
                    >
                      <strong style={{ color: 'var(--emerald-400)', display: 'block', marginBottom: '2px' }}>
                        Empirical Finding / Answer:
                      </strong>
                      <p style={{ color: 'var(--text-secondary)', lineHeight: '1.45' }}>
                        {q.answerSummary}
                      </p>
                    </div>
                  )}

                  {isAnswering && (
                    <div
                      style={{
                        padding: '14px',
                        borderRadius: 'var(--radius-md)',
                        background: 'var(--bg-canvas)',
                        border: '1px solid var(--border-subtle)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                      }}
                    >
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Status:</label>
                        <select
                          value={questionStatus}
                          onChange={(e) => setQuestionStatus(e.target.value as any)}
                          style={{
                            padding: '6px 10px',
                            borderRadius: 'var(--radius-md)',
                            background: 'var(--bg-surface-raised)',
                            border: '1px solid var(--border-subtle)',
                            color: 'var(--text-primary)',
                            fontSize: '12px',
                          }}
                        >
                          <option value="open">Open (Unanswered)</option>
                          <option value="investigating">Investigating (In Progress)</option>
                          <option value="answered">Answered (Empirical Findings Added)</option>
                          <option value="deferred">Deferred (Out of Scope)</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                          Empirical Answer Summary:
                        </label>
                        <textarea
                          rows={3}
                          value={questionAnswer}
                          onChange={(e) => setQuestionAnswer(e.target.value)}
                          placeholder="Record findings from user interviews, support data, or literature..."
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            borderRadius: 'var(--radius-md)',
                            background: 'var(--bg-surface-raised)',
                            border: '1px solid var(--border-subtle)',
                            color: 'var(--text-primary)',
                            fontSize: '13px',
                          }}
                        />
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                        <button className="btn btn-secondary" onClick={() => setAnsweringQuestionId(null)}>
                          Cancel
                        </button>
                        <button
                          className="btn btn-primary"
                          onClick={() => handleUpdateQuestion(q.id)}
                          disabled={isPending}
                        >
                          {isPending ? 'Saving...' : 'Save Answer'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* New Research Question Modal */}
      {isNewQuestionOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'var(--modal-overlay, rgba(0, 0, 0, 0.8))',
            backdropFilter: 'blur(8px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
          onClick={() => setIsNewQuestionOpen(false)}
        >
          <div
            className="card"
            style={{ width: '100%', maxWidth: '520px', padding: '24px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '18px', fontWeight: 600 }}>Log Open Research Inquiry</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
              Pose a testable qualitative question to guide future user interviews or cohort SQL queries.
            </p>

            <form onSubmit={handleCreateQuestion} style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Inquiry / Question:
                </label>
                <textarea
                  required
                  rows={3}
                  value={newQuestionText}
                  onChange={(e) => setNewQuestionText(e.target.value)}
                  placeholder="e.g. What percentage of month-3 cancellations are triggered by bank ECS bounce penalties vs voluntary stoppage?"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-canvas)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Related Journey Stage:
                </label>
                <select
                  value={newQuestionStage}
                  onChange={(e) => setNewQuestionStage(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-canvas)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                  }}
                >
                  <option value="discovery_intent">Discovery & Intent</option>
                  <option value="mandate_kyc_setup">Mandate & KYC Setup</option>
                  <option value="first_instalment">First Instalment Allotment</option>
                  <option value="market_dip_reaction">Market Dip (Months 2–4)</option>
                  <option value="autopay_failure_recovery">Autopay Failure & Penalty</option>
                  <option value="continuation_milestone">12-Month Horizon</option>
                  <option value="pause_cancellation">Pause & Cancellation</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setIsNewQuestionOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isPending || !newQuestionText.trim()}>
                  {isPending ? 'Logging...' : 'Log Question'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
