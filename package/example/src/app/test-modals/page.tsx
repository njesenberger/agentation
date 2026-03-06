"use client";

import { useState, useEffect, useRef } from "react";
import { Drawer as VaulDrawer } from "vaul";

// Uses native document.addEventListener("pointerdown") for click-outside detection,
// matching how real UI libraries (Radix, shadcn, MUI, Headless UI) work.
function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // Native pointerdown on document — this is how Radix DismissableLayer works
    const handlePointerDown = (e: PointerEvent) => {
      if (contentRef.current && !contentRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.removeEventListener("keydown", handleKey);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        ref={contentRef}
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: "24px 32px",
          minWidth: 360,
          maxWidth: 480,
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18 }}>{title}</h3>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: 20,
              cursor: "pointer",
              color: "#666",
              padding: "4px 8px",
            }}
          >
            x
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Dropdown({ trigger, children }: { trigger: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    // Use mousedown like many real dropdown libraries
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          padding: "8px 16px",
          borderRadius: 8,
          border: "1px solid #ddd",
          background: "#fff",
          cursor: "pointer",
          fontSize: 14,
        }}
      >
        {trigger} {open ? "\u25B2" : "\u25BC"}
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            background: "#fff",
            border: "1px solid #e0e0e0",
            borderRadius: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            padding: 8,
            minWidth: 180,
            zIndex: 100,
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

// Uses native document.addEventListener("mousedown") for click-outside — common pattern
function SideDrawer({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const handleMouseDown = (e: MouseEvent) => {
      if (contentRef.current && !contentRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handleMouseDown);
    return () => {
      window.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handleMouseDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.3)",
      }}
    >
      <div
        ref={contentRef}
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          width: 360,
          background: "#fff",
          boxShadow: "-8px 0 24px rgba(0,0,0,0.1)",
          padding: 24,
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18 }}>Drawer</h3>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#666" }}
          >
            x
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function HoverCard({ trigger, children }: { trigger: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  return (
    <span
      style={{ position: "relative", display: "inline-block" }}
      onMouseEnter={() => {
        clearTimeout(timeoutRef.current);
        setShow(true);
      }}
      onMouseLeave={() => {
        timeoutRef.current = setTimeout(() => setShow(false), 200);
      }}
    >
      <span style={{ textDecoration: "underline", textDecorationStyle: "dotted", cursor: "help" }}>
        {trigger}
      </span>
      {show && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            left: "50%",
            transform: "translateX(-50%)",
            background: "#fff",
            border: "1px solid #e0e0e0",
            borderRadius: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            padding: "12px 16px",
            minWidth: 200,
            zIndex: 100,
          }}
        >
          {children}
        </div>
      )}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 8px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 600,
      background: status === "open" ? "#dcfce7" : status === "closed" ? "#fee2e2" : "#f3f4f6",
      color: status === "open" ? "#166534" : status === "closed" ? "#991b1b" : "#374151",
    }}>
      {status}
    </span>
  );
}

