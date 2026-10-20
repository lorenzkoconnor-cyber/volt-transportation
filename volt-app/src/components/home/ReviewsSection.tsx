import { Star } from "lucide-react";
import ScrollReveal from "@/components/ui/ScrollReveal";
import { getPublishedReviews, type PublicReview } from "@/lib/reviews-server";
import { reviewMonth } from "@/lib/reviews";

// Homepage reviews — a slow, endless carousel of what riders wrote on
// /review/<token> (src/lib/reviews-server.ts). Until there are 3 real reviews,
// the original launch quotes fill the gaps (owner's call, 2026-10-20).

const LAUNCH_REVIEWS: PublicReview[] = [
  {
    id: "launch-1",
    name: "Marcus T.",
    createdAt: "2024-11-15T12:00:00Z",
    rating: 5,
    tripLabel: null,
    body: "Absolutely the best way to get to ATL from Columbus. The van was spotless, driver was on time, and I made my flight with no stress. Will always use Volt.",
  },
  {
    id: "launch-2",
    name: "Janelle R.",
    createdAt: "2024-10-15T12:00:00Z",
    rating: 5,
    tripLabel: null,
    body: "I travel to Atlanta for work every month and Volt has completely replaced my Uber routine. So much more comfortable and reliable. The booking process took 2 minutes.",
  },
  {
    id: "launch-3",
    name: "David K.",
    createdAt: "2024-12-15T12:00:00Z",
    rating: 5,
    tripLabel: null,
    body: "Traveled with my family of 4 including our dog. The driver was professional and helped with all our bags. 10 out of 10 experience from start to finish.",
  },
];

const MIN_SHOWN = 3;
// Each copy of the track needs enough cards to span a wide screen.
const MIN_PER_LOOP = 6;
const SECONDS_PER_CARD = 7;

export default async function ReviewsSection() {
  const real = await getPublishedReviews();
  const reviews = real.length >= MIN_SHOWN ? real : [...real, ...LAUNCH_REVIEWS.slice(0, MIN_SHOWN - real.length)];
  const average = real.length ? real.reduce((s, r) => s + r.rating, 0) / real.length : null;

  // Repeat short lists so one loop is wide enough; repeats are hidden from screen readers.
  const loop: { review: PublicReview; repeat: boolean }[] = [];
  while (loop.length < Math.max(MIN_PER_LOOP, reviews.length)) {
    reviews.forEach((review) => loop.push({ review, repeat: loop.length >= reviews.length }));
  }

  return (
    <section className="py-20 bg-[#0A0A0A] overflow-hidden">
      <ScrollReveal direction="up" className="text-center mb-14 px-4">
        <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">What Our Passengers Say</h2>
        <div className="flex items-center justify-center gap-1 mb-2" aria-hidden="true">
          {[...Array(5)].map((_, i) => (
            <Star key={i} className="w-5 h-5 text-[#FCC300]"
              fill={average == null || i < Math.round(average) ? "#FCC300" : "transparent"} />
          ))}
        </div>
        {average != null && (
          <p className="text-[#A1A1AA]">
            {average.toFixed(1)} average from {real.length} rider review{real.length === 1 ? "" : "s"}
          </p>
        )}
      </ScrollReveal>

      <div className="marquee" style={{ ["--marquee-duration" as string]: `${loop.length * SECONDS_PER_CARD}s` }}>
        <div className="marquee-track">
          {[false, true].map((copy) => (
            <ul key={String(copy)} aria-hidden={copy || undefined} className="flex gap-6 pr-6 shrink-0">
              {loop.map(({ review, repeat }, i) => (
                <li key={`${review.id}-${i}`} aria-hidden={(!copy && repeat) || undefined}
                  className="w-[300px] sm:w-[360px] shrink-0">
                  <ReviewCard review={review} />
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
    </section>
  );
}

function ReviewCard({ review }: { review: PublicReview }) {
  return (
    <figure className="glass rounded-2xl p-6 h-full flex flex-col">
      <div className="flex items-center gap-1 mb-4" aria-label={`${review.rating} out of 5 stars`} role="img">
        {[...Array(5)].map((_, j) => (
          <Star key={j} className="w-4 h-4 text-[#FCC300]" fill={j < review.rating ? "#FCC300" : "transparent"} />
        ))}
      </div>
      <blockquote className="text-[#A1A1AA] text-sm leading-relaxed mb-5 flex-1 line-clamp-6 whitespace-pre-line">
        &ldquo;{review.body}&rdquo;
      </blockquote>
      <figcaption className="flex items-center justify-between gap-3">
        <span className="text-white font-medium text-sm truncate">{review.name}</span>
        <span className="text-[#A1A1AA] text-xs whitespace-nowrap">
          {review.tripLabel ? `${review.tripLabel} · ` : ""}{reviewMonth(review.createdAt)}
        </span>
      </figcaption>
    </figure>
  );
}
