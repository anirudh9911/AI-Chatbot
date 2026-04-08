"use client"

import Header from '@/components/Header';
import InputBar from '@/components/InputBar';
import MessageArea from '@/components/MessageArea';
import ConversationSidebar from '@/components/ConversationSidebar';
import { Conversation, Message, SearchInfo } from '@/types/types';
import React, { useState, useEffect } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const WELCOME_MESSAGE: Message = {
  id: 1,
  content: 'Hi there, how can I help you?',
  isUser: false,
  type: 'message'
};

const Home = () => {
  // Initialize state from localStorage on first render so history
  // survives page refreshes. Falls back to defaults if nothing stored.
  const [conversationMessages, setConversationMessages] = useState<Record<string, Message[]>>(() => {
    try {
      const stored = localStorage.getItem('inquiro_messages');
      return stored ? JSON.parse(stored) : {};
    } catch { return {}; }
  });

  const [checkpointId, setCheckpointId] = useState<string | null>(() => {
    try { return localStorage.getItem('inquiro_checkpoint'); }
    catch { return null; }
  });

  // Restore the last active conversation's messages on load
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const storedId = localStorage.getItem('inquiro_checkpoint');
      const storedMessages = localStorage.getItem('inquiro_messages');
      if (storedId && storedMessages) {
        const map = JSON.parse(storedMessages) as Record<string, Message[]>;
        return map[storedId] || [WELCOME_MESSAGE];
      }
    } catch { /* fall through */ }
    return [WELCOME_MESSAGE];
  });

  const [currentMessage, setCurrentMessage] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);

  // Persist message history to localStorage whenever it changes
  useEffect(() => {
    try { localStorage.setItem('inquiro_messages', JSON.stringify(conversationMessages)); }
    catch { /* storage quota exceeded — fail silently */ }
  }, [conversationMessages]);

  // Persist active checkpoint to localStorage whenever it changes
  useEffect(() => {
    try {
      if (checkpointId) localStorage.setItem('inquiro_checkpoint', checkpointId);
      else localStorage.removeItem('inquiro_checkpoint');
    } catch { /* fail silently */ }
  }, [checkpointId]);

  const fetchConversations = async () => {
    try {
      const res = await fetch(`${API_BASE}/conversations`);
      const data: Conversation[] = await res.json();
      setConversations(data);
    } catch (err) {
      console.error("Failed to load conversations:", err);
    } finally {
      setIsLoadingConversations(false);
    }
  };

  useEffect(() => {
    fetchConversations();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Wrapper that updates both the visible messages AND the per-conversation
   * history map in a single atomic state update, so they never go out of sync.
   */
  const updateMessages = (threadId: string, updater: (prev: Message[]) => Message[]) => {
    setMessages(prev => {
      const updated = updater(prev);
      setConversationMessages(map => ({ ...map, [threadId]: updated }));
      return updated;
    });
  };

  /**
   * Switch to an existing conversation.
   * Restores saved UI messages for that thread. The LLM retains full context
   * server-side via LangGraph's MemorySaver checkpoint.
   */
  const handleSelectConversation = (threadId: string) => {
    setCheckpointId(threadId);
    setMessages(conversationMessages[threadId] || [WELCOME_MESSAGE]);
  };

  /** Start a fresh conversation — server will assign a new checkpoint ID. */
  const handleNewChat = () => {
    setCheckpointId(null);
    setMessages([WELCOME_MESSAGE]);
    // Keep conversationMessages intact so history of past chats is preserved
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!currentMessage.trim()) return;

    const newMessageId = messages.length > 0 ? Math.max(...messages.map(msg => msg.id)) + 1 : 1;
    const aiResponseId = newMessageId + 1;

    // Add user message immediately
    setMessages(prev => [
      ...prev,
      { id: newMessageId, content: currentMessage, isUser: true, type: 'message' }
    ]);

    const userInput = currentMessage;
    setCurrentMessage("");

    // Add AI placeholder
    setMessages(prev => [
      ...prev,
      { id: aiResponseId, content: "", isUser: false, type: 'message', isLoading: true, searchInfo: { stages: [], query: "", urls: [] } }
    ]);

    try {
      let url = `${API_BASE}/chat_stream/${encodeURIComponent(userInput)}`;
      if (checkpointId) {
        url += `?checkpoint_id=${encodeURIComponent(checkpointId)}`;
      }

      const eventSource = new EventSource(url);
      let streamedContent = "";
      let searchData: SearchInfo | null = null;

      // Tracks the active thread ID within this stream.
      // For new conversations, this gets set when the 'checkpoint' event arrives.
      let activeCheckpointId = checkpointId;

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'checkpoint') {
            // New conversation — capture the server-assigned thread ID
            activeCheckpointId = data.checkpoint_id;
            setCheckpointId(data.checkpoint_id);
          }
          else if (data.type === 'content') {
            streamedContent += data.content;
            if (activeCheckpointId) {
              updateMessages(activeCheckpointId, prev =>
                prev.map(msg =>
                  msg.id === aiResponseId
                    ? { ...msg, content: streamedContent, isLoading: false }
                    : msg
                )
              );
            }
          }
          else if (data.type === 'search_start') {
            const newSearchInfo: SearchInfo = { stages: ['searching'], query: data.query, urls: [] };
            searchData = newSearchInfo;
            if (activeCheckpointId) {
              updateMessages(activeCheckpointId, prev =>
                prev.map(msg =>
                  msg.id === aiResponseId
                    ? { ...msg, searchInfo: newSearchInfo, isLoading: false }
                    : msg
                )
              );
            }
          }
          else if (data.type === 'search_results') {
            try {
              const urls = typeof data.urls === 'string' ? JSON.parse(data.urls) : data.urls;
              const newSearchInfo: SearchInfo = {
                stages: searchData ? [...searchData.stages, 'reading'] : ['reading'],
                query: searchData?.query || "",
                urls
              };
              searchData = newSearchInfo;
              if (activeCheckpointId) {
                updateMessages(activeCheckpointId, prev =>
                  prev.map(msg =>
                    msg.id === aiResponseId
                      ? { ...msg, searchInfo: newSearchInfo, isLoading: false }
                      : msg
                  )
                );
              }
            } catch (err) {
              console.error("Error parsing search results:", err);
            }
          }
          else if (data.type === 'search_error') {
            const newSearchInfo: SearchInfo = {
              stages: searchData ? [...searchData.stages, 'error'] : ['error'],
              query: searchData?.query || "",
              error: data.error,
              urls: []
            };
            searchData = newSearchInfo;
            if (activeCheckpointId) {
              updateMessages(activeCheckpointId, prev =>
                prev.map(msg =>
                  msg.id === aiResponseId
                    ? { ...msg, searchInfo: newSearchInfo, isLoading: false }
                    : msg
                )
              );
            }
          }
          else if (data.type === 'end') {
            if (searchData && activeCheckpointId) {
              const finalSearchInfo: SearchInfo = {
                ...searchData,
                stages: [...searchData.stages, 'writing']
              };
              updateMessages(activeCheckpointId, prev =>
                prev.map(msg =>
                  msg.id === aiResponseId
                    ? { ...msg, searchInfo: finalSearchInfo, isLoading: false }
                    : msg
                )
              );
            }
            eventSource.close();
            fetchConversations();
          }
        } catch (error) {
          console.error("Error parsing event data:", error, event.data);
        }
      };

      eventSource.onerror = (error) => {
        console.error("EventSource error:", error);
        eventSource.close();
        if (!streamedContent) {
          setMessages(prev =>
            prev.map(msg =>
              msg.id === aiResponseId
                ? { ...msg, content: "Sorry, there was an error processing your request.", isLoading: false }
                : msg
            )
          );
        }
      };

      eventSource.addEventListener('end', () => { eventSource.close(); });

    } catch (error) {
      console.error("Error setting up EventSource:", error);
      setMessages(prev => [
        ...prev,
        { id: newMessageId + 1, content: "Sorry, there was an error connecting to the server.", isUser: false, type: 'message', isLoading: false }
      ]);
    }
  };

  return (
    <div className="flex bg-gray-100 min-h-screen">
      <ConversationSidebar
        conversations={conversations}
        activeId={checkpointId}
        onSelect={handleSelectConversation}
        onNewChat={handleNewChat}
        isLoading={isLoadingConversations}
      />

      <div className="flex-1 flex justify-center py-8 px-4">
        <div className="w-full max-w-3xl bg-white flex flex-col rounded-xl shadow-lg border border-gray-100 overflow-hidden h-[90vh]">
          <Header />
          <MessageArea messages={messages} />
          <InputBar currentMessage={currentMessage} setCurrentMessage={setCurrentMessage} onSubmit={handleSubmit} />
        </div>
      </div>
    </div>
  );
};

export default Home;
