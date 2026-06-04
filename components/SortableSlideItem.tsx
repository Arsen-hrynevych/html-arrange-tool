import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "../lib/utils";
import { useEffect, useRef } from "react";

interface SortableSlideItemProps {
  id: string;
  name: string;
  htmlContent: string;
  index: number;
  isActive: boolean;
  onRemove: (id: string) => void;
  onClick: () => void;
}

export function SortableSlideItem({ id, name, htmlContent, index, isActive, onRemove, onClick }: SortableSlideItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const thumbRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = thumbRef.current;
    if (!el) return;
    
    const setScale = () => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) {
        el.style.setProperty('--thumb-scale', (w / 1600).toString());
      }
    };
    
    const observer = new ResizeObserver(() => setScale());
    observer.observe(el);
    setScale();
    
    return () => observer.disconnect();
  }, []);

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "slide-item",
        isActive && "active",
        isDragging && "dragging z-10"
      )}
      onClick={onClick}
      {...attributes}
      {...listeners}
    >
      <div className="slide-thumb" ref={thumbRef}>
        <span className="slide-number">{index + 1}</span>
        
        <div className="slide-remove">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove(id);
            }}
            title="Remove slide"
            aria-label="Remove slide"
          >
            ×
          </button>
        </div>

        <iframe
          srcDoc={htmlContent}
          title={name}
          sandbox="allow-scripts"
          tabIndex={-1}
          aria-hidden="true"
        />
      </div>
      <div className="slide-title">{name}</div>
    </li>
  );
}

