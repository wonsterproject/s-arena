import { MessageCircle } from "lucide-react";

export default function WhatsAppFloat() {
  return (
    <a
      href="https://wa.link/v5hyml"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Contact us on WhatsApp"
      className="fixed bottom-5 right-5 z-50 h-14 w-14 rounded-full bg-[#25D366] shadow-2xl ring-2 ring-white/20 flex items-center justify-center hover:scale-110 active:scale-95 transition-transform animate-pulse-glow"
    >
      <MessageCircle className="h-7 w-7 text-white" fill="white" />
      <span className="absolute inset-0 rounded-full bg-[#25D366] opacity-60 animate-ping" />
    </a>
  );
}
