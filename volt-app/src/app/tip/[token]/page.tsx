import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { loadTipPage } from "@/lib/tips-server";
import TipForm from "./TipForm";

// "Tip your driver" — linked from the review request email and the review
// thank-you screen. The link carries the reservation's unguessable review
// token, so it isn't indexed.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tip your driver",
  robots: { index: false, follow: false },
};

export default async function TipPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const page = await loadTipPage(token);
  if (!page) notFound();

  return (
    <>
      <Navbar />
      <main className="pt-20">
        <section className="relative py-20 px-4 sm:px-6 lg:px-8 overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-[#FCC300]/8 blur-[100px] pointer-events-none" />
          <div className="max-w-lg mx-auto">
            <TipForm token={token} page={page} />
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
