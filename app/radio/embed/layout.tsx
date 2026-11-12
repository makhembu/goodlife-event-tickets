import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Live Stream Embed | GOODLIFE Radio 254",
  description: "Official embeddable audio player for GOODLIFE Radio 254",
  robots: {
    index: false,
    follow: false,
  },
};

export default function RadioEmbedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="w-full h-full min-h-screen bg-transparent flex items-center justify-center p-2">
      {children}
    </div>
  );
}
