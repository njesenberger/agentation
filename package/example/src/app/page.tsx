"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { Footer } from "./Footer";
import { HeroDemo } from "./components/HeroDemo";

// Animated copy/checkmark icon
const IconCopyAnimated = ({ size = 24, copied = false }: { size?: number; copied?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <style>{`
      .copy-icon, .check-icon {
        transition: opacity 0.2s ease, transform 0.2s ease;
      }
    `}</style>
    {/* Copy icon */}
    <g className="copy-icon" style={{ opacity: copied ? 0 : 1, transform: copied ? 'scale(0.8)' : 'scale(1)', transformOrigin: 'center' }}>
      <path
        d="M4.75 11.25C4.75 10.4216 5.42157 9.75 6.25 9.75H12.75C13.5784 9.75 14.25 10.4216 14.25 11.25V17.75C14.25 18.5784 13.5784 19.25 12.75 19.25H6.25C5.42157 19.25 4.75 18.5784 4.75 17.75V11.25Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M17.25 14.25H17.75C18.5784 14.25 19.25 13.5784 19.25 12.75V6.25C19.25 5.42157 18.5784 4.75 17.75 4.75H11.25C10.4216 4.75 9.75 5.42157 9.75 6.25V6.75"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </g>
    {/* Checkmark circle */}
    <g className="check-icon" style={{ opacity: copied ? 1 : 0, transform: copied ? 'scale(1)' : 'scale(0.8)', transformOrigin: 'center' }}>
      <path
        d="M12 20C7.58172 20 4 16.4182 4 12C4 7.58172 7.58172 4 12 4C16.4182 4 20 7.58172 20 12C20 16.4182 16.4182 20 12 20Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M15 10L11 14.25L9.25 12.25"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  </svg>
);

// Shadow DOM Modal Component
function ShadowModal({ isOpen, isExiting, onClose }: { isOpen: boolean; isExiting: boolean; onClose: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const shadowRootRef = useRef<ShadowRoot | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!hostRef.current || shadowRootRef.current) return;
    shadowRootRef.current = hostRef.current.attachShadow({ mode: 'open' });
    setMounted(true);
  }, []);

  if (!isOpen) return <div ref={hostRef} style={{ display: 'none' }} />;

  const modalStyles = `
    @keyframes modalOverlayEnter {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes modalOverlayExit {
      from { opacity: 1; }
      to { opacity: 0; }
    }
    @keyframes modalEnter {
      from { opacity: 0; transform: translate(-50%, -50%) scale(0.95); }
      to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
    }
    @keyframes modalExit {
      from { opacity: 1; transform: translate(-50%, -50%) scale(1); }
      to { opacity: 0; transform: translate(-50%, -50%) scale(0.95); }
    }
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(255, 255, 255, 0.7);
      backdrop-filter: blur(4px);
      z-index: 9999;
      animation: modalOverlayEnter 0.2s ease forwards;
    }
    .modal-overlay.exiting { animation: modalOverlayExit 0.15s ease forwards; }
    .modal-content {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 90%;
      max-width: 400px;
      background: #fff;
      border-radius: 16px;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.06);
      z-index: 10000;
      padding: 1.5rem;
      animation: modalEnter 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .modal-content.exiting { animation: modalExit 0.15s ease forwards; }
    .modal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; }
    .modal-title { font-size: 1rem; font-weight: 600; color: #111; margin: 0; }
    .modal-close {
      width: 28px; height: 28px; border-radius: 50%; background: transparent; border: none;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      color: rgba(0, 0, 0, 0.4); transition: background 0.15s ease, color 0.15s ease;
    }
    .modal-close:hover { background: rgba(0, 0, 0, 0.05); color: rgba(0, 0, 0, 0.7); }
    .modal-body { color: rgba(0, 0, 0, 0.65); font-size: 0.875rem; line-height: 1.5; margin-bottom: 1.25rem; }
    .modal-body p + p { margin-top: 0.75rem; }
    .modal-footer { display: flex; justify-content: flex-end; gap: 0.5rem; }
    .modal-btn {
      padding: 0.5rem 1rem; font-size: 0.8125rem; font-weight: 600; border-radius: 8px;
      border: none; cursor: pointer; transition: background 0.15s ease, color 0.15s ease;
    }
    .modal-btn-secondary { background: transparent; color: rgba(0, 0, 0, 0.5); }
    .modal-btn-secondary:hover { background: rgba(0, 0, 0, 0.05); color: rgba(0, 0, 0, 0.8); }
    .modal-btn-primary { background: #3c82f7; color: white; }
    .modal-btn-primary:hover { background: #2d6fe0; }
  `;

  const modalContent = (
    <>
      <style>{modalStyles}</style>
      <div className={`modal-overlay${isExiting ? ' exiting' : ''}`} onClick={onClose} />
      <div className={`modal-content${isExiting ? ' exiting' : ''}`}>
        <div className="modal-header">
          <h3 className="modal-title">Shadow DOM Modal</h3>
          <button className="modal-close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="modal-body">
          <p>This modal is rendered inside a shadow DOM, isolating its styles from the page.</p>
          <p>Agentation can detect and annotate elements inside shadow DOM boundaries.</p>
        </div>
        <div className="modal-footer">
          <button className="modal-btn modal-btn-secondary" onClick={onClose}>Cancel</button>
          <button className="modal-btn modal-btn-primary" onClick={onClose}>Got It</button>
        </div>
      </div>
    </>
  );

  return (
    <div ref={hostRef} style={{ position: 'fixed', inset: 0, zIndex: 9998, pointerEvents: 'none' }}>
      {mounted && shadowRootRef.current && createPortal(
        <div style={{ pointerEvents: 'auto' }}>{modalContent}</div>,
          shadowRootRef.current as unknown as Element
        )}
    </div>
  );
}

