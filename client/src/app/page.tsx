"use client"

import Header from '@/components/Header';
import InputBar from '@/components/InputBar';
import MessageArea from '@/components/MessageArea';
import ConversationSidebar from '@/components/ConversationSidebar';
import { Conversation, Message, SearchInfo } from '@/types/types';
import React, { useState, useEffect } from 'react';

// Read API base from environment — works locally and inside Docker
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const WELCOME_MESSAGE: Message = {
  id: 1,
  content: 'Hi there, how can I help you?',
  isUser: false,
  type: 'message'
};

const Home = () => {
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [currentMessage, setCurrentMessage] = useState("");
  const [checkpointId, setCheckpointId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);

  /** Fetch conversation list from server — populates the sidebar. */
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

  // Load conversations once on mount
  useEffect(() => {
    fetchConversations();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Switch to an existing conversation.
   * The UI resets to a clean welcome state; the LLM retains full context
   * server-side via LangGraph's MemorySaver checkpoint.
   */
  const handleSelectConversation = (threadId: string) => {
    setCheckpointId(threadId);
    setMessages([WELCOME_MESSAGE]);
  };

  /** Start a fresh conversation — server will assign a new checkpoint ID. */
  const handleNewChat = () => {
    setCheckpointId(null);
    setMessages([WELCOME_MESSAGE]);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (currentMessage.trim()) {
      const newMessageId = messages.length > 0 ? Math.max(...messages.map(msg => msg.id)) + 1 : 1;

      setMessages(prev => [
        ...prev,
        {
          id: newMessageId,
          content: currentMessage,
          isUser: true,
          type: 'message'
        }
      ]);

      const userInput = currentMessage;
      setCurrentMessage("");

      try {
        const aiResponseId = newMessageId + 1;
        setMessages(prev => [
          ...prev,
          {
            id: aiResponseId,
            content: "",
            isUser: false,
            type: 'message',
            isLoading: true,
            searchInfo: {
              stages: [],
              query: "",
              urls: []
            }
          }
        ]);

        let url = `${API_BASE}/chat_stream/${encodeURIComponent(userInput)}`;
        if (checkpointId) {
          url += `?checkpoint_id=${encodeURIComponent(checkpointId)}`;
        }

        const eventSource = new EventSource(url);
        let streamedContent = "";
        let searchData: SearchInfo | null = null;

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            if (data.type === 'checkpoint') {
              setCheckpointId(data.checkpoint_id);
            }
            else if (data.type === 'content') {
              streamedContent += data.content;

              setMessages(prev =>
                prev.map(msg =>
                  msg.id === aiResponseId
                    ? { ...msg, content: streamedContent, isLoading: false }
                    : msg
                )
              );
            }
            else if (data.type === 'search_start') {
              const newSearchInfo: SearchInfo = {
                stages: ['searching'],
                query: data.query,
                urls: []
              };
              searchData = newSearchInfo;

              setMessages(prev =>
                prev.map(msg =>
                  msg.id === aiResponseId
                    ? { ...msg, content: streamedContent, searchInfo: newSearchInfo, isLoading: false }
                    : msg
                )
              );
            }
            else if (data.type === 'search_results') {
              try {
                const urls = typeof data.urls === 'string' ? JSON.parse(data.urls) : data.urls;

                const newSearchInfo: SearchInfo = {
                  stages: searchData ? [...searchData.stages, 'reading'] : ['reading'],
                  query: searchData?.query || "",
                  urls: urls
                };
                searchData = newSearchInfo;

                setMessages(prev =>
                  prev.map(msg =>
                    msg.id === aiResponseId
                      ? { ...msg, content: streamedContent, searchInfo: newSearchInfo, isLoading: false }
                      : msg
                  )
                );
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

              setMessages(prev =>
                prev.map(msg =>
                  msg.id === aiResponseId
                    ? { ...msg, content: streamedContent, searchInfo: newSearchInfo, isLoading: false }
                    : msg
                )
              );
            }
            else if (data.type === 'end') {
              if (searchData) {
                const finalSearchInfo: SearchInfo = {
                  ...searchData,
                  stages: [...searchData.stages, 'writing']
                };

                setMessages(prev =>
                  prev.map(msg =>
                    msg.id === aiResponseId
                      ? { ...msg, searchInfo: finalSearchInfo, isLoading: false }
                      : msg
                  )
                );
              }

              eventSource.close();

              // Refresh sidebar so the new/updated conversation appears immediately
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

        eventSource.addEventListener('end', () => {
          eventSource.close();
        });
      } catch (error) {
        console.error("Error setting up EventSource:", error);
        setMessages(prev => [
          ...prev,
          {
            id: newMessageId + 1,
            content: "Sorry, there was an error connecting to the server.",
            isUser: false,
            type: 'message',
            isLoading: false
          }
        ]);
      }
    }
  };

  return (
    // Two-column layout: sidebar on the left, chat on the right
    <div className="flex bg-gray-100 min-h-screen">
      <ConversationSidebar
        conversations={conversations}
        activeId={checkpointId}
        onSelect={handleSelectConversation}
        onNewChat={handleNewChat}
        isLoading={isLoadingConversations}
      />

      {/* Chat panel */}
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
