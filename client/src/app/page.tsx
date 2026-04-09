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
  // Start with defaults — identical on server and client.
  // localStorage is read only after hydration (in useEffect) to avoid mismatch.
  const [conversationMessages, setConversationMessages] = useState<Record<string, Message[]>>({});
  const [checkpointId, setCheckpointId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [currentMessage, setCurrentMessage] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);

  // Runs once, client-side only, after hydration — safe to access localStorage.
  // Restores the last active conversation and all message histories.
  useEffect(() => {
    try {
      const storedId = localStorage.getItem('inquiro_checkpoint');
      const storedMessages = localStorage.getItem('inquiro_messages');
      const parsedMap: Record<string, Message[]> = storedMessages
        ? JSON.parse(storedMessages)
        : {};

      setConversationMessages(parsedMap);

      if (storedId) {
        setCheckpointId(storedId);
        setMessages(parsedMap[storedId] || [WELCOME_MESSAGE]);
      }
    } catch { /* localStorage unavailable — start fresh */ }
  }, []);

  // Persist message history whenever it changes (skip empty initial state)
  useEffect(() => {
    if (Object.keys(conversationMessages).length === 0) return;
    try { localStorage.setItem('inquiro_messages', JSON.stringify(conversationMessages)); }
    catch { /* storage quota exceeded — fail silently */ }
  }, [conversationMessages]);

  // Persist active checkpoint whenever it changes
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

  const handleDelete = async (threadId: string) => {
    try {
      await fetch(`${API_BASE}/conversations/${threadId}`, { method: "DELETE" });
    } catch (err) {
      console.error("Failed to delete conversation:", err);
    }
    // Remove from local state and localStorage
    setConversations(prev => prev.filter(c => c.thread_id !== threadId));
    setConversationMessages(prev => {
      const updated = { ...prev };
      delete updated[threadId];
      return updated;
    });
    // If the deleted conversation was active, start a new chat
    if (checkpointId === threadId) handleNewChat();
  };

  const handleRename = async (threadId: string, newTitle: string) => {
    try {
      await fetch(`${API_BASE}/conversations/${threadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle }),
      });
    } catch (err) {
      console.error("Failed to rename conversation:", err);
    }
    // Update local state immediately (optimistic update)
    setConversations(prev =>
      prev.map(c => c.thread_id === threadId ? { ...c, title: newTitle } : c)
    );
  };

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

  /**
   * Core streaming logic. Appends userInput to priorMessages, streams the
   * server response, and updates state incrementally as tokens arrive.
   * Used by both handleSubmit and handleEditMessage.
   */
  const startStream = async (userInput: string, priorMessages: Message[]) => {
    const newMessageId = priorMessages.length > 0 ? Math.max(...priorMessages.map(msg => msg.id)) + 1 : 1;
    const aiResponseId = newMessageId + 1;

    const withUser: Message[] = [
      ...priorMessages,
      { id: newMessageId, content: userInput, isUser: true, type: 'message' }
    ];
    const withPlaceholder: Message[] = [
      ...withUser,
      { id: aiResponseId, content: "", isUser: false, type: 'message', isLoading: true, searchInfo: { stages: [], query: "", urls: [] } }
    ];

    setMessages(withPlaceholder);
    if (checkpointId) {
      setConversationMessages(prev => ({ ...prev, [checkpointId]: withPlaceholder }));
    }

    try {
      let url = `${API_BASE}/chat_stream/${encodeURIComponent(userInput)}`;
      if (checkpointId) {
        url += `?checkpoint_id=${encodeURIComponent(checkpointId)}`;
      }

      const eventSource = new EventSource(url);
      let streamedContent = "";
      let searchData: SearchInfo | null = null;
      let activeCheckpointId = checkpointId;

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'checkpoint') {
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

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!currentMessage.trim()) return;
    const userInput = currentMessage;
    setCurrentMessage("");
    await startStream(userInput, messages);
  };

  /**
   * Truncates the conversation to everything before the edited message,
   * then resends the edited text as a new message.
   */
  const handleEditMessage = (messageId: number, newContent: string) => {
    const idx = messages.findIndex(m => m.id === messageId);
    if (idx === -1) return;
    const truncated = messages.slice(0, idx);
    if (checkpointId) {
      setConversationMessages(prev => ({ ...prev, [checkpointId]: truncated }));
    }
    startStream(newContent, truncated);
  };

  return (
    <div className="flex bg-gray-100 min-h-screen">
      <ConversationSidebar
        conversations={conversations}
        activeId={checkpointId}
        onSelect={handleSelectConversation}
        onNewChat={handleNewChat}
        onDelete={handleDelete}
        onRename={handleRename}
        isLoading={isLoadingConversations}
      />

      <div className="flex-1 flex justify-center py-8 px-4">
        <div className="w-full max-w-3xl bg-white flex flex-col rounded-xl shadow-lg border border-gray-100 overflow-hidden h-[90vh]">
          <Header />
          <MessageArea messages={messages} onEditMessage={handleEditMessage} />
          <InputBar currentMessage={currentMessage} setCurrentMessage={setCurrentMessage} onSubmit={handleSubmit} />
        </div>
      </div>
    </div>
  );
};

export default Home;
