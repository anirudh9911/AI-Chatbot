import { Message, SearchInfo } from '@/types/types';
import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';


/** Renders fenced code blocks with syntax highlighting and a copy button. */
const CodeBlock = ({ className, children }: { className?: string; children?: React.ReactNode }) => {
    const [copied, setCopied] = useState(false);
    const language = className?.replace('language-', '') || 'text';
    const code = String(children).replace(/\n$/, '');

    const handleCopy = () => {
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="my-3 rounded-lg overflow-hidden border border-gray-700 text-sm">
            {/* Header bar: language label + copy button */}
            <div className="flex items-center justify-between bg-gray-800 px-4 py-1.5">
                <span className="text-xs text-gray-400 font-mono">{language}</span>
                <button
                    onClick={handleCopy}
                    className="text-xs text-gray-400 hover:text-white transition-colors duration-150 flex items-center gap-1"
                >
                    {copied ? (
                        <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>Copied!</>
                    ) : (
                        <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>Copy</>
                    )}
                </button>
            </div>
            {/* Syntax highlighted code */}
            <SyntaxHighlighter
                language={language}
                style={oneDark}
                customStyle={{ margin: 0, borderRadius: 0, fontSize: '0.8rem' }}
                showLineNumbers={code.split('\n').length > 4}
            >
                {code}
            </SyntaxHighlighter>
        </div>
    );
};

interface SearchStagesProps {
    searchInfo : SearchInfo
}

const PremiumTypingAnimation = () => {
    return (
        <div className="flex items-center">
            <div className="flex items-center space-x-1.5">
                <div className="w-1.5 h-1.5 bg-gray-400/70 rounded-full animate-pulse"
                    style={{ animationDuration: "1s", animationDelay: "0ms" }}></div>
                <div className="w-1.5 h-1.5 bg-gray-400/70 rounded-full animate-pulse"
                    style={{ animationDuration: "1s", animationDelay: "300ms" }}></div>
                <div className="w-1.5 h-1.5 bg-gray-400/70 rounded-full animate-pulse"
                    style={{ animationDuration: "1s", animationDelay: "600ms" }}></div>
            </div>
        </div>
    );
};

