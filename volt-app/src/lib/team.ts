// The people behind Volt: each has a digital business card at /team/<slug>,
// linked only from the Contact page (not the footer or sitemap, and noindexed).
// Everyone shares Volt's main phone line from Dashboard → Settings.
//
// Bios and "ask me about" lines are placeholders until the team sends their own.

export interface TeamPhoto {
  src: string;
  alt: string;
}

export interface TeamMember {
  slug: string;
  name: string;
  title: string;
  email: string;
  /** Portrait headshot, 3:4. */
  photo: TeamPhoto;
  bio: string[];
  askMeAbout: string[];
  /** "On the job" photos, landscape. */
  gallery: TeamPhoto[];
}

export const SITE_URL = "https://volt-transportation.com";

export const TEAM: TeamMember[] = [
  {
    slug: "william",
    name: "William",
    title: "Owner",
    email: "william@contactvolt.com",
    photo: { src: "/images/team/william.webp", alt: "William, owner of Volt Transportation, at the Volt office entrance" },
    bio: [
      "William founded Volt Transportation to give Columbus travelers a better way to reach Atlanta's airport: on time, in comfort, and without the stress of the drive.",
      "He oversees the fleet, the drivers and the standard of service on every trip.",
    ],
    askMeAbout: ["Group and corporate travel", "Partnering with Volt"],
    gallery: [
      { src: "/images/team/william-by-van.webp", alt: "William beside a Volt van in front of the Volt Transportation building" },
      { src: "/images/team/william-greeting-customer.webp", alt: "William greeting a passenger at a Volt van" },
      { src: "/images/team/william-close-trunk.webp", alt: "William loading luggage into a Volt van" },
    ],
  },
  {
    slug: "gary",
    name: "Gary",
    title: "Co-Owner",
    email: "gary@contactvolt.com",
    photo: { src: "/images/team/gary.webp", alt: "Gary, co-owner of Volt Transportation, in front of a Volt van" },
    bio: [
      "Gary co-owns Volt Transportation and helps steer the company's growth across Columbus and the Chattahoochee Valley.",
      "He works behind the scenes to keep every ride safe, reliable and worth recommending.",
    ],
    askMeAbout: ["Business and community partnerships", "Military and Fort Moore travel"],
    gallery: [
      { src: "/images/team/all3-lorenz-william-gary.webp", alt: "Lorenz, William and Gary in front of a Volt van at the Volt Transportation building" },
    ],
  },
  {
    slug: "lorenz",
    name: "Lorenz",
    title: "Manager",
    email: "lorenz@contactvolt.com",
    photo: { src: "/images/team/lorenz.webp", alt: "Lorenz, manager at Volt Transportation, at the Volt office entrance" },
    bio: [
      "Lorenz manages Volt's day-to-day operations, from the schedule and the front desk to making sure every passenger gets where they're going.",
      "If you have a question about a booking, he's a great person to call.",
    ],
    askMeAbout: ["Booking and changing reservations", "Flight-based pickups at ATL"],
    gallery: [
      { src: "/images/team/lorenz-greeting-customer.webp", alt: "Lorenz shaking hands with a passenger seated in a Volt van" },
      { src: "/images/team/lorenz-open-trunk.webp", alt: "Lorenz opening the luggage area of a Volt van" },
      { src: "/images/team/lorenz-open-trunk-2.webp", alt: "Lorenz helping with luggage at a Volt van" },
    ],
  },
];

export function teamMember(slug: string): TeamMember | undefined {
  return TEAM.find((m) => m.slug === slug);
}

/** The card's own address, tagged so bookings started from it are credited to the person. */
export function cardUrl(m: TeamMember, medium: "qr" | "link" = "link"): string {
  return `${SITE_URL}/team/${m.slug}?utm_source=business-card&utm_medium=${medium}&utm_campaign=${m.slug}`;
}

export function bookUrl(m: TeamMember): string {
  return `/book?utm_source=business-card&utm_medium=card&utm_campaign=${m.slug}`;
}
