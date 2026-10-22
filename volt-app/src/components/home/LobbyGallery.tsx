import Image from "next/image";
import ScrollReveal from "@/components/ui/ScrollReveal";

const photos = [
  {
    label: "Our Columbus entrance",
    src: "/images/volt-entrance.webp",
    alt: "Glass entrance doors to the Volt Transportation lobby in Columbus, Georgia",
  },
  {
    label: "Check in at the front desk",
    src: "/images/volt-front-desk.webp",
    alt: "Volt Transportation front desk with the Volt sign on the wall",
  },
  {
    label: "Relax in our lounge",
    src: "/images/volt-lounge.webp",
    alt: "Volt Transportation passenger lounge with leather seating and a TV",
  },
];

export default function LobbyGallery() {
  return (
    <section className="pb-4 px-4 sm:px-6 lg:px-8">
      <div className="max-w-[512px] lg:max-w-[894px] mx-auto grid grid-cols-3 gap-3 sm:gap-10 lg:gap-[150px]">
        {photos.map((photo, i) => (
          <ScrollReveal key={photo.src} delay={i * 110} direction="up">
            <div className="glass rounded-xl overflow-hidden relative aspect-[3/4] group">
              <Image
                src={photo.src}
                alt={photo.alt}
                fill
                sizes="(min-width: 1024px) 198px, 144px"
                className="object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0A]/85 via-transparent to-transparent pointer-events-none" />
              <span className="absolute bottom-2 left-2 right-2 sm:bottom-3 sm:left-3 text-white text-[10px] sm:text-xs font-semibold leading-tight">
                {photo.label}
              </span>
            </div>
          </ScrollReveal>
        ))}
      </div>
    </section>
  );
}
