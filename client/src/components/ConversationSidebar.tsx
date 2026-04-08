"use client";

import { Conversation } from "@/types/types";

interface ConversationSidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (threadId: string) => void;
  onNewChat: () => void;
  isLoading: boolean;
}

/** Converts an ISO timestamp into a human-readable relative label. */
function relativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;
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

/** Skeleton row shown while conversations are loading. */
const SkeletonRow = () => (
  <div className="px-3 py-3 animate-pulse">
    <div className="h-3 bg-white/20 rounded w-3/4 mb-2" />
    <div className="h-2 bg-white/10 rounded w-1/3" />
  </div>
);

export default function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNewChat,
  isLoading,
}: ConversationSidebarProps) {
  return (
    <aside className="w-64 flex-shrink-0 bg-[#4A3F71] flex flex-col h-screen">
      {/* Header */}
      <div className="px-4 pt-5 pb-3">
        <h2 className="text-white/60 text-xs font-semibold uppercase tracking-widest mb-3">
          Inquiro
        </h2>

        {/* New Chat button */}
        <button
          onClick={onNewChat}
          className="w-full flex items-center gap-2 bg-teal-500 hover:bg-teal-400 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors duration-150"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
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
          // Skeleton shimmer while fetching
          <>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </>
        ) : conversations.length === 0 ? (
          // Empty state
          <div className="px-4 py-6 text-center">
            <p className="text-white/40 text-xs leading-relaxed">
              No conversations yet.
              <br />
              Start chatting!
            </p>
          </div>
        ) : (
          // Conversation items
          conversations.map((conv) => {
            const isActive = conv.thread_id === activeId;
            const title =
              conv.title.length > 40
                ? conv.title.slice(0, 40) + "…"
                : conv.title;

            return (
              <button
                key={conv.thread_id}
                onClick={() => onSelect(conv.thread_id)}
                className={`w-full text-left px-3 py-3 rounded-lg mb-0.5 transition-colors duration-150 group ${
                  isActive
                    ? "bg-white/10"
                    : "hover:bg-white/5"
                }`}
              >
                {/* Active indicator dot */}
                <div className="flex items-start gap-2">
                  <div
                    className={`mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      isActive ? "bg-teal-400" : "bg-white/20"
                    }`}
                  />
                  <div className="min-w-0">
                    <p
                      className={`text-sm truncate leading-snug ${
                        isActive ? "text-white" : "text-white/70"
                      }`}
                    >
                      {title}
                    </p>
                    <p className="text-xs text-white/30 mt-0.5">
                      {relativeTime(conv.updated_at)}
                    </p>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
