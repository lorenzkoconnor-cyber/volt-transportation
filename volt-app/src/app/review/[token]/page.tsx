import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { loadReviewForm } from "@/lib/reviews-server";
import ReviewForm from "./ReviewForm";

// "Leave a review" — opened from the review request email. The link carries the
// reservation's unguessable review token, so it isn't indexed.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Review your ride",
  robots: { index: false, follow: false },
};

export default async function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const form = await loadReviewForm(token);
  if (!form) notFound();

  return (
    <>
      <Navbar />
      <main className="pt-20">
        <section className="relative py-20 px-4 sm:px-6 lg:px-8 overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-[#FCC300]/8 blur-[100px] pointer-events-none" />
          <div className="max-w-lg mx-auto">
            <ReviewForm token={token} form={form} />
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
