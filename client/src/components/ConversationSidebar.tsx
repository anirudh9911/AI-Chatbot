"use client";

import { Conversation } from "@/types/types";
import { useState, useRef, useEffect } from "react";

interface ConversationSidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (threadId: string) => void;
  onNewChat: () => void;
  onDelete: (threadId: string) => void;
  onRename: (threadId: string, newTitle: string) => void;
  isLoading: boolean;
}

function relativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return new Date(isoString).toLocaleDateString();
}

const SkeletonRow = () => (
  <div className="px-3 py-3 animate-pulse">
    <div className="h-3 bg-white/20 rounded w-3/4 mb-2" />
    <div className="h-2 bg-white/10 rounded w-1/3" />
  </div>
);

export default function ConversationSidebar({
  conversations, activeId, onSelect, onNewChat, onDelete, onRename, isLoading,
}: ConversationSidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the rename input when it appears
  useEffect(() => {
    if (editingId) inputRef.current?.focus();
  }, [editingId]);

  const startRename = (conv: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(conv.thread_id);
    setEditValue(conv.title);
  };

  const commitRename = (threadId: string) => {
    const trimmed = editValue.trim();
    if (trimmed) onRename(threadId, trimmed);
    setEditingId(null);
  };

  return (
    <aside className="w-64 flex-shrink-0 bg-[#4A3F71] flex flex-col h-screen">
      {/* Header */}
      <div className="px-4 pt-5 pb-3">
        <h2 className="text-white/60 text-xs font-semibold uppercase tracking-widest mb-3">
          Inquiro
        </h2>
        <button
          onClick={onNewChat}
          className="w-full flex items-center gap-2 bg-teal-500 hover:bg-teal-400 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors duration-150"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Chat
        </button>
      </div>

      <div className="px-3 pb-2">
        <div className="border-t border-white/10" />
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-1">
        {isLoading ? (
          <><SkeletonRow /><SkeletonRow /><SkeletonRow /></>
        ) : conversations.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <p className="text-white/40 text-xs leading-relaxed">No conversations yet.<br />Start chatting!</p>
          </div>
        ) : (
          conversations.map((conv) => {
            const isActive = conv.thread_id === activeId;
            const isEditing = editingId === conv.thread_id;
            const title = conv.title.length > 40 ? conv.title.slice(0, 40) + "…" : conv.title;

            return (
              <div
                key={conv.thread_id}
                onClick={() => !isEditing && onSelect(conv.thread_id)}
                className={`group relative w-full text-left px-3 py-3 rounded-lg mb-0.5 cursor-pointer transition-colors duration-150 ${
                  isActive ? "bg-white/10" : "hover:bg-white/5"
                }`}
              >
                <div className="flex items-start gap-2 pr-12">
                  <div className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${isActive ? "bg-teal-400" : "bg-white/20"}`} />

                  <div className="min-w-0 flex-1">
                    {isEditing ? (
                      // Inline rename input
                      <input
                        ref={inputRef}
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onBlur={() => commitRename(conv.thread_id)}
                        onKeyDown={e => {
                          if (e.key === "Enter") commitRename(conv.thread_id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        onClick={e => e.stopPropagation()}
                        className="w-full bg-white/10 text-white text-sm rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-teal-400"
                      />
                    ) : (
                      <>
                        <p className={`text-sm truncate leading-snug ${isActive ? "text-white" : "text-white/70"}`}>
                          {title}
                        </p>
                        <p className="text-xs text-white/30 mt-0.5">{relativeTime(conv.updated_at)}</p>
                      </>
                    )}
                  </div>
                </div>

                {/* Rename + Delete — visible on hover */}
                {!isEditing && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-1">
                    {/* Rename */}
                    <button
                      onClick={(e) => startRename(conv, e)}
                      title="Rename"
                      className="p-1 rounded text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    {/* Delete */}
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(conv.thread_id); }}
                      title="Delete"
                      className="p-1 rounded text-white/40 hover:text-red-400 hover:bg-white/10 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
