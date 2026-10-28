'use client';

import { useState, useTransition } from 'react';
import { uploadEvidenceCsvAction, addManualEvidenceAction } from '@/app/actions';

export function IngestModal({
  isOpen: controlledIsOpen,
  onClose,
}: {
  isOpen?: boolean;
  onClose?: () => void;
} = {}) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isControlled = controlledIsOpen !== undefined;
  const showModal = isControlled ? controlledIsOpen : internalIsOpen;

  const closeModal = () => {
    if (onClose) onClose();
    if (!isControlled) setInternalIsOpen(false);
  };

  const openModal = () => {
    if (!isControlled) setInternalIsOpen(true);
  };

  const [activeTab, setActiveTab] = useState<'csv' | 'manual'>('csv');
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleCsvSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const res = await uploadEvidenceCsvAction(formData);
      if (res.success && res.result) {
        setSuccessMsg(
          `Successfully processed CSV: ${res.result.acceptedRows} accepted, ${res.result.duplicateRows} duplicates identified, ${res.result.rejectedRows} rejected.`
        );
        setTimeout(() => closeModal(), 2000);
      } else {
        setErrorMsg(res.error || 'Upload failed.');
      }
    });
  };

  const handleManualSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const res = await addManualEvidenceAction(formData);
      if (res.success) {
        setSuccessMsg('Record added successfully with verified provenance badges.');
        setTimeout(() => closeModal(), 2000);
      } else {
        setErrorMsg(res.error || 'Failed to add manual record.');
      }
    });
  };

  return (
    <>
      {!isControlled && (
        <button onClick={openModal} className="btn btn-primary">
          + Ingest Evidence
        </button>
      )}

      {showModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'var(--modal-overlay, rgba(0, 0, 0, 0.75))',
            backdropFilter: 'blur(8px)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="ingest-modal-title"
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: '640px',
              maxHeight: '90vh',
              overflowY: 'auto',
              border: '1px solid var(--border-strong)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 id="ingest-modal-title" style={{ fontSize: '18px' }}>
                Ingest Investor Evidence
              </h2>
              <button
                onClick={() => closeModal()}
                className="btn btn-secondary"
                style={{ padding: '4px 8px', fontSize: '12px' }}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            {/* Tab switch */}
            <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '12px', marginBottom: '16px' }}>
              <button
                type="button"
                className={`btn ${activeTab === 'csv' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveTab('csv')}
                style={{ fontSize: '12px' }}
              >
                📄 CSV Batch Upload
              </button>
              <button
                type="button"
                className={`btn ${activeTab === 'manual' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveTab('manual')}
                style={{ fontSize: '12px' }}
              >
                ✍️ Manual Single Entry
              </button>
            </div>

            {errorMsg && (
              <div style={{ background: 'var(--red-glow)', border: '1px solid var(--red-border)', color: 'var(--red-400)', padding: '10px 14px', borderRadius: 'var(--radius-md)', marginBottom: '14px', fontSize: '12px' }}>
                {errorMsg}
              </div>
            )}
            {successMsg && (
              <div style={{ background: 'var(--emerald-glow)', border: '1px solid var(--emerald-border)', color: 'var(--emerald-400)', padding: '10px 14px', borderRadius: 'var(--radius-md)', marginBottom: '14px', fontSize: '12px' }}>
                {successMsg}
              </div>
            )}

            {activeTab === 'csv' ? (
              <form onSubmit={handleCsvSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label htmlFor="csv-file-input" style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                    Select CSV File
                  </label>
                  <input
                    id="csv-file-input"
                    type="file"
                    name="file"
                    accept=".csv"
                    required
                    style={{ padding: '12px', background: 'var(--bg-canvas)', border: '1px dashed var(--border-strong)' }}
                  />
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                    Columns supported: <code>source_url</code>, <code>platform</code>, <code>collected_at</code>, <code>original_text</code>, <code>investor_context</code>, <code>journey_stage</code>.
                  </div>
                </div>

                <div>
                  <label htmlFor="csv-imported-by" style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                    Researcher Name / Attribution
                  </label>
                  <input
                    id="csv-imported-by"
                    type="text"
                    name="importedBy"
                    defaultValue="Fellowship Researcher"
                    required
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                  <button type="button" onClick={() => closeModal()} className="btn btn-secondary">
                    Cancel
                  </button>
                  <button type="submit" disabled={isPending} className="btn btn-primary">
                    {isPending ? 'Processing & Validating CSV...' : 'Upload & Ingest'}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleManualSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label htmlFor="manual-source-url" style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                    Source URL * (Verified provenance)
                  </label>
                  <input
                    id="manual-source-url"
                    type="url"
                    name="sourceUrl"
                    placeholder="https://play.google.com/... or https://reddit.com/..."
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label htmlFor="manual-platform" style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                      Platform *
                    </label>
                    <select id="manual-platform" name="platform" defaultValue="play_store" required>
                      <option value="play_store">Google Play Store</option>
                      <option value="app_store">Apple App Store</option>
                      <option value="reddit">Reddit (r/IndiaInvestments, r/Groww)</option>
                      <option value="twitter_x">Twitter / X</option>
                      <option value="youtube">YouTube Comments</option>
                      <option value="community_forum">Community Forum</option>
                      <option value="user_interview">User Interview</option>
                      <option value="other">Other Public Source</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="manual-collected-at" style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                      Collection Date *
                    </label>
                    <input
                      id="manual-collected-at"
                      type="date"
                      name="collectedAt"
                      defaultValue={new Date().toISOString().split('T')[0]}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="manual-journey-stage" style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                    Journey Stage (Preliminary)
                  </label>
                  <select id="manual-journey-stage" name="journeyStage" defaultValue="unclear">
                    <option value="discovery_intent">Discovery & Intent</option>
                    <option value="mandate_kyc_setup">Mandate & KYC Setup</option>
                    <option value="first_instalment">First Instalment & NAV Allotment</option>
                    <option value="market_dip_reaction">Market Dip & Drawdown Reaction</option>
                    <option value="autopay_failure_recovery">Autopay Failure & Recovery</option>
                    <option value="continuation_milestone">Continuation Milestone (6M / 12M)</option>
                    <option value="pause_cancellation">Pause & Cancellation</option>
                    <option value="unclear">Unclear / Needs AI Discovery</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="manual-investor-context" style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                    Investor Context (Only if explicitly stated in text)
                  </label>
                  <input
                    id="manual-investor-context"
                    type="text"
                    name="investorContext"
                    placeholder="e.g. First-time investor, 3 months into SIP (leave blank if unstated)"
                  />
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Do not assume first-time status unless the source explicitly mentions it.
                  </div>
                </div>

                <div>
                  <label htmlFor="manual-original-text" style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                    Original Verbatim Feedback * (Immutable Evidence)
                  </label>
                  <textarea
                    id="manual-original-text"
                    name="originalText"
                    rows={4}
                    placeholder="Paste the exact verbatim user feedback here without editing..."
                    required
                  />
                </div>

                <div>
                  <label htmlFor="manual-entered-by" style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                    Researcher Name
                  </label>
                  <input id="manual-entered-by" type="text" name="enteredBy" defaultValue="Fellowship Researcher" required />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                  <button type="button" onClick={() => closeModal()} className="btn btn-secondary">
                    Cancel
                  </button>
                  <button type="submit" disabled={isPending} className="btn btn-primary">
                    {isPending ? 'Saving Record...' : 'Save Evidence Record'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
