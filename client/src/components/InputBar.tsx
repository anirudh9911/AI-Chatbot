import { Dispatch, SetStateAction, useRef, useEffect } from "react";

interface InputBarProps {
  currentMessage: string;
  setCurrentMessage: Dispatch<SetStateAction<string>>;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}

const InputBar = ({ currentMessage, setCurrentMessage, onSubmit }: InputBarProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow the textarea as content changes, reset to 1 row when cleared
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [currentMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      // Plain Enter → submit
      e.preventDefault();
      if (currentMessage.trim()) {
        onSubmit(e as unknown as React.FormEvent<HTMLFormElement>);
      }
    }
    // Shift+Enter → browser default (inserts newline)
  };

  return (
    <form onSubmit={onSubmit} className="p-4 bg-white">
      <div className="flex items-end bg-[#F9F9F5] rounded-2xl px-4 py-2 shadow-md border border-gray-200">
        <textarea
          ref={textareaRef}
          placeholder="Type a message"
          value={currentMessage}
          onChange={e => setCurrentMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          className="flex-grow px-2 py-2 bg-transparent focus:outline-none text-gray-700 text-sm resize-none overflow-hidden max-h-40"
        />
        <button
          type="submit"
          className="bg-gradient-to-r from-teal-500 to-teal-400 hover:from-teal-600 hover:to-teal-500 rounded-full p-2.5 ml-2 mb-0.5 shadow-md transition-all duration-200 group flex-shrink-0"
        >
          <svg className="w-5 h-5 text-white transform rotate-45 group-hover:scale-110 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </div>
    </form>
  );
}

export default InputBar;
