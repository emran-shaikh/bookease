import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MessageCircle, X, Send, Bot, User, Loader2, Sparkles, MapPin, HelpCircle, Clock, DollarSign, Mic, MicOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

type Message = {
  role: 'user' | 'assistant';
  content: string;
};

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/court-assistant`;

const QUICK_ACTIONS = [
  { label: 'Check availability', message: 'What courts are available tomorrow afternoon?', icon: Clock },
  { label: 'Show courts', message: 'Show me available courts', icon: MapPin },
  { label: 'How to book?', message: 'How do I book a court?', icon: HelpCircle },
  { label: 'Pricing', message: 'What are the pricing options?', icon: DollarSign },
];

// Check if browser supports speech recognition
const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

// Simple markdown-like formatting for chat messages
const formatMessage = (content: string) => {
  // Split by lines and process
  const lines = content.split('\n');
  
  return lines.map((line, lineIndex) => {
    // Handle bullet points
    if (line.trim().startsWith('*') || line.trim().startsWith('-')) {
      const bulletContent = line.trim().slice(1).trim();
      // Handle bold text within bullet
      const formattedContent = bulletContent.split(/(\*\*.*?\*\*)/).map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>;
        }
        return part;
      });
      return (
        <div key={lineIndex} className="flex items-start gap-2 py-1">
          <span className="text-primary mt-0.5">•</span>
          <span className="flex-1">{formattedContent}</span>
        </div>
      );
    }
    
    // Handle bold text in regular lines
    const formattedLine = line.split(/(\*\*.*?\*\*)/).map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
      }
      return part;
    });
    
    return line.trim() ? (
      <p key={lineIndex} className="py-0.5">{formattedLine}</p>
    ) : (
      <div key={lineIndex} className="h-2" />
    );
  });
};

const ChatBot: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Hi there! 👋 I'm your friendly court booking assistant. I can help you find the perfect court, understand pricing, and guide you through booking. What can I help you with today?",
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Initialize speech recognition
  useEffect(() => {
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
        setInterimTranscript('');
      };

      recognition.onresult = (event: any) => {
        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            final += transcript;
          } else {
            interim += transcript;
          }
        }

        if (final) {
          setInput(prev => prev + final);
          setInterimTranscript('');
        } else {
          setInterimTranscript(interim);
        }
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
        setInterimTranscript('');
        
        if (event.error === 'not-allowed') {
          toast({
            title: "Microphone Access Denied",
            description: "Please allow microphone access to use voice input.",
            variant: "destructive",
          });
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        setInterimTranscript('');
      };

      recognitionRef.current = recognition;
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, [toast]);

  const toggleListening = useCallback(() => {
    if (!SpeechRecognition) {
      toast({
        title: "Voice Input Not Supported",
        description: "Your browser doesn't support voice input. Please try Chrome or Edge.",
        variant: "destructive",
      });
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      try {
        recognitionRef.current?.start();
      } catch (error) {
        console.error('Error starting recognition:', error);
      }
    }
  }, [isListening, toast]);

  const streamChat = async (userMessages: Message[]) => {
    const resp = await fetch(CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ messages: userMessages }),
    });

    if (!resp.ok || !resp.body) {
      const errorData = await resp.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to get response');
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let textBuffer = '';
    let assistantContent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      textBuffer += decoder.decode(value, { stream: true });

      let newlineIndex: number;
      while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
        let line = textBuffer.slice(0, newlineIndex);
        textBuffer = textBuffer.slice(newlineIndex + 1);

        if (line.endsWith('\r')) line = line.slice(0, -1);
        if (line.startsWith(':') || line.trim() === '') continue;
        if (!line.startsWith('data: ')) continue;

        const jsonStr = line.slice(6).trim();
        if (jsonStr === '[DONE]') break;

        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content as string | undefined;
          if (content) {
            assistantContent += content;
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.role === 'assistant' && prev.length > 1) {
                return prev.map((m, i) =>
                  i === prev.length - 1 ? { ...m, content: assistantContent } : m
                );
              }
              return [...prev, { role: 'assistant', content: assistantContent }];
            });
          }
        } catch {
          textBuffer = line + '\n' + textBuffer;
          break;
        }
      }
    }
  };

  const handleSend = async (messageText?: string) => {
    const text = messageText || input.trim();
    if (!text || isLoading) return;

    setShowQuickActions(false);
    const userMessage: Message = { role: 'user', content: text };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      await streamChat(newMessages.slice(1)); // Skip the initial greeting
    } catch (error) {
      console.error('Chat error:', error);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: "I'm sorry, I'm having trouble connecting right now. Please try again in a moment. 🔄",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* Chat Toggle Button */}
      <Button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-xl transition-all duration-300 group",
          "bg-gradient-to-br from-primary to-primary/80 hover:from-primary/90 hover:to-primary text-primary-foreground",
          "hover:scale-110 hover:shadow-2xl hover:shadow-primary/25",
          isOpen && "scale-0 opacity-0"
        )}
        size="icon"
      >
        <MessageCircle className="h-6 w-6 group-hover:scale-110 transition-transform" />
        <span className="absolute -top-1 -right-1 h-3 w-3 bg-green-500 rounded-full border-2 border-background animate-pulse" />
      </Button>

      {/* Chat Window */}
      <div
        className={cn(
          "fixed bottom-6 right-6 z-50 w-[400px] max-w-[calc(100vw-3rem)] transition-all duration-300 transform",
          "bg-background/95 backdrop-blur-xl border border-border/50 rounded-3xl shadow-2xl overflow-hidden",
          isOpen ? "scale-100 opacity-100 animate-scale-in" : "scale-95 opacity-0 pointer-events-none"
        )}
      >
        {/* Header */}
        <div className="relative flex items-center justify-between p-4 bg-gradient-to-r from-primary via-primary to-primary/90 text-primary-foreground overflow-hidden">
          {/* Decorative elements */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
          
          <div className="flex items-center gap-3 relative z-10">
            <div className="relative">
              <div className="h-11 w-11 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center ring-2 ring-white/30">
                <Bot className="h-6 w-6" />
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 bg-green-400 rounded-full border-2 border-primary" />
            </div>
            <div>
              <h3 className="font-bold text-lg flex items-center gap-2">
                Court Assistant
                <Sparkles className="h-4 w-4 text-yellow-300" />
              </h3>
              <p className="text-xs text-primary-foreground/80">Online • Ready to help</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsOpen(false)}
            className="relative z-10 text-primary-foreground hover:bg-white/20 rounded-full"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Messages */}
        <ScrollArea className="h-[420px] p-4" ref={scrollRef}>
          <div className="space-y-4">
            {messages.map((message, index) => (
              <div
                key={index}
                className={cn(
                  "flex gap-3 animate-fade-in",
                  message.role === 'user' ? "flex-row-reverse" : "flex-row"
                )}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div
                  className={cn(
                    "h-9 w-9 rounded-full flex items-center justify-center shrink-0 shadow-md transition-transform hover:scale-105",
                    message.role === 'user'
                      ? "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground"
                      : "bg-gradient-to-br from-muted to-muted/80 text-muted-foreground ring-1 ring-border/50"
                  )}
                >
                  {message.role === 'user' ? (
                    <User className="h-4 w-4" />
                  ) : (
                    <Bot className="h-4 w-4" />
                  )}
                </div>
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm",
                    message.role === 'user'
                      ? "bg-gradient-to-br from-primary to-primary/90 text-primary-foreground rounded-tr-md"
                      : "bg-gradient-to-br from-muted/80 to-muted text-foreground rounded-tl-md border border-border/30"
                  )}
                >
                  <div className="space-y-1">
                    {formatMessage(message.content)}
                  </div>
                </div>
              </div>
            ))}
            {isLoading && messages[messages.length - 1]?.role === 'user' && (
              <div className="flex gap-3 animate-fade-in">
                <div className="h-9 w-9 rounded-full bg-gradient-to-br from-muted to-muted/80 flex items-center justify-center shadow-md ring-1 ring-border/50">
                  <Bot className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="bg-gradient-to-br from-muted/80 to-muted rounded-2xl rounded-tl-md px-4 py-3 border border-border/30 shadow-sm">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    <span className="text-xs text-muted-foreground">Thinking...</span>
                  </div>
                </div>
              </div>
            )}
            
            {/* Quick Actions */}
            {showQuickActions && messages.length === 1 && (
              <div className="mt-6 space-y-3 animate-fade-in" style={{ animationDelay: '200ms' }}>
                <p className="text-xs text-muted-foreground font-medium ml-12 flex items-center gap-1.5">
                  <Sparkles className="h-3 w-3 text-primary" />
                  Quick questions to get started:
                </p>
                <div className="grid grid-cols-2 gap-2 ml-12">
                  {QUICK_ACTIONS.map((action, index) => {
                    const Icon = action.icon;
                    return (
                      <Button
                        key={index}
                        variant="outline"
                        size="sm"
                        className={cn(
                          "text-xs h-auto py-2.5 px-3 rounded-xl justify-start gap-2",
                          "bg-gradient-to-br from-background to-muted/30 hover:from-primary/5 hover:to-primary/10",
                          "border-border/50 hover:border-primary/30 hover:shadow-md",
                          "transition-all duration-200 hover:scale-[1.02]"
                        )}
                        onClick={() => handleSend(action.message)}
                        disabled={isLoading}
                      >
                        <Icon className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span className="truncate">{action.label}</span>
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="p-4 border-t border-border/50 bg-gradient-to-t from-muted/30 to-transparent">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Input
                ref={inputRef}
                value={isListening ? input + interimTranscript : input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={isListening ? "Listening..." : "Type or speak your message..."}
                disabled={isLoading}
                className={cn(
                  "pr-4 rounded-xl border-border/50 bg-background/80 backdrop-blur-sm focus:ring-2 focus:ring-primary/20 transition-all",
                  isListening && "border-primary/50 bg-primary/5"
                )}
              />
              {isListening && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="flex gap-0.5">
                    <span className="w-1 h-3 bg-primary rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
                    <span className="w-1 h-4 bg-primary rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
                    <span className="w-1 h-2 bg-primary rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}
            </div>
            <Button
              onClick={toggleListening}
              disabled={isLoading}
              size="icon"
              variant={isListening ? "default" : "outline"}
              className={cn(
                "shrink-0 rounded-xl transition-all duration-200",
                isListening 
                  ? "bg-red-500 hover:bg-red-600 text-white animate-pulse" 
                  : "hover:bg-primary/10 hover:border-primary/30"
              )}
            >
              {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </Button>
            <Button
              onClick={() => handleSend()}
              disabled={!input.trim() || isLoading}
              size="icon"
              className={cn(
                "shrink-0 rounded-xl shadow-md transition-all duration-200",
                "bg-gradient-to-br from-primary to-primary/80 hover:from-primary/90 hover:to-primary",
                "hover:shadow-lg hover:shadow-primary/25 hover:scale-105",
                "disabled:opacity-50 disabled:hover:scale-100"
              )}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground/60 text-center mt-2">
            {SpeechRecognition ? "Tap mic to speak • Powered by AI" : "Powered by AI • Here to help 24/7"}
          </p>
        </div>
      </div>
    </>
  );
};

export default ChatBot;