const SearchStages = ({ searchInfo }: SearchStagesProps)  => {
    if (!searchInfo || !searchInfo.stages || searchInfo.stages.length === 0) return null;

    return (
        <div className="mb-3 mt-1 relative pl-4">
            {/* Search Process UI */}
            <div className="flex flex-col space-y-4 text-sm text-gray-700">
                {/* Searching Stage */}
                {searchInfo.stages.includes('searching') && (
                    <div className="relative">
                        {/* Green dot */}
                        <div className="absolute -left-3 top-1 w-2.5 h-2.5 bg-teal-400 rounded-full z-10 shadow-sm"></div>

                        {/* Connecting line to next item if reading exists */}
                        {searchInfo.stages.includes('reading') && (
                            <div className="absolute -left-[7px] top-3 w-0.5 h-[calc(100%+1rem)] bg-gradient-to-b from-teal-300 to-teal-200"></div>
                        )}

                        <div className="flex flex-col">
                            <span className="font-medium mb-2 ml-2">Searching the web</span>

                            {/* Search Query in box styling */}
                            <div className="flex flex-wrap gap-2 pl-2 mt-1">
                                <div className="bg-gray-100 text-xs px-3 py-1.5 rounded border border-gray-200 inline-flex items-center">
                                    <svg className="w-3 h-3 mr-1.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                                    </svg>
                                    {searchInfo.query}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Reading Stage */}
                {searchInfo.stages.includes('reading') && (
                    <div className="relative">
                        {/* Green dot */}
                        <div className="absolute -left-3 top-1 w-2.5 h-2.5 bg-teal-400 rounded-full z-10 shadow-sm"></div>

                        <div className="flex flex-col">
                            <span className="font-medium mb-2 ml-2">Reading</span>

                            {/* Search Results — clickable source chips */}
                            {Array.isArray(searchInfo.urls) && searchInfo.urls.length > 0 && (
                                <div className="pl-2 flex flex-wrap gap-2 mt-1">
                                    {searchInfo.urls.map((source, index) => {
                                        const href = typeof source === 'string' ? source : source.url as string;
                                        const label = typeof source === 'string'
                                            ? new URL(source).hostname.replace('www.', '')
                                            : (source.title as string) || new URL(href).hostname.replace('www.', '');
                                        return (
                                            <a
                                                key={index}
                                                href={href}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="bg-gray-100 text-xs px-3 py-1.5 rounded border border-gray-200 truncate max-w-[180px] hover:bg-teal-50 hover:border-teal-300 hover:text-teal-700 transition-all duration-150"
                                                title={href}
                                            >
                                                {label}
                                            </a>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Writing Stage */}
                {searchInfo.stages.includes('writing') && (
                    <div className="relative">
                        {/* Green dot with subtle glow effect */}
                        <div className="absolute -left-3 top-1 w-2.5 h-2.5 bg-teal-400 rounded-full z-10 shadow-sm"></div>
                        <span className="font-medium pl-2">Writing answer</span>
                    </div>
                )}

                {/* Error Message */}
                {searchInfo.stages.includes('error') && (
                    <div className="relative">
                        {/* Red dot over the vertical line */}
                        <div className="absolute -left-3 top-1 w-2.5 h-2.5 bg-red-400 rounded-full z-10 shadow-sm"></div>
                        <span className="font-medium">Search error</span>
                        <div className="pl-4 text-xs text-red-500 mt-1">
                            {searchInfo.error || "An error occurred during search."}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};



interface MessageAreaProps {
  messages: Message[];
}




const MessageArea = ({ messages } : MessageAreaProps) => {
    return (
        <div className="flex-grow overflow-y-auto bg-[#FCFCF8] border-b border-gray-100" style={{ minHeight: 0 }}>
            <div className="max-w-4xl mx-auto p-6">
                {messages.map((message) => (
                    <div key={message.id} className={`flex ${message.isUser ? 'justify-end' : 'justify-start'} mb-5`}>
                        <div className="flex flex-col max-w-md">
                            {/* Search Status Display - Now ABOVE the message */}
                            {!message.isUser && message.searchInfo && (
                                <SearchStages searchInfo={message.searchInfo} />
                            )}

                            {/* Message Content */}
                            <div
                                className={`rounded-lg py-3 px-5 ${message.isUser
                                    ? 'bg-gradient-to-br from-[#5E507F] to-[#4A3F71] text-white rounded-br-none shadow-md'
                                    : 'bg-[#F3F3EE] text-gray-800 border border-gray-200 rounded-bl-none shadow-sm'
                                    }`}
                            >
                                {message.isLoading ? (
                                    <PremiumTypingAnimation />
                                ) : (
                                    message.content ? (
                                            <div className="prose prose-sm max-w-none prose-a:text-blue-600 hover:prose-a:underline prose-pre:p-0 prose-pre:bg-transparent">
                                            <ReactMarkdown
                                                components={{
                                                    a: ({ node: _node, ...props }) =>
                                                        <a {...props}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-blue-600 underline hover:text-blue-800" />,
                                                    // Block code (fenced with ```)
                                                    code({ className, children, ...props }) {
                                                        const isBlock = className?.startsWith('language-');
                                                        if (isBlock) {
                                                            return <CodeBlock className={className}>{children}</CodeBlock>;
                                                        }
                                                        // Inline code
                                                        return (
                                                            <code
                                                                className="bg-gray-100 text-rose-600 px-1.5 py-0.5 rounded text-xs font-mono"
                                                                {...props}
                                                            >
                                                                {children}
                                                            </code>
                                                        );
                                                    }
                                                }}
                                            >
                                                {message.content}
                                            </ReactMarkdown>
                                            </div>
                                        ) : (
                                        <span className="text-gray-400 text-xs italic">Waiting for response...</span>
                                        )
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default MessageArea;