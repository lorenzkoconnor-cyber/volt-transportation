import ScrollReveal from "@/components/ui/ScrollReveal";
import { FACEBOOK_URL, INSTAGRAM_URL } from "@/lib/site-copy";

// Brand marks drawn inline — lucide no longer ships logos.
function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M24 12.07C24 5.41 18.63 0 12 0S0 5.41 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z" />
    </svg>
  );
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="2" width="20" height="20" rx="5.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="17.6" cy="6.4" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

const links = [
  { label: "Facebook", href: FACEBOOK_URL, icon: FacebookIcon, className: "bg-[#1877F2] hover:bg-[#3A8DF5]" },
  {
    label: "Instagram",
    href: INSTAGRAM_URL,
    icon: InstagramIcon,
    className: "bg-gradient-to-r from-[#F58529] via-[#DD2A7B] to-[#8134AF] hover:brightness-110",
  },
];

/** "Find us on social media" — sits between the reviews and the lobby photos. */
export default function SocialLinks() {
  return (
    <section className="pb-14 px-4 sm:px-6 lg:px-8 bg-[#0A0A0A]">
      <ScrollReveal direction="up" className="max-w-2xl mx-auto text-center">
        <h2 className="text-white font-semibold text-lg mb-5">Find us on social media</h2>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-12">
          {links.map(({ label, href, icon: Icon, className }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Volt Transportation on ${label} (opens in a new tab)`}
              className={`flex w-full max-w-xs sm:w-56 items-center justify-center gap-2.5 rounded-xl px-6 py-3.5 text-white font-semibold shadow-lg transition-all ${className}`}
            >
              <Icon className="w-5 h-5" />
              {label}
            </a>
          ))}
        </div>
      </ScrollReveal>
    </section>
  );
}