export default function TestModalsPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [modal2Open, setModal2Open] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [vaulOpen, setVaulOpen] = useState(false);
  const [clickLog, setClickLog] = useState<string[]>([]);

  // Log document-level clicks to help debug
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const isFeedback = target.closest("[data-feedback-toolbar]");
      if (isFeedback) {
        setClickLog(prev => [`[${new Date().toLocaleTimeString()}] Click on agentation toolbar (bubbled to document)`, ...prev].slice(0, 20));
      }
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  return (
    <article className="article">
      <header>
        <h1>Modal / Drawer Test</h1>
        <p className="tagline">
          Test that agentation toolbar clicks don't close modals, drawers, or dropdowns.
        </p>
      </header>

      <section>
        <h2>The Bug</h2>
        <p>
          When "block page interaction" is enabled and you have a modal open, clicking the
          agentation icon or toolbar causes the modal to close. This is because the native
          click event bubbles from the toolbar (portaled into document.body) and triggers
          "click outside" listeners that modals use.
        </p>
        <p>
          <strong>Steps to reproduce:</strong>
        </p>
        <ol>
          <li>Open a modal, dropdown, or drawer below</li>
          <li>With it open, click the agentation FAB (bottom-right icon)</li>
          <li>The modal/dropdown/drawer closes - <strong>this is the bug</strong></li>
        </ol>
      </section>

      <section>
        <h2>Test Components</h2>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
          <button
            data-testid="open-modal"
            onClick={() => setModalOpen(true)}
            style={{
              padding: "10px 20px",
              borderRadius: 8,
              border: "1px solid #ddd",
              background: "#fff",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            Open Modal
          </button>

          <button
            data-testid="open-form-modal"
            onClick={() => setModal2Open(true)}
            style={{
              padding: "10px 20px",
              borderRadius: 8,
              border: "1px solid #ddd",
              background: "#fff",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            Open Form Modal
          </button>

          <button
            data-testid="open-drawer"
            onClick={() => setDrawerOpen(true)}
            style={{
              padding: "10px 20px",
              borderRadius: 8,
              border: "1px solid #ddd",
              background: "#fff",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            Open Drawer
          </button>

          <button
            data-testid="open-vaul-drawer"
            onClick={() => setVaulOpen(true)}
            style={{
              padding: "10px 20px",
              borderRadius: 8,
              border: "1px solid #ddd",
              background: "#fff",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            Open Vaul Drawer
          </button>

          <Dropdown trigger="Dropdown Menu">
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {["Edit", "Duplicate", "Archive", "Delete"].map(item => (
                <button
                  key={item}
                  style={{
                    padding: "8px 12px",
                    border: "none",
                    background: "transparent",
                    borderRadius: 6,
                    cursor: "pointer",
                    textAlign: "left",
                    fontSize: 14,
                  }}
                  onMouseOver={e => (e.currentTarget.style.background = "#f3f4f6")}
                  onMouseOut={e => (e.currentTarget.style.background = "transparent")}
                >
                  {item}
                </button>
              ))}
            </div>
          </Dropdown>
        </div>
      </section>

      <section>
        <h2>Click Event Log</h2>
        <p style={{ fontSize: 13, color: "#666" }}>
          Shows when agentation toolbar clicks bubble to the document level (which would close modals):
        </p>
        <div
          style={{
            background: "#f9fafb",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            padding: 16,
            maxHeight: 200,
            overflowY: "auto",
            fontFamily: "monospace",
            fontSize: 12,
          }}
        >
          {clickLog.length === 0 ? (
            <span style={{ color: "#9ca3af" }}>No toolbar clicks detected yet...</span>
          ) : (
            clickLog.map((log, i) => (
              <div key={i} style={{ padding: "2px 0", color: "#dc2626" }}>{log}</div>
            ))
          )}
        </div>
      </section>

      {/* Modals */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Simple Modal">
        <p style={{ margin: 0, color: "#555", lineHeight: 1.6 }}>
          This modal uses native <code>document.addEventListener("pointerdown")</code> for
          click-outside detection — the same approach as Radix, shadcn, and MUI.
          Clicking the agentation FAB should NOT close this.
        </p>
        <div style={{ marginTop: 16, display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={() => setModalOpen(false)}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "1px solid #ddd",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => setModalOpen(false)}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "none",
              background: "#111",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Confirm
          </button>
        </div>
      </Modal>

      <Modal open={modal2Open} onClose={() => setModal2Open(false)} title="Edit Item">
        <p style={{ margin: "0 0 12px", color: "#555", fontSize: 14 }}>
          This form modal also uses native pointerdown click-outside detection.
          Clicking the agentation toolbar should not close this.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ fontSize: 14, fontWeight: 500 }}>
            Name
            <input
              type="text"
              data-testid="modal-name-input"
              defaultValue="My Component"
              style={{
                display: "block",
                width: "100%",
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #ddd",
                marginTop: 4,
                fontSize: 14,
                boxSizing: "border-box",
              }}
            />
          </label>
          <label style={{ fontSize: 14, fontWeight: 500 }}>
            Status
            <select
              defaultValue="open"
              style={{
                display: "block",
                width: "100%",
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #ddd",
                marginTop: 4,
                fontSize: 14,
              }}
            >
              <option value="open">Open</option>
              <option value="in-progress">In Progress</option>
              <option value="closed">Closed</option>
            </select>
          </label>
          <label style={{ fontSize: 14, fontWeight: 500 }}>
            Description
            <textarea
              defaultValue="A detailed description of the item..."
              rows={3}
              style={{
                display: "block",
                width: "100%",
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #ddd",
                marginTop: 4,
                fontSize: 14,
                resize: "vertical",
                boxSizing: "border-box",
              }}
            />
          </label>
        </div>
        <div style={{ marginTop: 16, display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={() => setModal2Open(false)}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "1px solid #ddd",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => setModal2Open(false)}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "none",
              background: "#111",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Save
          </button>
        </div>
      </Modal>

      <SideDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <p style={{ color: "#555", lineHeight: 1.6 }}>
          This is a side drawer. Clicking the agentation toolbar should not close this.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
          {["Item A", "Item B", "Item C"].map(item => (
            <div
              key={item}
              style={{
                padding: "12px 16px",
                background: "#f9fafb",
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>{item}</span>
              <StatusBadge status="open" />
            </div>
          ))}
        </div>
      </SideDrawer>

      {/* Vaul Drawer — real-world library that a customer reported issues with */}
      <VaulDrawer.Root open={vaulOpen} onOpenChange={setVaulOpen}>
        <VaulDrawer.Portal>
          <VaulDrawer.Overlay
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.4)",
              zIndex: 9999,
            }}
          />
          <VaulDrawer.Content
            style={{
              background: "#fff",
              position: "fixed",
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 10000,
              borderTopLeftRadius: 12,
              borderTopRightRadius: 12,
              outline: "none",
            }}
          >
            <div style={{ padding: "16px 24px 24px", maxWidth: 600, margin: "0 auto" }}>
              <div
                style={{
                  width: 48,
                  height: 4,
                  borderRadius: 2,
                  background: "#d4d4d8",
                  margin: "0 auto 16px",
                }}
              />
              <h3 style={{ margin: "0 0 8px", fontSize: 18 }}>Vaul Drawer</h3>
              <p style={{ margin: "0 0 16px", color: "#555", lineHeight: 1.6, fontSize: 14 }}>
                This is a <a href="https://vaul.emilkowal.ski" target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb" }}>Vaul</a> drawer
                — a real-world library that a customer reported breaks when using agentation.
                Clicking the agentation toolbar should NOT close this drawer.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <label style={{ fontSize: 14, fontWeight: 500 }}>
                  Drawer Input
                  <input
                    type="text"
                    data-testid="vaul-drawer-input"
                    defaultValue="Type here"
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: "1px solid #ddd",
                      marginTop: 4,
                      fontSize: 14,
                      boxSizing: "border-box",
                    }}
                  />
                </label>
                <label style={{ fontSize: 14, fontWeight: 500 }}>
                  Drawer Textarea
                  <textarea
                    data-testid="vaul-drawer-textarea"
                    defaultValue="Some notes..."
                    rows={2}
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: "1px solid #ddd",
                      marginTop: 4,
                      fontSize: 14,
                      resize: "vertical",
                      boxSizing: "border-box",
                    }}
                  />
                </label>
                {["Vault Item 1", "Vault Item 2", "Vault Item 3"].map(item => (
                  <div
                    key={item}
                    style={{
                      padding: "12px 16px",
                      background: "#f9fafb",
                      borderRadius: 8,
                      border: "1px solid #e5e7eb",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span>{item}</span>
                    <StatusBadge status="open" />
                  </div>
                ))}
              </div>
            </div>
          </VaulDrawer.Content>
        </VaulDrawer.Portal>
      </VaulDrawer.Root>
    </article>
  );
}
