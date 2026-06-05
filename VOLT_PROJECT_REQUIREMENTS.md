Volt Transportation — Final Website & Web App Plan

Technology

Frontend

* Next.js
* Tailwind CSS
* ShadCN UI

Backend

* Supabase

Payments

* Stripe

Hosting

* Hostinger

Code Repository

* GitHub

⸻

Public Website

Top Navigation

Left:

* Volt Logo

Right:

* Book Now
* Pricing
* Contact
* About volt
* Manage Reservation
* Login

⸻

Homepage

Section 1 — Hero

Large image/video of black Mercedes Sprinter.

Headline:

Premium Transportation Between Columbus & Atlanta

Subheadline:

Comfortable. Reliable. Professional.

Buttons:

* Book Now
* View Pricing

⸻

Section 2 — Booking Widget

Most important section.

Fields:

From

* Columbus
* ATL Airport

To

* Columbus
* ATL Airport

Date

Time

Adults

Children

Pets

Extra Luggage

Round Trip Toggle

Button:

* Find Available Rides

⸻

Section 3 — Why Choose Volt

4 cards:

Luxury Vehicles

Black Mercedes Sprinters

More Comfort

Only 8 passengers

Professional Drivers

Chauffeur-style service

Premium Amenities

Water, charging, luggage assistance

⸻

Section 4 — The Volt Experience

Photos of:

* Vehicles
* Airport pickups
* Luggage assistance

Short luxury-focused text.

⸻

Section 5 — Pricing

Adult: $59

Child: $49

Pet: $25

Extra Bag: $10

Military Discount Available

⸻

Section 6 — Reviews

Customer reviews.

⸻

Section 7 — Call To Action

Large button:

* Book Your Ride

⸻

Booking Engine

Step 1

Customer enters:

* Pickup Location
* Destination
* Date
* Time
* Passenger Counts

Click:

* Find Available Rides

⸻

Step 2

Available departures appear.

Example:

8:00 AM

9:00 AM

Customer selects departure.

⸻

Step 3

Passenger Information

* Name
* Phone
* Email

Additional passenger names if needed.

⸻

Step 4

Checkout

Price automatically calculated.

Stripe payment integration
⸻

Step 5

Confirmation

Customer receives:

* Confirmation Number
* Booking Summary
* SMS Confirmation

⸻

Manage Reservation

No account required.

Customer enters:

* Confirmation Number
* Phone Number

Can:

* View reservation
* Update information
* Add luggage
* Add pet
* Cancel reservation (if allowed)
* View receipt

⸻

Customer Portal

Optional customer account creation.

Customers can:

Upcoming Trips

View future reservations.

Trip History

View past trips.

Saved Payment Methods

Stored through Stripe.

Rebook

Quickly rebook previous trips.

Profile

Update account information.

⸻

Admin Dashboard

Single dashboard.

Everyone logs into the same system.

Permissions change based on role.

⸻

Dashboard Home

Displays:

* Today’s Trips
* Upcoming Trips
* Passenger Counts
* Revenue Summary
* Vehicle Assignments

⸻

Reservations

Employees can:

* Create reservation
* Edit reservation
* Cancel reservation
* Search reservation

⸻

Dispatch

Displays all departures.

Example:

8:00 AM Columbus → ATL

Passengers: 13

Vehicle 1:

* 8 passengers

Vehicle 2:

* 5 passengers

⸻

Passenger Manifest

Trip details:

* Passenger names
* Phone numbers
* Pickup location
* Notes
* Passenger count

⸻

Vehicles

Manage:

* Vehicle list
* Vehicle status
* Vehicle assignments

⸻

Drivers

Manage:

* Driver list
* Driver assignments
* Driver schedules

⸻

Payments

View:

* Paid reservations
* Cash reservations
* Refunds

⸻

Reports

View:

* Revenue
* Passenger counts
* Route performance
* Daily totals

