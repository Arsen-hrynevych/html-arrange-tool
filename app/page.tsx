"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { SortableSlideItem } from "@/components/SortableSlideItem";
import { exportPdf } from "@/components/exportPDF";
import { HtmlChatPanel, type HtmlChatScope } from "@/components/HtmlChatPanel";
import { buildCompiledPresentationHtml } from "@/lib/compiledPresentation";
import type { Slide } from "@/lib/slide";

function App() {
  const [slides, setSlides] = useState<Slide[]>([]);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isSidebarWide, setIsSidebarWide] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isHudIdle, setIsHudIdle] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishStatus, setPublishStatus] = useState<{
    kind: "idle" | "success" | "error";
    message: string;
    url?: string;
  }>({ kind: "idle", message: "" });
  const [transitioning, setTransitioning] = useState(false);
  const [transitionState, setTransitionState] = useState<{ from: number; to: number; dir: "next" | "prev"; type: "fade" | "slide" | "explode" } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hudIdleTimer = useRef<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // minimum drag distance before taking over
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const processFileEntries = async (
    entries: Array<{ file: File; handle?: FileSystemFileHandle }>
  ) => {
    const htmlEntries = entries.filter(
      ({ file }) => file.type === "text/html" || file.name.endsWith(".html") || file.name.endsWith(".htm")
    );

    const newSlides: Slide[] = [];
    for (const entry of htmlEntries) {
      const text = await entry.file.text();
      newSlides.push({
        id: crypto.randomUUID(),
        name: entry.file.name,
        originalHtml: text,
        fileHandle: entry.handle,
      });
    }

    setSlides((prev) => [...prev, ...newSlides]);
  };

  const processFiles = async (files: File[]) => {
    await processFileEntries(files.map((file) => ({ file })));
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(Array.from(e.target.files));
    }
    e.target.value = "";
  };

  const handleOpenEditableFiles = async () => {
    const picker = (window as Window & {
      showOpenFilePicker?: (options?: {
        multiple?: boolean;
        types?: Array<{
          description?: string;
          accept: Record<string, string[]>;
        }>;
      }) => Promise<FileSystemFileHandle[]>;
    }).showOpenFilePicker;

    if (!picker) {
      alert("Editable file access is not available in this browser. Use Add HTML Slides instead.");
      return;
    }

    try {
      const handles = await picker({
        multiple: true,
        types: [
          {
            description: "HTML files",
            accept: { "text/html": [".html", ".htm"] },
          },
        ],
      });

      const entries = await Promise.all(
        handles.map(async (handle) => ({
          handle,
          file: await handle.getFile(),
        }))
      );

      await processFileEntries(entries);
      setIsSidebarOpen(true);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error(error);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setSlides((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);

        let newActiveIndex = activeSlideIndex;
        if (activeSlideIndex === oldIndex) newActiveIndex = newIndex;
        else if (oldIndex < activeSlideIndex && newIndex >= activeSlideIndex) newActiveIndex--;
        else if (oldIndex > activeSlideIndex && newIndex <= activeSlideIndex) newActiveIndex++;
        setActiveSlideIndex(newActiveIndex);

        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const TRANSITION_MS = 520;

  const goToSlide = useCallback((targetIndex: number, type: "fade" | "slide" | "explode" = "slide") => {
    if (targetIndex < 0 || targetIndex >= slides.length) return;
    if (targetIndex === activeSlideIndex) return;
    if (transitioning) return;

    const dir = targetIndex > activeSlideIndex ? "next" : "prev";
    setTransitionState({ from: activeSlideIndex, to: targetIndex, dir, type });
    setTransitioning(true);

    setTimeout(() => {
      setActiveSlideIndex(targetIndex);
      setTransitioning(false);
      setTransitionState(null);
    }, TRANSITION_MS);
  }, [activeSlideIndex, slides.length, transitioning]);

  const removeSlide = (id: string) => {
    setSlides((items) => {
      const index = items.findIndex((item) => item.id === id);
      if (index === -1) return items;

      const newItems = items.filter((item) => item.id !== id);
      if (activeSlideIndex >= newItems.length) {
        setActiveSlideIndex(Math.max(0, newItems.length - 1));
      } else if (index < activeSlideIndex) {
        setActiveSlideIndex(activeSlideIndex - 1);
      }
      return newItems;
    });
  };

  const handleAssistantSend = async (prompt: string, scope: HtmlChatScope) => {
    if (slides.length === 0) {
      return "Load one or more HTML files first.";
    }

    const targets = scope === "active"
      ? slides[activeSlideIndex]
        ? [slides[activeSlideIndex]]
        : []
      : slides;

    if (targets.length === 0) {
      return "There is no active slide to edit.";
    }

    const updates = new Map<string, string>();
    const summaries: string[] = [];

    const results = await Promise.all(
      targets.map(async (slide) => {
        const response = await fetch("/api/html-assistant", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            html: slide.originalHtml,
            instruction: prompt,
            slideName: slide.name,
          }),
        });

        if (!response.ok) {
          const errorBody = await response.json().catch(() => null);
          const message = errorBody?.error || `The assistant failed for ${slide.name}.`;
          throw new Error(message);
        }

        const result = (await response.json()) as { html: string; summary: string };
        return { slide, result };
      })
    );

    for (const { slide, result } of results) {
      updates.set(slide.id, result.html);
      summaries.push(`${slide.name}: ${result.summary}`);
    }

    if (updates.size === 0) {
      return 'I could not map that instruction yet. Try "set title to ...", "replace ... with ...", "remove ...", or "insert ... before </body>".';
    }

    setSlides((currentSlides) =>
      currentSlides.map((slide) => {
        const nextHtml = updates.get(slide.id);
        return nextHtml ? { ...slide, originalHtml: nextHtml } : slide;
      })
    );

    const persisted: string[] = [];
    const failed: string[] = [];

    await Promise.all(
      targets.map(async (slide) => {
        const nextHtml = updates.get(slide.id);
        if (!nextHtml || !slide.fileHandle) return;

        try {
          const writable = await slide.fileHandle.createWritable();
          await writable.write(nextHtml);
          await writable.close();
          persisted.push(slide.name);
        } catch {
          failed.push(slide.name);
        }
      })
    );

    const responseParts = [`Updated ${updates.size} slide${updates.size === 1 ? "" : "s"}.`];
    if (persisted.length > 0) {
      responseParts.push(`Wrote back to ${persisted.join(", ")}.`);
    }
    if (failed.length > 0) {
      responseParts.push(`Could not write ${failed.join(", ")} back to disk.`);
    }
    if (summaries.length > 0) {
      responseParts.push(summaries.slice(0, 2).join(" "));
    }

    return responseParts.join(" ");
  };

  const exportPresentation = () => {
    if (slides.length === 0) return;

    const htmlContent = buildCompiledPresentationHtml(
      slides.map(({ name, originalHtml }) => ({ name, originalHtml }))
    );

    const blob = new Blob([htmlContent], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "presentation.html";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleShareableLink = async () => {
    if (slides.length === 0 || isPublishing) return;

    setIsPublishing(true);
    setPublishStatus({ kind: "idle", message: "Publishing to Netlify..." });

    try {
      const response = await fetch("/api/netlify-share", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          slides: slides.map(({ name, originalHtml }) => ({ name, originalHtml })),
        }),
      });

      const payload = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error || "Publishing failed.");
      }

      if (!payload?.url) {
        throw new Error("Netlify did not return a shareable URL.");
      }

      if (navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(payload.url).catch(() => {});
      }
      setPublishStatus({
        kind: "success",
        message: "Shareable link is ready.",
        url: payload.url,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Publishing failed.";
      setPublishStatus({ kind: "error", message });
    } finally {
      setIsPublishing(false);
    }
  };

  // Keyboard navigation & HUD idle
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case 'ArrowRight':
        case 'PageDown':
        case ' ':
          e.preventDefault();
          goToSlide(Math.min(slides.length - 1, activeSlideIndex + 1));
          break;
        case 'ArrowLeft':
        case 'PageUp':
          e.preventDefault();
          goToSlide(Math.max(0, activeSlideIndex - 1));
          break;
        case 'Home':
          e.preventDefault();
          goToSlide(0);
          break;
        case 'End':
          e.preventDefault();
          goToSlide(slides.length - 1);
          break;
        case 's':
        case 'S':
          e.preventDefault();
          setIsSidebarOpen(v => !v);
          break;
        case 'Escape':
          if (isHelpOpen) setIsHelpOpen(false);
          else setIsSidebarOpen(false);
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen?.().catch(() => {});
          } else {
            document.exitFullscreen?.();
          }
          break;
        case '?':
          e.preventDefault();
          setIsHelpOpen(v => !v);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [slides.length, isHelpOpen, goToSlide, activeSlideIndex]);

  useEffect(() => {
    const resetHud = () => {
      setIsHudIdle(false);
      if (hudIdleTimer.current !== null) clearTimeout(hudIdleTimer.current);
      hudIdleTimer.current = window.setTimeout(() => setIsHudIdle(true), 2500);
    };

    ['mousemove', 'keydown', 'touchstart'].forEach(ev =>
      window.addEventListener(ev, resetHud, { passive: true })
    );
    resetHud();
    return () => {
      if (hudIdleTimer.current !== null) clearTimeout(hudIdleTimer.current);
    };
  }, []);

  return (
    <div 
      className={isSidebarWide ? "sidebar-wide" : ""}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={handleDrop}
    >
      <main id="stage">
        {slides.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-lg flex-col gap-4">
            <p>No slides uploaded yet.</p>
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="px-4 py-2 border border-[#2A3530] rounded-md hover:bg-[#222B25] text-[#E8EAD8]"
            >
              Open Sidebar to Add Slides
            </button>
          </div>
        ) : (
          slides.map((slide, index) => {
            let cls = '';
            const tr = transitionState;
            if (!transitioning) {
              cls = index === activeSlideIndex ? 'active visible' : '';
            } else if (tr) {
              if (index === tr.from) cls = `exit ${tr.type} ${tr.dir} visible`;
              else if (index === tr.to) cls = `enter ${tr.type} ${tr.dir} visible`;
              else cls = '';
            }

            return (
              <iframe
                key={slide.id}
                className={cls}
                srcDoc={slide.originalHtml}
                title={slide.name}
              />
            );
          })
        )}
      </main>

      {slides.length > 0 && (
        <>
          <button 
            className="nav-arrow prev" 
            disabled={activeSlideIndex === 0}
            onClick={() => goToSlide(activeSlideIndex - 1, 'slide')}
          >
            ‹
          </button>
          <button 
            className="nav-arrow next" 
            disabled={activeSlideIndex === slides.length - 1}
            onClick={() => goToSlide(activeSlideIndex + 1, 'slide')}
          >
            ›
          </button>

          <div id="hud" className={isHudIdle ? "idle" : ""}>
            <span id="counter">{activeSlideIndex + 1} / {slides.length}</span>
            <button title="AI edit chat" onClick={() => setIsChatOpen((value) => !value)}>AI</button>
            <button title="Overview (S)" onClick={() => setIsSidebarOpen(v => !v)}>☰</button>
            <button title="Fullscreen (F)" onClick={() => {
              if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen?.().catch(() => {});
              } else {
                document.exitFullscreen?.();
              }
            }}>⛶</button>
            <button title="Help (?)" onClick={() => setIsHelpOpen(v => !v)}>?</button>
          </div>
        </>
      )}

      <aside id="sidebar" className={isSidebarOpen ? "open" : ""}>
        <header className="sidebar-header">
          <h1>HTML Arranger</h1>
          <div className="sidebar-actions">
            <button 
              className={isSidebarWide ? "active" : ""}
              title="Toggle wide view" 
              onClick={() => setIsSidebarWide(v => !v)}
            >
              ⇔
            </button>
            <button title="Close (S)" onClick={() => setIsSidebarOpen(false)}>×</button>
          </div>
        </header>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <ol id="slide-list">
            <SortableContext
              items={slides.map((s) => s.id)}
              strategy={rectSortingStrategy}
            >
              {slides.map((slide, index) => (
                <SortableSlideItem
                  key={slide.id}
                  id={slide.id}
                  name={slide.name}
                  htmlContent={slide.originalHtml}
                  index={index}
                  isActive={index === activeSlideIndex}
                  onRemove={removeSlide}
                  onClick={() => goToSlide(index, 'explode')}
                />
              ))}
            </SortableContext>
            
            <div className="p-2">
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-4 border-2 border-dashed border-[#2A3530] rounded-xl text-[#98A099] hover:border-[#5A8A6B] hover:text-[#E8EAD8] transition-colors"
              >
                + Add HTML Slides
              </button>
              <input
                type="file"
                multiple
                accept=".html,text/html"
                className="hidden"
                ref={fileInputRef}
                onChange={handleFileInput}
              />
              <button
                onClick={() => void handleOpenEditableFiles()}
                className="mt-3 w-full py-3 border border-[#2A3530] rounded-xl text-[#E8EAD8] hover:bg-[#222B25] transition-colors"
              >
                Open Editable HTML
              </button>
            </div>
          </ol>
        </DndContext>

        <footer className="sidebar-footer">
          <button onClick={exportPresentation} disabled={slides.length === 0}>
            Download Compiled HTML
          </button>
          <button onClick={() => exportPdf(slides)} disabled={slides.length === 0}>
            Download PDF
          </button>
          <button onClick={handleShareableLink} disabled={slides.length === 0 || isPublishing}>
            {isPublishing ? "Publishing..." : "Get Shareable Link"}
          </button>
          <button 
            onClick={() => setSlides([])} 
            disabled={slides.length === 0}
            style={{ color: '#ef4444' }}
          >
            Clear All
          </button>
          {publishStatus.message ? (
            <div className={`share-result ${publishStatus.kind}`}>
              <span>{publishStatus.message}</span>
              {publishStatus.url ? (
                <a href={publishStatus.url} target="_blank" rel="noreferrer">
                  Open link
                </a>
              ) : null}
            </div>
          ) : null}
          <div className="hint">
            Drag a slide to reorder.<br/>
            Drop HTML files anywhere to add.
          </div>
        </footer>
      </aside>

      <div id="backdrop" onClick={() => setIsSidebarOpen(false)}></div>

      <div id="help" className={isHelpOpen ? "show" : ""}>
        <div className="help-card">
          <h2>Keyboard shortcuts</h2>
          <dl>
            <dt><kbd>→</kbd> <kbd>Space</kbd></dt><dd>Next slide</dd>
            <dt><kbd>←</kbd></dt><dd>Previous slide</dd>
            <dt><kbd>Home</kbd></dt><dd>First slide</dd>
            <dt><kbd>End</kbd></dt><dd>Last slide</dd>
            <dt><kbd>S</kbd> / <kbd>Esc</kbd></dt><dd>Toggle overview sidebar</dd>
            <dt><kbd>F</kbd></dt><dd>Toggle fullscreen</dd>
            <dt><kbd>?</kbd></dt><dd>This help</dd>
          </dl>
          <button className="help-close" onClick={() => setIsHelpOpen(false)}>Got it</button>
        </div>
      </div>

      <HtmlChatPanel
        isOpen={isChatOpen}
        activeSlideName={slides[activeSlideIndex]?.name}
        canWriteBack={slides.some((slide) => Boolean(slide.fileHandle))}
        onClose={() => setIsChatOpen(false)}
        onOpenEditableFiles={() => void handleOpenEditableFiles()}
        onSend={handleAssistantSend}
      />
    </div>
  );
}

export default App;

