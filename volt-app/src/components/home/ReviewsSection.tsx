import { Star } from "lucide-react";

const reviews = [
  {
    name: "Marcus T.",
    date: "November 2024",
    rating: 5,
    text: "Absolutely the best way to get to ATL from Columbus. The Sprinter was spotless, driver was on time, and I made my flight with no stress. Will always use Volt.",
  },
  {
    name: "Janelle R.",
    date: "October 2024",
    rating: 5,
    text: "I travel to Atlanta for work every month and Volt has completely replaced my Uber routine. So much more comfortable and reliable. The booking process took 2 minutes.",
  },
  {
    name: "David K.",
    date: "December 2024",
    rating: 5,
    text: "Traveled with my family of 4 including our dog. The driver was professional and helped with all our bags. 10 out of 10 experience from start to finish.",
  },
];

export default function ReviewsSection() {
  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8 bg-[#0A0A0A]">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            What Our Passengers Say
          </h2>
          <div className="flex items-center justify-center gap-1 mb-2">
            {[...Array(5)].map((_, i) => (
              <Star key={i} className="w-5 h-5 text-[#7C3AED]" fill="#7C3AED" />
            ))}
          </div>
          <p className="text-[#A1A1AA]">5.0 average rating</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {reviews.map((review) => (
            <div key={review.name} className="glass rounded-2xl p-6">
              <div className="flex items-center gap-1 mb-4">
                {[...Array(review.rating)].map((_, i) => (
                  <Star
                    key={i}
                    className="w-4 h-4 text-[#7C3AED]"
                    fill="#7C3AED"
                  />
                ))}
              </div>
              <p className="text-[#A1A1AA] text-sm leading-relaxed mb-5">
                &ldquo;{review.text}&rdquo;
              </p>
              <div className="flex items-center justify-between">
                <span className="text-white font-medium text-sm">
                  {review.name}
                </span>
                <span className="text-[#A1A1AA] text-xs">{review.date}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