⸻

Employee Roles

Owner

Full access.

⸻

Manager

Can:

* Create bookings
* Edit bookings
* Cancel bookings
* Assign vehicles
* Assign drivers
* Process payments
* View reports

Cannot:

* Change company settings
* Manage owner account

⸻

Office Staff

Can:

* Create bookings
* Take payments
* Edit bookings
* View trips
* Search customers
* Check passengers in

Cannot:

* Refund payments
* Change pricing
* Manage employees

⸻

Driver

Can:

* View assigned trips
* View passenger list
* View passenger phone numbers
* View notes
* Mark passenger boarded
* Mark no-show
* Mark trip completed

Cannot:

* Edit reservations
* Cancel reservations
* View payments
* View reports

⸻

Database (Supabase)

Tables:

* Users
* Employees
* Roles
* Reservations
* Trips
* Routes
* Vehicles
* Drivers
* Payments
* Discounts
* Notifications
* Audit Logs

⸻

Future Expansion

The system should be built so additional routes can be added later:

Current:

* Columbus ⇄ ATL Airport

Future:

* Additional cities
* Additional airports
* Luxury SUV service

No major redesign needed later.

⸻

Final Goal

One application containing:

* Public Website
* Booking Engine
* Stripe Payments
* Manage Reservation
* Customer Portal
* Admin Dashboard
* Dispatch System
* Driver Access
* Reporting

⸻