function InstallSnippet() {
  const [copied, setCopied] = useState(false);
  const command = "npm install agentation";

  const handleCopy = async () => {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="install-snippet"
      title="Copy to clipboard"
    >
      <code>{command}</code>
      <IconCopyAnimated size={14} copied={copied} />
    </button>
  );
}

export default function AgentationDocs() {
  const [inputValue, setInputValue] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalExiting, setModalExiting] = useState(false);
  const [shadowModalOpen, setShadowModalOpen] = useState(false);
  const [shadowModalExiting, setShadowModalExiting] = useState(false);

  const openModal = () => {
    setModalOpen(true);
    setModalExiting(false);
  };

  const openShadowModal = () => {
    setShadowModalOpen(true);
    setShadowModalExiting(false);
  };

  const closeShadowModal = () => {
    setShadowModalExiting(true);
    setTimeout(() => {
      setShadowModalOpen(false);
      setShadowModalExiting(false);
    }, 150);
  };

  const closeModal = () => {
    setModalExiting(true);
    setTimeout(() => {
      setModalOpen(false);
      setModalExiting(false);
    }, 150);
  };

  return (
    <>
      <article className="article">
        <Link href="/blog/introducing-agentation-2" className="announcement-banner">
          <span className="pulse-dot" />
          <span><span style={{ fontWeight: 500 }}>New in 2.0:</span> Real-time agent sync</span>
          <span style={{ color: '#4a9eff', marginLeft: '0.5rem' }}>&rarr;</span>
        </Link>
        <header style={{ position: 'relative' }}>
          <InstallSnippet />
          <h1 style={{ fontSize: '2rem', lineHeight: 1.15, marginBottom: '0.5rem' }}><span className="sketchy-underline">Point at bugs.</span><br />Let AI <span className="pen-underline">fix them.</span></h1>
          <p className="tagline">A floating toolbar that turns your design feedback into structured context for AI coding agents. Annotate any element, and let Claude Code, Cursor, or any AI tool act on it.</p>
        </header>

        {/* Animated demo */}
        <HeroDemo />

        <section>
          <h2>How you use it</h2>
          <ol>


            <li><strong>Click</strong> any element to add an annotation</li>
            <li>Write your feedback and click <strong>Add</strong></li>
            <li>Click <svg style={{ display: 'inline-block', verticalAlign: '-0.45em', width: '1.5em', height: '1.5em', margin: '0 -0.1em' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M4.75 11.25C4.75 10.4216 5.42157 9.75 6.25 9.75H12.75C13.5784 9.75 14.25 10.4216 14.25 11.25V17.75C14.25 18.5784 13.5784 19.25 12.75 19.25H6.25C5.42157 19.25 4.75 18.5784 4.75 17.75V11.25Z" /><path d="M17.25 14.25H17.75C18.5784 14.25 19.25 13.5784 19.25 12.75V6.25C19.25 5.42157 18.5784 4.75 17.75 4.75H11.25C10.4216 4.75 9.75 5.42157 9.75 6.25V6.75" /></svg> to copy formatted markdown</li>
            <li>Paste into your agent</li>
          </ol>
          <p style={{ fontSize: '0.8125rem', color: 'rgba(0,0,0,0.55)', marginTop: '1rem' }}>
            <strong style={{
              display: 'inline',
              margin: '-0.04em -0.06em',
              padding: '0.04em 0.06em',
              borderRadius: '0.2em 0.15em',
              backgroundImage: 'linear-gradient(75deg, rgba(239, 68, 68, 0.5), rgba(239, 68, 68, 0.15) 4%, rgba(239, 68, 68, 0.3) 96%, rgba(239, 68, 68, 0.6))',
            }}>Note:</strong> With <Link href="/mcp">MCP</Link>, you can skip the copy-paste step entirely &mdash; your agent already sees what you&apos;re pointing at. Just say &ldquo;address my feedback&rdquo; or &ldquo;fix annotation 3.&rdquo;
          </p>
        </section>

        <section>
          <h2>How agents use it</h2>
          <p>
            Agentation works best with AI tools that have access to your codebase (Claude Code, Cursor, etc.). When you paste the output, agents get:
          </p>
          <ul>
            <li><strong>CSS selectors</strong> to grep your codebase</li>
            <li><strong>Source file paths</strong> to jump directly to the right line</li>
            <li><strong>React component tree</strong> to understand the hierarchy</li>
            <li><strong>Computed styles</strong> to understand current appearance</li>
            <li><strong>Your feedback</strong> with intent and priority</li>
          </ul>
          <p>
            Without Agentation, you&rsquo;d have to describe the element (&ldquo;the blue button in the sidebar&rdquo;) and hope the agent guesses right. With Agentation, you give it <code>.sidebar &gt; button.primary</code> and it can grep for that directly.
          </p>
        </section>

        {/* Interactive Demo Section - hidden on mobile since tool is desktop-only */}
        <section className="demo-section hide-on-mobile">
          <h2>Try it</h2>
          <p>
            The toolbar is active on this page. Try annotating these demo elements:
          </p>

          <div className="demo-elements">
            <div className="button-group">
              <button className="demo-button" onClick={() => alert("Primary clicked!")} style={{ background: '#facc15', color: '#111' }}>Primary</button>
              <button className="demo-button secondary" onClick={() => alert("Secondary clicked!")}>Secondary</button>
              <button className="demo-button" onClick={openModal} style={{ background: '#ef4444', color: 'white' }}>Modal</button>
              <button className="demo-button" onClick={openShadowModal} style={{ background: '#22c55e', color: 'white', fontSize: '0.875rem', padding: '0.5625rem 1rem' }}>Sonic Modal</button>
            </div>

            <input
              type="text"
              className="demo-input"
              placeholder="Try selecting this text..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
            />

            <div className="demo-card">
              <h3>Example Card</h3>
              <p>
                Click on this card or select this text to create an annotation.
                The output will include the element path and your feedback.
              </p>
            </div>
          </div>
        </section>

        {/* Animation Demo - hidden on mobile since tool is desktop-only */}
        <section className="demo-section hide-on-mobile">
          <p>
            Click <svg style={{ display: 'inline-block', verticalAlign: '-0.45em', width: '1.5em', height: '1.5em', margin: '0 -0.1em' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M8 6L8 18" /><path d="M16 18L16 6" /></svg> in the toolbar to freeze this animation:
          </p>
          <div className="animation-demo">
            <div className="progress-bar-demo">
              <div className="progress-bar" />
            </div>
          </div>
        </section>

        <section>
          <h2>Agents talk back</h2>
          <p>
            With <a href="/mcp">MCP integration</a> and the <a href="/schema">Annotation Format Schema</a>, agents don&rsquo;t just read your annotations &mdash; they can respond to them:
          </p>
          <ul>
            <li><strong>&ldquo;What annotations do I have?&rdquo;</strong> &mdash; List all feedback across pages</li>
            <li><strong>&ldquo;Should this be 24px or 16px?&rdquo;</strong> &mdash; Agent asks for clarification</li>
            <li><strong>&ldquo;Fixed the padding&rdquo;</strong> &mdash; Agent resolves with a summary</li>
            <li><strong>&ldquo;Clear all annotations&rdquo;</strong> &mdash; Dismiss everything at once</li>
          </ul>
          <p>
            Your feedback becomes a conversation, not a one-way ticket into the void.
          </p>
        </section>

        <section>
          <h2>Best practices</h2>
          <ul>
            <li>One issue per annotation &mdash; easier for the agent to address individually</li>
            <li>Include context &mdash; mention what you expected vs. what you see</li>
            <li style={{ fontSize: '1.125rem' }}><strong>Use text selection</strong> &mdash; for typos or content issues, select the exact text</li>
            <li><strong>Pause animations</strong> &mdash; to annotate a specific animation frame</li>
          </ul>
        </section>

        <section>
          <h2>Licensing</h2>
          <p>
            Agentation is free for individuals and companies for internal use. Use it to annotate your own projects, debug your own apps, or streamline feedback within your team. {" "}
            <a href="mailto:benji@dip.org">Contact us</a> for a commercial license if you're redistributing Agentation as part of a product you sell.
          </p>
        </section>

        <section className="quickstart-links">
          <p><Link href="/mcp" className="styled-link">Set up real-time sync with MCP <span className="arrow">→</span></Link></p>
          <p><Link href="/webhooks" className="styled-link">Push annotations to external services <span className="arrow">→</span></Link></p>
          <p><Link href="/api" className="styled-link">Build your own integration with the API <span className="arrow">→</span></Link></p>
        </section>

      </article>

      <Footer />

      {/* Test Modal */}
      {modalOpen && (
        <>
          <style>{`
            @keyframes modalOverlayEnter {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            @keyframes modalOverlayExit {
              from { opacity: 1; }
              to { opacity: 0; }
            }
            @keyframes modalEnter {
              from {
                opacity: 0;
                transform: translate(-50%, -50%) scale(0.95);
              }
              to {
                opacity: 1;
                transform: translate(-50%, -50%) scale(1);
              }
            }
            @keyframes modalExit {
              from {
                opacity: 1;
                transform: translate(-50%, -50%) scale(1);
              }
              to {
                opacity: 0;
                transform: translate(-50%, -50%) scale(0.95);
              }
            }
            .modal-overlay {
              position: fixed;
              inset: 0;
              background: rgba(255, 255, 255, 0.7);
              backdrop-filter: blur(4px);
              z-index: 9999;
              animation: modalOverlayEnter 0.2s ease forwards;
            }
            .modal-overlay.exiting {
              animation: modalOverlayExit 0.15s ease forwards;
            }
            .modal-content {
              position: fixed;
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%);
              width: 90%;
              max-width: 400px;
              background: #fff;
              border-radius: 16px;
              box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.06);
              z-index: 10000;
              padding: 1.5rem;
              animation: modalEnter 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
              font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            }
            .modal-content.exiting {
              animation: modalExit 0.15s ease forwards;
            }
            .modal-header {
              display: flex;
              align-items: center;
              justify-content: space-between;
              margin-bottom: 1rem;
            }
            .modal-title {
              font-size: 1rem;
              font-weight: 600;
              color: #111;
              margin: 0;
            }
            .modal-close {
              width: 28px;
              height: 28px;
              border-radius: 50%;
              background: transparent;
              border: none;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: center;
              color: rgba(0, 0, 0, 0.4);
              transition: background 0.15s ease, color 0.15s ease;
            }
            .modal-close:hover {
              background: rgba(0, 0, 0, 0.05);
              color: rgba(0, 0, 0, 0.7);
            }
            .modal-body {
              color: rgba(0, 0, 0, 0.65);
              font-size: 0.875rem;
              line-height: 1.5;
              margin-bottom: 1.25rem;
            }
            .modal-footer {
              display: flex;
              justify-content: flex-end;
              gap: 0.5rem;
            }
            .modal-btn {
              padding: 0.5rem 1rem;
              font-size: 0.8125rem;
              font-weight: 600;
              border-radius: 8px;
              border: none;
              cursor: pointer;
              transition: background 0.15s ease, color 0.15s ease;
            }
            .modal-btn-secondary {
              background: transparent;
              color: rgba(0, 0, 0, 0.5);
            }
            .modal-btn-secondary:hover {
              background: rgba(0, 0, 0, 0.05);
              color: rgba(0, 0, 0, 0.8);
            }
            .modal-btn-primary {
              background: #3c82f7;
              color: white;
            }
            .modal-btn-primary:hover {
              background: #2d6fe0;
            }
          `}</style>
          <div
            className={`modal-overlay${modalExiting ? ' exiting' : ''}`}
            onClick={closeModal}
          />
          <div className={`modal-content${modalExiting ? ' exiting' : ''}`}>
            <div className="modal-header">
              <h3 className="modal-title">Example Modal</h3>
              <button className="modal-close" onClick={closeModal}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <p>This is an example modal dialog. You can use it to display important information, confirmations, or form inputs.</p>
              <p style={{ marginTop: '0.75rem' }}>Click outside the modal or use the buttons below to close it.</p>
            </div>
            <div className="modal-footer">
              <button className="modal-btn modal-btn-secondary" onClick={closeModal}>
                Cancel
              </button>
              <button className="modal-btn modal-btn-primary" onClick={closeModal}>
                Got It
              </button>
            </div>
          </div>
        </>
      )}

      {/* Shadow DOM Modal */}
      <ShadowModal isOpen={shadowModalOpen} isExiting={shadowModalExiting} onClose={closeShadowModal} />
    </>
  );
}
