import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Phone, Bot, User, Loader2, Trash2, AlertCircle } from "lucide-react";
import { Header } from "@/components/Header";
import Footer from "@/components/Footer";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const QUICK_REPLIES = [
  { label: "🏟️ Show Courts", message: "Show available courts" },
  { label: "📅 My Bookings", message: "Show my bookings" },
  { label: "❓ Help", message: "Help" },
  { label: "🏏 Cricket", message: "I want to book a cricket court" },
  { label: "🏸 Badminton", message: "I want to book a badminton court" },
  { label: "❌ Cancel", message: "I want to cancel a booking" },
];

const isValidPhone = (phone: string) => {
  const cleaned = phone.replace(/\s/g, "");
  return /^\+\d{10,15}$/.test(cleaned);
};

const WhatsAppSimulator = () => {
  const { user } = useAuth();
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [phoneError, setPhoneError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-fetch phone from logged-in user's profile
  useEffect(() => {
    const fetchPhone = async () => {
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("phone, whatsapp_number")
        .eq("id", user.id)
        .maybeSingle();
      if (data?.whatsapp_number) {
        setPhone(data.whatsapp_number);
      } else if (data?.phone) {
        setPhone(data.phone);
      }
    };
    fetchPhone();
  }, [user]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (phone && !isValidPhone(phone)) {
      setPhoneError("Enter a valid phone number (e.g. +923001234567)");
    } else {
      setPhoneError("");
    }
  }, [phone]);

  const sendMessage = async (text?: string) => {
    const msgText = (text || message).trim();
    if (!msgText || loading) return;

    if (!phone) {
      toast.error("Please enter a WhatsApp number first");
      return;
    }
    if (!isValidPhone(phone)) {
      toast.error("Please enter a valid phone number (e.g. +923001234567)");
      return;
    }

    const userMsg: Message = { role: "user", content: msgText, timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    if (!text) setMessage("");
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-booking", {
        body: { phone, message: userMsg.content },
      });

      if (error) throw error;

      const botMsg: Message = {
        role: "assistant",
        content: data?.reply || "No response received",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${err.message}`, timestamp: new Date() },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => setMessages([]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-2xl">
        <Card className="h-[calc(100vh-220px)] flex flex-col">
          <CardHeader className="pb-3 border-b flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-600 flex items-center justify-center">
                <Phone className="h-5 w-5 text-white" />
              </div>
              <div>
                <CardTitle className="text-lg">WhatsApp Simulator</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {phone ? `Testing: ${phone}` : "Enter your WhatsApp number"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={`w-44 h-8 text-xs ${phoneError ? "border-destructive" : ""}`}
                  placeholder="+923001234567"
                />
                {phoneError && (
                  <div className="absolute top-full left-0 mt-1 flex items-center gap-1 text-destructive text-[10px] whitespace-nowrap">
                    <AlertCircle className="h-3 w-3" />
                    {phoneError}
                  </div>
                )}
              </div>
              <Button variant="ghost" size="icon" onClick={clearChat} title="Clear chat">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>

          <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
            <ScrollArea className="flex-1 p-4" ref={scrollRef}>
              {messages.length === 0 && (
                <div className="text-center text-muted-foreground py-8 space-y-3">
                  <Bot className="h-12 w-12 mx-auto opacity-40" />
                  <p className="text-sm">Send a message to test the WhatsApp booking flow.</p>
                  <p className="text-xs">Try one of the quick replies below, or type your own message.</p>
                </div>
              )}
              <div className="space-y-3">
                {messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[80%] rounded-xl px-4 py-2 text-sm whitespace-pre-wrap ${
                        msg.role === "user"
                          ? "bg-green-600 text-white rounded-br-sm"
                          : "bg-muted text-foreground rounded-bl-sm"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-1 opacity-70">
                        {msg.role === "user" ? <User className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
                        <span className="text-[10px]">
                          {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      {msg.content}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div className="bg-muted rounded-xl px-4 py-3 rounded-bl-sm">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Quick Replies */}
            <div className="px-3 pt-2 flex flex-wrap gap-1.5 border-t">
              {QUICK_REPLIES.map((qr) => (
                <Button
                  key={qr.label}
                  variant="outline"
                  size="sm"
                  className="text-xs h-7 rounded-full"
                  disabled={loading}
                  onClick={() => sendMessage(qr.message)}
                >
                  {qr.label}
                </Button>
              ))}
            </div>

            <div className="p-3 flex gap-2">
              <Input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
                placeholder="Type a message..."
                disabled={loading}
                className="flex-1"
              />
              <Button onClick={() => sendMessage()} disabled={loading || !message.trim()} size="icon" className="bg-green-600 hover:bg-green-700">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
      <Footer />
    </div>
  );
};

export default WhatsAppSimulator;