Design System
The priority is to be optimized for mobile devices, desktop should still look good.
Style
Apple × Tesla × Private Jet
Colors
Primary:
* Black (#0A0A0A)
Secondary:
* Dark Graphite (#171717)
Accent:
* Electric Purple (#7C3AED)
Text:
* White (#FFFFFF)
Muted:
* Gray (#A1A1AA)
Typography
* Inter
* SF Pro Display
Design Rules
* Large spacing
* Rounded corners
* Glassmorphism booking cards
* Minimal text
* High-quality photography
* No stock-photo feeling

 ⸻
 
Frontend (What Users See)
This is what Claude Code will build visually.
Public Website
Homepage
* Hero section
* Booking widget
* Pricing section
* Reviews section
* Call-to-action buttons
* Navigation bar
* Footer
About Volt Page
* Company story
* Fleet information
* Why choose Volt
How It Works Page
* Step-by-step travel process
Pricing Page
* Adult pricing
* Child pricing
* Pet pricing
* Luggage pricing
Locations Page
* Columbus location
* ATL Airport location
* Maps and instructions
Contact Page
* Contact form
* Phone number
* Email
Safety & Rules Page
* Policies
* Passenger rules
Terms & Conditions Page
* Legal information
 
⸻
 
Booking Screens
Search Form
* From
* To
* Date
* Time
* Passenger counts
Available Ride Selection
* Departure options
* Pricing
Passenger Information Form
* Names
* Contact information
Checkout Screen
* Stripe payment form
Confirmation Screen
* Booking confirmation
* Reservation number
 
⸻
 
Customer Portal
Dashboard
* Upcoming trips
* Trip history
Profile
* Customer information
Saved Payment Methods
Rebook Buttons
 
⸻
 
Admin Dashboard UI
What employees see.
Dashboard Home
Reservations Page
Dispatch Page
Passenger Manifest Page
Vehicle Management Page
Driver Management Page
Reports Page
Employee Management Page
All of this is frontend.
 
⸻
 
Backend (What Makes Everything Work)
This is the business logic and database.
Users never see this directly.
 
⸻
 
Supabase Database
Stores:
Customers
* Name
* Email
* Phone
Reservations
* Trip information
* Passenger counts
Trips
* Departure schedules
Vehicles
* Vehicle assignments
Drivers
* Driver assignments
Employees
* User accounts
* Roles
Payments
* Stripe payment records
Audit Logs
* Changes made by staff
 
⸻
 
Authentication
Handles:
Customer Login
Employee Login
Password Resets
Session Management
Permissions
 
⸻
 
Role-Based Access Control
Controls:
Owner Permissions
Manager Permissions
Office Staff Permissions
Driver Permissions
This is backend.
 
⸻
 
Booking Engine Logic
This is one of the most important backend systems.
Example:
Customer selects:
* Columbus
* ATL Airport
* June 15
* 8:00 AM
Backend:
* Checks availability
* Calculates price
* Creates reservation
* Generates confirmation number
* Sends SMS
Frontend shows the result.
Backend does the work.
 
⸻
 
Dispatch Logic
Example:
15 passengers book 8:00 AM.
Backend automatically determines:
Vehicle 1:
* 8 passengers
Vehicle 2:
* 7 passengers
Frontend displays it.
Backend calculates it.
 
⸻
 
Stripe Integration
Backend handles:
* Payment processing
* Payment verification
* Refunds
* Payment records
Frontend only shows payment screens.
 
⸻
 
SMS Notifications
Backend sends:
* Booking confirmations
* Trip reminders
Likely through Twilio or similar.
 
⸻
 
Manage Reservation System
Customer enters:
* Confirmation Number
* Phone Number
Backend:
* Finds reservation
* Verifies customer
* Returns booking
Frontend displays booking.
 
⸻
 
Reports
Backend calculates:
* Revenue
* Passenger counts
* Daily totals
* Monthly totals
Frontend displays charts and tables.
 
⸻
 
Simple Breakdown
Frontend
Everything the user clicks, views, or types into.
Examples:
* Homepage
* Booking form
* Customer portal
* Admin dashboard screens
* Buttons
* Tables
* Menus
Built with:
* Next.js
* Tailwind
* ShadCN
 
⸻
 
Backend
Everything that stores data, processes information, and enforces rules.
Examples:
* Supabase database
* User accounts
* Reservation system
* Dispatch calculations
* Employee permissions
* Stripe payments
* SMS notifications
Built with:
* Supabase
* PostgreSQL
* Server-side API routes
* Stripe
* SMS provider
 
⸻
 
If We Had To Draw Volt
CUSTOMERS
EMPLOYEES
        │
        ▼
FRONTEND
(Next.js Website)
        │
        ▼
BACKEND
(API Routes)
        │
 ┌──────┼──────┐
 ▼      ▼      ▼
Supabase Stripe SMS
Database Payments Notifications
For Volt, roughly 70% of the effort will actually be in the backend, because the booking engine, dispatch system, permissions, reservations, and payment handling are what make the business operate. The website itself is relatively straightforward compared to the operational logic behind it.


⸻


Volt Transportation SEO Requirements

Build the Volt Transportation website with SEO as a core requirement from the start.

Technical SEO

* Use Next.js server-side rendering (SSR) or static generation where appropriate.
* Generate sitemap.xml automatically.
* Generate robots.txt automatically.
* Create clean, human-readable URLs.
* Ensure all pages are crawlable by search engines.
* Optimize Core Web Vitals.
* Optimize Largest Contentful Paint (LCP).
* Optimize Cumulative Layout Shift (CLS).
* Optimize Interaction to Next Paint (INP).
* Implement mobile-first responsive design.
* Use semantic HTML throughout the site.

Structured Data

Implement JSON-LD structured data:

* LocalBusiness Schema
* TransportationService Schema
* FAQ Schema (Homepage FAQ section)
* Organization Schema

All structured data should be dynamically generated from page content where possible.

Metadata

Every page must have:

* Unique title tag
* Unique meta description
* Canonical URL
* Open Graph tags
* Twitter/X card tags

Metadata should be dynamically managed through Next.js Metadata API.

Homepage SEO

Primary keyword:

“Columbus GA to Atlanta Airport Shuttle”

Homepage should naturally include:

* Columbus, Georgia
* Atlanta Airport
* ATL Airport
* Airport Shuttle
* Airport Transportation

Do not keyword stuff.

Use natural language.

Heading Structure

Homepage:

H1:

* Columbus GA to Atlanta Airport Shuttle Service

H2:

* Why Choose Volt Transportation
* How It Works
* Pricing
* Frequently Asked Questions

Only one H1 per page.

Maintain proper heading hierarchy.

FAQ Section

Create an SEO-focused FAQ section on the homepage.

Include questions such as:

* How much does transportation from Columbus GA to Atlanta Airport cost?
* Where does Volt pick up passengers in Columbus?
* Can I bring luggage?
* Can I travel with a pet?
* How early should I arrive for pickup?
* How long does the trip take?

Connect FAQ Schema to this section.

Image Optimization

* Use Next.js Image component.
* Lazy load non-critical images.
* Compress images automatically.
* Generate responsive image sizes.

Use descriptive filenames.

Examples:

* volt-sprinter-van.jpg
* columbus-ga-airport-shuttle.jpg
* atl-airport-pickup-location.jpg

Every image must include descriptive alt text.

Internal Linking

Create strong internal linking between:

* Home
* About Volt
* How It Works
* Pricing
* Locations
* Safety & Rules
* Contact

Ensure all pages are reachable within a few clicks.

Page Content Requirements

Each public page should contain enough crawlable text for search engines.

Avoid pages that are mostly images with little text.

Homepage should contain:

* Service overview
* Route information
* Benefits
* Pricing summary
* FAQ section

URL Structure

Use SEO-friendly URLs:

/

/about

/how-it-works

/pricing

/locations

/contact

/safety-rules

/terms

/privacy-policy

/manage-reservation

/login

Avoid URL parameters for public content pages.

Performance

Target:

* Lighthouse SEO Score: 100
* Lighthouse Performance Score: 90+
* Mobile-first optimization
* Fast page load times
* Optimized font loading
* Optimized JavaScript bundles

Accessibility

Implement accessibility best practices:

* Proper heading structure
* ARIA labels where appropriate
* Keyboard navigation support
* Accessible forms
* Accessible buttons

Accessibility should support SEO and usability.


⸻


About Volt Page

Purpose:
Make Volt feel like a real transportation company, not just a booking website.

Sections:

Our Mission

Safe, comfortable, reliable transportation between Columbus and Atlanta.

Why We Started Volt

Explain the desire to provide a better alternative to crowded transportation options.

What Makes Us Different

* Mercedes Sprinter fleet
* Maximum 8 passengers
* Professional drivers
* Complimentary water
* Extra legroom
* Airport-focused service

Fleet Showcase

Photos of actual vehicles.

⸻

How It Works section

This is important because many first-time customers have never used an airport shuttle.

Step 1

Book your trip online.

Step 2

Receive confirmation by text.

Step 3

Arrive at your pickup location.

Step 4

Meet your driver.

Step 5

Relax and enjoy the ride.

Step 6

Arrive at your destination.

Simple and visual.

⸻

Locations section

Keep this simple.

Columbus Pickup Location

Address

Map

Parking information if applicable.

ATL Airport Pickup Location

Terminal instructions.

Map.

Photos if possible.

⸻

Safety & Rules Section

I would definitely add this.

This protects the business and answers common questions.

Sections:

Passenger Conduct

Luggage Policy

Pet Policy

Child Passenger Policy

Cancellation Policy

Weather Delays

Driver Authority

Prohibited Items

Check-In Requirements

⸻

Terms & Conditions Section

Definitely add this.

Include:

Booking Agreement

Refund Policy

Liability Limitations

Reservation Changes

No-Show Policy

Payment Terms

Privacy Policy Link

Most users won’t read it, but it is important.

⸻

I want a simple discrete link at the bottom of each page (footer) (especially the main page) that says “emp login” so that employees can access the admin dashboard and sign in.